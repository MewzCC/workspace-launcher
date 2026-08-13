// 桌宠服务
// 独立透明置顶窗口承载宠物；渲染层驱动动画与漫游，主进程负责窗口位置、菜单与持久化。
const path = require('path')
const { BrowserWindow, screen, Menu, ipcMain } = require('electron')
const { settingsDao } = require('../db/index.cjs')
const { t } = require('../i18n.cjs')

const PET_SIZE = 220
const PET_WINDOW_ID = 'pet'

let petWindow = null
let callbacks = null

function getPetPosition() {
  const { workArea } = screen.getPrimaryDisplay()
  const saved = settingsDao.get('petPosition')
  const fallback = {
    x: workArea.x + workArea.width - PET_SIZE - 60,
    y: workArea.y + workArea.height - PET_SIZE - 10
  }
  return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    ? { x: saved.x, y: saved.y }
    : fallback
}

function petUrl() {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}#/pet`
  }
  return null
}

function createPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) return petWindow
  const position = getPetPosition()
  const win = new BrowserWindow({
    width: PET_SIZE,
    height: PET_SIZE,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.cjs')
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  petWindow = win

  win.on('closed', () => {
    if (petWindow === win) petWindow = null
  })

  // 拖拽/漫游结束时持久化位置（move 事件高频，节流保存）
  let saveTimer = null
  win.on('move', () => {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      savePosition()
    }, 800)
  })

  const url = petUrl()
  if (url) {
    win.loadURL(url)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: '/pet' })
  }
  return win
}

function savePosition() {
  if (!petWindow || petWindow.isDestroyed()) return
  const [x, y] = petWindow.getPosition()
  settingsDao.set('petPosition', { x, y })
}

function homePosition() {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - PET_SIZE - 60,
    y: workArea.y + workArea.height - PET_SIZE - 10
  }
}

function showPetWindow() {
  if (!settingsDao.get('petEnabled')) return
  const win = createPetWindow()
  if (win.isMinimized()) win.restore()
  win.showInactive()
}

function hidePetWindow() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide()
}

function destroyPetWindow() {
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy()
  petWindow = null
}

function popupMenu() {
  const menu = Menu.buildFromTemplate([
    { label: t('pet.openLaunchpad'), click: () => callbacks?.showWindow?.() },
    { label: t('pet.goHome'), click: () => {
      if (!petWindow || petWindow.isDestroyed()) return
      const home = homePosition()
      petWindow.setPosition(home.x, home.y)
      settingsDao.set('petPosition', home)
    } },
    { type: 'separator' },
    { label: t('pet.hide'), click: () => {
      settingsDao.set('petEnabled', false)
      hidePetWindow()
    } }
  ])
  menu.popup({ window: petWindow || undefined })
}

function registerPetIpc() {
  ipcMain.on('pet:move', (_event, position) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const x = Number(position?.x)
    const y = Number(position?.y)
    if (Number.isFinite(x) && Number.isFinite(y)) petWindow.setPosition(Math.round(x), Math.round(y))
  })
  ipcMain.on('pet:savePosition', () => savePosition())
  ipcMain.handle('pet:openMain', () => {
    callbacks?.showWindow?.()
    return { success: true }
  })
  ipcMain.handle('pet:showMenu', () => {
    popupMenu()
    return { success: true }
  })
  ipcMain.handle('pet:home', () => {
    if (!petWindow || petWindow.isDestroyed()) return { success: false }
    const home = homePosition()
    petWindow.setPosition(home.x, home.y)
    settingsDao.set('petPosition', home)
    return { success: true }
  })
}

function init(nextCallbacks) {
  callbacks = nextCallbacks
  registerPetIpc()
  showPetWindow()
}

function refresh() {
  if (settingsDao.get('petEnabled')) {
    showPetWindow()
  } else {
    hidePetWindow()
  }
}

module.exports = {
  init,
  refresh,
  showPetWindow,
  hidePetWindow,
  destroyPetWindow
}
