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

const SPRITE_WIDTH = 116
const CHAT = { width: 244, height: 48 }
const PET_ACTIONS = ['idle', 'wave', 'jump', 'failed', 'waiting', 'working', 'review']
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
  const width = Math.round(SPRITE_WIDTH * profile(id).scale)
  const height = Math.round(width * (208 / 192))
  return { width: width + 10, height: height + 12, spriteWidth: width, spriteHeight: height }
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
  const available = new Set(petModelService.list().map((item) => item.id))
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
  return { x: workArea.x + workArea.width - size.width - 28 - index * (size.width + 16), y: workArea.y + workArea.height - size.height - 8 }
}
function clamp(id, x, y) {
  const size = dimensions(id)
  const { workArea } = screen.getDisplayNearestPoint({ x: Number(x), y: Number(y) })
  return {
    x: Math.min(workArea.x + workArea.width - size.width, Math.max(workArea.x, Math.round(x))),
    y: Math.min(workArea.y + workArea.height - size.height, Math.max(workArea.y, Math.round(y)))
  }
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
    this.enforcing = false
  }
  config() {
    const p = profile(this.id)
    return { instanceId: this.id, model: model(this.id), settings: { enabled: activeIds().includes(this.id), ...p, study: petStudyService.getSettings(this.id), dimensions: dimensions(this.id), chatOpen: this.chatOpen } }
  }
  position() { return profile(this.id).position || home(this.id, Math.max(0, activeIds().indexOf(this.id))) }
  setBounds(x, y) {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    const size = dimensions(this.id)
    const point = clamp(this.id, x, y)
    const bounds = { ...point, width: size.width, height: size.height }
    this.enforcing = true
    try {
      this.petWindow.setBounds(bounds, false)
      // 程序驱动的连续移动不能依赖 Windows 的 move 事件；系统会合并高频事件，
      // 导致独立气泡/聊天窗口停留在旧坐标。直接使用本次目标 bounds 同步所有浮层。
      this.positionOverlays(undefined, undefined, bounds)
    } finally { this.enforcing = false }
  }
  savePosition() {
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
    win.setAlwaysOnTop(p.alwaysOnTop, 'screen-saver')
    win.setOpacity(p.opacity)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.on('closed', () => { if (this.petWindow === win) this.petWindow = null })
    win.on('resize', () => { if (!this.enforcing) this.setBounds(win.getBounds().x, win.getBounds().y) })
    let timer
    win.on('move', () => { this.positionOverlays(); clearTimeout(timer); timer = setTimeout(() => this.savePosition(), 700) })
    load(win, 'pet', this.id)
    return win
  }
  show() { const win = this.createPet(); win.showInactive(); return win }
  destroy() {
    clearTimeout(this.bubbleTimer)
    for (const win of [this.chatWindow, this.bubbleWindow, this.quickAddWindow, this.petWindow]) if (win && !win.isDestroyed()) win.destroy()
    this.chatWindow = this.bubbleWindow = this.quickAddWindow = this.petWindow = null
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
      width: 220, height: 64, transparent: true, backgroundColor: '#00000000', frame: false, show: false, focusable: false, resizable: false,
      alwaysOnTop: profile(this.id).alwaysOnTop, skipTaskbar: true, hasShadow: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, preload: path.join(__dirname, '../preload/index.cjs') }
    })
    this.bubbleWindow = win
    win.setIgnoreMouseEvents(true)
    win.webContents.on('did-finish-load', () => { if (this.bubblePayload) win.webContents.send('pet:bubbleContent', this.bubblePayload) })
    win.on('closed', () => { if (this.bubbleWindow === win) this.bubbleWindow = null })
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
  positionOverlays(width, height, petBounds) {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    const pet = petBounds || this.petWindow.getBounds()
    const { workArea } = screen.getDisplayNearestPoint({ x: pet.x, y: pet.y })
    if (this.chatWindow && !this.chatWindow.isDestroyed()) {
      const x = Math.min(workArea.x + workArea.width - CHAT.width, Math.max(workArea.x, Math.round(pet.x + pet.width / 2 - CHAT.width / 2)))
      const y = Math.min(workArea.y + workArea.height - CHAT.height, pet.y + pet.height + 6)
      this.chatWindow.setBounds({ x, y, width: CHAT.width, height: CHAT.height }, false)
    }
    if (this.bubbleWindow && !this.bubbleWindow.isDestroyed()) {
      const w = width || this.bubbleWindow.getBounds().width
      const h = height || this.bubbleWindow.getBounds().height
      let x = Math.round(pet.x + pet.width / 2 - w / 2)
      let y = pet.y - h - 6
      let placement = 'top'
      if (y < workArea.y) { y = pet.y + pet.height + 6; placement = 'bottom' }
      x = Math.min(workArea.x + workArea.width - w, Math.max(workArea.x, x))
      y = Math.min(workArea.y + workArea.height - h, Math.max(workArea.y, y))
      this.bubbleWindow.setBounds({ x, y, width: w, height: h }, false)
      this.bubbleWindow.webContents.send('pet:bubblePlacement', placement)
    }
    if (this.quickAddWindow && !this.quickAddWindow.isDestroyed()) {
      const size = this.quickAddWindow.getBounds()
      let x = Math.round(pet.x + pet.width / 2 - size.width / 2)
      let y = pet.y - size.height - 10
      if (y < workArea.y) y = pet.y + pet.height + 10
      x = Math.min(workArea.x + workArea.width - size.width, Math.max(workArea.x, x))
      y = Math.min(workArea.y + workArea.height - size.height, Math.max(workArea.y, y))
      this.quickAddWindow.setBounds({ x, y, width: size.width, height: size.height }, false)
    }
  }
  bubble(text, minimum) {
    const content = String(text || '').trim().slice(0, 1200)
    if (!content || !activeIds().includes(this.id)) return { success: false }
    const duration = calculatePetBubbleDuration(content, minimum)
    this.bubblePayload = { text: content, duration, instanceId: this.id }
    const win = this.createBubble()
    if (!win.webContents.isLoading()) win.webContents.send('pet:bubbleContent', this.bubblePayload)
    clearTimeout(this.bubbleTimer)
    this.bubbleTimer = setTimeout(() => { if (this.bubbleWindow && !this.bubbleWindow.isDestroyed()) this.bubbleWindow.destroy(); this.bubbleWindow = null }, duration)
    return { success: true, duration }
  }
  action(action = {}) {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    if (action.bubble) this.bubble(action.bubble, action.bubbleDuration)
    const { bubble, bubbleDuration, ...visual } = action
    this.petWindow.webContents.send('pet:action', visual)
  }
  refresh() {
    const win = this.show()
    const p = profile(this.id)
    const b = win.getBounds()
    this.setBounds(b.x, b.y)
    win.setOpacity(p.opacity)
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
    { label: '添加学习词条', accelerator: study.quickAddShortcut || undefined, click: () => item.openQuickAdd() },
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
    { label: t('pet.encourage'), click: () => item.action({ state: 'wave', bubble: t('pet.encourageBubble'), duration: 3600 }) },
    { label: t('pet.goHome'), click: () => { const pos = home(item.id, activeIds().indexOf(item.id)); item.setBounds(pos.x, pos.y); petProfileService.update(item.id, { position: pos }) } },
    { type: 'separator' },
    { label: t('pet.openLaunchpad'), click: () => { callbacks?.showWindow?.(); callbacks?.openPetCenter?.() } },
    { label: t('pet.hide'), click: () => setInstanceEnabled(item.id, false) }
  ]).popup({ window: item.petWindow || undefined })
}

const idSchema = v.optional(v.str({ max: 200 }))
const positionSchema = v.obj({ x: v.num(), y: v.num() })
const actionSchema = v.obj({ state: v.optional(v.oneOf(PET_ACTIONS)), bubble: v.optional(v.str({ max: 1200 })), duration: v.optional(v.num()) })
const bubbleSizeSchema = v.obj({ width: v.optional(v.num()), height: v.optional(v.num()) })
const settingsSchema = v.obj({ scale: v.optional(v.num()), opacity: v.optional(v.num()), roaming: v.optional(v.bool()), roamRange: v.optional(v.num()), roamActivity: v.optional(v.num()), alwaysOnTop: v.optional(v.bool()) })
const studyEntrySchema = v.obj({ language: v.optional(v.str({ max: 24 })), term: v.str({ min: 1, max: 120 }), meaning: v.optional(v.str({ max: 500 })), pronunciation: v.optional(v.str({ max: 120 })), example: v.optional(v.str({ max: 500 })), exampleTranslation: v.optional(v.str({ max: 500 })) })
const studySettingsSchema = v.obj({ mode: v.optional(v.oneOf(petStudyService.MODES)), language: v.optional(v.str({ max: 24 })), intervalSeconds: v.optional(v.num({ integer: true, min: 5, max: 600 })), quickAddShortcut: v.optional(v.str({ max: 80 })), autoSeedEnglish: v.optional(v.bool()) })
const petRoutes = [
  { channel: 'pet:move', kind: 'on', schema: [v.or(idSchema, positionSchema), v.optional(positionSchema)], handler: (_e, first, second) => { const old = typeof first === 'object'; const p = old ? first : second; instance(old ? undefined : first)?.setBounds(p.x, p.y) } },
  { channel: 'pet:setMousePassthrough', kind: 'on', schema: [idSchema, v.bool()], handler: (_e, id, value) => instance(id)?.petWindow?.setIgnoreMouseEvents(Boolean(value), value ? { forward: true } : undefined) },
  { channel: 'pet:savePosition', kind: 'on', schema: [idSchema], handler: (_e, id) => instance(id)?.savePosition() },
  { channel: 'pet:performAction', kind: 'on', schema: [v.or(idSchema, actionSchema), v.optional(actionSchema)], handler: (_e, first, second) => instance(typeof first === 'object' ? undefined : first)?.action(typeof first === 'object' ? first : second) },
  { channel: 'pet:setChatOpen', schema: [idSchema, v.bool()], handler: (_e, id, open) => instance(id).setChat(open) },
  { channel: 'pet:showBubble', schema: [idSchema, v.optional(v.or(v.str({ max: 1200 }), v.num())), v.optional(v.num())], handler: (_e, first, second, third) => { const legacy = typeof second === 'number'; return instance(legacy ? undefined : first).bubble(legacy ? first : second, legacy ? second : third) } },
  { channel: 'pet:bubbleSize', kind: 'on', schema: [v.or(idSchema, bubbleSizeSchema), v.optional(bubbleSizeSchema)], handler: (_e, first, second) => { const old = typeof first === 'object'; const item = instance(old ? undefined : first); const size = old ? first : second; if (!item?.bubbleWindow) return; const w = Math.min(360, Math.max(120, Math.ceil(size.width || 220))); const h = Math.min(420, Math.max(42, Math.ceil(size.height || 64))); item.positionOverlays(w, h); item.bubbleWindow.showInactive() } },
  { channel: 'pet:openMain', schema: [], handler: () => { callbacks?.showWindow?.(); callbacks?.openPetCenter?.(); return { success: true } } },
  { channel: 'pet:showMenu', schema: [idSchema], handler: (_e, id) => { popupMenu(id); return { success: true } }, },
  { channel: 'pet:home', schema: [idSchema], handler: (_e, id) => { const item = instance(id); const pos = home(item.id, activeIds().indexOf(item.id)); item.setBounds(pos.x, pos.y); petProfileService.update(item.id, { position: pos }); return { success: true } } },
  { channel: 'pet:getConfig', schema: [idSchema], handler: (_e, id) => instance(id).config() },
  { channel: 'pet:getMovementArea', schema: [idSchema], handler: (_e, id) => { const key = selectedId(id); const size = dimensions(key); const pos = instance(key).position(); const { workArea } = screen.getDisplayNearestPoint(pos); return { minX: workArea.x, maxX: workArea.x + workArea.width - size.width, minY: workArea.y, maxY: workArea.y + workArea.height - size.height } } },
  { channel: 'pet:listModels', schema: [], handler: () => petModelService.list() },
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
  { channel: 'pet:study:review', schema: [idSchema, v.optional(v.num({ integer: true, min: 1 })), v.num({ integer: true, min: 1, max: 4 })], handler: (_e, id, itemId, rating) => petStudyService.review(id, itemId, rating) },
  { channel: 'pet:study:remove', schema: [idSchema, v.num({ integer: true, min: 1 })], handler: (_e, id, itemId) => petStudyService.remove(id, itemId) },
  { channel: 'pet:study:generate', schema: [idSchema, v.obj({ language: v.optional(v.str({ max: 40 })), topic: v.optional(v.str({ max: 120 })), count: v.optional(v.num({ integer: true, min: 3, max: 30 })) })], handler: (_e, id, request) => petStudyService.generate(id, request) },
  { channel: 'pet:study:click', schema: [idSchema], handler: (_e, id) => petStudyService.handleClick(id) },
  { channel: 'pet:study:openAdd', schema: [idSchema], handler: (_e, id) => petStudyService.openQuickAdd(id) },
  { channel: 'pet:study:validateShortcut', schema: [idSchema, v.optional(v.str({ max: 80 }))], handler: (_e, id, accelerator) => petStudyService.validateShortcut(id, accelerator) },
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
  defineRoutes(petRoutes); installHandlers(); syncInstances()
  interactionService.init({
    getActivePetIds: activeIds,
    canAutoInteract: () => !isAnyChatOpen(),
    showSpeech: (id, text) => { const item = instance(id, false); item?.show(); item?.action({ state: 'wave', bubble: text, duration: 2400 }) }
  })
  petStudyService.init({
    getActivePetIds: activeIds,
    getSelectedPetId: selectedId,
    isPetActive: (id) => activeIds().includes(String(id)),
    showBubble: (id, text, duration) => instance(id, false)?.bubble(text, duration),
    openQuickAdd: (id) => instance(id)?.openQuickAdd(),
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
}
function sendPetAction(action, id) { instance(id).action(action) }
function showPetBubble(text, duration, id) { return instance(id).bubble(text, duration) }
function getRuntimeConfig(id) { return instance(id).config() }
function isAnyChatOpen() { return [...instances.values()].some((item) => item.chatOpen) }

module.exports = { init, refresh, showPetWindow, hidePetWindow, destroyPetWindow, getRuntimeConfig, sendPetAction, showPetBubble, listInstances, setInstanceEnabled, isAnyChatOpen, petRoutes }
