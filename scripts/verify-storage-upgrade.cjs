const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-storage-upgrade-'))
const installRoot = path.join(testRoot, 'installed-app')
const oldDataDirectory = path.join(installRoot, 'LaunchPadData')
const userDataDirectory = path.join(testRoot, 'user-data')
const appDataDirectory = path.join(testRoot, 'app-data')
process.env.PORTABLE_EXECUTABLE_DIR = installRoot

app.whenReady().then(() => {
  app.setPath('userData', userDataDirectory)
  app.setPath('appData', appDataDirectory)
  fs.mkdirSync(oldDataDirectory, { recursive: true })
  fs.mkdirSync(userDataDirectory, { recursive: true })
  fs.writeFileSync(path.join(installRoot, 'LaunchPad.exe'), '')

  const Database = require('better-sqlite3')
  const oldDatabasePath = path.join(oldDataDirectory, 'workspace-launcher.db')
  const oldDatabase = new Database(oldDatabasePath)
  oldDatabase.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE software (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
  `)
  oldDatabase.prepare('INSERT INTO workspaces (name) VALUES (?)').run('升级前工作空间')
  oldDatabase.prepare('INSERT INTO software (name) VALUES (?)').run('升级前软件')
  oldDatabase.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('aiProvider', JSON.stringify('custom'))
  oldDatabase.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run('aiProviderKeysEncrypted', JSON.stringify({ custom: 'encrypted-key-placeholder' }))
  oldDatabase.pragma('wal_checkpoint(TRUNCATE)')
  oldDatabase.close()

  // 模拟 AppData 中已经存在一份更早的数据库副本；迁移前必须备份它，
  // 并以配置指向的旧安装目录数据库为权威来源。
  const stableUserRoot = path.join(appDataDirectory, 'workspace-launcher')
  const previousStableDirectory = path.join(stableUserRoot, 'LaunchPadData')
  fs.mkdirSync(previousStableDirectory, { recursive: true })
  const previousStable = new Database(path.join(previousStableDirectory, 'workspace-launcher.db'))
  previousStable.exec(`
    CREATE TABLE workspaces (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE software (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
  `)
  previousStable.prepare('INSERT INTO workspaces (name) VALUES (?)').run('更早的工作空间副本')
  previousStable.close()

  // 旧版会把自动选择的安装目录也写进配置，但没有 customized 字段。
  fs.writeFileSync(
    path.join(userDataDirectory, 'storage-location.json'),
    JSON.stringify({ directory: oldDataDirectory, updatedAt: new Date().toISOString() }),
    'utf8'
  )

  const storageService = require('../electron/services/storageService.cjs')
  const info = storageService.getInfo()
  const expectedDirectory = path.join(stableUserRoot, 'LaunchPadData')
  assert.strictEqual(path.resolve(info.directory), path.resolve(expectedDirectory))
  assert.strictEqual(path.resolve(info.migratedFrom), path.resolve(oldDataDirectory))
  assert.strictEqual(info.customized, false)
  assert(fs.existsSync(oldDatabasePath), '旧数据库必须保留')
  assert(info.migrationBackupPath && fs.existsSync(info.migrationBackupPath), 'AppData 中的旧副本必须先备份')

  const migrated = new Database(info.databasePath, { readonly: true })
  assert.strictEqual(migrated.prepare('SELECT name FROM workspaces').get().name, '升级前工作空间')
  assert.strictEqual(migrated.prepare('SELECT name FROM software').get().name, '升级前软件')
  assert.strictEqual(JSON.parse(migrated.prepare("SELECT value FROM app_settings WHERE key='aiProvider'").get().value), 'custom')
  assert.deepStrictEqual(JSON.parse(migrated.prepare("SELECT value FROM app_settings WHERE key='aiProviderKeysEncrypted'").get().value), { custom: 'encrypted-key-placeholder' })
  migrated.close()

  const updatedConfig = JSON.parse(fs.readFileSync(path.join(stableUserRoot, 'storage-location.json'), 'utf8'))
  assert.strictEqual(path.resolve(updatedConfig.directory), path.resolve(expectedDirectory))
  assert.strictEqual(updatedConfig.customized, false)

  fs.rmSync(testRoot, { recursive: true, force: true })
  console.log('升级数据目录迁移验证通过 ✓')
  app.quit()
}).catch((error) => {
  console.error(error)
  try { fs.rmSync(testRoot, { recursive: true, force: true }) } catch (_) {}
  app.exit(1)
})
