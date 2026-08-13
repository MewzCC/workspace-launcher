const { getDb } = require('./database.cjs')

const DEFAULTS = {
  closeToTray: true,
  openAtLogin: false,
  startMinimized: true,
  killBeforeLaunch: false,
  language: 'zh-CN',
  updateNotify: true,
  updateMode: 'background',
  skippedVersion: ''
}

let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    get: db.prepare('SELECT value FROM app_settings WHERE key = ?'),
    set: db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (@key, @value, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `)
  }
  return stmts
}

function decode(value, fallback) {
  if (value == null) return fallback
  try {
    return JSON.parse(value)
  } catch (_) {
    return fallback
  }
}

function get(key) {
  const fallback = DEFAULTS[key]
  const row = getStmts().get.get(key)
  return decode(row?.value, fallback)
}

function set(key, value) {
  getStmts().set.run({ key, value: JSON.stringify(value) })
  return value
}

function getAll() {
  return Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, get(key)]))
}

module.exports = { get, set, getAll, DEFAULTS }
