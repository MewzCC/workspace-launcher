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
let dataUrlCache = new Map()

function petsRoot() {
  const configured = String(settingsDao.get('petModelsDirectory') || '').trim()
  const root = configured ? path.resolve(configured) : path.join(app.getPath('userData'), 'pets')
  fs.mkdirSync(root, { recursive: true })
  return root
}

function defaultPetsRoot() {
  return path.join(app.getPath('userData'), 'pets')
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function pathsOverlap(left, right) {
  const a = `${path.resolve(left).toLowerCase()}${path.sep}`
  const b = `${path.resolve(right).toLowerCase()}${path.sep}`
  return a.startsWith(b) || b.startsWith(a)
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

function getStorageInfo() {
  const directory = petsRoot()
  return {
    directory,
    defaultDirectory: defaultPetsRoot(),
    customized: !samePath(directory, defaultPetsRoot())
  }
}

function setStorageDirectory(targetDirectory) {
  const source = petsRoot()
  const target = path.resolve(String(targetDirectory || '').trim())
  if (!targetDirectory || !target) throw new Error(t('pet.modelsPathRequired'))
  if (samePath(source, target)) return getStorageInfo()
  if (pathsOverlap(source, target)) throw new Error(t('pet.modelsPathOverlap'))
  ensureWritable(target)

  const entries = fs.readdirSync(source, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  for (const entry of entries) {
    if (fs.existsSync(path.join(target, entry.name))) {
      throw new Error(t('pet.modelsTargetConflict', { name: entry.name }))
    }
  }
  for (const entry of entries) {
    fs.cpSync(path.join(source, entry.name), path.join(target, entry.name), {
      recursive: true,
      errorOnExist: true,
      force: false
    })
  }
  settingsDao.set('petModelsDirectory', target)
  dataUrlCache.clear()
  return { ...getStorageInfo(), previousDirectory: source, migratedModels: entries.length }
}

function safeId(value) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!id || id.length > 64) throw new Error(t('pet.invalidId'))
  return id
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
  return {
    id,
    displayName: String(manifest.displayName || id).trim().slice(0, 80),
    description: String(manifest.description || '').trim().slice(0, 240),
    spriteVersionNumber,
    spritesheetPath: spriteName
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
    const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
    const spritePath = path.join(directory, manifest.spritesheetPath)
    validateAtlas(spritePath, manifest.spriteVersionNumber)
    return { ...manifest, directory, spritePath, imported: true }
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

function list() {
  const imported = fs.readdirSync(petsRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPetDirectory(path.join(petsRoot(), entry.name)))
    .filter(Boolean)
    .map(({ directory, spritePath, ...item }) => ({
      ...item,
      builtin: false,
      spritesheetDataUrl: spriteDataUrl({ ...item, spritePath })
    }))
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

  const destination = path.join(petsRoot(), manifest.id)
  fs.mkdirSync(destination, { recursive: true })
  const spriteName = `spritesheet${path.extname(sourceSprite).toLowerCase()}`
  fs.copyFileSync(sourceSprite, path.join(destination, spriteName))
  const normalized = { ...manifest, spritesheetPath: spriteName }
  fs.writeFileSync(path.join(destination, 'pet.json'), JSON.stringify(normalized, null, 2), 'utf8')
  dataUrlCache.delete(manifest.id)
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
  dataUrlCache.delete(target)
  if (settingsDao.get('petModelId') === target) settingsDao.set('petModelId', BUILTIN_ID)
  return { success: true }
}

function getRuntimeModel() {
  const selected = settingsDao.get('petModelId') || BUILTIN_ID
  if (selected === BUILTIN_ID) return { id: BUILTIN_ID, builtin: true }
  const item = readPetDirectory(path.join(petsRoot(), selected))
  if (!item) {
    settingsDao.set('petModelId', BUILTIN_ID)
    return { id: BUILTIN_ID, builtin: true }
  }
  return {
    id: item.id,
    displayName: item.displayName,
    description: item.description,
    spriteVersionNumber: item.spriteVersionNumber,
    builtin: false,
    spritesheetDataUrl: spriteDataUrl(item)
  }
}

function openFolder() {
  return petsRoot()
}

module.exports = { list, importFromManifest, select, remove, getRuntimeModel, openFolder, getStorageInfo, setStorageDirectory, BUILTIN_ID }
