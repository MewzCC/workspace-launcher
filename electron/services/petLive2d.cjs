const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { app, protocol } = require('electron')

const STATES = ['idle', 'wave', 'dragging', 'walkLeft', 'walkRight', 'jump', 'failed', 'waiting', 'working', 'review']
const ASSET_RE = /\.(json|moc3|png|webp|jpe?g|wav|mp3)$/i
const mounts = new Map()
let installed = false
if (!app.isReady()) protocol.registerSchemesAsPrivileged([{ scheme: 'pet-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])

function installProtocol() {
  if (installed) return
  protocol.handle('pet-asset', (request) => {
    try {
      const url = new URL(request.url)
      const mount = mounts.get(url.hostname)
      const relative = decodeURIComponent(url.pathname.slice(1))
      if (!mount || !mount.files.has(relative)) return new Response('Not found', { status: 404 })
      const file = asset(mount.root, relative)
      const ext = path.extname(file).toLowerCase()
      const mime = { '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' }[ext] || 'application/octet-stream'
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' } })
    } catch (_) { return new Response('Invalid resource', { status: 404 }) }
  })
  installed = true
}

function asset(root, relative) {
  if (typeof relative !== 'string' || !ASSET_RE.test(relative) || relative.includes('\\') || relative.includes(':') || relative.includes('%') || relative.includes('?') || relative.includes('#') || relative.startsWith('/') || relative.split('/').some(p => p === '..' || !p)) throw new Error(`Live2D 资源路径无效：${relative}`)
  const base = fs.realpathSync(root)
  const file = fs.realpathSync(path.resolve(root, relative))
  if (!file.startsWith(base + path.sep) || !fs.statSync(file).isFile() || fs.statSync(file).size > 32 * 1024 * 1024) throw new Error(`Live2D 资源须位于模型目录内且不超过 32 MB：${relative}`)
  return file
}

function json(root, name) {
  const file = asset(root, name)
  if (fs.statSync(file).size > 4 * 1024 * 1024) throw new Error(`Live2D JSON 超过 4 MB：${name}`)
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

function mappings(value, actions) {
  const result = {}
  for (const [state, id] of Object.entries(value || {})) {
    if (!STATES.includes(state) || (id && !actions.some(a => a.id === id))) throw new Error(`无效的 Live2D 动作映射：${state}`)
    result[state] = String(id || '')
  }
  return result
}

function validate(raw, root) {
  if (raw.renderer !== 'live2d' || !/\.model3\.json$/i.test(raw.modelPath || '')) throw new Error('Live2D 需要完整的 .model3.json 模型包')
  const settings = json(root, raw.modelPath)
  if (settings.Version !== 3 || !settings.FileReferences?.Moc || !Array.isArray(settings.FileReferences.Textures) || !settings.FileReferences.Textures.length) throw new Error('Live2D 模型缺少 Moc 或 Textures')
  const base = path.posix.dirname(raw.modelPath)
  const files = new Set([raw.modelPath])
  const reference = (name, extension) => {
    if (typeof name !== 'string' || !extension.test(name)) throw new Error(`Live2D 资源类型无效：${name}`)
    // Reject traversal before normalizing, even if it could remain within root.
    asset(path.join(root, base), name)
    const relative = base === '.' ? name : `${base}/${name}`
    files.add(relative)
    if (/\.json$/i.test(name)) json(root, relative)
    return relative
  }
  const refs = settings.FileReferences
  const moc = reference(refs.Moc, /\.moc3$/i)
  if (fs.readFileSync(asset(root, moc)).subarray(0, 4).toString() !== 'MOC3') throw new Error('Live2D moc3 文件无效')
  for (const name of refs.Textures) reference(name, /\.(png|webp|jpe?g)$/i)
  for (const key of ['Physics', 'Pose', 'DisplayInfo', 'UserData']) if (refs[key]) reference(refs[key], /\.json$/i)
  const actions = []
  for (const [group, motions] of Object.entries(refs.Motions || {})) {
    if (!Array.isArray(motions) || group.length > 120) throw new Error('Live2D 动作组无效')
    motions.forEach((motion, index) => {
      reference(motion.File, /\.motion3\.json$/i)
      if (motion.Sound) reference(motion.Sound, /\.(wav|mp3)$/i)
      actions.push({ id: `motion-${actions.length}`, type: 'motion', group, index, label: `${group} / ${index + 1}` })
    })
  }
  for (const expression of refs.Expressions || []) {
    reference(expression.File, /\.exp3\.json$/i)
    if (typeof expression.Name !== 'string' || expression.Name.length > 120) throw new Error('Live2D 表情名称无效')
    actions.push({ id: `expression-${actions.length}`, type: 'expression', name: expression.Name, label: expression.Name })
  }
  if (actions.length > 200 || files.size > 600) throw new Error('Live2D 最多 200 个动作、600 个资源')
  let total = 0
  for (const name of files) total += fs.statSync(asset(root, name)).size
  if (total > 128 * 1024 * 1024) throw new Error('Live2D 模型总大小不能超过 128 MB')
  const idle = actions.find(a => a.type === 'motion' && a.group.toLowerCase() === 'idle')
  const mapped = mappings(raw.live2d?.mappings || (idle ? { idle: idle.id } : {}), actions)
  return { schemaVersion: 1, renderer: 'live2d', id: raw.id, displayName: String(raw.displayName || raw.id).slice(0, 80), description: String(raw.description || '').slice(0, 240), modelPath: raw.modelPath, live2d: { mappings: mapped }, actions, files: [...files] }
}

function runtime(manifest, root) {
  installProtocol()
  let entry = [...mounts].find(([, item]) => item.root === root)
  if (!entry) { entry = [crypto.randomUUID(), { root, files: new Set(manifest.files) }]; mounts.set(...entry) }
  const idle = manifest.actions.find(a => a.id === manifest.live2d.mappings.idle && a.type === 'motion')
  const thumb = path.join(root, 'thumbnail.png')
  return { id: manifest.id, displayName: manifest.displayName, description: manifest.description, renderer: 'live2d', builtin: false, imported: true, sourceFormat: 'live2d', render: { engine: 'live2d', canvas: { width: 240, height: 300 } }, live2d: { entryUrl: `pet-asset://${entry[0]}/${manifest.modelPath.split('/').map(encodeURIComponent).join('/')}`, actions: manifest.actions, mappings: manifest.live2d.mappings, idleGroup: idle?.group }, thumbnailDataUrl: fs.existsSync(thumb) && fs.statSync(thumb).size < 2 * 1024 * 1024 ? `data:image/png;base64,${fs.readFileSync(thumb).toString('base64')}` : undefined }
}

function revoke(root) { for (const [key, item] of mounts) if (item.root === root || item.root.startsWith(root + path.sep)) mounts.delete(key) }
module.exports = { validate, runtime, revoke, asset, mappings, STATES, installProtocol }
