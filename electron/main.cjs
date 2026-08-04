const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const path = require('path')
const { setupAppMenu } = require('./menu.cjs')
const trayService = require('./services/trayService.cjs')
const systemPreferences = require('./services/systemPreferences.cjs')

let mainWindow = null
let isQuitting = false
let trayHintShown = false

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
        trayService.notify('LaunchPad 仍在运行', '窗口已收起到系统托盘，可继续一键启动工作空间。')
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

    const startHidden = process.argv.includes('--hidden') && db.settingsDao.get('startMinimized')
    createWindow({ startHidden })
    trayService.createTray({
      showWindow: showMainWindow,
      toggleWindow: toggleMainWindow,
      quitApp
    })

    app.on('activate', showMainWindow)
  })
}

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  trayService.destroyTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
