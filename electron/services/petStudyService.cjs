const { globalShortcut, BrowserWindow } = require('electron')
const { settingsDao, petStudyDao, workspaceDao } = require('../db/index.cjs')
const aiService = require('./aiService.cjs')

const MODES = ['companion', 'study', 'stealth-study']
const DEFAULTS = {
  mode: 'companion',
  language: 'en',
  intervalSeconds: 10,
  intervalVersion: 2,
  quickAddShortcut: 'CommandOrControl+Alt+W',
  autoSeedEnglish: true,
}
const timers = new Map()
const recent = new Map()
const current = new Map()
let callbacks = {}
let registeredShortcut = ''

function profileId(value) {
  return String(value || callbacks.getSelectedPetId?.() || 'builtin-launchbot')
}

function allSettings() {
  return settingsDao.get('petStudySettings') || {}
}

function getSettings(id) {
  const stored = allSettings()[profileId(id)] || {}
  // 设置轮播间隔默认值为 10 秒
  const migrated = stored.intervalVersion === 2
    ? stored
    : {
      ...stored,
      intervalSeconds: stored.intervalSeconds === 45 || stored.intervalSeconds == null ? 10 : stored.intervalSeconds,
      intervalVersion: 2,
    }
  return { ...DEFAULTS, ...migrated }
}

function emit(id) {
  const studySettings = getSettings(id)
  const payload = {
    petModelId: profileId(id),
    settings: studySettings,
    stats: petStudyDao.stats(profileId(id), studySettings.language),
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('pet:studyChanged', payload)
  }
  callbacks.configChanged?.(profileId(id))
  return payload
}

function updateSettings(id, patch = {}) {
  const key = profileId(id)
  const currentSettings = getSettings(key)
  const next = { ...currentSettings }
  if (patch.mode != null) next.mode = MODES.includes(patch.mode) ? patch.mode : currentSettings.mode
  if (patch.language != null) next.language = String(patch.language || 'en').trim().toLowerCase().slice(0, 24) || 'en'
  if (patch.intervalSeconds != null) {
    next.intervalSeconds = Math.min(600, Math.max(5, Math.round(Number(patch.intervalSeconds) || 10)))
  }
  if (patch.quickAddShortcut != null) next.quickAddShortcut = String(patch.quickAddShortcut || '').trim().slice(0, 80)
  if (patch.autoSeedEnglish != null) next.autoSeedEnglish = Boolean(patch.autoSeedEnglish)
  settingsDao.set('petStudySettings', { ...allSettings(), [key]: next })
  if (next.autoSeedEnglish && next.language === 'en' && petStudyDao.stats(key).total === 0) {
    petStudyDao.seedEnglish(key)
  }
  reschedule(key)
  syncShortcut()
  return emit(key)
}

function formatCard(card) {
  const pronunciation = card.pronunciation ? `  ${card.pronunciation}` : ''
  const meaning = card.meaning ? `\n**${card.meaning}**` : ''
  const example = card.example ? `\n_${card.example}_` : ''
  const translation = card.example_translation ? `\n${card.example_translation}` : ''
  return `### ${card.term}${pronunciation}${meaning}${example}${translation}`
}

function showNext(id, immediate = false) {
  const key = profileId(id)
  const settings = getSettings(key)
  if (settings.mode === 'companion' || !callbacks.isPetActive?.(key)) return null
  if (settings.autoSeedEnglish && settings.language === 'en' && petStudyDao.stats(key).total === 0) {
    petStudyDao.seedEnglish(key)
  }
  const card = petStudyDao.next(key, settings.language, recent.get(key) || [])
  if (!card) {
    callbacks.showBubble?.(
      key,
      `还没有 ${settings.language} 词条，单击桌宠或按 ${settings.quickAddShortcut || '快捷键'} 添加。`,
      7000,
    )
    return null
  }
  current.set(key, card.itemId)
  const ids = [...(recent.get(key) || []), card.itemId].slice(-5)
  recent.set(key, ids)
  callbacks.showBubble?.(
    key,
    formatCard(card),
    immediate ? 9000 : Math.min(14000, Math.max(6500, getSettings(key).intervalSeconds * 650)),
  )
  return card
}

function reschedule(id) {
  const key = profileId(id)
  clearTimeout(timers.get(key))
  timers.delete(key)
  const settings = getSettings(key)
  if (settings.mode === 'companion' || !callbacks.isPetActive?.(key)) return
  const tick = () => {
    showNext(key)
    const latest = getSettings(key)
    if (latest.mode !== 'companion') timers.set(key, setTimeout(tick, latest.intervalSeconds * 1000))
  }
  timers.set(key, setTimeout(tick, 800))
}

function calculateReview(card, rating) {
  const now = Date.now()
  const elapsedDays = card.last_review_at ? Math.max(0, (now - card.last_review_at) / 86400000) : 0
  const oldStability = Math.max(0.1, Number(card.stability) || 0.1)
  const retrievability = card.last_review_at ? Math.exp(Math.log(0.9) * elapsedDays / oldStability) : 0
  const difficulty = Math.min(10, Math.max(1, (Number(card.difficulty) || 5) - 0.65 * (rating - 3)))
  let stability
  if (!card.reps) {
    stability = [0.12, 0.7, 2.5, 5.8][rating - 1]
  } else if (rating === 1) {
    stability =
      Math.max(0.1, 0.35 * Math.pow(difficulty, -0.2) * Math.pow(oldStability, 0.7) * Math.pow(Math.max(0.05, 1 - retrievability), 0.4))
  } else {
    stability =
      oldStability *
      (1 +
        0.13 *
        (11 - difficulty) *
        Math.pow(oldStability, -0.45) *
        (Math.exp((1 - retrievability) * 1.6) - 1) *
        (rating === 2 ? 0.72 : rating === 4 ? 1.35 : 1))
  }
  stability = Math.min(36500, Math.max(0.1, stability))
  let scheduledDays = stability
  let dueAt = now + scheduledDays * 86400000
  let state = 'review'
  if (rating === 1) {
    state = 'relearning'
    scheduledDays = 2 / 1440
    dueAt = now + 120000
  } else if (rating === 2 && card.state === 'new') {
    state = 'learning'
    scheduledDays = 10 / 1440
    dueAt = now + 600000
  }
  return { state, dueAt: Math.round(dueAt), stability, difficulty, scheduledDays, elapsedDays }
}

function review(id, itemId, rating) {
  const key = profileId(id)
  const card = petStudyDao.get(Number(itemId || current.get(key)), key)
  if (!card) throw new Error('当前没有可复习词条')
  const safeRating = Math.min(4, Math.max(1, Math.round(Number(rating) || 3)))
  const next = calculateReview(card, safeRating)
  const saved = petStudyDao.saveReview(
    { ...card, pet_model_id: key, item_id: card.itemId },
    next,
    safeRating,
    next.elapsedDays,
  )
  emit(key)
  setTimeout(() => showNext(key, true), 160)
  return saved
}

function add(id, entry) {
  const result = petStudyDao.add(entry, profileId(id))
  emit(id)
  return result
}

function list(id, language, limit) {
  return petStudyDao.list(profileId(id), language, limit)
}

function search(id, options) {
  return petStudyDao.search(profileId(id), options)
}

function remove(id, itemId) {
  const result = petStudyDao.remove(itemId, profileId(id))
  emit(id)
  return result
}

async function generate(id, request) {
  const items = await aiService.generateStudyItems(request)
  const saved = items.map((item) => add(id, item))
  return { items: saved, count: saved.length }
}

async function addWithAI(id, request) {
  const entry = await aiService.generateStudyEntry(request)
  return add(id, entry)
}

function handleClick(id) {
  const key = profileId(id)
  const mode = getSettings(key).mode
  if (mode === 'stealth-study') {
    callbacks.openQuickAdd?.(key)
    return { handled: true, action: 'quick-add' }
  }
  if (mode === 'study') {
    if (current.get(key)) review(key, current.get(key), 3)
    else showNext(key, true)
    return { handled: true, action: 'review-good' }
  }
  return { handled: false }
}

function openQuickAdd(id) {
  callbacks.openQuickAdd?.(profileId(id))
  return { success: true }
}

function validateShortcut(id, accelerator) {
  const accel = String(accelerator || '').trim()
  if (!accel) return { valid: true }
  const normalized = accel.toLowerCase()
  if (registeredShortcut && registeredShortcut.toLowerCase() === normalized) return { valid: true }
  const duplicate = workspaceDao.list().find((workspace) =>
    String(workspace.shortcut || '').trim().toLowerCase() === normalized
  )
  if (duplicate) return { valid: false, reason: 'duplicate', workspaceName: duplicate.name }
  try {
    const registered = globalShortcut.register(accel, () => {})
    if (!registered) return { valid: false, reason: 'occupied' }
    globalShortcut.unregister(accel)
    return { valid: true }
  } catch (_) {
    return { valid: false, reason: 'invalid' }
  }
}

function syncShortcut() {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut)
    registeredShortcut = ''
  }
  const ids = callbacks.getActivePetIds?.() || []
  const target = ids.find((id) => getSettings(id).mode !== 'companion') || ids[0]
  if (!target) return
  const accel = getSettings(target).quickAddShortcut
  if (!accel) return
  try {
    if (globalShortcut.register(accel, () => callbacks.openQuickAdd?.(target))) registeredShortcut = accel
  } catch (error) {
    console.warn('[pet-study] 快捷键注册失败:', error.message)
  }
}

function init(nextCallbacks) {
  callbacks = nextCallbacks || {}
  for (const id of callbacks.getActivePetIds?.() || []) reschedule(id)
  syncShortcut()
}

function shutdown() {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut)
  registeredShortcut = ''
}

module.exports = {
  MODES,
  init,
  shutdown,
  getSettings,
  updateSettings,
  showNext,
  review,
  add,
  list,
  search,
  remove,
  generate,
  addWithAI,
  handleClick,
  openQuickAdd,
  validateShortcut,
  stats: (id, language) => petStudyDao.stats(profileId(id), language || getSettings(id).language),
  reschedule,
  syncShortcut,
}
