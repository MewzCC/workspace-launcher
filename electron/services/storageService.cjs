// 用户数据存储位置服务
// 打包版默认将数据放在安装目录下的 LaunchPadData；安装目录不可写时回退到 Electron 用户目录。
const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { t } = require('../i18n.cjs')

const DATA_DIR_NAME = 'LaunchPadData'
const DATABASE_NAME = 'workspace-launcher.db'
const CONFIG_NAME = 'storage-location.json'

let resolved = null

function normalizeDirectory(directory) {
  return path.resolve(String(directory || '').trim())
}

function samePath(left, right) {
  return normalizeDirectory(left).toLowerCase() === normalizeDirectory(right).toLowerCase()
}

function getLegacyDirectory() {
  return app.getPath('userData')
}

function getInstallRoot() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return normalizeDirectory(process.env.PORTABLE_EXECUTABLE_DIR)
  }
  if (app.isPackaged) return normalizeDirectory(path.dirname(process.execPath))
  return normalizeDirectory(getLegacyDirectory())
}

function getDefaultDirectory() {
  return path.join(getInstallRoot(), DATA_DIR_NAME)
}

function canWrite(directory) {
  try {
    fs.mkdirSync(directory, { recursive: true })
    const probe = path.join(directory, `.write-test-${process.pid}-${Date.now()}`)
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
    return true
  } catch (_) {
    return false
  }
}

function copyLegacyDatabase(sourceDirectory, targetDirectory) {
  const source = path.join(sourceDirectory, DATABASE_NAME)
  const target = path.join(targetDirectory, DATABASE_NAME)
  if (!fs.existsSync(source) || fs.existsSync(target) || samePath(sourceDirectory, targetDirectory)) return false

  fs.mkdirSync(targetDirectory, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    const sourceFile = `${source}${suffix}`
    const targetFile = `${target}${suffix}`
    if (fs.existsSync(sourceFile)) fs.copyFileSync(sourceFile, targetFile)
  }
  return true
}

// 判断数据库里是否已有实际业务数据（避免把空库当成有效数据）。
function countDatabaseRows(databasePath) {
  try {
    const Database = require('better-sqlite3')
    const database = new Database(databasePath, { readonly: true })
    try {
      const workspaces = database.prepare('SELECT COUNT(*) AS count FROM workspaces').get()?.count || 0
      const software = database.prepare('SELECT COUNT(*) AS count FROM software').get()?.count || 0
      return workspaces + software
    } finally {
      database.close()
    }
  } catch (_) {
    return -1
  }
}

function migrateDatabase(sourceDirectory, targetDirectory) {
  if (!sourceDirectory || samePath(sourceDirectory, targetDirectory)) return
  const source = path.join(sourceDirectory, DATABASE_NAME)
  const target = path.join(targetDirectory, DATABASE_NAME)
  if (!fs.existsSync(source)) return
  const sourceRows = countDatabaseRows(source)
  if (sourceRows <= 0) return
  // 目标已有真实数据时不覆盖，避免合并冲突。
  if (fs.existsSync(target) && countDatabaseRows(target) > 0) return
  try {
    copyLegacyDatabase(sourceDirectory, targetDirectory)
  } catch (_) {
    // 迁移失败时保持源数据不动。
  }
}

function readConfiguredDirectory() {
  try {
    const configPath = path.join(getLegacyDirectory(), CONFIG_NAME)
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return typeof config.directory === 'string' && config.directory.trim()
      ? normalizeDirectory(config.directory)
      : null
  } catch (_) {
    return null
  }
}

function writeConfiguredDirectory(directory) {
  const legacyDirectory = getLegacyDirectory()
  fs.mkdirSync(legacyDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(legacyDirectory, CONFIG_NAME),
    JSON.stringify({ directory, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
}

function resolveStorage() {
  if (resolved) return resolved

  const legacyDirectory = normalizeDirectory(getLegacyDirectory())
  const defaultDirectory = normalizeDirectory(getDefaultDirectory())
  const configuredDirectory = readConfiguredDirectory()

  // 用户明确选择的目录优先；未配置时才跟随安装目录。
  let directory = configuredDirectory || defaultDirectory
  let fallback = false
  if (!canWrite(directory)) {
    // 已配置目录失效时优先尝试默认目录，最后回退 Electron 用户目录。
    directory = canWrite(defaultDirectory) ? defaultDirectory : legacyDirectory
    fallback = true
  }

  // 数据迁移：旧配置目录或旧用户数据目录中已有数据库时，迁移到新选定的目录。
  const dataSources = [configuredDirectory, legacyDirectory]
    .filter((source) => source && !samePath(source, directory))
  for (const source of dataSources) {
    migrateDatabase(source, directory)
  }

  writeConfiguredDirectory(directory)
  resolved = {
    directory,
    databasePath: path.join(directory, DATABASE_NAME),
    defaultDirectory,
    legacyDirectory,
    fallback,
    writable: canWrite(directory)
  }
  return resolved
}

function getDatabasePath() {
  return resolveStorage().databasePath
}

function getInfo() {
  return { ...resolveStorage() }
}

function relocate(targetDirectory) {
  const current = resolveStorage()
  const target = normalizeDirectory(targetDirectory)
  if (!targetDirectory || !target) throw new Error(t('errors.storagePathRequired'))
  if (samePath(current.directory, target)) return { ...current, changed: false }
  if (!canWrite(target)) throw new Error(t('errors.storagePathNotWritable'))

  const sourceDatabase = current.databasePath
  const targetDatabase = path.join(target, DATABASE_NAME)
  if (fs.existsSync(targetDatabase) && countDatabaseRows(targetDatabase) > 0) {
    throw new Error(t('errors.storageTargetHasData'))
  }

  fs.mkdirSync(target, { recursive: true })
  if (fs.existsSync(sourceDatabase)) fs.copyFileSync(sourceDatabase, targetDatabase)
  writeConfiguredDirectory(target)
  resolved = {
    directory: target,
    databasePath: targetDatabase,
    defaultDirectory: current.defaultDirectory,
    legacyDirectory: current.legacyDirectory,
    fallback: false,
    writable: true
  }
  return { ...resolved, changed: true, previousDirectory: current.directory }
}

module.exports = { getDatabasePath, getInfo, relocate }
