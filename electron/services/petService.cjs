// 桌宠服务
// 独立透明置顶窗口承载宠物；渲染层驱动动画与漫游，主进程负责窗口位置、菜单与持久化。
const path = require('path')
const { BrowserWindow, screen, Menu, ipcMain } = require('electron')
const { settingsDao } = require('../db/index.cjs')
const petModelService = require('./petModelService.cjs')
const { t } = require('../i18n.cjs')

const PET_SPRITE_WIDTH = 116
const PET_HORIZONTAL_PADDING = 10
const PET_TOP_SPACE = 62
const PET_BOTTOM_PADDING = 8
const PET_WINDOW_ID = 'pet'
const PET_ACTIONS = new Set(['idle', 'wave', 'jump', 'failed', 'waiting', 'working', 'review'])

let petWindow = null
let callbacks = null
let enforcingPetSize = false

function getPetPosition() {
  const { workArea } = screen.getPrimaryDisplay()
  const size = getPetDimensions()
  const saved = settingsDao.get('petPosition')
  const fallback = {
    x: workArea.x + workArea.width - size.width - 28,
    y: workArea.y + workArea.height - size.height - 8
  }
  return saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
    ? { x: saved.x, y: saved.y }
    : fallback
}

function getPetScale() {
  return Math.min(1.35, Math.max(0.65, Number(settingsDao.get('petScale')) || 1))
}

function getPetDimensions() {
  const scale = getPetScale()
  const spriteWidth = Math.round(PET_SPRITE_WIDTH * scale)
  const spriteHeight = Math.round(spriteWidth * (208 / 192))
  return {
    width: spriteWidth + PET_HORIZONTAL_PADDING,
    height: spriteHeight + PET_TOP_SPACE + PET_BOTTOM_PADDING,
    spriteWidth,
    spriteHeight
  }
}

function clampPetPosition(x, y, size = getPetDimensions()) {
  const point = { x: Math.round(x), y: Math.round(y) }
  const { workArea } = screen.getDisplayNearestPoint(point)
  return {
    x: Math.min(workArea.x + workArea.width - size.width, Math.max(workArea.x, point.x)),
    y: Math.min(workArea.y + workArea.height - size.height, Math.max(workArea.y, point.y))
  }
}

function setStrictPetBounds(x, y) {
  if (!petWindow || petWindow.isDestroyed()) return
  const size = getPetDimensions()
  const position = clampPetPosition(x, y, size)
  const current = petWindow.getBounds()
  if (
    current.x === position.x &&
    current.y === position.y &&
    current.width === size.width &&
    current.height === size.height
  ) return

  enforcingPetSize = true
  try {
    petWindow.setBounds({ ...position, width: size.width, height: size.height }, false)
  } finally {
    enforcingPetSize = false
  }
}

function getRuntimeConfig() {
  return {
    model: petModelService.getRuntimeModel(),
    settings: {
      enabled: Boolean(settingsDao.get('petEnabled')),
      scale: getPetScale(),
      opacity: Number(settingsDao.get('petOpacity')) || 1,
      roaming: Boolean(settingsDao.get('petRoaming')),
      alwaysOnTop: Boolean(settingsDao.get('petAlwaysOnTop')),
      dimensions: getPetDimensions()
    }
  }
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
  const size = getPetDimensions()
  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    alwaysOnTop: Boolean(settingsDao.get('petAlwaysOnTop')),
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
  win.setAlwaysOnTop(Boolean(settingsDao.get('petAlwaysOnTop')), 'screen-saver')
  win.setOpacity(Math.min(1, Math.max(0.55, Number(settingsDao.get('petOpacity')) || 1)))
  // 默认让透明区域穿透；渲染层仅在指针进入宠物命中框时临时关闭穿透。
  win.setIgnoreMouseEvents(true, { forward: true })
  petWindow = win

  win.on('closed', () => {
    if (petWindow === win) petWindow = null
  })

  // The pet window is never allowed to resize during a drag. On some Windows
  // setups repeated position updates can also mutate transparent-window bounds.
  win.on('resize', () => {
    if (enforcingPetSize || petWindow !== win) return
    const bounds = win.getBounds()
    const expected = getPetDimensions()
    if (bounds.width !== expected.width || bounds.height !== expected.height) {
      setStrictPetBounds(bounds.x, bounds.y)
    }
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
  const size = getPetDimensions()
  return {
    x: workArea.x + workArea.width - size.width - 28,
    y: workArea.y + workArea.height - size.height - 8
  }
}

function resizePetWindow() {
  if (!petWindow || petWindow.isDestroyed()) return
  const current = petWindow.getBounds()
  const next = getPetDimensions()
  // 缩放时固定宠物脚下中心点，避免大小变化后突然向一侧跳动。
  const x = Math.round(current.x + (current.width - next.width) / 2)
  const y = Math.round(current.y + current.height - next.height)
  setStrictPetBounds(x, y)
}

function showPetWindow() {
  if (!settingsDao.get('petEnabled')) return
  const win = createPetWindow()
  if (win.isMinimized()) win.restore()
  win.showInactive()
  return win
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
    { label: t('pet.openLaunchpad'), click: () => {
      callbacks?.showWindow?.()
      callbacks?.openPetCenter?.()
    } },
    { label: t('pet.goHome'), click: () => {
      if (!petWindow || petWindow.isDestroyed()) return
      const home = homePosition()
      setStrictPetBounds(home.x, home.y)
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
    if (Number.isFinite(x) && Number.isFinite(y)) {
      // Explicitly restore the configured dimensions on every movement. Dragging
      // may only change x/y and can therefore never accumulate width/height.
      setStrictPetBounds(x, y)
    }
  })
  ipcMain.on('pet:setMousePassthrough', (_event, passthrough) => {
    if (!petWindow || petWindow.isDestroyed()) return
    petWindow.setIgnoreMouseEvents(Boolean(passthrough), passthrough ? { forward: true } : undefined)
  })
  ipcMain.on('pet:savePosition', () => savePosition())
  ipcMain.on('pet:performAction', (_event, action) => {
    if (!petWindow || petWindow.isDestroyed()) return
    const state = PET_ACTIONS.has(action?.state) ? action.state : 'idle'
    const bubble = String(action?.bubble || '').trim().slice(0, 80)
    const duration = Math.min(12000, Math.max(800, Number(action?.duration) || 1800))
    petWindow.webContents.send('pet:action', { state, bubble, duration })
  })
  ipcMain.handle('pet:openMain', () => {
    callbacks?.showWindow?.()
    callbacks?.openPetCenter?.()
    return { success: true }
  })
  ipcMain.handle('pet:showMenu', () => {
    popupMenu()
    return { success: true }
  })
  ipcMain.handle('pet:home', () => {
    if (!petWindow || petWindow.isDestroyed()) return { success: false }
    const home = homePosition()
    setStrictPetBounds(home.x, home.y)
    settingsDao.set('petPosition', home)
    return { success: true }
  })
  ipcMain.handle('pet:getConfig', () => getRuntimeConfig())
  ipcMain.handle('pet:listModels', () => petModelService.list())
  ipcMain.handle('pet:getModelsStorage', () => petModelService.getStorageInfo())
  ipcMain.handle('pet:setModelsStorage', (_event, directory) => {
    try {
      const result = petModelService.setStorageDirectory(String(directory || ''))
      refresh()
      return result
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('pet:openModelsStorage', async () => {
    try {
      const directory = petModelService.openFolder()
      const { shell } = require('electron')
      const error = await shell.openPath(directory)
      if (error) throw new Error(error)
      return { success: true, path: directory }
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('pet:importModel', (_event, manifestPath) => {
    try {
      const result = petModelService.importFromManifest(String(manifestPath || ''))
      refresh()
      return result
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle('pet:selectModel', (_event, id) => {
    const result = petModelService.select(id)
    refresh()
    return result
  })
  ipcMain.handle('pet:removeModel', (_event, id) => {
    const result = petModelService.remove(id)
    refresh()
    return result
  })
  ipcMain.handle('pet:updateSettings', (_event, patch) => {
    const next = patch || {}
    if (Object.prototype.hasOwnProperty.call(next, 'scale')) {
      settingsDao.set('petScale', Math.min(1.35, Math.max(0.65, Number(next.scale) || 1)))
    }
    if (Object.prototype.hasOwnProperty.call(next, 'opacity')) {
      settingsDao.set('petOpacity', Math.min(1, Math.max(0.55, Number(next.opacity) || 1)))
    }
    if (Object.prototype.hasOwnProperty.call(next, 'roaming')) settingsDao.set('petRoaming', Boolean(next.roaming))
    if (Object.prototype.hasOwnProperty.call(next, 'alwaysOnTop')) settingsDao.set('petAlwaysOnTop', Boolean(next.alwaysOnTop))
    refresh()
    return getRuntimeConfig()
  })
}

function init(nextCallbacks) {
  callbacks = nextCallbacks
  registerPetIpc()
  showPetWindow()
}

function refresh() {
  if (settingsDao.get('petEnabled')) {
    const win = showPetWindow()
    if (win && !win.isDestroyed()) {
      resizePetWindow()
      win.setOpacity(Math.min(1, Math.max(0.55, Number(settingsDao.get('petOpacity')) || 1)))
      win.setAlwaysOnTop(Boolean(settingsDao.get('petAlwaysOnTop')), 'screen-saver')
      win.webContents.send('pet:configChanged', getRuntimeConfig())
    }
  } else {
    hidePetWindow()
  }
}

module.exports = {
  init,
  refresh,
  showPetWindow,
  hidePetWindow,
  destroyPetWindow,
  getRuntimeConfig
}
