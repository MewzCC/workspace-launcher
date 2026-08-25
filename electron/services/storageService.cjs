// 用户数据存储位置服务
// 默认保存在固定的 roaming AppData 目录，避免产品名或 NSIS/自动更新变化导致数据库丢失。
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

function getStableUserRoot() {
  return path.join(app.getPath('appData'), 'workspace-launcher')
}

function getInstallRoot() {
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return normalizeDirectory(process.env.PORTABLE_EXECUTABLE_DIR)
  }
  if (app.isPackaged) return normalizeDirectory(path.dirname(process.execPath))
  return normalizeDirectory(getLegacyDirectory())
}

function getDefaultDirectory() {
  return path.join(getStableUserRoot(), DATA_DIR_NAME)
}

function getLegacyInstallDirectory() {
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
  if (!fs.existsSync(source) || samePath(sourceDirectory, targetDirectory)) return null

  fs.mkdirSync(targetDirectory, { recursive: true })
  const incomingBase = `${target}.incoming-${process.pid}-${Date.now()}`
  const copiedSuffixes = []
  for (const suffix of ['', '-wal', '-shm']) {
    const sourceFile = `${source}${suffix}`
    if (!fs.existsSync(sourceFile)) continue
    fs.copyFileSync(sourceFile, `${incomingBase}${suffix}`)
    copiedSuffixes.push(suffix)
  }
  let backupPath = null
  if (fs.existsSync(target)) {
    backupPath = `${target}.pre-migration-${Date.now()}.bak`
    fs.copyFileSync(target, backupPath)
  }
  try {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${target}${suffix}`) } catch (_) {}
    }
    for (const suffix of copiedSuffixes) fs.renameSync(`${incomingBase}${suffix}`, `${target}${suffix}`)
  } catch (error) {
    for (const suffix of copiedSuffixes) {
      try { fs.unlinkSync(`${incomingBase}${suffix}`) } catch (_) {}
    }
    if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(target)) fs.copyFileSync(backupPath, target)
    throw error
  }
  return backupPath
}

// 计算数据库的用户数据权重。排除运行时自动写入的派生设置，避免把空白新库
// 误判为有效数据而挡住旧版本迁移。
function databaseScore(databasePath) {
  try {
    const Database = require('better-sqlite3')
    const database = new Database(databasePath, { readonly: true })
    try {
      const tableExists = (name) => Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
      const businessTables = [
        'workspaces', 'software', 'scripts', 'bat_scripts', 'launch_logs',
        'ai_conversations', 'ai_messages', 'ai_memories', 'pet_interactions',
        'pet_diary_entries', 'pet_relationship_memories', 'pet_study_items', 'pet_study_cards'
      ]
      const businessRows = businessTables.reduce((total, name) => {
        if (!tableExists(name)) return total
        return total + Number(database.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get()?.count || 0)
      }, 0)
      let userSettings = 0
      if (tableExists('app_settings')) {
        userSettings = Number(database.prepare(`
          SELECT COUNT(*) AS count FROM app_settings
          WHERE key NOT IN ('petModelsDirectory', 'petInstancesInitialized', 'petKnownInstanceIds')
        `).get()?.count || 0)
      }
      return businessRows * 100 + userSettings
    } finally {
      database.close()
    }
  } catch (_) {
    return -1
  }
}

function migrateDatabase(sourceDirectory, targetDirectory, { force = false } = {}) {
  if (!sourceDirectory || samePath(sourceDirectory, targetDirectory)) return null
  const source = path.join(sourceDirectory, DATABASE_NAME)
  const target = path.join(targetDirectory, DATABASE_NAME)
  if (!fs.existsSync(source)) return null
  const sourceScore = databaseScore(source)
  if (sourceScore <= 0) return null
  // 目标已有真实数据时不覆盖，避免合并冲突。
  if (!force && fs.existsSync(target) && databaseScore(target) > 0) return null
  try {
    return {
      sourceDirectory,
      score: sourceScore,
      backupPath: copyLegacyDatabase(sourceDirectory, targetDirectory)
    }
  } catch (_) {
    // 迁移失败时保持源数据不动。
    return null
  }
}

function readStorageConfig() {
  const configPaths = uniqueDirectories([getStableUserRoot(), getLegacyDirectory()])
    .map((directory) => path.join(directory, CONFIG_NAME))
  for (const configPath of configPaths) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      if (typeof config.directory === 'string' && config.directory.trim()) {
        return { directory: normalizeDirectory(config.directory), customized: config.customized === true }
      }
    } catch (_) {}
  }
  return null
}

function writeConfiguredDirectory(directory, customized = false) {
  const stableUserRoot = getStableUserRoot()
  fs.mkdirSync(stableUserRoot, { recursive: true })
  fs.writeFileSync(
    path.join(stableUserRoot, CONFIG_NAME),
    JSON.stringify({ directory, customized, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  )
}

function looksLikeInstallDataDirectory(directory) {
  if (!directory) return false
  const installDirectory = normalizeDirectory(getLegacyInstallDirectory())
  if (samePath(directory, installDirectory)) return true
  if (path.basename(normalizeDirectory(directory)).toLowerCase() !== DATA_DIR_NAME.toLowerCase()) return false
  const parent = path.dirname(normalizeDirectory(directory))
  return fs.existsSync(path.join(parent, 'LaunchPad.exe'))
}

function uniqueDirectories(items) {
  const output = []
  for (const item of items) {
    if (!item || output.some((existing) => samePath(existing, item))) continue
    output.push(normalizeDirectory(item))
  }
  return output
}

function resolveStorage() {
  if (resolved) return resolved

  const legacyDirectory = normalizeDirectory(getLegacyDirectory())
  const stableUserRoot = normalizeDirectory(getStableUserRoot())
  const defaultDirectory = normalizeDirectory(getDefaultDirectory())
  const legacyInstallDirectory = normalizeDirectory(getLegacyInstallDirectory())
  const config = readStorageConfig()
  const configuredDirectory = config?.directory || null
  const configuredIsCustom = Boolean(configuredDirectory) && (config.customized || !looksLikeInstallDataDirectory(configuredDirectory))

  // 明确自定义的外部目录继续优先；旧版自动写入的安装目录迁移到稳定 AppData。
  let directory = configuredIsCustom ? configuredDirectory : defaultDirectory
  let fallback = false
  if (!canWrite(directory)) {
    // 已配置目录失效时优先尝试默认目录，最后回退 Electron 用户目录。
    directory = canWrite(defaultDirectory) ? defaultDirectory : legacyDirectory
    fallback = true
  }

  // 仅当目标尚无用户数据时，从旧配置、旧安装目录或早期 userData 根目录中
  // 选择数据量最大的有效数据库迁移；源文件始终保留。
  let migration = null
  const targetDatabase = path.join(directory, DATABASE_NAME)
  // 旧配置明确指向安装目录时，该数据库是升级前最后实际使用的数据源。
  // 即便稳定目录已有更早副本，也先备份目标再以此源迁移。
  const authoritativeInstallSource = configuredDirectory && !configuredIsCustom && !samePath(configuredDirectory, directory)
    && databaseScore(path.join(configuredDirectory, DATABASE_NAME)) > 0
  if (authoritativeInstallSource) {
    migration = migrateDatabase(configuredDirectory, directory, { force: true })
  } else if (!fs.existsSync(targetDatabase) || databaseScore(targetDatabase) <= 0) {
    const dataSources = uniqueDirectories([configuredDirectory, legacyInstallDirectory, stableUserRoot, legacyDirectory])
      .filter((source) => !samePath(source, directory))
      .map((source) => ({ directory: source, score: databaseScore(path.join(source, DATABASE_NAME)) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
    if (dataSources[0]) migration = migrateDatabase(dataSources[0].directory, directory)
  }

  writeConfiguredDirectory(directory, configuredIsCustom && samePath(directory, configuredDirectory))
  resolved = {
    directory,
    databasePath: path.join(directory, DATABASE_NAME),
    defaultDirectory,
    legacyDirectory,
    stableUserRoot,
    legacyInstallDirectory,
    customized: configuredIsCustom && samePath(directory, configuredDirectory),
    migratedFrom: migration?.sourceDirectory || null,
    migrationBackupPath: migration?.backupPath || null,
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
  if (fs.existsSync(targetDatabase) && databaseScore(targetDatabase) > 0) {
    throw new Error(t('errors.storageTargetHasData'))
  }

  fs.mkdirSync(target, { recursive: true })
  if (fs.existsSync(sourceDatabase)) fs.copyFileSync(sourceDatabase, targetDatabase)
  writeConfiguredDirectory(target, true)
  resolved = {
    directory: target,
    databasePath: targetDatabase,
    defaultDirectory: current.defaultDirectory,
    legacyDirectory: current.legacyDirectory,
    stableUserRoot: current.stableUserRoot,
    legacyInstallDirectory: current.legacyInstallDirectory,
    customized: true,
    fallback: false,
    writable: true
  }
  return { ...resolved, changed: true, previousDirectory: current.directory }
}

module.exports = { getDatabasePath, getInfo, relocate, databaseScore }
