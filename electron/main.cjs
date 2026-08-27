const { app, BrowserWindow } = require('electron')
const petAssetProtocol = require('./services/petAssetProtocol.cjs')
const path = require('path')
const { setupAppMenu } = require('./menu.cjs')
const trayService = require('./services/trayService.cjs')
const shortcutService = require('./services/shortcutService.cjs')
const updateService = require('./services/updateService.cjs')
const systemPreferences = require('./services/systemPreferences.cjs')
const crashLogger = require('./services/crashLogger.cjs')
const petService = require('./services/petService.cjs')
const { applyNativeTheme } = require('./ipc/routers/systemRouter.cjs')
const { t } = require('./i18n.cjs')

let mainWindow = null
let isQuitting = false
let trayHintShown = false
let unsubscribeTrayUpdate = null
let mainWindowHiddenToTray = true

// 自定义资源协议必须在 ready 前声明权限，避免序列帧退化为巨型 base64 IPC。
petAssetProtocol.registerPrivileges()
crashLogger.initialize()

function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(app.getAppPath(), 'build', 'icon.ico')
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ startHidden: false })
    return
  }
  mainWindowHiddenToTray = false
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindowHiddenToTray = true
  mainWindow.hide()
}

function toggleMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    hideMainWindow()
  } else {
    showMainWindow()
  }
}

function openMainView(view) {
  showMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return
  const send = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:navigate', view)
  }
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send)
  else send()
}

function quitApp() {
  isQuitting = true
  app.quit()
}

function createWindow({ startHidden = false } = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f6f7fb',
    icon: getAppIconPath(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.cjs')
    }
  })
  mainWindow = win
  mainWindowHiddenToTray = Boolean(startHidden)
  crashLogger.attachWindow(win)

  win.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindowHiddenToTray = false
      win.show()
    }
  })

  win.on('close', (event) => {
    const closeToTray = require('./db/index.cjs').settingsDao.get('closeToTray')
    if (!isQuitting && closeToTray && trayService.hasTray()) {
      event.preventDefault()
      mainWindowHiddenToTray = true
      win.hide()
      if (!trayHintShown) {
        trayHintShown = true
        trayService.notify(t('tray.hintTitle'), t('tray.hintBody'))
      }
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null
      mainWindowHiddenToTray = true
    }
  })
  win.on('show', () => trayService.refreshTrayMenu())
  win.on('hide', () => trayService.refreshTrayMenu())
  win.on('minimize', () => setImmediate(() => trayService.refreshTrayMenu()))
  win.on('restore', () => setImmediate(() => trayService.refreshTrayMenu()))

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  app.whenReady().then(() => {
    // 运行时版本唯一来源：package.json -> app.getVersion() -> preload/渲染层。
    process.env.LAUNCHPAD_VERSION = app.getVersion()
    petAssetProtocol.install()
    const db = require('./db/index.cjs')
    db.getDb()
    require('./ipc/handlers.cjs').registerIpcHandlers()

    applyNativeTheme('light')
    setupAppMenu()
    systemPreferences.syncLoginItem()

    const startHidden = process.argv.includes('--hidden') && db.settingsDao.get('startMinimized')
    createWindow({ startHidden })
    trayService.createTray({
      showWindow: showMainWindow,
      hideWindow: hideMainWindow,
      toggleWindow: toggleMainWindow,
      quitApp,
      isWindowShown: () => Boolean(mainWindow && !mainWindow.isDestroyed() && !mainWindowHiddenToTray),
      openView: openMainView,
      checkForUpdates: () => updateService.checkForUpdates({ manual: true }),
      getUpdateStatus: () => updateService.getStatus(),
      setPetEnabled: (enabled) => petService.setGlobalEnabled(enabled)
    })
    unsubscribeTrayUpdate = updateService.subscribeStatus(() => trayService.refreshTrayMenu())
    shortcutService.init({ showWindow: showMainWindow })
    shortcutService.syncShortcuts()
    updateService.start()
    petService.init({
      showWindow: showMainWindow,
      openPetCenter: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:navigate', 'pet-center')
        }
      }
    })

    app.on('activate', showMainWindow)
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  unsubscribeTrayUpdate?.()
  unsubscribeTrayUpdate = null
  trayService.destroyTray()
  shortcutService.unregisterAll()
  updateService.stop()
  petService.destroyPetWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
