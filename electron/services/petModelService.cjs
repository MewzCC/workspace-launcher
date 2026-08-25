const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { settingsDao } = require('../db/index.cjs')
const { readImageSize } = require('./imageSize.cjs')
const { t } = require('../i18n.cjs')

const ATLAS_WIDTH = 1536
const ATLAS_HEIGHTS = {
  1: 1872,
  2: 2288
}
const BUILTIN_ID = 'builtin-launchbot'
const DRAG_ATLAS_STATES = new Set(['idle', 'wave', 'jump', 'failed', 'waiting', 'working', 'review'])
let dataUrlCache = new Map()
let resolvedModelsRoot = null

function clearModelCache(id) {
  const prefix = `${id}:`
  for (const key of dataUrlCache.keys()) {
    if (key === id || key.startsWith(prefix)) dataUrlCache.delete(key)
  }
}

function installRoot() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR)
  if (app.isPackaged) return path.resolve(path.dirname(process.execPath))
  let current = path.resolve(app.getAppPath())
  while (true) {
    const manifestPath = path.join(current, 'package.json')
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (manifest.name === 'workspace-launcher') return current
    } catch (_) {}
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return path.resolve(process.cwd())
}

function defaultPetsRoot() {
  return path.join(installRoot(), 'models')
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function ensureWritable(directory) {
  fs.mkdirSync(directory, { recursive: true })
  const probe = path.join(directory, `.write-test-${process.pid}-${Date.now()}`)
  try {
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
  } catch (_) {
    try { fs.unlinkSync(probe) } catch (_) {}
    throw new Error(t('pet.modelsPathNotWritable'))
  }
}

function migrateLegacyModels(target) {
  const configured = String(settingsDao.get('petModelsDirectory') || '').trim()
  const sources = [configured, path.join(app.getPath('userData'), 'pets')]
    .filter((source, index, items) => source && items.findIndex((item) => samePath(item, source)) === index)
  let migratedModels = 0
  for (const source of sources) {
    if (samePath(source, target) || !fs.existsSync(source)) continue
    let entries = []
    try {
      entries = fs.readdirSync(source, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(source, entry.name, 'pet.json')))
    } catch (_) {
      continue
    }
    for (const entry of entries) {
      const destination = path.join(target, entry.name)
      if (fs.existsSync(destination)) continue
      try {
        fs.cpSync(path.join(source, entry.name), destination, { recursive: true, errorOnExist: true, force: false })
        migratedModels += 1
      } catch (_) {
        // 保留旧目录不动；单个模型迁移失败不影响其他模型和应用启动。
      }
    }
  }
  return migratedModels
}

function petsRoot() {
  if (resolvedModelsRoot) return resolvedModelsRoot.directory
  const defaultDirectory = defaultPetsRoot()
  const fallbackDirectory = path.join(app.getPath('userData'), 'models')
  let directory = defaultDirectory
  let fallback = false
  try {
    ensureWritable(directory)
  } catch (_) {
    directory = fallbackDirectory
    ensureWritable(directory)
    fallback = true
  }
  const migratedModels = migrateLegacyModels(directory)
  settingsDao.set('petModelsDirectory', directory)
  resolvedModelsRoot = { directory, defaultDirectory, fallback, migratedModels }
  dataUrlCache.clear()
  return directory
}

function getStorageInfo() {
  const directory = petsRoot()
  return {
    ...resolvedModelsRoot,
    directory,
    customized: false
  }
}

function safeId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id || id.length > 64) throw new Error(t('pet.invalidId'))
  return id
}

// ===== AI 生成的 SVG 参数化桌宠 =====
const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/
const ANTENNA_TYPES = ['none', 'orb', 'line']

// 严格校验 AI 产出参数：颜色仅接受 #rrggbb，枚举白名单，长度限制
function validateSvgParams(raw) {
  const params = raw && typeof raw === 'object' ? raw : {}
  const color = (value) => {
    const text = String(value || '').trim()
    if (!HEX_COLOR_RE.test(text)) throw new Error(t('pet.invalidColor', { value: text || '(empty)' }))
    return text.toLowerCase()
  }
  const antennaType = String(params.antennaType || 'orb').trim()
  if (!ANTENNA_TYPES.includes(antennaType)) throw new Error(t('pet.invalidAntennaType'))
  return {
    bodyColor: color(params.bodyColor),
    bodyInnerColor: color(params.bodyInnerColor),
    eyeColor: color(params.eyeColor),
    antennaType,
    antennaColor: antennaType === 'none' ? '#22d3ee' : color(params.antennaColor || params.bodyColor || '#22d3ee')
  }
}

function buildSvgManifest({ id, displayName, description, svgParams }) {
  return {
    id,
    displayName,
    description,
    renderer: 'svg',
    svgParams
  }
}

// 用 bodyColor 生成一个简单 SVG 缩略图，供衣橱预览
function svgThumbDataUrl(item) {
  const color = item.svgParams?.bodyColor || '#6366f1'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 112"><rect x="26" y="30" width="68" height="64" rx="16" fill="${color}"/><circle cx="48" cy="58" r="7" fill="#0f172a"/><circle cx="72" cy="58" r="7" fill="#0f172a"/><rect x="38" y="94" width="16" height="8" rx="4" fill="${color}"/><rect x="66" y="94" width="16" height="8" rx="4" fill="${color}"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}

function createFromAi(input) {
  const name = String(input?.name || '').trim().slice(0, 40)
  if (!name) throw new Error(t('pet.nameRequired'))
  const description = String(input?.description || '').trim().slice(0, 240)
  const svgParams = validateSvgParams(input?.svgParams)
  const id = safeId(`ai-${name}`)
  const manifest = buildSvgManifest({ id, displayName: name, description, svgParams })
  const destination = path.join(petsRoot(), id)
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, 'pet.json'), JSON.stringify(manifest, null, 2), 'utf8')
  dataUrlCache.delete(id)
  settingsDao.set('petModelId', id)
  require('./petProfileService.cjs').ensure(id, { displayName: name })
  return manifest
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error(t('pet.invalidManifest'))
  const id = safeId(manifest.id)
  // Codex v1 manifests predate spriteVersionNumber. Missing means v1; v2
  // explicitly opts into the two additional look-direction rows.
  const spriteVersionNumber = manifest.spriteVersionNumber == null
    ? 1
    : Number(manifest.spriteVersionNumber)
  if (spriteVersionNumber !== 1 && spriteVersionNumber !== 2) {
    throw new Error(t('pet.invalidVersion'))
  }
  const spriteName = path.basename(String(manifest.spritesheetPath || ''))
  if (!spriteName || !/\.(png|webp)$/i.test(spriteName)) {
    throw new Error(t('pet.invalidSpritePath'))
  }
  let dragAnimation
  if (manifest.dragAnimation != null) {
    const rawAnimation = manifest.dragAnimation
    const frames = Array.isArray(rawAnimation?.frames) ? rawAnimation.frames : []
    const atlasState = String(rawAnimation?.atlasState || '').trim()
    let normalizedFrames
    if (frames.length) {
      if (frames.length < 2 || frames.length > 12) throw new Error('dragAnimation.frames 必须包含 2-12 张图片')
      normalizedFrames = frames.map((value) => {
        const raw = String(value || '').trim().replace(/\\/g, '/')
        const normalized = path.posix.normalize(raw)
        if (!raw || path.posix.isAbsolute(raw) || normalized === '..' || normalized.startsWith('../') || !/\.(png|webp)$/i.test(normalized)) {
          throw new Error('dragAnimation.frames 必须是模型目录内的 PNG 或 WebP 相对路径')
        }
        return normalized
      })
    } else if (!DRAG_ATLAS_STATES.has(atlasState)) {
      throw new Error('dragAnimation 必须提供有效的 atlasState 或 2-12 张动画帧')
    }
    const rawDurations = Array.isArray(rawAnimation?.durations) ? rawAnimation.durations : []
    const durationCount = normalizedFrames?.length || ({ idle: 6, wave: 4, jump: 5, failed: 8, waiting: 6, working: 6, review: 6 }[atlasState])
    const durations = Array.from({ length: durationCount }, (_, index) => Math.min(1000, Math.max(60, Number(rawDurations[index]) || 150)))
    dragAnimation = normalizedFrames
      ? { frames: normalizedFrames, durations }
      : { atlasState, durations }
  }
  return {
    id,
    displayName: String(manifest.displayName || id).trim().slice(0, 80),
    description: String(manifest.description || '').trim().slice(0, 240),
    spriteVersionNumber,
    spritesheetPath: spriteName,
    ...(dragAnimation ? { dragAnimation } : {})
  }
}

function validateAtlas(filePath, spriteVersionNumber) {
  if (!fs.existsSync(filePath)) throw new Error(t('pet.spriteNotFound', { name: path.basename(filePath) }))
  let size
  try {
    size = readImageSize(filePath)
  } catch (error) {
    throw new Error(t('pet.spriteUnreadable', { message: error.message }))
  }
  const expectedHeight = ATLAS_HEIGHTS[spriteVersionNumber]
  if (size.width !== ATLAS_WIDTH || size.height !== expectedHeight) {
    throw new Error(t('pet.invalidAtlasSize', { version: spriteVersionNumber, width: ATLAS_WIDTH, height: expectedHeight, actualWidth: size.width, actualHeight: size.height }))
  }
  return size
}

function validateDragAnimation(directory, animation) {
  if (!animation) return null
  if (animation.atlasState) return animation
  const root = path.resolve(directory)
  const framePaths = animation.frames.map((relativePath) => {
    const filePath = path.resolve(directory, ...relativePath.split('/'))
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error('拖拽动画路径超出模型目录')
    if (!fs.existsSync(filePath)) throw new Error(`找不到拖拽动画帧：${relativePath}`)
    const size = readImageSize(filePath)
    if (size.width !== 192 || size.height !== 208) throw new Error(`拖拽动画帧必须为 192×208：${relativePath}`)
    return filePath
  })
  return { ...animation, framePaths }
}

function resolveManifestPath(inputPath) {
  const target = path.resolve(String(inputPath || '').trim())
  if (!target || !fs.existsSync(target)) throw new Error(t('pet.pathMissing'))
  const stat = fs.statSync(target)
  const manifestPath = stat.isDirectory() ? path.join(target, 'pet.json') : target
  if (path.basename(manifestPath).toLowerCase() !== 'pet.json') {
    throw new Error(t('pet.choosePetPath'))
  }
  if (!fs.existsSync(manifestPath)) throw new Error(t('pet.manifestMissing', { path: target }))
  return manifestPath
}

function readPetDirectory(directory) {
  const manifestPath = path.join(directory, 'pet.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    // SVG 参数化模型：无精灵图，仅校验参数
    if (raw.renderer === 'svg') {
      const manifest = buildSvgManifest({
        id: safeId(raw.id),
        displayName: String(raw.displayName || raw.id).trim().slice(0, 80),
        description: String(raw.description || '').trim().slice(0, 240),
        svgParams: validateSvgParams(raw.svgParams)
      })
      return { ...manifest, directory, imported: true, svgThumbDataUrl: svgThumbDataUrl(manifest) }
    }
    const manifest = validateManifest(raw)
    const spritePath = path.join(directory, manifest.spritesheetPath)
    validateAtlas(spritePath, manifest.spriteVersionNumber)
    const dragAnimation = validateDragAnimation(directory, manifest.dragAnimation)
    return { ...manifest, ...(dragAnimation ? { dragAnimation } : {}), directory, spritePath, imported: true }
  } catch (_) {
    return null
  }
}

function spriteDataUrl(item) {
  if (!dataUrlCache.has(item.id)) {
    const mime = path.extname(item.spritePath).toLowerCase() === '.png' ? 'image/png' : 'image/webp'
    dataUrlCache.set(item.id, `data:${mime};base64,${fs.readFileSync(item.spritePath).toString('base64')}`)
  }
  return dataUrlCache.get(item.id)
}

function fileDataUrl(cacheKey, filePath) {
  if (!dataUrlCache.has(cacheKey)) {
    const mime = path.extname(filePath).toLowerCase() === '.png' ? 'image/png' : 'image/webp'
    dataUrlCache.set(cacheKey, `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`)
  }
  return dataUrlCache.get(cacheKey)
}

function runtimeDragAnimation(item) {
  if (!item.dragAnimation) return undefined
  if (item.dragAnimation.atlasState) {
    return { atlasState: item.dragAnimation.atlasState, durations: item.dragAnimation.durations }
  }
  return {
    durations: item.dragAnimation.durations,
    frameDataUrls: item.dragAnimation.framePaths.map((filePath, index) => fileDataUrl(`${item.id}:drag:${index}`, filePath))
  }
}

function list() {
  const imported = fs.readdirSync(petsRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPetDirectory(path.join(petsRoot(), entry.name)))
    .filter(Boolean)
    .map((item) => {
      const { directory, spritePath, ...rest } = item
      if (item.renderer === 'svg') return { ...rest, builtin: false }
      return {
        ...rest,
        builtin: false,
        spritesheetDataUrl: spriteDataUrl({ ...rest, spritePath }),
        ...(item.dragAnimation ? { dragAnimation: runtimeDragAnimation(item) } : {})
      }
    })
  return [
    {
      id: BUILTIN_ID,
      displayName: 'LaunchBot',
      description: t('pet.builtinDescription'),
      spriteVersionNumber: 0,
      builtin: true,
      imported: false
    },
    ...imported
  ]
}

function importFromManifest(inputPath) {
  const manifestPath = resolveManifestPath(inputPath)
  const sourceDir = path.dirname(manifestPath)
  let manifest
  try {
    manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  } catch (error) {
    throw new Error(t('pet.manifestValidationFailed', { message: error.message }))
  }
  const sourceSprite = path.join(sourceDir, manifest.spritesheetPath)
  try {
    validateAtlas(sourceSprite, manifest.spriteVersionNumber)
  } catch (error) {
    throw new Error(t('pet.spriteValidationFailed', { name: path.basename(sourceSprite), message: error.message }))
  }
  let sourceDragAnimation
  try {
    sourceDragAnimation = validateDragAnimation(sourceDir, manifest.dragAnimation)
  } catch (error) {
    throw new Error(`拖拽动画校验失败：${error.message}`)
  }

  const destination = path.join(petsRoot(), manifest.id)
  fs.mkdirSync(destination, { recursive: true })
  const spriteName = `spritesheet${path.extname(sourceSprite).toLowerCase()}`
  fs.copyFileSync(sourceSprite, path.join(destination, spriteName))
  let normalizedDragAnimation
  if (sourceDragAnimation) {
    if (sourceDragAnimation.atlasState) {
      normalizedDragAnimation = { atlasState: sourceDragAnimation.atlasState, durations: sourceDragAnimation.durations }
    } else {
      const frames = sourceDragAnimation.framePaths.map((sourceFrame, index) => {
        const extension = path.extname(sourceFrame).toLowerCase()
        const relativePath = `animations/dragging/${String(index).padStart(2, '0')}${extension}`
        const destinationFrame = path.join(destination, ...relativePath.split('/'))
        fs.mkdirSync(path.dirname(destinationFrame), { recursive: true })
        if (!samePath(sourceFrame, destinationFrame)) fs.copyFileSync(sourceFrame, destinationFrame)
        return relativePath
      })
      normalizedDragAnimation = { frames, durations: sourceDragAnimation.durations }
    }
  }
  const normalized = {
    ...manifest,
    spritesheetPath: spriteName,
    ...(normalizedDragAnimation ? { dragAnimation: normalizedDragAnimation } : {})
  }
  fs.writeFileSync(path.join(destination, 'pet.json'), JSON.stringify(normalized, null, 2), 'utf8')
  clearModelCache(manifest.id)
  settingsDao.set('petModelId', manifest.id)
  return { ...normalized, sourceDirectory: sourceDir }
}

function select(id) {
  const target = String(id || '')
  if (!list().some((item) => item.id === target)) throw new Error(t('pet.modelUnavailable'))
  settingsDao.set('petModelId', target)
  return getRuntimeModel()
}

function remove(id) {
  const target = safeId(id)
  if (target === BUILTIN_ID) throw new Error(t('pet.builtinCannotDelete'))
  const directory = path.resolve(petsRoot(), target)
  const root = path.resolve(petsRoot())
  if (path.dirname(directory) !== root) throw new Error(t('pet.invalidPetPath'))
  fs.rmSync(directory, { recursive: true, force: true })
  clearModelCache(target)
  if (settingsDao.get('petModelId') === target) settingsDao.set('petModelId', BUILTIN_ID)
  return { success: true }
}

function getRuntimeModel(modelId) {
  const explicit = modelId !== undefined && modelId !== null && String(modelId).trim() !== ''
  const selected = explicit ? String(modelId) : (settingsDao.get('petModelId') || BUILTIN_ID)
  if (selected === BUILTIN_ID) return { id: BUILTIN_ID, displayName: 'LaunchBot', builtin: true }
  const item = readPetDirectory(path.join(petsRoot(), selected))
  if (!item) {
    if (!explicit) {
      settingsDao.set('petModelId', BUILTIN_ID)
      return { id: BUILTIN_ID, displayName: 'LaunchBot', builtin: true }
    }
    return null
  }
  const { directory, spritePath, ...rest } = item
  if (item.renderer === 'svg') return { ...rest, builtin: false }
  return {
    id: item.id,
    displayName: item.displayName,
    description: item.description,
    spriteVersionNumber: item.spriteVersionNumber,
    builtin: false,
    spritesheetDataUrl: spriteDataUrl(item),
    ...(item.dragAnimation ? { dragAnimation: runtimeDragAnimation(item) } : {})
  }
}

function openFolder() {
  return petsRoot()
}

function refresh() {
  dataUrlCache.clear()
  const models = list()
  const selected = String(settingsDao.get('petModelId') || BUILTIN_ID)
  if (!models.some((item) => item.id === selected)) settingsDao.set('petModelId', BUILTIN_ID)
  return models
}

module.exports = { list, refresh, importFromManifest, select, remove, getRuntimeModel, openFolder, getStorageInfo, createFromAi, BUILTIN_ID }
