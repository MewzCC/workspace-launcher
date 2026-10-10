const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')
const { ACTION_ALIASES, IMAGE_RE, MAX_BYTES, assetPath, validateSequence } = require('./petSequence.cjs')
const { readImageSize } = require('./imageSize.cjs')
const live2d = require('./petLive2d.cjs')

const previews = new Map()
let sessionRoot
function sessionDirectory() {
  if (!sessionRoot) sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-pet-import-'))
  return sessionRoot
}
const TTL = 30 * 60 * 1000
const naturalSort = (a, b) => a.localeCompare(b, 'en', { numeric: true })
const idFor = (name) => String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'custom-pet'

function cleanup(token, owner) {
  const item = previews.get(token)
  if (!item || (owner !== undefined && item.owner !== owner)) return
  previews.delete(token)
  live2d.revoke(item.directory)
  fs.rmSync(item.directory, { recursive: true, force: true })
}

function dispose() {
  if (sessionRoot) live2d.revoke(sessionRoot)
  previews.clear()
  if (sessionRoot) fs.rmSync(sessionRoot, { recursive: true, force: true })
  sessionRoot = null
}

function unpack(file, directory) {
  if (fs.statSync(file).size > MAX_BYTES) throw new Error('压缩包不能超过 128 MB')
  const entries = new AdmZip(file).getEntries()
  if (entries.length > 1500) throw new Error('压缩包文件过多（最多 1500 个条目）')
  let total = 0
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/')
    if (name.startsWith('/') || name.includes(':') || name.split('/').includes('..') || ((entry.attr >>> 16) & 0xf000) === 0xa000) throw new Error('压缩包包含不安全的路径或链接')
    total += entry.header.size
    if (total > MAX_BYTES || entry.header.size > 16 * 1024 * 1024) throw new Error('压缩包解压后过大：总计最多 128 MB，单文件最多 16 MB')
    if (entry.isDirectory) continue
    // Only extract assets used by the importer, never executable contents.
    if (!IMAGE_RE.test(name) && !/\.(model3\.json|motion3\.json|exp3\.json|physics3\.json|pose3\.json|cdi3\.json|userdata3\.json|moc3|jpe?g|wav|mp3)$/i.test(name) && path.posix.basename(name).toLowerCase() !== 'pet.json') continue
    const target = path.resolve(directory, name)
    if (!target.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error('无效的压缩包路径')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const data = entry.getData()
    if (data.length !== entry.header.size) throw new Error('压缩包文件大小不一致')
    fs.writeFileSync(target, data, { flag: 'wx' })
  }
}

function findManifests(root, depth = 0, budget = { count: 0 }, pattern = /^pet\.json$/i) {
  const results = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (++budget.count > 1500) throw new Error('目录文件过多，请选择单个桌宠的文件夹')
    if (entry.isSymbolicLink()) continue
    const file = path.join(root, entry.name)
    if (entry.isFile() && pattern.test(entry.name)) results.push(file)
    else if (entry.isDirectory() && depth < 4 && !entry.name.startsWith('.')) results.push(...findManifests(file, depth + 1, budget, pattern))
  }
  return results
}

function imageFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).filter((e) => e.isFile() && IMAGE_RE.test(e.name)).map((e) => e.name).sort(naturalSort)
}

function infer(directory, name) {
  const animations = {}
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const action = ACTION_ALIASES[entry.name.toLowerCase()]
    if (!action) continue
    const frames = imageFiles(path.join(directory, entry.name)).map((file) => `${entry.name}/${file}`)
    if (!frames.length) continue
    if (animations[action]) throw new Error(`多个目录映射到 ${action}，请保留一个动作目录`)
    animations[action] = { frames, fps: action === 'sleep' ? 6 : 8, loop: true }
  }
  if (Object.keys(animations).length) {
    if (!animations.idle) throw new Error('识别到动作目录，但缺少 idle 待机目录')
    return { manifest: { schemaVersion: 1, renderer: 'sequence', id: idFor(name), displayName: name, animations }, format: 'frames' }
  }
  const frames = imageFiles(directory)
  if (!frames.length) {
    const children = fs.readdirSync(directory, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== '__MACOSX')
    if (children.length === 1) {
      const child = path.join(directory, children[0].name)
      const result = infer(child, name)
      return { ...result, directory: result.directory || child }
    }
    throw new Error('没有找到素材。请拖入 pet.json、PNG/WebP、动作帧文件夹或 ZIP')
  }
  if (frames.length === 1) {
    const size = readImageSize(assetPath(directory, frames[0]))
    if (size.width === 1536 && [1872, 2288].includes(size.height)) return {
      manifest: { id: idFor(name), displayName: name, spriteVersionNumber: size.height === 1872 ? 1 : 2, spritesheetPath: frames[0] }, format: 'codex-atlas'
    }
  }
  return {
    manifest: { schemaVersion: 1, renderer: 'sequence', id: idFor(name), displayName: name, animations: { idle: { frames, fps: 8, loop: true } } },
    format: frames.length === 1 ? 'image' : 'frames'
  }
}

function snapshot(raw, root, destination) {
  const models = require('./petModelService.cjs')
  let manifest
  let copiedBytes = 0
  const copy = (relative, target) => {
    const source = assetPath(root, relative)
    copiedBytes += fs.statSync(source).size
    if (copiedBytes > MAX_BYTES) throw new Error('模型总大小不能超过 128 MB')
    // Electron nativeImage decodes PNG/JPEG but rejects valid WebP. WebP
    // structure is checked by readImageSize; Chromium verifies every asset
    // before the UI exposes the preview/use action.
    if (/\.png$/i.test(source) && require('electron').nativeImage.createFromPath(source).isEmpty()) throw new Error(`图片无法解码：${relative}`)
    fs.mkdirSync(path.dirname(path.join(destination, target)), { recursive: true })
    fs.copyFileSync(source, path.join(destination, target))
  }
  if (raw.renderer === 'live2d') {
    const validated = live2d.validate(raw, root)
    for (const relative of validated.files) {
      const target = path.join(destination, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(live2d.asset(root, relative), target)
    }
    const { actions, files, ...rest } = validated
    manifest = rest
  } else if (raw.renderer === 'sequence') {
    manifest = validateSequence(raw, root)
    for (const [action, clip] of Object.entries(manifest.animations)) {
      clip.frames = clip.frames.map((relative, index) => {
        const target = `animations/${action}/${String(index).padStart(3, '0')}${path.extname(relative).toLowerCase()}`
        copy(relative, target)
        return target
      })
    }
  } else if (raw.renderer === 'svg') {
    manifest = { id: raw.id, displayName: String(raw.displayName || raw.id), description: String(raw.description || ''), renderer: 'svg', svgParams: models.validateSvgParams(raw.svgParams) }
  } else {
    manifest = models.validateManifest(raw)
    const sprite = assetPath(root, manifest.spritesheetPath)
    models.validateAtlas(sprite, manifest.spriteVersionNumber)
    const target = `spritesheet${path.extname(sprite).toLowerCase()}`
    copy(manifest.spritesheetPath, target)
    manifest.spritesheetPath = target
    if (manifest.dragAnimation?.frames) {
      manifest.dragAnimation.frames = manifest.dragAnimation.frames.map((relative, index) => {
        const size = readImageSize(assetPath(root, relative))
        if (size.width !== 192 || size.height !== 208) throw new Error(`拖拽帧须为 192×208：${relative}`)
        const target = `animations/dragging/${index}${path.extname(relative).toLowerCase()}`
        copy(relative, target)
        return target
      })
    }
  }
  manifest.id = idFor(manifest.id || manifest.displayName)
  fs.writeFileSync(path.join(destination, 'pet.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

function prepare(paths, owner, options = {}) {
  const engine = options.engine || 'auto'
  if (!['auto', 'sprite', 'live2d'].includes(engine)) throw new Error('不支持的桌宠引擎')
  for (const [token, item] of previews) if (Date.now() - item.created > TTL || item.owner === owner) cleanup(token)
  const token = crypto.randomUUID()
  const directory = path.join(sessionDirectory(), token)
  const staged = path.join(directory, 'model')
  fs.mkdirSync(staged, { recursive: true })
  try {
    if (!paths.length || paths.length > 120) throw new Error('请拖入一个模型包/目录，或最多 120 张待机动画帧')
    let source = path.resolve(paths[0])
    let name = path.basename(source, path.extname(source))
    if (!fs.existsSync(source) || fs.lstatSync(source).isSymbolicLink()) throw new Error('素材路径不存在或是链接')
    let raw, format, root
    if (paths.length > 1) {
      root = path.join(directory, 'input')
      fs.mkdirSync(root)
      let inputBytes = 0
      paths.forEach((file) => {
        if (!IMAGE_RE.test(file) || !fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 16 * 1024 * 1024) throw new Error('多文件导入只支持 PNG/WebP 动画帧')
        inputBytes += fs.statSync(file).size
        if (inputBytes > MAX_BYTES) throw new Error('模型总大小不能超过 128 MB')
      })
      // Preserve filename ordering independent of drag selection ordering.
      const sortedPaths = [...paths].sort(naturalSort)
      sortedPaths.forEach((file, i) => fs.copyFileSync(file, path.join(root, `${String(i).padStart(3, '0')}${path.extname(file)}`)))
      name = '自定义桌宠'
    } else if (fs.statSync(source).isDirectory()) {
      root = source
      name = path.basename(source)
    } else if (/\.zip$/i.test(source)) {
      root = path.join(directory, 'unpacked')
      fs.mkdirSync(root)
      unpack(source, root)
    } else if (/\.model3\.json$/i.test(source)) {
      if (engine === 'sprite') throw new Error('该素材是 Live2D 模型，请选择 Live2D 或自动识别')
      root = path.dirname(source)
      raw = { renderer: 'live2d', modelPath: path.basename(source), id: idFor(name), displayName: name.replace(/\.model3$/i, '') }
      format = 'live2d'
    } else if (/\.model\.json$/i.test(source)) {
      throw new Error('Cubism 2 模型暂不支持，请导出 Cubism 3/4/5 的 .model3.json 模型包')
    } else if (path.basename(source).toLowerCase() === 'pet.json') {
      root = path.dirname(source)
      if (fs.statSync(source).size > 1024 * 1024) throw new Error('pet.json 不能超过 1 MB')
      raw = JSON.parse(fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, ''))
      format = 'manifest'
    } else if (IMAGE_RE.test(source)) {
      root = path.join(directory, 'input')
      fs.mkdirSync(root)
      if (fs.statSync(source).size > 16 * 1024 * 1024) throw new Error('图片不能超过 16 MB')
      fs.copyFileSync(source, path.join(root, path.basename(source)))
    } else throw new Error('支持 ZIP、pet.json、PNG/WebP 和动作帧目录；其他格式暂不支持')

    if (!raw) {
      const candidates = findManifests(root, 0, { count: 0 }, /\.model3\.json$/i)
      const manifests = findManifests(root).filter(file => engine !== 'live2d' || JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')).renderer === 'live2d')
      if (engine !== 'sprite' && candidates.length && !manifests.length) {
        const relative = candidates.map(file => path.relative(root, file).replace(/\\/g, '/'))
        if (candidates.length > 1 && !options.entry) {
          fs.rmSync(directory, { recursive: true, force: true })
          return { selectionRequired: true, candidates: relative }
        }
        const index = options.entry ? relative.indexOf(options.entry) : 0
        if (index < 0) throw new Error('选择的 Live2D 模型不存在')
        root = path.dirname(candidates[index])
        raw = { renderer: 'live2d', modelPath: path.basename(candidates[index]), id: idFor(name), displayName: name }
        format = 'live2d'
      } else {
      if (manifests.length > 1) throw new Error('发现多个 pet.json，请选择一个桌宠的子目录')
      if (manifests.length === 1) {
        if (fs.statSync(manifests[0]).size > 1024 * 1024) throw new Error('pet.json 不能超过 1 MB')
        root = path.dirname(manifests[0])
        raw = JSON.parse(fs.readFileSync(manifests[0], 'utf8').replace(/^\uFEFF/, ''))
        format = 'manifest'
      } else {
        // A conventional frames/ wrapper is also accepted.
        if (fs.existsSync(path.join(root, 'frames')) && fs.statSync(path.join(root, 'frames')).isDirectory()) root = path.join(root, 'frames')
        let inferred
        try { inferred = infer(root, name) } catch (error) {
          if (engine === 'sprite' && candidates.length) throw new Error('该素材是 Live2D 模型，请选择 Live2D 或自动识别')
          throw error
        }
        raw = inferred.manifest
        format = inferred.format
        root = inferred.directory || root
      }
      }
    }
    if (engine === 'live2d' && raw.renderer !== 'live2d') throw new Error('没有找到 .model3.json。Live2D 需要 moc3、纹理和模型配置组成的完整模型包')
    if (engine === 'sprite' && raw.renderer === 'live2d') throw new Error('该素材是 Live2D 模型，请选择 Live2D 或自动识别')
    const manifest = snapshot(raw, root, staged)
    const model = require('./petModelService.cjs').previewDirectory(staged)
    const actions = manifest.renderer === 'live2d' ? model.live2d.actions.map(a => a.id) : manifest.renderer === 'sequence' ? Object.keys(manifest.animations) : manifest.renderer === 'svg' ? ['idle', 'wave'] : ['idle', 'walkRight', 'walkLeft', 'wave', 'jump', 'failed', 'waiting', 'working', 'review', ...(manifest.dragAnimation ? ['dragging'] : [])]
    const warnings = []
    if (manifest.renderer === 'sequence') {
      if (manifest.animations.idle.frames.length === 1) warnings.push('static')
      if (!manifest.animations.walkLeft || !manifest.animations.walkRight) warnings.push('missingWalk')
      if (!manifest.animations.dragging) warnings.push('missingDrag')
    }
    previews.set(token, { directory, staged, manifest, owner, created: Date.now() })
    return { token, model, format, actions, warnings }
  } catch (error) {
    live2d.revoke(directory)
    fs.rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

function publishDirectory(temporary, destination) {
  try {
    fs.renameSync(temporary, destination)
    return
  } catch (error) {
    // Windows scanners/editors can hold directory handles that deny rename
    // while allowing the files to be copied. Other errors remain failures.
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error
  }
  // Reserve a new destination exclusively. Never merge with or remove an
  // existing model, even if another importer took this name meanwhile.
  fs.mkdirSync(destination)
  try {
    const manifest = fs.readFileSync(path.join(temporary, 'pet.json'))
    for (const name of fs.readdirSync(temporary)) {
      if (name === 'pet.json') continue
      fs.cpSync(path.join(temporary, name), path.join(destination, name), { recursive: true, force: false, errorOnExist: true })
    }
    // A directory is discoverable only when pet.json exists. Publish it last,
    // after every validated resource has been copied successfully.
    fs.writeFileSync(path.join(destination, 'pet.json'), manifest, { flag: 'wx' })
  } catch (error) {
    try { fs.rmSync(destination, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
    catch (cleanupError) { console.warn('[pet import] Failed to remove incomplete model:', cleanupError.message) }
    throw error
  }
  // Installation has succeeded. A locked staging directory must not turn it
  // into an apparent failure; hidden staging directories are not library items.
  try { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
  catch (error) { console.warn('[pet import] Failed to remove staging directory:', error.message) }
}

function commit(token, options, owner) {
  const item = previews.get(token)
  if (!item || item.owner !== owner || Date.now() - item.created > TTL) throw new Error('预览已过期，请重新拖入素材')
  const models = require('./petModelService.cjs')
  const root = models.openFolder()
  const base = idFor(item.manifest.id)
  let id = base, suffix = 2
  while (fs.existsSync(path.join(root, id)) || id === models.BUILTIN_ID) id = `${base}-${suffix++}`
  const manifest = { ...item.manifest, id, displayName: String(options.displayName || item.manifest.displayName || id).trim().slice(0, 80) }
  if (manifest.renderer === 'live2d') {
    const validated = live2d.validate(manifest, item.staged)
    manifest.live2d = { mappings: live2d.mappings(options.mappings || manifest.live2d.mappings, validated.actions) }
    if (options.thumbnail) {
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(options.thumbnail) || options.thumbnail.length > 2 * 1024 * 1024) throw new Error('Live2D 缩略图无效')
      const buffer = Buffer.from(options.thumbnail.split(',')[1], 'base64')
      if (require('electron').nativeImage.createFromBuffer(buffer).isEmpty()) throw new Error('Live2D 缩略图无法解码')
      fs.writeFileSync(path.join(item.staged, 'thumbnail.png'), buffer)
    }
  }
  if (manifest.renderer === 'sequence') {
    for (const clip of Object.values(manifest.animations)) clip.fps = options.fps || clip.fps
  }
  // Publish only a fully validated snapshot; failed copies stay outside the library.
  const temporary = path.join(root, `.import-${token}`)
  const destination = path.join(root, id)
  try {
    fs.cpSync(item.staged, temporary, { recursive: true, force: false, errorOnExist: true })
    fs.writeFileSync(path.join(temporary, 'pet.json'), JSON.stringify(manifest, null, 2))
    models.previewDirectory(temporary)
    live2d.revoke(temporary)
    publishDirectory(temporary, destination)
  } catch (error) {
    live2d.revoke(temporary)
    try { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) }
    catch (cleanupError) { console.warn('[pet import] Failed to remove staging directory:', cleanupError.message) }
    throw error
  }
  cleanup(token, owner)
  models.refresh()
  models.select(id)
  return { id, displayName: manifest.displayName, static: manifest.renderer === 'sequence' && manifest.animations.idle.frames.length === 1 }
}

module.exports = { prepare, commit, cleanup, dispose }
