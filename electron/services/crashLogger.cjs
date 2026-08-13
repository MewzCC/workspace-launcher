// 本地崩溃与运行异常日志
// 主进程/渲染进程/子进程异常写入按日滚动的 JSONL 文件；
// 原生崩溃由 crashReporter 保存到同一日志目录下的 crashes 子目录。
// 同时保留最近 50 条错误在内存中，供诊断报告使用。
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app, crashReporter } = require('electron')

const MAX_LOG_BYTES = 5 * 1024 * 1024
const MAX_RECENT_ERRORS = 50
const recentErrors = []
let initialized = false
let fatalHandled = false

function getLogDir() {
  try {
    return path.join(app.getPath('userData'), 'logs')
  } catch (_) {
    return path.join(os.tmpdir(), 'LaunchPad', 'logs')
  }
}

function ensureLogDir() {
  const dir = getLogDir()
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (_) {
    // 日志不能影响应用主流程。
  }
  return dir
}

function getLogFile() {
  const day = new Date().toISOString().slice(0, 10)
  return path.join(ensureLogDir(), `launchpad-${day}.jsonl`)
}

function stringifyDetails(value) {
  if (value == null) return undefined
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack, code: value.code }
  }
  if (typeof value === 'object') {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch (_) {
      return String(value)
    }
  }
  return String(value)
}

function rotateIfNeeded(filePath) {
  try {
    if (fs.statSync(filePath).size <= MAX_LOG_BYTES) return
    fs.renameSync(filePath, `${filePath}.${Date.now()}`)
  } catch (_) {
    // 文件不存在或轮转失败时继续尝试追加。
  }
}

function log(event, details, extra = {}) {
  const timestamp = new Date().toISOString()
  const record = {
    timestamp,
    event,
    processType: process.type || 'browser',
    pid: process.pid,
    platform: process.platform,
    details: stringifyDetails(details),
    ...extra
  }
  try {
    const filePath = getLogFile()
    rotateIfNeeded(filePath)
    fs.appendFileSync(filePath, `${JSON.stringify(record)}${os.EOL}`, 'utf8')
  } catch (_) {
    // 崩溃处理路径不能再次抛出异常。
  }
  if (record.details) {
    recentErrors.push(record)
    if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift()
  }
  return record
}

function getRecentErrors(limit = 20) {
  return recentErrors.slice(-Math.max(1, Math.min(50, Number(limit) || 20)))
}

function initialize() {
  if (initialized) return
  initialized = true

  try {
    const crashDir = path.join(ensureLogDir(), 'crashes')
    fs.mkdirSync(crashDir, { recursive: true })
    app.setPath('crashDumps', crashDir)
    crashReporter.start({
      productName: 'LaunchPad',
      submitURL: 'https://example.invalid/launchpad-crashes',
      uploadToServer: false,
      compress: true
    })
  } catch (_) {
    // crashReporter 早期启动失败时，JS 日志仍然可用。
  }

  process.on('uncaughtException', (error) => {
    log('uncaught-exception', error)
    if (!fatalHandled) {
      fatalHandled = true
      setTimeout(() => app.quit(), 0)
    }
  })
  process.on('unhandledRejection', (reason) => {
    log('unhandled-rejection', reason)
  })
  app.on('child-process-gone', (_event, details) => {
    log('child-process-gone', details)
  })
}

function attachWindow(win) {
  if (!win?.webContents) return
  win.webContents.on('render-process-gone', (_event, details) => {
    log('render-process-gone', details)
  })
  win.webContents.on('unresponsive', () => {
    log('render-process-unresponsive', { url: win.webContents.getURL() })
  })
  win.webContents.on('responsive', () => {
    log('render-process-responsive', { url: win.webContents.getURL() })
  })
}

module.exports = { initialize, attachWindow, getLogDir, log, getRecentErrors }
