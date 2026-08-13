const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const path = require('path')
const { setupAppMenu, refreshAppMenu } = require('./menu.cjs')
const trayService = require('./services/trayService.cjs')
const shortcutService = require('./services/shortcutService.cjs')
const updateService = require('./services/updateService.cjs')
const systemPreferences = require('./services/systemPreferences.cjs')
const crashLogger = require('./services/crashLogger.cjs')
const petService = require('./services/petService.cjs')
const { t } = require('./i18n.cjs')

let mainWindow = null
let isQuitting = false
let trayHintShown = false

crashLogger.initialize()

function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(app.getAppPath(), 'build', 'icon.ico')
}

function applyNativeTheme(theme) {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow({ startHidden: false })
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function toggleMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    showMainWindow()
  }
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
  crashLogger.attachWindow(win)

  win.once('ready-to-show', () => {
    if (!startHidden) win.show()
  })

  win.on('close', (event) => {
    const closeToTray = require('./db/index.cjs').settingsDao.get('closeToTray')
    if (!isQuitting && closeToTray && trayService.hasTray()) {
      event.preventDefault()
      win.hide()
      if (!trayHintShown) {
        trayHintShown = true
        trayService.notify(t('tray.hintTitle'), t('tray.hintBody'))
      }
    }
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

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
    const db = require('./db/index.cjs')
    db.getDb()
    require('./ipc/handlers.cjs').registerIpcHandlers()

    applyNativeTheme('light')
    setupAppMenu()
    systemPreferences.syncLoginItem()

    ipcMain.handle('theme:set', (_e, theme) => {
      applyNativeTheme(theme)
      return { success: true }
    })

    ipcMain.handle('language:set', (_e, language) => {
      const { settingsDao } = require('./db/index.cjs')
      settingsDao.set('language', String(language))
      // 语言切换后刷新原生菜单与托盘菜单
      refreshAppMenu()
      trayService.refreshTrayMenu()
      return { success: true }
    })

    const startHidden = process.argv.includes('--hidden') && db.settingsDao.get('startMinimized')
    createWindow({ startHidden })
    trayService.createTray({
      showWindow: showMainWindow,
      toggleWindow: toggleMainWindow,
      quitApp
    })
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
  trayService.destroyTray()
  shortcutService.unregisterAll()
  updateService.stop()
  petService.destroyPetWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
