const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { settingsDao } = require('../db/index.cjs')
const { readImageSize } = require('./imageSize.cjs')
const { t } = require('../i18n.cjs')
const { validateV3Manifest, PetManifestError } = require('./petRuntime/petManifestV3.cjs')
const { normalizeLegacyAtlas, normalizeSvg } = require('./petRuntime/legacyPetAdapter.cjs')
const { withCapabilities, prepareRuntimeModel } = require('./petRuntime/runtimeModel.cjs')
const petAssetProtocol = require('./petAssetProtocol.cjs')

const ATLAS_WIDTH = 1536
const ATLAS_HEIGHTS = { 1: 1872, 2: 2288 }
const BUILTIN_ID = 'builtin-launchbot'
const DRAG_ATLAS_STATES = new Set(['idle', 'wave', 'jump', 'failed', 'waiting', 'working', 'review'])
let resolvedModelsRoot = null
let generation = 1
let scanCache = null

function installRoot() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return path.resolve(process.env.PORTABLE_EXECUTABLE_DIR)
  if (app.isPackaged) return path.resolve(path.dirname(process.execPath))
  let current = path.resolve(app.getAppPath())
  while (true) {
    try {
      if (JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8')).name === 'workspace-launcher') return current
    } catch (_) {}
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return path.resolve(process.cwd())
}

function defaultPetsRoot() { return path.join(installRoot(), 'models') }
function samePath(left, right) { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase() }

function ensureWritable(directory) {
  fs.mkdirSync(directory, { recursive: true })
  const probe = path.join(directory, `.write-test-${process.pid}-${Date.now()}`)
  try { fs.writeFileSync(probe, ''); fs.unlinkSync(probe) } catch (_) {
    try { fs.unlinkSync(probe) } catch (_) {}
    throw new Error(t('pet.modelsPathNotWritable'))
  }
}

function migrateLegacyModels(target) {
  const configured = String(settingsDao.get('petModelsDirectory') || '').trim()
  const sources = [configured, path.join(app.getPath('userData'), 'pets')].filter((source, index, values) => source && values.findIndex((item) => samePath(item, source)) === index)
  let migratedModels = 0
  for (const source of sources) {
    if (samePath(source, target) || !fs.existsSync(source)) continue
    let entries = []
    try { entries = fs.readdirSync(source, { withFileTypes: true }).filter((entry) => entry.isDirectory() && fs.existsSync(path.join(source, entry.name, 'pet.json'))) } catch (_) { continue }
    for (const entry of entries) {
      const destination = path.join(target, entry.name)
      if (fs.existsSync(destination)) continue
      try { fs.cpSync(path.join(source, entry.name), destination, { recursive: true, errorOnExist: true, force: false }); migratedModels += 1 } catch (_) {
        // 保留旧目录不动，单个模型迁移失败不影响应用启动。
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
  try { ensureWritable(directory) } catch (_) { directory = fallbackDirectory; ensureWritable(directory); fallback = true }
  const migratedModels = migrateLegacyModels(directory)
  settingsDao.set('petModelsDirectory', directory)
  resolvedModelsRoot = { directory, defaultDirectory, fallback, migratedModels }
  return directory
}

function getStorageInfo() { const directory = petsRoot(); return { ...resolvedModelsRoot, directory, customized: false } }

function safeId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!id || id.length > 64) throw new Error(t('pet.invalidId'))
  return id
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/
const ANTENNA_TYPES = ['none', 'orb', 'line']
function validateSvgParams(raw) {
  const params = raw && typeof raw === 'object' ? raw : {}
  const color = (value) => { const text = String(value || '').trim(); if (!HEX_COLOR_RE.test(text)) throw new Error(t('pet.invalidColor', { value: text || '(empty)' })); return text.toLowerCase() }
  const antennaType = String(params.antennaType || 'orb').trim()
  if (!ANTENNA_TYPES.includes(antennaType)) throw new Error(t('pet.invalidAntennaType'))
  return { bodyColor: color(params.bodyColor), bodyInnerColor: color(params.bodyInnerColor), eyeColor: color(params.eyeColor), antennaType, antennaColor: antennaType === 'none' ? '#22d3ee' : color(params.antennaColor || params.bodyColor || '#22d3ee') }
}

function buildSvgManifest({ id, displayName, description, svgParams }) { return { id, displayName, description, renderer: 'svg', svgParams } }
function svgThumbDataUrl(item) {
  const color = item.svgParams?.bodyColor || '#6366f1'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 112"><rect x="26" y="30" width="68" height="64" rx="16" fill="${color}"/><circle cx="48" cy="58" r="7" fill="#0f172a"/><circle cx="72" cy="58" r="7" fill="#0f172a"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

function createFromAi(input) {
  const name = String(input?.name || '').trim().slice(0, 40)
  if (!name) throw new Error(t('pet.nameRequired'))
  const manifest = buildSvgManifest({ id: safeId(`ai-${name}`), displayName: name, description: String(input?.description || '').trim().slice(0, 240), svgParams: validateSvgParams(input?.svgParams) })
  const destination = path.join(petsRoot(), manifest.id)
  fs.mkdirSync(destination, { recursive: true })
  fs.writeFileSync(path.join(destination, 'pet.json'), JSON.stringify(manifest, null, 2), 'utf8')
  refresh()
  settingsDao.set('petModelId', manifest.id)
  require('./petProfileService.cjs').ensure(manifest.id, { displayName: name })
  return manifest
}

function validateLegacyManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error(t('pet.invalidManifest'))
  const id = safeId(raw.id)
  const spriteVersionNumber = raw.spriteVersionNumber == null ? 1 : Number(raw.spriteVersionNumber)
  if (![1, 2].includes(spriteVersionNumber)) throw new Error(t('pet.invalidVersion'))
  const spritesheetPath = String(raw.spritesheetPath || '').trim().replace(/\\/g, '/')
  if (!spritesheetPath || path.posix.basename(spritesheetPath) !== spritesheetPath || !/\.(png|webp)$/i.test(spritesheetPath)) throw new Error(t('pet.invalidSpritePath'))
  let dragAnimation
  if (raw.dragAnimation != null) {
    const frames = Array.isArray(raw.dragAnimation.frames) ? raw.dragAnimation.frames : []
    const atlasState = String(raw.dragAnimation.atlasState || '').trim()
    let normalizedFrames
    if (frames.length) {
      if (frames.length < 2 || frames.length > 120) throw new Error('dragAnimation.frames 必须包含 2-120 张图片')
      normalizedFrames = frames.map((value) => {
        const relativePath = String(value || '').trim().replace(/\\/g, '/')
        const normalized = path.posix.normalize(relativePath)
        if (!relativePath || path.posix.isAbsolute(relativePath) || normalized === '..' || normalized.startsWith('../') || !/\.(png|webp)$/i.test(normalized)) throw new Error('dragAnimation.frames 必须是模型目录内的 PNG 或 WebP 相对路径')
        return normalized
      })
    } else if (!DRAG_ATLAS_STATES.has(atlasState)) throw new Error('dragAnimation 必须提供有效的 atlasState 或动画帧')
    const count = normalizedFrames?.length || ({ idle: 6, wave: 4, jump: 5, failed: 8, waiting: 6, working: 6, review: 6 }[atlasState])
    const rawDurations = Array.isArray(raw.dragAnimation.durations) ? raw.dragAnimation.durations : []
    const durations = Array.from({ length: count }, (_, index) => Math.min(5000, Math.max(30, Number(rawDurations[index]) || 150)))
    dragAnimation = normalizedFrames ? { frames: normalizedFrames, durations } : { atlasState, durations }
  }
  return { id, displayName: String(raw.displayName || id).trim().slice(0, 80), description: String(raw.description || '').trim().slice(0, 500), spriteVersionNumber, spritesheetPath, ...(dragAnimation ? { dragAnimation } : {}) }
}

function validateLegacyAssets(directory, manifest) {
  const spritePath = path.join(directory, manifest.spritesheetPath)
  if (!fs.existsSync(spritePath)) throw new Error(t('pet.spriteNotFound', { name: manifest.spritesheetPath }))
  const size = readImageSize(spritePath)
  const expectedHeight = ATLAS_HEIGHTS[manifest.spriteVersionNumber]
  if (size.width !== ATLAS_WIDTH || size.height !== expectedHeight) throw new Error(t('pet.invalidAtlasSize', { version: manifest.spriteVersionNumber, width: ATLAS_WIDTH, height: expectedHeight, actualWidth: size.width, actualHeight: size.height }))
  for (const relativePath of manifest.dragAnimation?.frames || []) {
    const root = path.resolve(directory)
    const filePath = path.resolve(root, ...relativePath.split('/'))
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath)) throw new Error(`找不到拖拽动画帧：${relativePath}`)
    readImageSize(filePath)
  }
}

function normalizeDirectory(directory) {
  const manifestPath = path.join(directory, 'pet.json')
  if (!fs.existsSync(manifestPath)) return null
  let raw
  try { raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch (error) {
    return { status: 'invalid', idHint: path.basename(directory), directory, issues: [{ code: 'MANIFEST_JSON_INVALID', path: 'pet.json', message: error.message }] }
  }
  try {
    let model
    if (Number(raw.schemaVersion) === 3) model = withCapabilities({ ...validateV3Manifest(raw, directory), directory })
    else if (raw.renderer === 'svg') {
      const manifest = buildSvgManifest({ id: safeId(raw.id), displayName: String(raw.displayName || raw.id).trim().slice(0, 80), description: String(raw.description || '').trim().slice(0, 500), svgParams: validateSvgParams(raw.svgParams) })
      model = normalizeSvg(manifest, directory)
    } else {
      const manifest = validateLegacyManifest(raw)
      validateLegacyAssets(directory, manifest)
      model = normalizeLegacyAtlas(manifest, directory)
    }
    petAssetProtocol.registerModel(model)
    return { status: 'valid', model }
  } catch (error) {
    const issues = error instanceof PetManifestError ? error.issues : [{ code: 'MANIFEST_SCHEMA_UNSUPPORTED', path: 'pet.json', message: error.message }]
    return { status: 'invalid', idHint: String(raw.id || path.basename(directory)).slice(0, 64), directory, issues }
  }
}

function scan() {
  if (scanCache) return scanCache
  petAssetProtocol.clearModels()
  scanCache = fs.readdirSync(petsRoot(), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => normalizeDirectory(path.join(petsRoot(), entry.name))).filter(Boolean)
  return scanCache
}

function builtinModel() {
  return { id: BUILTIN_ID, displayName: 'LaunchBot', description: t('pet.builtinDescription'), schemaVersion: 3, sourceFormat: 'builtin-svg', builtin: true, imported: false, status: 'valid', render: { engine: 'builtin', canvas: { width: 80, height: 112 }, animations: {} }, semantics: { bindings: { idle: ['idle'] } }, capabilities: { animations: ['idle'], intents: ['idle'], lookDirections: [] } }
}

function list() {
  const items = scan().map((result) => {
    if (result.status === 'invalid') return { id: result.idHint, displayName: result.idHint, description: result.issues[0]?.message || '模型无效', status: 'invalid', invalid: true, imported: true, builtin: false, diagnostics: result.issues }
    const runtime = prepareRuntimeModel(result.model, generation)
    return { ...runtime, status: 'valid', imported: true, builtin: false, ...(runtime.sourceFormat === 'legacy-svg' ? { renderer: 'svg', svgParams: runtime.render.svgParams, svgThumbDataUrl: svgThumbDataUrl(runtime.render) } : {}) }
  })
  return [builtinModel(), ...items]
}

function resolveManifestPath(inputPath) {
  const target = path.resolve(String(inputPath || '').trim())
  if (!target || !fs.existsSync(target)) throw new Error(t('pet.pathMissing'))
  const manifestPath = fs.statSync(target).isDirectory() ? path.join(target, 'pet.json') : target
  if (path.basename(manifestPath).toLowerCase() !== 'pet.json' || !fs.existsSync(manifestPath)) throw new Error(t('pet.choosePetPath'))
  return manifestPath
}

function copyDeclaredAssets(model, sourceDir, destination) {
  for (const asset of model.assets || []) {
    const source = path.resolve(sourceDir, ...asset.relativePath.split('/'))
    const target = path.resolve(destination, ...asset.relativePath.split('/'))
    if (samePath(source, target)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }
}

function importFromManifest(inputPath) {
  const manifestPath = resolveManifestPath(inputPath)
  const sourceDir = path.dirname(manifestPath)
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  let model
  if (Number(raw.schemaVersion) === 3) model = withCapabilities(validateV3Manifest(raw, sourceDir))
  else {
    const manifest = validateLegacyManifest(raw)
    validateLegacyAssets(sourceDir, manifest)
    model = normalizeLegacyAtlas(manifest, sourceDir)
  }
  const destination = path.join(petsRoot(), model.id)
  fs.mkdirSync(destination, { recursive: true })
  copyDeclaredAssets(model, sourceDir, destination)
  if (!samePath(manifestPath, path.join(destination, 'pet.json'))) fs.copyFileSync(manifestPath, path.join(destination, 'pet.json'))
  refresh()
  settingsDao.set('petModelId', model.id)
  return { id: model.id, displayName: model.displayName, sourceDirectory: sourceDir, schemaVersion: model.schemaVersion, sourceFormat: model.sourceFormat }
}

function select(id) {
  const target = String(id || '')
  if (!list().some((item) => item.id === target && item.status === 'valid')) throw new Error(t('pet.modelUnavailable'))
  settingsDao.set('petModelId', target)
  return getRuntimeModel(target)
}

function remove(id) {
  const target = safeId(id)
  if (target === BUILTIN_ID) throw new Error(t('pet.builtinCannotDelete'))
  const directory = path.resolve(petsRoot(), target)
  const root = path.resolve(petsRoot())
  if (path.dirname(directory) !== root) throw new Error(t('pet.invalidPetPath'))
  fs.rmSync(directory, { recursive: true, force: true })
  refresh()
  if (settingsDao.get('petModelId') === target) settingsDao.set('petModelId', BUILTIN_ID)
  return { success: true }
}

function getRuntimeModel(modelId) {
  const explicit = modelId != null && String(modelId).trim() !== ''
  const selected = explicit ? String(modelId) : String(settingsDao.get('petModelId') || BUILTIN_ID)
  if (selected === BUILTIN_ID) return builtinModel()
  const result = scan().find((item) => item.status === 'valid' && item.model.id === selected)
  if (!result) {
    if (!explicit) settingsDao.set('petModelId', BUILTIN_ID)
    return explicit ? null : builtinModel()
  }
  return { ...prepareRuntimeModel(result.model, generation), status: 'valid', imported: true, builtin: false }
}

function refresh() { generation += 1; scanCache = null; return list() }
function openFolder() { return petsRoot() }

module.exports = { list, refresh, importFromManifest, select, remove, getRuntimeModel, openFolder, getStorageInfo, createFromAi, normalizeDirectory, BUILTIN_ID }
