// 自动更新服务
// 仅在已打包的 Windows 安装版中运行；开发环境和便携版不会发起更新下载。
const { app, BrowserWindow } = require('electron')
const { autoUpdater } = require('electron-updater')

const STARTUP_CHECK_DELAY = 15000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

let configured = false
let started = false
let checking = false
let startupTimer = null
let intervalTimer = null

const status = {
  state: 'idle',
  currentVersion: '',
  version: '',
  releaseName: '',
  releaseDate: '',
  releaseNotes: '',
  progress: 0,
  bytesPerSecond: 0,
  transferred: 0,
  total: 0,
  error: '',
  checkedAt: null
}

function getCurrentVersion() {
  try {
    return app.getVersion()
  } catch (_) {
    return '0.0.0'
  }
}

function getUnsupportedReason() {
  if (!app.isPackaged) return 'development'
  if (process.platform !== 'win32') return 'platform'
  if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) {
    return 'portable'
  }
  return ''
}

function getStatus() {
  return { ...status, currentVersion: getCurrentVersion() }
}

function notifyRenderer() {
  const payload = getStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', payload)
  }
}

function setStatus(patch) {
  Object.assign(status, patch)
  notifyRenderer()
  return getStatus()
}

function normalizeReleaseNotes(notes) {
  if (typeof notes === 'string') return notes.trim()
  if (!Array.isArray(notes)) return ''
  return notes
    .map((item) => {
      if (typeof item === 'string') return item
      const version = item?.version ? `## v${item.version}\n` : ''
      return `${version}${String(item?.note || '')}`.trim()
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function configure() {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    checking = true
    setStatus({ state: 'checking', error: '' })
  })
  autoUpdater.on('update-available', (info) => {
    checking = false
    setStatus({
      state: 'available',
      version: info?.version || '',
      releaseName: info?.releaseName || '',
      releaseDate: info?.releaseDate || '',
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
      progress: 0,
      error: '',
      checkedAt: Date.now()
    })
  })
  autoUpdater.on('update-not-available', () => {
    checking = false
    setStatus({
      state: 'up-to-date',
      version: '',
      releaseName: '',
      releaseDate: '',
      releaseNotes: '',
      progress: 0,
      error: '',
      checkedAt: Date.now()
    })
  })
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      progress: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
      bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
      transferred: Number(progress?.transferred) || 0,
      total: Number(progress?.total) || 0,
      error: ''
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    checking = false
    setStatus({
      state: 'downloaded',
      version: info?.version || status.version,
      releaseName: info?.releaseName || status.releaseName,
      releaseDate: info?.releaseDate || status.releaseDate,
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes) || status.releaseNotes,
      progress: 100,
      error: '',
      checkedAt: Date.now()
    })
  })
  autoUpdater.on('error', (error) => {
    checking = false
    setStatus({
      state: 'error',
      error: error?.message || String(error),
      checkedAt: Date.now()
    })
  })
}

async function checkForUpdates() {
  const unsupported = getUnsupportedReason()
  if (unsupported) return setStatus({ state: 'unsupported', error: unsupported })
  if (checking) return getStatus()

  configure()
  checking = true
  setStatus({ state: 'checking', error: '' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    checking = false
    return setStatus({
      state: 'error',
      error: error?.message || String(error),
      checkedAt: Date.now()
    })
  }
  return getStatus()
}

async function downloadUpdate() {
  const unsupported = getUnsupportedReason()
  if (unsupported) return setStatus({ state: 'unsupported', error: unsupported })
  if (status.state !== 'available') return getStatus()

  configure()
  try {
    setStatus({ state: 'downloading', progress: 0, error: '' })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    return setStatus({
      state: 'error',
      error: error?.message || String(error),
      checkedAt: Date.now()
    })
  }
  return getStatus()
}

function installUpdate() {
  if (status.state !== 'downloaded') return getStatus()
  setStatus({ state: 'installing' })
  autoUpdater.quitAndInstall(false, true)
  return getStatus()
}

function start() {
  if (started) return
  started = true
  configure()

  const unsupported = getUnsupportedReason()
  if (unsupported) {
    setStatus({ state: 'unsupported', error: unsupported })
    return
  }

  startupTimer = setTimeout(() => { checkForUpdates() }, STARTUP_CHECK_DELAY)
  startupTimer.unref?.()
  intervalTimer = setInterval(() => { checkForUpdates() }, CHECK_INTERVAL)
  intervalTimer.unref?.()
}

function stop() {
  if (startupTimer) clearTimeout(startupTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  startupTimer = null
  intervalTimer = null
}

module.exports = {
  start,
  stop,
  getStatus,
  checkForUpdates,
  downloadUpdate,
  installUpdate
}
