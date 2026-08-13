// 自动更新服务
// 打包安装版走 electron-updater；开发环境读取 dev-app-update.yml 检查版本（只读，不下载）。
// 前台：检测到新版本时渲染层弹窗（更新/跳过此版本/取消）；
// 后台（窗口隐藏于托盘）：静默下载，完成后询问是否重启安装。
const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const { settingsDao } = require('../db/index.cjs')
const { t } = require('../i18n.cjs')

const STARTUP_CHECK_DELAY = 15000
const CHECK_INTERVAL = 6 * 60 * 60 * 1000

let configured = false
let started = false
let checking = false
let startupTimer = null
let intervalTimer = null
let releasesCache = null
let installing = false

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

function hasVisibleWindow() {
  return BrowserWindow.getAllWindows().some((win) => !win.isDestroyed() && win.isVisible() && !win.isMinimized())
}

// 开发模式也通过 electron-updater 的 GitHub provider 检查版本（读取 dev-app-update.yml），
// 走 GitHub 下载通道，不受 API 限流影响；仅打包安装版支持下载与安装。
function getUnsupportedReason() {
  if (process.platform !== 'win32') return 'platform'
  if (process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR) {
    return 'portable'
  }
  return ''
}

// 上次成功安装的更新信息，重启后用于向用户展示“本次更新内容”。
function getLastUpdateFile() {
  return path.join(app.getPath('userData'), 'last-update.json')
}

function saveLastUpdate(info) {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(
      getLastUpdateFile(),
      JSON.stringify({
        version: info?.version || '',
        releaseName: info?.releaseName || '',
        releaseDate: info?.releaseDate || '',
        releaseNotes: info?.releaseNotes || '',
        installedAt: new Date().toISOString()
      }, null, 2),
      'utf8'
    )
  } catch (_) {
    // 记录失败不影响更新流程。
  }
}

function getLastUpdate() {
  try {
    const record = JSON.parse(fs.readFileSync(getLastUpdateFile(), 'utf8'))
    if (!record || typeof record !== 'object' || !record.version) return null
    // 只有版本与当前运行版本一致时，才认为是刚安装完成的更新。
    if (record.version !== getCurrentVersion()) return null
    return record
  } catch (_) {
    return null
  }
}

function clearLastUpdate() {
  try {
    fs.unlinkSync(getLastUpdateFile())
  } catch (_) {
    // 文件不存在时无需处理。
  }
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

// 简单 semver 比较：大于返回 1，等于 0，小于 -1
function compareVersions(left, right) {
  const parse = (value) => String(value || '')
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const av = a[index] || 0
    const bv = b[index] || 0
    if (av > bv) return 1
    if (av < bv) return -1
  }
  return 0
}

function configure() {
  if (configured) return
  configured = true
  autoUpdater.autoDownload = false
  // 用户点击“重启并安装”或直接关闭应用时自动安装，不需要手动引导安装界面。
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  // 开发模式允许读取 dev-app-update.yml 并执行检查（打包模式忽略此配置）。
  autoUpdater.forceDevUpdateConfig = true

  autoUpdater.on('checking-for-update', () => {
    checking = true
    setStatus({ state: 'checking', error: '' })
  })
  autoUpdater.on('update-available', (info) => {
    checking = false
    const version = info?.version || ''
    // 用户选择跳过该版本时不再提示/下载，直到出现更高版本。
    const skipped = settingsDao.get('skippedVersion')
    if (skipped && version && String(skipped) === String(version)) {
      setStatus({
        state: 'skipped',
        version,
        releaseName: info?.releaseName || '',
        releaseDate: info?.releaseDate || '',
        releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
        progress: 0,
        error: '',
        checkedAt: Date.now()
      })
      return
    }
    setStatus({
      state: 'available',
      version,
      releaseName: info?.releaseName || '',
      releaseDate: info?.releaseDate || '',
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes),
      progress: 0,
      error: '',
      checkedAt: Date.now()
    })
    // 后台静默更新：窗口隐藏在托盘时按更新方式自动下载，不打扰用户。
    const updateMode = settingsDao.get('updateMode')
    if (!hasVisibleWindow() && updateMode !== 'manual') {
      downloadUpdate()
    }
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
    const downloaded = {
      state: 'downloaded',
      version: info?.version || status.version,
      releaseName: info?.releaseName || status.releaseName,
      releaseDate: info?.releaseDate || status.releaseDate,
      releaseNotes: normalizeReleaseNotes(info?.releaseNotes) || status.releaseNotes,
      progress: 100,
      error: '',
      checkedAt: Date.now()
    }
    setStatus(downloaded)
    // 记录本次更新内容，供安装重启后弹窗展示。
    saveLastUpdate(downloaded)
    // 后台更新完成：全自动直接重启安装；后台静默则询问用户是否立即重启。
    if (!hasVisibleWindow() && !installing) {
      const updateMode = settingsDao.get('updateMode')
      if (updateMode === 'auto') {
        installUpdate()
        return
      }
      const parent = BrowserWindow.getAllWindows()[0]
      const options = {
        type: 'question',
        title: t('updateBackgroundTitle'),
        message: t('updateBackgroundMessage', { version: downloaded.version }),
        detail: t('updateBackgroundDetail'),
        buttons: [t('updateRestartNow'), t('updateLater')],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      }
      const promise = parent ? dialog.showMessageBox(parent, options) : dialog.showMessageBox(options)
      promise.then((result) => {
        if (result.response === 0) installUpdate()
      }).catch(() => {})
    }
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
  if (checking) return getStatus()

  const unsupported = getUnsupportedReason()
  if (unsupported) return setStatus({ state: 'unsupported', error: unsupported })

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
  if (!app.isPackaged) {
    return setStatus({ state: 'unsupported', error: 'development' })
  }
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
  if (!app.isPackaged) return getStatus()
  if (status.state !== 'downloaded') return getStatus()
  installing = true
  setStatus({ state: 'installing' })
  autoUpdater.quitAndInstall(false, true)
  return getStatus()
}

// 跳过当前版本：记录版本号，该版本不再提示（更高版本仍会正常提示）。
function skipVersion() {
  if (!status.version) return getStatus()
  settingsDao.set('skippedVersion', String(status.version))
  return setStatus({ state: 'skipped' })
}

function start() {
  if (started) return
  started = true

  // 开发环境不自动检查，仅支持设置页手动检查。
  if (!app.isPackaged) return
  const unsupported = getUnsupportedReason()
  if (unsupported) {
    setStatus({ state: 'unsupported', error: unsupported })
    return
  }

  configure()
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

// ===== 发布历史（更新日志弹窗）=====
// 读取随应用发布的本地清单 release-history.json（打包在 resources，开发在项目根），
// 不依赖 GitHub API（未认证限流频繁）。
// 安装包下载直链格式：https://github.com/MewzCC/workspace-launcher/releases/download/{tag}/LaunchPad-Setup-{version}-x64.exe
function buildSetupDownloadUrl(tag, version) {
  return `https://github.com/MewzCC/workspace-launcher/releases/download/${encodeURIComponent(tag)}/LaunchPad-Setup-${encodeURIComponent(version)}-x64.exe`
}

function getReleaseHistoryFile() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'release-history.json')
    : path.join(app.getAppPath(), 'release-history.json')
}

function getReleaseHistory() {
  if (releasesCache) return Promise.resolve(releasesCache)
  try {
    const raw = fs.readFileSync(getReleaseHistoryFile(), 'utf8')
    const list = JSON.parse(raw)
    releasesCache = (Array.isArray(list) ? list : [])
      .map((release) => ({
        tag: `v${String(release.version || '').replace(/^v/i, '')}`,
        version: String(release.version || '').replace(/^v/i, ''),
        name: release.name || `v${release.version}`,
        publishedAt: release.date || '',
        notes: String(release.notes || '').trim(),
        url: release.version ? buildSetupDownloadUrl(`v${String(release.version).replace(/^v/i, '')}`, String(release.version).replace(/^v/i, '')) : ''
      }))
      .filter((release) => release.version)
    return Promise.resolve(releasesCache)
  } catch (error) {
    return Promise.reject(new Error(`无法读取发布记录: ${error.message}`))
  }
}

module.exports = {
  start,
  stop,
  getStatus,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  skipVersion,
  getLastUpdate,
  clearLastUpdate,
  getReleaseHistory
}
