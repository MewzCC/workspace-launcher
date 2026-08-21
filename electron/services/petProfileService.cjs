const { settingsDao } = require('../db/index.cjs')
const { t } = require('../i18n.cjs')

const CHAT_MODES = ['concise', 'focus', 'creative', 'casual']
const LEGACY_DEFAULT_PERSONALITY = '你是一只安静、友善的工作陪伴型桌宠。回答简短自然，优先鼓励用户拆分任务、专注工作和适时休息。'
const DEFAULT_BEHAVIOR = {
  scale: 0.9,
  opacity: 1,
  roaming: true,
  roamRange: 0.7,
  roamActivity: 1,
  alwaysOnTop: true,
  position: null
}

function selectedModelId() {
  return String(settingsDao.get('petModelId') || 'builtin-launchbot')
}

function profiles() {
  const value = settingsDao.get('petProfiles')
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function clamp(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function validPosition(value) {
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
    ? { x: Math.round(Number(value.x)), y: Math.round(Number(value.y)) }
    : null
}

function normalize(profile = {}, defaults = {}) {
  const mode = CHAT_MODES.includes(profile.mode) ? profile.mode : 'concise'
  return {
    petName: String(profile.petName || defaults.displayName || t('pet.defaultName')).trim().slice(0, 40),
    personality: String(profile.personality || t('pet.defaultPersonality')).trim().slice(0, 1200),
    mode,
    scale: clamp(profile.scale, 0.65, 1.35, DEFAULT_BEHAVIOR.scale),
    opacity: clamp(profile.opacity, 0.55, 1, DEFAULT_BEHAVIOR.opacity),
    roaming: typeof profile.roaming === 'boolean' ? profile.roaming : DEFAULT_BEHAVIOR.roaming,
    roamRange: clamp(profile.roamRange, 0.2, 1, DEFAULT_BEHAVIOR.roamRange),
    roamActivity: clamp(profile.roamActivity, 0.5, 2, DEFAULT_BEHAVIOR.roamActivity),
    alwaysOnTop: typeof profile.alwaysOnTop === 'boolean' ? profile.alwaysOnTop : DEFAULT_BEHAVIOR.alwaysOnTop,
    position: validPosition(profile.position)
  }
}

function legacyProfile(defaults = {}) {
  const storedPersonality = settingsDao.get('aiPetPersonality')
  return normalize({
    petName: settingsDao.get('aiPetName'),
    personality: !storedPersonality || storedPersonality === LEGACY_DEFAULT_PERSONALITY
      ? t('pet.defaultPersonality')
      : storedPersonality,
    mode: 'concise',
    scale: settingsDao.get('petScale'),
    opacity: settingsDao.get('petOpacity'),
    roaming: settingsDao.get('petRoaming'),
    roamRange: settingsDao.get('petRoamRange'),
    roamActivity: settingsDao.get('petRoamActivity'),
    alwaysOnTop: settingsDao.get('petAlwaysOnTop'),
    position: settingsDao.get('petPosition')
  }, defaults)
}

function ensure(modelId = selectedModelId(), defaults = {}) {
  const id = String(modelId || selectedModelId())
  const all = profiles()
  if (!Object.prototype.hasOwnProperty.call(all, id)) {
    const firstProfile = settingsDao.get('petProfilesInitialized') !== true
    all[id] = firstProfile ? legacyProfile(defaults) : normalize({}, defaults)
    settingsDao.set('petProfiles', all)
    if (firstProfile) settingsDao.set('petProfilesInitialized', true)
  }
  return normalize(all[id], defaults)
}

function update(modelId = selectedModelId(), patch = {}, defaults = {}) {
  const id = String(modelId || selectedModelId())
  const all = profiles()
  const current = ensure(id, defaults)
  const next = normalize({ ...current, ...patch }, defaults)
  all[id] = next
  settingsDao.set('petProfiles', all)
  return next
}

function remove(modelId) {
  const id = String(modelId || '')
  const all = profiles()
  if (!Object.prototype.hasOwnProperty.call(all, id)) return false
  delete all[id]
  settingsDao.set('petProfiles', all)
  const active = settingsDao.get('aiActiveConversationIds') || {}
  if (Object.prototype.hasOwnProperty.call(active, id)) {
    delete active[id]
    settingsDao.set('aiActiveConversationIds', active)
  }
  return true
}

module.exports = { CHAT_MODES, DEFAULT_BEHAVIOR, selectedModelId, ensure, update, remove }
