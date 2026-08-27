// 多桌宠窗口服务：每个模型对应一个独立实例，窗口、位置、聊天和气泡互不共享。
const path = require('path')
const { BrowserWindow, screen, Menu } = require('electron')
const { settingsDao, conversationDao, memoryDao } = require('../db/index.cjs')
const petModelService = require('./petModelService.cjs')
const petProfileService = require('./petProfileService.cjs')
const { calculatePetBubbleDuration } = require('./petBubbleDuration.cjs')
const { defineRoutes, installHandlers } = require('../ipc/registry.cjs')
const v = require('../ipc/validate.cjs')
const { t } = require('../i18n.cjs')
const interactionModule = require('./petInteractionService.cjs')
const petStudyService = require('./petStudyService.cjs')
const { calculateBubbleBounds } = require('./petOverlayPlacement.cjs')
const petRuntimeService = require('./petRuntime/petRuntimeService.cjs')
const { resolveLocal, resolveHybrid, resolveAi } = require('./petPresentationService.cjs')

const SPRITE_WIDTH = 116
const CHAT = { width: 244, height: 48 }
const instances = new Map()
let callbacks
let interactionService = interactionModule

function model(id) {
  const value = petModelService.getRuntimeModel(id)
  if (!value) throw new Error(t('pet.modelUnavailable'))
  return value
}
function profile(id) {
  const item = model(id)
  return petProfileService.ensure(id, { displayName: item.displayName })
}
function dimensions(id) {
  const runtimeModel = model(id)
  const width = Math.round(SPRITE_WIDTH * profile(id).scale)
  const canvas = runtimeModel.render?.canvas || { width: 192, height: 208 }
  const ratio = Math.min(2, Math.max(0.7, Number(canvas.height || 208) / Number(canvas.width || 192)))
  const height = Math.round(width * ratio)
  return { width: width + 10, height: height + 12, spriteWidth: width, spriteHeight: height }
}

const LEGACY_ACTION_INTENTS = {
  idle: 'idle', wave: 'greet', jump: 'react.excited', failed: 'error', waiting: 'rest.sit',
  working: 'focus.working', review: 'study.review', dragging: 'interaction.drag', walkRight: 'move.walk.right', walkLeft: 'move.walk.left'
}

function semanticAction(action = {}) {
  return { ...action, intent: action.intent || LEGACY_ACTION_INTENTS[action.state] || 'idle', type: 'PRESENT' }
}
function cleanupLegacyDuplicateInstances() {
  const duplicatePattern = /--instance-\d+$/
  const stored = settingsDao.get('petInstanceIds') || []
  const known = settingsDao.get('petKnownInstanceIds') || []
  const profileIds = Object.keys(settingsDao.get('petProfiles') || {})
  const duplicates = [...new Set([...stored, ...known, ...profileIds].map(String).filter((id) => duplicatePattern.test(id)))]
  if (!duplicates.length && !known.length) return
  for (const id of duplicates) {
    petProfileService.remove(id)
    conversationDao.deleteByPet(id)
    memoryDao.clear(id)
  }
  settingsDao.set('petKnownInstanceIds', [])
  settingsDao.set('petInstanceIds', stored.map(String).filter((id) => !duplicatePattern.test(id)))
  const selected = String(settingsDao.get('petModelId') || '')
  if (duplicatePattern.test(selected)) settingsDao.set('petModelId', selected.replace(duplicatePattern, '') || petModelService.BUILTIN_ID)
}
function activeIds() {
  cleanupLegacyDuplicateInstances()
  const available = new Set(petModelService.list().filter((item) => item.status !== 'invalid').map((item) => item.id))
  if (!settingsDao.get('petInstancesInitialized')) {
    const selected = String(settingsDao.get('petModelId') || petModelService.BUILTIN_ID)
    const initial = settingsDao.get('petEnabled') && available.has(selected) ? [selected] : []
    settingsDao.set('petInstanceIds', initial)
    settingsDao.set('petInstancesInitialized', true)
    return initial
  }
  const stored = settingsDao.get('petInstanceIds') || []
  const ids = [...new Set(stored.map(String))].filter((id) => available.has(id))
  if (ids.length !== stored.length) settingsDao.set('petInstanceIds', ids)
  return ids
}
function selectedId(value) { return String(value || settingsDao.get('petModelId') || petModelService.BUILTIN_ID) }
function load(win, name, id) {
  const hash = `${name}?instance=${encodeURIComponent(id)}`
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${hash}`)
  else win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: `/${hash}` })
}
function home(id, index = 0) {
  const { workArea } = screen.getPrimaryDisplay()
  const size = dimensions(id)
  const x = workArea.x + workArea.width - size.width - 28 - index * (size.width + 16)
  const y = workArea.y + workArea.height - size.height - 8
  return { x: Math.max(workArea.x, x), y: Math.max(workArea.y, y) }
}
function clamp(id, x, y) {
  const size = dimensions(id)
  const { workArea } = screen.getDisplayNearestPoint({ x: Number(x), y: Number(y) })
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - size.width)
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - size.height)
  return {
    x: Math.min(maxX, Math.max(workArea.x, Math.round(x))),
    y: Math.min(maxY, Math.max(workArea.y, Math.round(y)))
  }
}

function setBoundsIfChanged(win, next) {
  if (!win || win.isDestroyed()) return false
  const current = win.getBounds()
  if (current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height) return false
  win.setBounds(next, false)
  return true
}

class PetInstance {
  constructor(id) {
    this.id = id
    this.petWindow = null
    this.chatWindow = null
    this.bubbleWindow = null
    this.quickAddWindow = null
    this.chatOpen = false
    this.bubbleTimer = null
    this.bubblePayload = null
    this.bubblePlacement = null
    this.bubbleMeasuredSize = null
    this.petBounds = null
    this.pendingMove = null
    this.moveImmediate = null
    this.dragOffset = null
    this.enforcing = false
    this.runtimeMotionTimer = null
    this.runtimeMotionToken = 0
    this.presentationRequestToken = 0
    this.runtimeSnapshot = petRuntimeService.ensure(this.id, model(this.id), profile(this.id), (snapshot) => this.applyRuntimeSnapshot(snapshot))
  }
  config() {
    const p = profile(this.id)
    const runtimeModel = model(this.id)
    this.runtimeSnapshot = petRuntimeService.ensure(this.id, runtimeModel, p, (snapshot) => this.applyRuntimeSnapshot(snapshot))
    return { instanceId: this.id, model: runtimeModel, runtime: this.runtimeSnapshot, settings: { enabled: activeIds().includes(this.id), ...p, study: petStudyService.getSettings(this.id), dimensions: dimensions(this.id), chatOpen: this.chatOpen } }
  }
  position() { return profile(this.id).position || home(this.id, Math.max(0, activeIds().indexOf(this.id))) }
  setBounds(x, y) {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    const size = dimensions(this.id)
    const point = clamp(this.id, x, y)
    const bounds = { ...point, width: size.width, height: size.height }
    this.petBounds = bounds
    this.enforcing = true
    try {
      this.petWindow.setBounds(bounds, false)
      // 程序驱动的连续移动不能依赖 Windows 的 move 事件；系统会合并高频事件，
      // 导致独立气泡/聊天窗口停留在旧坐标。直接使用本次目标 bounds 同步所有浮层。
      this.positionOverlays(undefined, undefined, bounds)
    } finally { this.enforcing = false }
  }
  queueMove(x, y) {
    this.pendingMove = { x, y }
    if (this.moveImmediate) return
    this.moveImmediate = setImmediate(() => {
      this.moveImmediate = null
      const next = this.pendingMove
      this.pendingMove = null
      if (next) this.setBounds(next.x, next.y)
    })
  }
  flushMove() {
    if (this.moveImmediate) clearImmediate(this.moveImmediate)
    this.moveImmediate = null
    const next = this.pendingMove
    this.pendingMove = null
    if (next) this.setBounds(next.x, next.y)
  }
  startDrag() {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    this.flushMove()
    const cursor = screen.getCursorScreenPoint()
    const pet = this.petBounds || this.petWindow.getBounds()
    this.dragOffset = { x: cursor.x - pet.x, y: cursor.y - pet.y }
    this.stopRuntimeMotion()
  }
  moveDrag() {
    if (!this.dragOffset) return
    const cursor = screen.getCursorScreenPoint()
    this.queueMove(cursor.x - this.dragOffset.x, cursor.y - this.dragOffset.y)
  }
  endDrag() {
    if (!this.dragOffset) return
    this.moveDrag()
    this.flushMove()
    this.dragOffset = null
    this.savePosition()
  }
  savePosition() {
    this.flushMove()
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    const [x, y] = this.petWindow.getPosition()
    petProfileService.update(this.id, { position: { x, y } })
  }
  createPet() {
    if (this.petWindow && !this.petWindow.isDestroyed()) return this.petWindow
    const size = dimensions(this.id)
    const pos = this.position()
    const p = profile(this.id)
    const win = new BrowserWindow({
      ...size, ...pos, transparent: true, backgroundColor: '#00000000', frame: false, alwaysOnTop: p.alwaysOnTop,
      skipTaskbar: true, resizable: false, hasShadow: false, focusable: false, minimizable: false, maximizable: false, fullscreenable: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../preload/index.cjs') }
    })
    this.petWindow = win
    this.petBounds = win.getBounds()
    win.setAlwaysOnTop(p.alwaysOnTop, 'screen-saver')
    win.setOpacity(p.opacity)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.on('closed', () => { if (this.petWindow === win) this.petWindow = null })
    win.on('resize', () => { if (!this.enforcing) this.setBounds(win.getBounds().x, win.getBounds().y) })
    let timer
    // 所有桌宠移动都经过 setBounds，并已使用目标坐标同步浮层。
    // 此处不能再读取 move 事件发生时的窗口坐标去移动浮层：Windows 会延迟或合并
    // 高频 move 事件，旧事件会把气泡拉回历史位置，造成拖拽结束后仍持续漂移。
    win.on('move', () => { clearTimeout(timer); timer = setTimeout(() => this.savePosition(), 700) })
    load(win, 'pet', this.id)
    return win
  }
  show() { const win = this.createPet(); win.showInactive(); return win }
  applyOpacity(opacity = profile(this.id).opacity) {
    for (const win of [this.petWindow, this.chatWindow, this.bubbleWindow, this.quickAddWindow]) {
      if (win && !win.isDestroyed()) win.setOpacity(opacity)
    }
  }
  destroy() {
    clearTimeout(this.bubbleTimer)
    if (this.moveImmediate) clearImmediate(this.moveImmediate)
    this.moveImmediate = null
    this.pendingMove = null
    this.dragOffset = null
    this.stopRuntimeMotion()
    petRuntimeService.remove(this.id)
    for (const win of [this.chatWindow, this.bubbleWindow, this.quickAddWindow, this.petWindow]) if (win && !win.isDestroyed()) win.destroy()
    this.chatWindow = this.bubbleWindow = this.quickAddWindow = this.petWindow = null
    this.bubblePlacement = null
    this.bubbleMeasuredSize = null
    this.petBounds = null
    this.chatOpen = false
  }
  createChat() {
    if (this.chatWindow && !this.chatWindow.isDestroyed()) return this.chatWindow
    const win = new BrowserWindow({
      width: CHAT.width, height: CHAT.height, transparent: true, backgroundColor: '#00000000', frame: false, show: false, resizable: false,
      alwaysOnTop: profile(this.id).alwaysOnTop, skipTaskbar: true, hasShadow: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../preload/index.cjs') }
    })
    this.chatWindow = win
    win.setOpacity(profile(this.id).opacity)
    win.on('closed', () => { if (this.chatWindow === win) this.chatWindow = null })
    win.once('ready-to-show', () => { if (this.chatOpen) { this.positionOverlays(); win.show(); win.focus() } })
    load(win, 'pet-chat', this.id)
    return win
  }
  setChat(open) {
    this.chatOpen = Boolean(open)
    if (this.chatOpen) {
      const win = this.createChat(); this.positionOverlays()
      if (!win.webContents.isLoading()) { win.show(); win.focus() }
    } else if (this.chatWindow && !this.chatWindow.isDestroyed()) this.chatWindow.destroy()
    if (this.petWindow && !this.petWindow.isDestroyed()) this.petWindow.webContents.send('pet:chatVisibility', this.chatOpen)
    return { open: this.chatOpen, instanceId: this.id }
  }
  createBubble() {
    if (this.bubbleWindow && !this.bubbleWindow.isDestroyed()) return this.bubbleWindow
    const win = new BrowserWindow({
      // 宽度足够完成最终排版，高度保持最小；内容可自然溢出并回报真实高度。
      // 即使尺寸回报延迟，也不会留下大块不断增长的透明画布。
      width: 360, height: 64, transparent: true, backgroundColor: '#00000000', frame: false, show: false, focusable: false, resizable: false,
      alwaysOnTop: profile(this.id).alwaysOnTop, skipTaskbar: true, hasShadow: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../preload/index.cjs') }
    })
    this.bubbleWindow = win
    win.setOpacity(profile(this.id).opacity)
    win.setIgnoreMouseEvents(true)
    win.webContents.on('did-finish-load', () => {
      if (this.bubblePayload) win.webContents.send('pet:bubbleContent', this.bubblePayload)
      if (this.bubblePlacement) win.webContents.send('pet:bubblePlacement', this.bubblePlacement)
    })
    win.on('closed', () => {
      if (this.bubbleWindow === win) {
        this.bubbleWindow = null
        this.bubblePlacement = null
      }
    })
    load(win, 'pet-bubble', this.id)
    return win
  }
  createQuickAdd() {
    if (this.quickAddWindow && !this.quickAddWindow.isDestroyed()) return this.quickAddWindow
    const win = new BrowserWindow({
      width: 300, height: 210, transparent: true, backgroundColor: '#00000000', frame: false, show: false, resizable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../preload/index.cjs') }
    })
    this.quickAddWindow = win
    win.setOpacity(profile(this.id).opacity)
    win.on('closed', () => { if (this.quickAddWindow === win) this.quickAddWindow = null })
    win.once('ready-to-show', () => { this.positionOverlays(); win.show(); win.focus() })
    load(win, 'pet-study-add', this.id)
    return win
  }
  openQuickAdd() {
    const win = this.createQuickAdd()
    this.positionOverlays()
    if (!win.webContents.isLoading()) { win.show(); win.focus() }
  }
  toggleQuickAdd() {
    if (this.quickAddWindow && !this.quickAddWindow.isDestroyed() && this.quickAddWindow.isVisible()) {
      this.quickAddWindow.destroy()
      this.quickAddWindow = null
      return { success: true, open: false }
    }
    this.openQuickAdd()
    return { success: true, open: true }
  }
  positionOverlays(width, height, petBounds) {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    // 目标 bounds 是桌宠移动的唯一可信位置。Windows 的 getBounds() 在连续
    // setBounds 后可能短暂返回旧坐标，尺寸回报不能使用它重新锚定气泡。
    const pet = petBounds || this.petBounds || this.petWindow.getBounds()
    const { workArea } = screen.getDisplayNearestPoint({ x: pet.x, y: pet.y })
    if (this.chatWindow && !this.chatWindow.isDestroyed()) {
      const x = Math.min(workArea.x + workArea.width - CHAT.width, Math.max(workArea.x, Math.round(pet.x + pet.width / 2 - CHAT.width / 2)))
      const y = Math.min(workArea.y + workArea.height - CHAT.height, pet.y + pet.height + 6)
      setBoundsIfChanged(this.chatWindow, { x, y, width: CHAT.width, height: CHAT.height })
    }
    if (this.bubbleWindow && !this.bubbleWindow.isDestroyed()) {
      const w = width || this.bubbleWindow.getBounds().width
      const h = height || this.bubbleWindow.getBounds().height
      const target = calculateBubbleBounds(pet, { width: w, height: h }, workArea)
      setBoundsIfChanged(this.bubbleWindow, { x: target.x, y: target.y, width: w, height: h })
      const placement = target.placement
      if (this.bubblePlacement !== placement) {
        this.bubblePlacement = placement
        this.bubbleWindow.webContents.send('pet:bubblePlacement', placement)
      }
    }
    if (this.quickAddWindow && !this.quickAddWindow.isDestroyed()) {
      const size = this.quickAddWindow.getBounds()
      let x = Math.round(pet.x + pet.width / 2 - size.width / 2)
      let y = pet.y - size.height - 10
      if (y < workArea.y) y = pet.y + pet.height + 10
      x = Math.min(workArea.x + workArea.width - size.width, Math.max(workArea.x, x))
      y = Math.min(workArea.y + workArea.height - size.height, Math.max(workArea.y, y))
      setBoundsIfChanged(this.quickAddWindow, { x, y, width: size.width, height: size.height })
    }
  }
  resizeBubble(size = {}) {
    if (!this.bubbleWindow || this.bubbleWindow.isDestroyed()) return
    let width = Math.min(360, Math.max(120, Math.ceil(size.width || 220)))
    let height = Math.min(420, Math.max(42, Math.ceil(size.height || 64)))
    // 同一段气泡内容只允许首次测量决定尺寸；后续布局/字体回调可以收缩，
    // 但绝不能继续放大透明窗口，从主进程侧彻底阻断尺寸正反馈。
    if (this.bubbleMeasuredSize) {
      width = Math.min(width, this.bubbleMeasuredSize.width)
      height = Math.min(height, this.bubbleMeasuredSize.height)
    }
    this.bubbleMeasuredSize = { width, height }
    this.positionOverlays(width, height)
    this.bubbleWindow.showInactive()
  }
  bubble(text, minimum) {
    const content = String(text || '').trim().slice(0, 1200)
    if (!content || !activeIds().includes(this.id)) return { success: false }
    const duration = calculatePetBubbleDuration(content, minimum)
    this.bubblePayload = { text: content, duration, instanceId: this.id }
    this.bubbleMeasuredSize = null
    const win = this.createBubble()
    if (!win.webContents.isLoading()) win.webContents.send('pet:bubbleContent', this.bubblePayload)
    clearTimeout(this.bubbleTimer)
    this.bubbleTimer = setTimeout(() => {
      if (this.bubbleWindow && !this.bubbleWindow.isDestroyed()) this.bubbleWindow.destroy()
      this.bubbleWindow = null
      this.bubblePlacement = null
      this.bubbleMeasuredSize = null
    }, duration)
    return { success: true, duration }
  }
  action(action = {}) {
    if (action.bubble) this.bubble(action.bubble, action.bubbleDuration)
    const request = semanticAction(action)
    this.runtimeSnapshot = petRuntimeService.dispatch(this.id, request)
    return this.runtimeSnapshot
  }
  runtimeEvent(event = {}) {
    if (event.type === 'POINTER_DOWN' || event.type === 'DRAG_THRESHOLD') this.stopRuntimeMotion()
    this.runtimeSnapshot = petRuntimeService.dispatch(this.id, event)
    return this.runtimeSnapshot
  }
  applyRuntimeSnapshot(snapshot) {
    this.runtimeSnapshot = snapshot
    if (this.petWindow && !this.petWindow.isDestroyed()) this.petWindow.webContents.send('pet:runtimeChanged', snapshot)
    if (snapshot.state === 'active.locomotion.walk' && snapshot.presentation.source === 'autonomous') this.startRuntimeMotion(snapshot)
    else if (snapshot.state !== 'active.locomotion.walk') this.stopRuntimeMotion()
  }
  stopRuntimeMotion() {
    this.runtimeMotionToken += 1
    clearInterval(this.runtimeMotionTimer)
    this.runtimeMotionTimer = null
  }
  startRuntimeMotion(snapshot) {
    if (this.runtimeMotionTimer || !this.petWindow || this.petWindow.isDestroyed()) return
    const start = this.petBounds || this.petWindow.getBounds()
    const { workArea } = screen.getDisplayNearestPoint(start)
    const size = dimensions(this.id)
    const direction = snapshot.presentation.intent.endsWith('.left') ? -1 : 1
    const roamRange = Math.min(1, Math.max(0.2, Number(profile(this.id).roamRange) || 0.7))
    const distance = 60 + Math.random() * Math.max(30, workArea.width * 0.18 * roamRange)
    const targetX = Math.min(workArea.x + workArea.width - size.width, Math.max(workArea.x, Math.round(start.x + direction * distance)))
    const targetY = Math.min(workArea.y + workArea.height - size.height, Math.max(workArea.y, Math.round(start.y + (Math.random() - 0.5) * 45)))
    const duration = Math.max(800, Math.min(3600, Math.hypot(targetX - start.x, targetY - start.y) / 95 * 1000))
    const startedAt = Date.now()
    const token = ++this.runtimeMotionToken
    this.runtimeMotionTimer = setInterval(() => {
      if (token !== this.runtimeMotionToken) return
      const progress = Math.min(1, (Date.now() - startedAt) / duration)
      const eased = 0.5 - Math.cos(Math.PI * progress) / 2
      this.setBounds(start.x + (targetX - start.x) * eased, start.y + (targetY - start.y) * eased)
      if (progress >= 1) {
        this.stopRuntimeMotion()
        this.savePosition()
        this.runtimeEvent({ type: 'MOTION_COMPLETED' })
      }
    }, 32)
  }
  refresh() {
    const win = this.show()
    const p = profile(this.id)
    const b = win.getBounds()
    this.setBounds(b.x, b.y)
    this.applyOpacity(p.opacity)
    win.setAlwaysOnTop(p.alwaysOnTop, 'screen-saver')
    win.webContents.send('pet:configChanged', this.config())
  }
}

function instance(id, create = true) {
  const key = selectedId(id)
  if (!instances.has(key) && create) instances.set(key, new PetInstance(key))
  return instances.get(key)
}
function syncInstances() {
  petRuntimeService.start()
  if (!settingsDao.get('petEnabled')) return destroyPetWindow()
  const desired = new Set(activeIds())
  for (const [id, item] of instances) if (!desired.has(id)) { item.destroy(); instances.delete(id) }
  for (const id of desired) instance(id).refresh()
}
function listInstances() {
  const active = new Set(activeIds())
  return petModelService.list().map((item) => ({ ...item, active: active.has(item.id), profile: petProfileService.ensure(item.id, { displayName: item.displayName }) }))
}
function setInstanceEnabled(id, enabled) {
  const key = selectedId(id)
  model(key)
  const next = new Set(activeIds())
  if (enabled) next.add(key); else next.delete(key)
  settingsDao.set('petInstanceIds', [...next])
  settingsDao.set('petEnabled', next.size > 0)
  syncInstances()
  interactionService?.reschedule?.()
  petStudyService.reschedule(key)
  petStudyService.syncShortcut()
  callbacks?.petEnabledChanged?.(next.size > 0)
  return listInstances()
}
function setGlobalEnabled(enabled) {
  const value = Boolean(enabled)
  settingsDao.set('petEnabled', value)
  if (value && activeIds().length === 0) {
    const available = petModelService.list()
    const preferred = selectedId()
    const fallback = available.find((item) => item.id === preferred)?.id || available[0]?.id
    if (fallback) settingsDao.set('petInstanceIds', [fallback])
  }
  syncInstances()
  interactionService?.reschedule?.()
  petStudyService.syncShortcut()
  callbacks?.petEnabledChanged?.(value)
  return listInstances()
}
function popupMenu(id) {
  const item = instance(id)
  const study = petStudyService.getSettings(item.id)
  const review = (rating) => { try { petStudyService.review(item.id, undefined, rating) } catch (error) { item.bubble(error.message, 3500) } }
  Menu.buildFromTemplate([
    { label: '桌宠模式', type: 'radio', checked: study.mode === 'companion', click: () => petStudyService.updateSettings(item.id, { mode: 'companion' }) },
    { label: '单词学习模式', type: 'radio', checked: study.mode === 'study', click: () => petStudyService.updateSettings(item.id, { mode: 'study' }) },
    { label: '摸鱼学习模式', type: 'radio', checked: study.mode === 'stealth-study', click: () => petStudyService.updateSettings(item.id, { mode: 'stealth-study' }) },
    {
      label: study.mode === 'study' ? '认识当前词条' : '快速添加词条',
      accelerator: study.quickAddShortcut || undefined,
      click: () => petStudyService.triggerQuickAction(item.id)
    },
    {
      label: '记忆反馈', submenu: [
        { label: '忘记了', click: () => review(1) },
        { label: '有点难', click: () => review(2) },
        { label: '记住了', click: () => review(3) },
        { label: '很简单', click: () => review(4) }
      ]
    },
    { type: 'separator' },
    { label: t('pet.chat'), click: () => item.setChat(true) },
    { label: t('pet.encourage'), click: () => item.action({ intent: 'greet', source: 'menu', priority: 50, bubble: t('pet.encourageBubble'), bubbleDuration: 3600 }) },
    { label: t('pet.goHome'), click: () => { const pos = home(item.id, activeIds().indexOf(item.id)); item.setBounds(pos.x, pos.y); petProfileService.update(item.id, { position: pos }) } },
    { type: 'separator' },
    { label: t('pet.openLaunchpad'), click: () => { callbacks?.showWindow?.(); callbacks?.openPetCenter?.() } },
    { label: t('pet.hide'), click: () => setInstanceEnabled(item.id, false) }
  ]).popup({ window: item.petWindow || undefined })
}

const idSchema = v.optional(v.str({ max: 200 }))
const positionSchema = v.obj({ x: v.num(), y: v.num() })
const intentSchema = v.str({ min: 1, max: 80, pattern: /^[a-z][a-z0-9_.-]*$/ })
const actionSchema = v.obj({ state: v.optional(v.oneOf(Object.keys(LEGACY_ACTION_INTENTS))), intent: v.optional(intentSchema), emotion: v.optional(v.str({ max: 24, pattern: /^[a-z]+$/ })), intensity: v.optional(v.num({ min: 0, max: 1 })), priority: v.optional(v.num({ min: 0, max: 100 })), source: v.optional(v.oneOf(['menu', 'ai', 'study', 'social', 'user', 'system', 'autonomous'])), bubble: v.optional(v.str({ max: 1200 })), duration: v.optional(v.num()), bubbleDuration: v.optional(v.num()) })
const runtimeEventSchema = v.obj({ type: v.oneOf(['POINTER_DOWN', 'DRAG_THRESHOLD', 'POINTER_UP', 'CLICK', 'DOUBLE_CLICK', 'ANIMATION_COMPLETED', 'MOTION_COMPLETED', 'CHAT_OPENED', 'CHAT_CLOSED']), intent: v.optional(intentSchema), playbackToken: v.optional(v.num({ integer: true, min: 0 })) })
const presentationContextSchema = v.obj({ event: v.oneOf(['started', 'completed', 'failure', 'social', 'study']), userText: v.optional(v.str({ max: 2000 })), assistantText: v.optional(v.str({ max: 4000 })), toolFailed: v.optional(v.bool()), bubble: v.optional(v.str({ max: 1200 })) })
const bubbleSizeSchema = v.obj({ width: v.optional(v.num()), height: v.optional(v.num()) })
const settingsSchema = v.obj({ scale: v.optional(v.num({ min: 0.65, max: 5 })), opacity: v.optional(v.num({ min: 0.55, max: 1 })), roaming: v.optional(v.bool()), roamRange: v.optional(v.num()), roamActivity: v.optional(v.num()), alwaysOnTop: v.optional(v.bool()), emotionMode: v.optional(v.oneOf(['local', 'hybrid', 'ai'])) })
const studyEntrySchema = v.obj({ language: v.optional(v.str({ max: 24 })), term: v.str({ min: 1, max: 120 }), meaning: v.optional(v.str({ max: 500 })), pronunciation: v.optional(v.str({ max: 120 })), example: v.optional(v.str({ max: 500 })), exampleTranslation: v.optional(v.str({ max: 500 })) })
const studySettingsSchema = v.obj({ mode: v.optional(v.oneOf(petStudyService.MODES)), language: v.optional(v.str({ max: 24 })), intervalSeconds: v.optional(v.num({ integer: true, min: 5, max: 600 })), quickAddShortcut: v.optional(v.str({ max: 80 })), modeSwitchShortcut: v.optional(v.str({ max: 80 })), autoSeedEnglish: v.optional(v.bool()) })
const studySearchSchema = v.obj({ language: v.str({ min: 1, max: 24 }), query: v.optional(v.str({ max: 200 })), limit: v.optional(v.num({ integer: true, min: 1, max: 100 })), offset: v.optional(v.num({ integer: true, min: 0, max: 100000 })) })
const petRoutes = [
  { channel: 'pet:move', kind: 'on', schema: [v.or(idSchema, positionSchema), v.optional(positionSchema)], handler: (_e, first, second) => { const old = typeof first === 'object'; const p = old ? first : second; instance(old ? undefined : first)?.queueMove(p.x, p.y) } },
  { channel: 'pet:dragStart', kind: 'on', schema: [idSchema], handler: (_e, id) => instance(id)?.startDrag() },
  { channel: 'pet:dragMove', kind: 'on', schema: [idSchema], handler: (_e, id) => instance(id)?.moveDrag() },
  { channel: 'pet:dragEnd', kind: 'on', schema: [idSchema], handler: (_e, id) => instance(id)?.endDrag() },
  { channel: 'pet:setMousePassthrough', kind: 'on', schema: [idSchema, v.bool()], handler: (_e, id, value) => instance(id)?.petWindow?.setIgnoreMouseEvents(Boolean(value), value ? { forward: true } : undefined) },
  { channel: 'pet:savePosition', kind: 'on', schema: [idSchema], handler: (_e, id) => instance(id)?.savePosition() },
  { channel: 'pet:performAction', kind: 'on', schema: [v.or(idSchema, actionSchema), v.optional(actionSchema)], handler: (_e, first, second) => instance(typeof first === 'object' ? undefined : first)?.action(typeof first === 'object' ? first : second) },
  { channel: 'pet:runtime:getSnapshot', schema: [idSchema], handler: (_e, id) => instance(id).runtimeSnapshot },
  { channel: 'pet:runtime:event', kind: 'on', schema: [idSchema, runtimeEventSchema], handler: (_e, id, event) => instance(id)?.runtimeEvent(event) },
  { channel: 'pet:animationCompleted', kind: 'on', schema: [idSchema, v.num({ integer: true, min: 0 })], handler: (_e, id, playbackToken) => instance(id)?.runtimeEvent({ type: 'ANIMATION_COMPLETED', playbackToken }) },
  { channel: 'pet:present', schema: [idSchema, actionSchema], handler: (_e, id, action) => instance(id).action(action) },
  { channel: 'pet:resolvePresentation', schema: [idSchema, presentationContextSchema], handler: async (_e, id, context) => {
    const item = instance(id)
    const requestToken = ++item.presentationRequestToken
    const mode = profile(item.id).emotionMode
    const resolved = mode === 'local'
      ? resolveLocal(context)
      : mode === 'ai'
        ? await resolveAi(context, callbacks?.classifyPresentation)
        : await resolveHybrid(context, callbacks?.classifyPresentation)
    // 较早的分类结果不允许覆盖后续交互；拖拽等高优先级状态仍由状态机裁决。
    if (requestToken !== item.presentationRequestToken) return item.runtimeSnapshot
    return item.action({ ...resolved, priority: 80, bubble: context.bubble })
  } },
  { channel: 'pet:setChatOpen', schema: [idSchema, v.bool()], handler: (_e, id, open) => instance(id).setChat(open) },
  { channel: 'pet:showBubble', schema: [idSchema, v.optional(v.or(v.str({ max: 1200 }), v.num())), v.optional(v.num())], handler: (_e, first, second, third) => { const legacy = typeof second === 'number'; return instance(legacy ? undefined : first).bubble(legacy ? first : second, legacy ? second : third) } },
  { channel: 'pet:bubbleSize', kind: 'on', schema: [v.or(idSchema, bubbleSizeSchema), v.optional(bubbleSizeSchema)], handler: (_e, first, second) => { const old = typeof first === 'object'; const item = instance(old ? undefined : first); item?.resizeBubble(old ? first : second) } },
  { channel: 'pet:openMain', schema: [], handler: () => { callbacks?.showWindow?.(); callbacks?.openPetCenter?.(); return { success: true } } },
  { channel: 'pet:showMenu', schema: [idSchema], handler: (_e, id) => { popupMenu(id); return { success: true } }, },
  { channel: 'pet:home', schema: [idSchema], handler: (_e, id) => { const item = instance(id); const pos = home(item.id, activeIds().indexOf(item.id)); item.setBounds(pos.x, pos.y); petProfileService.update(item.id, { position: pos }); return { success: true } } },
  { channel: 'pet:getConfig', schema: [idSchema], handler: (_e, id) => instance(id).config() },
  { channel: 'pet:getMovementArea', schema: [idSchema], handler: (_e, id) => { const key = selectedId(id); const size = dimensions(key); const pos = instance(key).position(); const { workArea } = screen.getDisplayNearestPoint(pos); return { minX: workArea.x, maxX: Math.max(workArea.x, workArea.x + workArea.width - size.width), minY: workArea.y, maxY: Math.max(workArea.y, workArea.y + workArea.height - size.height) } } },
  { channel: 'pet:listModels', schema: [], handler: () => petModelService.list() },
  { channel: 'pet:refreshModels', schema: [], handler: () => { petModelService.refresh(); syncInstances(); return listInstances() } },
  { channel: 'pet:listInstances', schema: [], handler: () => listInstances() },
  { channel: 'pet:setInstanceEnabled', schema: [v.str({ max: 200 }), v.bool()], handler: (_e, id, enabled) => setInstanceEnabled(id, enabled) },
  { channel: 'pet:getModelsStorage', schema: [], handler: () => petModelService.getStorageInfo() },
  { channel: 'pet:openModelsStorage', schema: [], handler: async () => { const { shell } = require('electron'); const dir = petModelService.openFolder(); const error = await shell.openPath(dir); return error ? { error } : { success: true, path: dir } } },
  { channel: 'pet:importModel', schema: [v.optional(v.path({ max: 1024 }))], handler: (_e, file) => { const result = petModelService.importFromManifest(String(file || '')); petProfileService.ensure(result.id, { displayName: result.displayName }); return result } },
  { channel: 'pet:selectModel', schema: [v.str({ max: 200 })], handler: (_e, id) => petModelService.select(id) },
  { channel: 'pet:removeModel', schema: [v.str({ max: 200 })], handler: (_e, id) => { setInstanceEnabled(id, false); const result = petModelService.remove(id); petProfileService.remove(id); conversationDao.deleteByPet(id); memoryDao.clear(id); return result } },
  { channel: 'pet:updateSettings', schema: [v.or(idSchema, settingsSchema), v.optional(settingsSchema)], handler: (_e, first, second) => { const old = typeof first === 'object'; const id = old ? undefined : first; const patch = old ? first : second; petProfileService.update(selectedId(id), patch); instance(id).refresh(); return instance(id).config() } },
  { channel: 'pet:study:get', schema: [idSchema], handler: (_e, id) => { const settings = petStudyService.getSettings(id); return { settings, stats: petStudyService.stats(id, settings.language), items: petStudyService.list(id, settings.language, 200) } } },
  { channel: 'pet:study:updateSettings', schema: [idSchema, studySettingsSchema], handler: (_e, id, patch) => petStudyService.updateSettings(id, patch) },
  { channel: 'pet:study:add', schema: [idSchema, studyEntrySchema], handler: (_e, id, entry) => petStudyService.add(id, entry) },
  { channel: 'pet:study:addWithAI', schema: [idSchema, v.obj({ language: v.optional(v.str({ max: 40 })), term: v.str({ min: 1, max: 120 }) })], handler: (_e, id, request) => petStudyService.addWithAI(id, request) },
  { channel: 'pet:study:list', schema: [idSchema, v.optional(v.str({ max: 24 })), v.optional(v.num({ integer: true, min: 1, max: 1000 }))], handler: (_e, id, language, limit) => petStudyService.list(id, language, limit) },
  { channel: 'pet:study:search', schema: [idSchema, studySearchSchema], handler: (_e, id, options) => petStudyService.search(id, options) },
  { channel: 'pet:study:review', schema: [idSchema, v.optional(v.num({ integer: true, min: 1 })), v.num({ integer: true, min: 1, max: 4 })], handler: (_e, id, itemId, rating) => petStudyService.review(id, itemId, rating) },
  { channel: 'pet:study:remove', schema: [idSchema, v.num({ integer: true, min: 1 })], handler: (_e, id, itemId) => petStudyService.remove(id, itemId) },
  { channel: 'pet:study:generate', schema: [idSchema, v.obj({ language: v.optional(v.str({ max: 40 })), topic: v.optional(v.str({ max: 120 })), count: v.optional(v.num({ integer: true, min: 3, max: 30 })) })], handler: (_e, id, request) => petStudyService.generate(id, request) },
  { channel: 'pet:study:click', schema: [idSchema], handler: (_e, id) => petStudyService.handleClick(id) },
  { channel: 'pet:study:openAdd', schema: [idSchema], handler: (_e, id) => petStudyService.openQuickAdd(id) },
  { channel: 'pet:study:validateShortcut', schema: [idSchema, v.optional(v.str({ max: 80 })), v.optional(v.oneOf(['quickAdd', 'modeSwitch']))], handler: (_e, id, accelerator, kind) => petStudyService.validateShortcut(id, accelerator, kind) },
  { channel: 'pet:study:closeAdd', schema: [idSchema], handler: (_e, id) => { const item = instance(id, false); item?.quickAddWindow?.close(); return { success: true } } },
  { channel: 'pet:interaction:status', schema: [], handler: () => interactionService.status() },
  { channel: 'pet:interaction:list', schema: [v.optional(v.num({ integer: true, min: 1, max: 100 }))], handler: (_e, limit) => require('../db/index.cjs').petInteractionDao.list(limit) },
  { channel: 'pet:interaction:updateSettings', schema: [v.obj({ autoEnabled: v.optional(v.bool()), interactionMemoryEnabled: v.optional(v.bool()), shareOwnerContext: v.optional(v.bool()), idleMinutes: v.optional(v.num()), cooldownMinutes: v.optional(v.num()), maxTurns: v.optional(v.num()), participantIds: v.optional(v.arr(v.str({ max: 200 }), { max: 20 })), doNotDisturbStart: v.optional(v.str({ max: 5 })), doNotDisturbEnd: v.optional(v.str({ max: 5 })) })], handler: (_e, patch) => interactionService.updateSettings(patch) },
  { channel: 'pet:interaction:start', schema: [v.obj({ petAId: v.str({ max: 200 }), petBId: v.str({ max: 200 }), topic: v.optional(v.str({ max: 500 })), maxTurns: v.optional(v.num({ integer: true, min: 2, max: 10 })) })], handler: (_e, request) => interactionService.start(request) },
  { channel: 'pet:interaction:stop', schema: [], handler: () => interactionService.stop() },
  { channel: 'pet:interaction:memories', schema: [v.optional(v.str({ max: 200 })), v.optional(v.str({ max: 200 }))], handler: (_e, petAId, petBId) => interactionService.socialMemories(petAId, petBId) },
  { channel: 'pet:interaction:clearMemories', schema: [v.str({ max: 200 }), v.str({ max: 200 })], handler: (_e, petAId, petBId) => interactionService.clearSocialMemories(petAId, petBId) }
]

function init(nextCallbacks) {
  callbacks = nextCallbacks
  defineRoutes(petRoutes); installHandlers(); petRuntimeService.start(); syncInstances()
  interactionService.init({
    getActivePetIds: activeIds,
    canAutoInteract: () => !isAnyChatOpen(),
    showSpeech: (id, text) => { const item = instance(id, false); item?.show(); const presentation = resolveLocal({ event: 'social', assistantText: text }); item?.action({ ...presentation, source: 'social', priority: 70, bubble: text, bubbleDuration: 2400 }) }
  })
  petStudyService.init({
    getActivePetIds: activeIds,
    getSelectedPetId: selectedId,
    isPetActive: (id) => activeIds().includes(String(id)),
    showBubble: (id, text, duration) => instance(id, false)?.action({ intent: 'study.review', source: 'study', priority: 75, bubble: text, bubbleDuration: duration }),
    openQuickAdd: (id) => instance(id)?.openQuickAdd(),
    toggleQuickAdd: (id) => instance(id)?.toggleQuickAdd(),
    configChanged: (id) => { const item = instance(id, false); if (item?.petWindow && !item.petWindow.isDestroyed()) item.petWindow.webContents.send('pet:configChanged', item.config()) }
  })
}
function refresh() { syncInstances() }
function showPetWindow(id) { if (!settingsDao.get('petEnabled')) return null; return instance(id).show() }
function hidePetWindow(id) { const item = instance(id, false); for (const win of [item?.petWindow, item?.chatWindow, item?.bubbleWindow]) if (win && !win.isDestroyed()) win.hide() }
function destroyPetWindow(id) {
  if (id) { const item = instance(id, false); item?.destroy(); instances.delete(String(id)); return }
  for (const item of instances.values()) item.destroy()
  instances.clear()
  petRuntimeService.stop()
}
function sendPetAction(action, id) { instance(id).action(action) }
function showPetBubble(text, duration, id) { return instance(id).bubble(text, duration) }
function getRuntimeConfig(id) { return instance(id).config() }
function isAnyChatOpen() { return [...instances.values()].some((item) => item.chatOpen) }

module.exports = { init, refresh, showPetWindow, hidePetWindow, destroyPetWindow, getRuntimeConfig, sendPetAction, showPetBubble, listInstances, setInstanceEnabled, setGlobalEnabled, isAnyChatOpen, petRoutes }
