// 桌宠服务
// 独立透明置顶窗口承载宠物；渲染层驱动动画与漫游，主进程负责窗口位置、菜单与持久化。
const path = require('path')
const { BrowserWindow, screen, Menu, ipcMain, Notification } = require('electron')
const { settingsDao } = require('../db/index.cjs')
const petModelService = require('./petModelService.cjs')
const { t } = require('../i18n.cjs')

const PET_SPRITE_WIDTH = 116
const PET_HORIZONTAL_PADDING = 10
const PET_TOP_SPACE = 4
const PET_BOTTOM_PADDING = 8
const PET_CHAT_WIDTH = 244
const PET_CHAT_HEIGHT = 48
const PET_BUBBLE_INITIAL_WIDTH = 220
const PET_BUBBLE_INITIAL_HEIGHT = 64
const PET_OVERLAY_GAP = 6
const PET_WINDOW_ID = 'pet'
const PET_ACTIONS = new Set(['idle', 'wave', 'jump', 'failed', 'waiting', 'working', 'review'])

let petWindow = null
let callbacks = null
let enforcingPetSize = false
let petChatOpen = false
let focusTimer = null
let chatWindow = null
let bubbleWindow = null
let bubbleTimer = null
let bubblePayload = null
let chatRestorePosition = null
let autoPositioningPet = false

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

function getRoamRange() {
  return Math.min(1, Math.max(0.2, Number(settingsDao.get('petRoamRange')) || 0.7))
}

function getRoamActivity() {
  return Math.min(2, Math.max(0.5, Number(settingsDao.get('petRoamActivity')) || 1))
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
      roamRange: getRoamRange(),
      roamActivity: getRoamActivity(),
      alwaysOnTop: Boolean(settingsDao.get('petAlwaysOnTop')),
      dimensions: getPetDimensions(),
      chatOpen: petChatOpen
    }
  }
}

function sendPetAction(action = {}) {
  if (!petWindow || petWindow.isDestroyed()) return
  const { bubble, duration, ...visualAction } = action
  if (String(bubble || '').trim()) showPetBubble(bubble, duration)
  petWindow.webContents.send('pet:action', { ...visualAction, duration })
}

function overlayUrl(hash) {
  return process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}#/${hash}`
    : null
}

function loadOverlay(win, hash) {
  const url = overlayUrl(hash)
  if (url) win.loadURL(url)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: `/${hash}` })
}

function animatePetTo(targetX, targetY, duration = 170) {
  if (!petWindow || petWindow.isDestroyed()) return Promise.resolve()
  const [startX, startY] = petWindow.getPosition()
  const steps = Math.max(1, Math.round(duration / 17))
  let step = 0
  autoPositioningPet = true
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      step += 1
      const progress = Math.min(1, step / steps)
      const eased = 1 - Math.pow(1 - progress, 3)
      setStrictPetBounds(
        startX + (targetX - startX) * eased,
        startY + (targetY - startY) * eased
      )
      if (step >= steps) {
        clearInterval(timer)
        autoPositioningPet = false
        resolve()
      }
    }, 17)
  })
}

async function positionChatWindow() {
  if (!chatWindow || chatWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) return
  let petBounds = petWindow.getBounds()
  const { workArea } = screen.getDisplayNearestPoint({
    x: petBounds.x + Math.round(petBounds.width / 2),
    y: petBounds.y + Math.round(petBounds.height / 2)
  })
  const workBottom = workArea.y + workArea.height
  const desiredBottom = petBounds.y + petBounds.height + PET_OVERLAY_GAP + PET_CHAT_HEIGHT
  if (desiredBottom > workBottom) {
    if (!chatRestorePosition) chatRestorePosition = { x: petBounds.x, y: petBounds.y }
    const targetY = Math.max(workArea.y, workBottom - PET_CHAT_HEIGHT - PET_OVERLAY_GAP - petBounds.height)
    await animatePetTo(petBounds.x, targetY)
    petBounds = petWindow.getBounds()
  }
  const x = Math.min(
    workArea.x + workArea.width - PET_CHAT_WIDTH,
    Math.max(workArea.x, Math.round(petBounds.x + petBounds.width / 2 - PET_CHAT_WIDTH / 2))
  )
  const y = petBounds.y + petBounds.height + PET_OVERLAY_GAP
  chatWindow.setBounds({ x, y, width: PET_CHAT_WIDTH, height: PET_CHAT_HEIGHT }, false)
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) return chatWindow
  const win = new BrowserWindow({
    width: PET_CHAT_WIDTH,
    height: PET_CHAT_HEIGHT,
    transparent: true,
    frame: false,
    show: false,
    resizable: false,
    alwaysOnTop: Boolean(settingsDao.get('petAlwaysOnTop')),
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.cjs')
    }
  })
  chatWindow = win
  win.setAlwaysOnTop(Boolean(settingsDao.get('petAlwaysOnTop')), 'screen-saver')
  win.once('ready-to-show', async () => {
    if (!petChatOpen || chatWindow !== win || win.isDestroyed()) return
    await positionChatWindow()
    if (!petChatOpen || chatWindow !== win || win.isDestroyed()) return
    win.show()
    win.focus()
  })
  win.on('closed', () => { if (chatWindow === win) chatWindow = null })
  loadOverlay(win, 'pet-chat')
  return win
}

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y
}

function positionBubbleWindow(width, height) {
  if (!bubbleWindow || bubbleWindow.isDestroyed() || !petWindow || petWindow.isDestroyed()) return 'top'
  const pet = petWindow.getBounds()
  const { workArea } = screen.getDisplayNearestPoint({ x: pet.x, y: pet.y })
  const workRight = workArea.x + workArea.width
  const workBottom = workArea.y + workArea.height
  const centeredX = Math.round(pet.x + pet.width / 2 - width / 2)
  const centeredY = Math.round(pet.y + pet.height / 2 - height / 2)
  const candidates = [
    { placement: 'top', x: centeredX, y: pet.y - height - PET_OVERLAY_GAP },
    { placement: 'right', x: pet.x + pet.width + PET_OVERLAY_GAP, y: centeredY },
    { placement: 'left', x: pet.x - width - PET_OVERLAY_GAP, y: centeredY },
    { placement: 'bottom', x: centeredX, y: pet.y + pet.height + PET_OVERLAY_GAP }
  ]
  const chatBounds = chatWindow && !chatWindow.isDestroyed() ? chatWindow.getBounds() : null
  let selected = candidates.find((candidate) => {
    const rect = { ...candidate, width, height }
    const inside = rect.x >= workArea.x && rect.y >= workArea.y &&
      rect.x + width <= workRight && rect.y + height <= workBottom
    return inside && (!chatBounds || !rectanglesOverlap(rect, chatBounds))
  })
  if (!selected) {
    selected = candidates[0]
    selected = {
      ...selected,
      x: Math.min(workRight - width, Math.max(workArea.x, selected.x)),
      y: Math.min(workBottom - height, Math.max(workArea.y, selected.y))
    }
  }
  bubbleWindow.setBounds({ x: selected.x, y: selected.y, width, height }, false)
  bubbleWindow.webContents.send('pet:bubblePlacement', selected.placement)
  return selected.placement
}

function createBubbleWindow() {
  if (bubbleWindow && !bubbleWindow.isDestroyed()) return bubbleWindow
  const win = new BrowserWindow({
    width: PET_BUBBLE_INITIAL_WIDTH,
    height: PET_BUBBLE_INITIAL_HEIGHT,
    transparent: true,
    frame: false,
    show: false,
    focusable: false,
    resizable: false,
    alwaysOnTop: Boolean(settingsDao.get('petAlwaysOnTop')),
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.cjs')
    }
  })
  bubbleWindow = win
  win.setAlwaysOnTop(Boolean(settingsDao.get('petAlwaysOnTop')), 'screen-saver')
  win.setIgnoreMouseEvents(true)
  win.webContents.on('did-finish-load', () => {
    if (bubblePayload && bubbleWindow === win) win.webContents.send('pet:bubbleContent', bubblePayload)
  })
  win.on('closed', () => { if (bubbleWindow === win) bubbleWindow = null })
  loadOverlay(win, 'pet-bubble')
  return win
}

function showPetBubble(text, requestedDuration) {
  const content = String(text || '').trim().slice(0, 1200)
  if (!content) return { success: false }
  const duration = Math.min(12000, Math.max(2500,
    Number(requestedDuration) || (1800 + Array.from(content).length * 72)
  ))
  bubblePayload = { text: content, duration }
  const win = createBubbleWindow()
  if (!win.webContents.isLoading()) win.webContents.send('pet:bubbleContent', bubblePayload)
  clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.destroy()
    bubbleWindow = null
    bubblePayload = null
  }, duration)
  return { success: true, duration }
}

async function setPetChatOpen(open) {
  petChatOpen = Boolean(open)
  if (petChatOpen) {
    const win = createChatWindow()
    if (!win.webContents.isLoading()) {
      await positionChatWindow()
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
      }
    }
  } else {
    if (chatWindow && !chatWindow.isDestroyed()) chatWindow.hide()
    if (chatRestorePosition && petWindow && !petWindow.isDestroyed()) {
      const restore = chatRestorePosition
      chatRestorePosition = null
      await animatePetTo(restore.x, restore.y)
      savePosition()
    }
  }
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:chatVisibility', petChatOpen)
  }
  return { open: petChatOpen }
}

function startFocusSession() {
  if (focusTimer) clearTimeout(focusTimer)
  sendPetAction({ state: 'working', bubble: t('pet.focusStarted'), duration: 3200 })
  focusTimer = setTimeout(() => {
    focusTimer = null
    showPetWindow()
    sendPetAction({ state: 'wave', bubble: t('pet.focusComplete'), duration: 6500 })
    if (Notification.isSupported()) {
      new Notification({ title: t('pet.focusCompleteTitle'), body: t('pet.focusComplete') }).show()
    }
  }, 25 * 60 * 1000)
}

function getMovementArea() {
  const size = getPetDimensions()
  const current = petWindow && !petWindow.isDestroyed()
    ? petWindow.getBounds()
    : { ...getPetPosition(), ...size }
  const point = {
    x: current.x + Math.round(current.width / 2),
    y: current.y + Math.round(current.height / 2)
  }
  const { workArea } = screen.getDisplayNearestPoint(point)
  return {
    minX: workArea.x,
    maxX: workArea.x + Math.max(0, workArea.width - size.width),
    minY: workArea.y,
    maxY: workArea.y + Math.max(0, workArea.height - size.height)
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
    if (!autoPositioningPet && petChatOpen) positionChatWindow().catch(() => {})
    if (bubbleWindow && !bubbleWindow.isDestroyed()) {
      const bounds = bubbleWindow.getBounds()
      positionBubbleWindow(bounds.width, bounds.height)
    }
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (autoPositioningPet || (petChatOpen && chatRestorePosition)) return
      savePosition()
    }, 800)
  })

  const url = petUrl()
  if (url) {
    win.loadURL(url)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: '/pet' })
  }
  win.webContents.once('did-finish-load', () => {
    if (petWindow === win && !win.isDestroyed()) createChatWindow()
  })
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
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.hide()
  if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide()
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide()
}

function destroyPetWindow() {
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = null
  petChatOpen = false
  clearTimeout(bubbleTimer)
  bubbleTimer = null
  bubblePayload = null
  chatRestorePosition = null
  if (chatWindow && !chatWindow.isDestroyed()) chatWindow.destroy()
  if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.destroy()
  chatWindow = null
  bubbleWindow = null
  if (petWindow && !petWindow.isDestroyed()) petWindow.destroy()
  petWindow = null
}

function popupMenu() {
  const menu = Menu.buildFromTemplate([
    { label: t('pet.chat'), click: () => setPetChatOpen(true) },
    { label: t('pet.encourage'), click: () => sendPetAction({ state: 'wave', bubble: t('pet.encourageBubble'), duration: 3600 }) },
    { label: t('pet.focus25'), click: () => startFocusSession() },
    { label: t('pet.takeBreak'), click: () => sendPetAction({ state: 'waiting', bubble: t('pet.breakBubble'), duration: 4800 }) },
    { type: 'separator' },
    { label: t('pet.roaming'), type: 'checkbox', checked: Boolean(settingsDao.get('petRoaming')), click: (item) => {
      settingsDao.set('petRoaming', item.checked)
      refresh()
    } },
    { label: t('pet.alwaysOnTop'), type: 'checkbox', checked: Boolean(settingsDao.get('petAlwaysOnTop')), click: (item) => {
      settingsDao.set('petAlwaysOnTop', item.checked)
      refresh()
    } },
    { label: t('pet.goHome'), click: () => {
      if (!petWindow || petWindow.isDestroyed()) return
      const home = homePosition()
      setStrictPetBounds(home.x, home.y)
      settingsDao.set('petPosition', home)
    } },
    { type: 'separator' },
    { label: t('pet.openLaunchpad'), click: () => {
      callbacks?.showWindow?.()
      callbacks?.openPetCenter?.()
    } },
    { type: 'separator' },
    { label: t('pet.hide'), click: () => {
      setPetChatOpen(false)
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
    const bubble = String(action?.bubble || '').trim().slice(0, 1200)
    const duration = Math.min(12000, Math.max(800, Number(action?.duration) || 1800))
    sendPetAction({ state, bubble, duration })
  })
  ipcMain.handle('pet:setChatOpen', (_event, open) => setPetChatOpen(open))
  ipcMain.handle('pet:showBubble', (_event, text, duration) => showPetBubble(text, duration))
  ipcMain.on('pet:bubbleSize', (_event, size) => {
    if (!bubbleWindow || bubbleWindow.isDestroyed()) return
    const width = Math.min(360, Math.max(120, Math.ceil(Number(size?.width) || PET_BUBBLE_INITIAL_WIDTH)))
    const height = Math.min(420, Math.max(42, Math.ceil(Number(size?.height) || PET_BUBBLE_INITIAL_HEIGHT)))
    positionBubbleWindow(width, height)
    bubbleWindow.showInactive()
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
  ipcMain.handle('pet:getMovementArea', () => getMovementArea())
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
    if (Object.prototype.hasOwnProperty.call(next, 'roamRange')) {
      settingsDao.set('petRoamRange', Math.min(1, Math.max(0.2, Number(next.roamRange) || 0.7)))
    }
    if (Object.prototype.hasOwnProperty.call(next, 'roamActivity')) {
      settingsDao.set('petRoamActivity', Math.min(2, Math.max(0.5, Number(next.roamActivity) || 1)))
    }
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
      if (chatWindow && !chatWindow.isDestroyed()) chatWindow.setAlwaysOnTop(Boolean(settingsDao.get('petAlwaysOnTop')), 'screen-saver')
      if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.setAlwaysOnTop(Boolean(settingsDao.get('petAlwaysOnTop')), 'screen-saver')
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
