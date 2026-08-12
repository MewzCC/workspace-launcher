// 用户数据存储位置服务
// 打包版默认将数据放在安装目录下的 LaunchPadData；安装目录不可写时回退到 Electron 用户目录。
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

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
  try {
    const legacyDirectory = getLegacyDirectory()
    fs.mkdirSync(legacyDirectory, { recursive: true })
    fs.writeFileSync(
      path.join(legacyDirectory, CONFIG_NAME),
      JSON.stringify({ directory, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    )
  } catch (_) {
    // 路径配置写入失败不影响数据库继续使用。
  }
}

function resolveStorage() {
  if (resolved) return resolved

  const legacyDirectory = normalizeDirectory(getLegacyDirectory())
  const defaultDirectory = normalizeDirectory(getDefaultDirectory())
  const configuredDirectory = readConfiguredDirectory()
  const candidates = [...new Set(
    [configuredDirectory, defaultDirectory, legacyDirectory]
      .filter(Boolean)
      .map(normalizeDirectory)
  )]

  let directory = legacyDirectory
  let fallback = true
  for (const candidate of candidates) {
    if (!canWrite(candidate)) continue
    directory = candidate
    fallback = !samePath(candidate, defaultDirectory)
    if (!samePath(candidate, legacyDirectory)) {
      try { copyLegacyDatabase(legacyDirectory, candidate) } catch (_) { /* 回退到已有目录 */ }
    }
    break
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

module.exports = { getDatabasePath, getInfo }
