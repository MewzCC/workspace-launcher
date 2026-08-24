const { powerMonitor, BrowserWindow } = require('electron')
const { settingsDao, petInteractionDao, petSocialMemoryDao } = require('../db/index.cjs')
const petProfileService = require('./petProfileService.cjs')
const aiService = require('./aiService.cjs')

let hooks = { getActivePetIds: () => [], showSpeech: () => {}, canAutoInteract: () => true }
let timer = null
let running = null
let lastInteractionAt = 0

function settings() {
  const raw = settingsDao.get('petInteractionSettings') || {}
  return {
    autoEnabled: raw.autoEnabled === true,
    interactionMemoryEnabled: raw.interactionMemoryEnabled !== false,
    shareOwnerContext: raw.shareOwnerContext !== false,
    idleMinutes: Math.min(240, Math.max(1, Number(raw.idleMinutes) || 10)),
    cooldownMinutes: Math.min(1440, Math.max(1, Number(raw.cooldownMinutes) || 30)),
    maxTurns: Math.min(10, Math.max(2, Number(raw.maxTurns) || 4)),
    participantIds: Array.isArray(raw.participantIds) ? raw.participantIds.map(String) : [],
    doNotDisturbStart: String(raw.doNotDisturbStart || '23:00'),
    doNotDisturbEnd: String(raw.doNotDisturbEnd || '08:00')
  }
}
function updateSettings(patch = {}) {
  const next = { ...settings(), ...patch }
  settingsDao.set('petInteractionSettings', next)
  reschedule()
  return settings()
}
function broadcast(payload) {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('pet:interactionChanged', payload)
}
function inQuietHours(config) {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const parse = (value) => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m }
  const start = parse(config.doNotDisturbStart), end = parse(config.doNotDisturbEnd)
  return start > end ? minutes >= start || minutes < end : minutes >= start && minutes < end
}
function status() { return { running: Boolean(running), interactionId: running?.id || null, settings: settings(), lastInteractionAt } }

async function start({ petAId, petBId, topic = '', maxTurns, triggerType = 'manual' }) {
  if (running) throw new Error('已有桌宠互动正在进行')
  const active = new Set(hooks.getActivePetIds())
  if (!active.has(petAId) || !active.has(petBId)) throw new Error('参与互动的桌宠必须处于开启状态')
  if (petAId === petBId) throw new Error('请选择两只不同的桌宠')
  const turns = Math.min(10, Math.max(2, Number(maxTurns) || settings().maxTurns))
  let session = petInteractionDao.create({ petAId, petBId, title: topic || '桌宠闲聊', triggerType })
  running = { id: session.id, stopped: false }
  broadcast({ type: 'started', session })
  try {
    const relationshipMemories = settings().interactionMemoryEnabled
      ? petSocialMemoryDao.relationship(petAId, petBId, 10)
      : []
    const petADiary = settings().shareOwnerContext ? petSocialMemoryDao.today(petAId, 8, true) : []
    const petBDiary = settings().shareOwnerContext ? petSocialMemoryDao.today(petBId, 8, true) : []
    for (let index = 0; index < turns && !running.stopped; index += 1) {
      const speakerPetId = index % 2 === 0 ? petAId : petBId
      const partnerPetId = speakerPetId === petAId ? petBId : petAId
      const content = await aiService.generateInteractionReply({
        speakerPetId, partnerPetId, topic, summary: session.summary,
        messages: session.messages.map((item) => ({ speakerPetId: item.speaker_pet_id, content: item.content })),
        relationshipMemories,
        speakerDiary: speakerPetId === petAId ? petADiary : petBDiary,
        partnerDiary: speakerPetId === petAId ? petBDiary : petADiary
      })
      if (!content || running.stopped) break
      session = petInteractionDao.addMessage(session.id, speakerPetId, content)
      hooks.showSpeech(speakerPetId, content)
      broadcast({ type: 'message', sessionId: session.id, message: session.messages.at(-1) })
    }
    let summary = session.messages.slice(-6).map((item) => `${petProfileService.ensure(item.speaker_pet_id).petName}: ${item.content}`).join(' / ')
    if (settings().interactionMemoryEnabled && session.messages.length) {
      summary = await aiService.generateInteractionMemory({
        petAId, petBId, topic,
        messages: session.messages.map((item) => ({ speakerPetId: item.speaker_pet_id, content: item.content }))
      }).catch(() => summary)
      petSocialMemoryDao.remember(petAId, petBId, { content: summary, importance: triggerType === 'manual' ? 0.82 : 0.68, sourceInteractionId: session.id })
    }
    session = petInteractionDao.finish(session.id, running.stopped ? 'stopped' : 'completed', summary)
    lastInteractionAt = Date.now()
    settingsDao.set('petInteractionLastAt', lastInteractionAt)
    broadcast({ type: 'finished', session })
    return session
  } catch (error) {
    petInteractionDao.finish(session.id, 'failed', error.message)
    broadcast({ type: 'failed', sessionId: session.id, error: error.message })
    throw error
  } finally { running = null }
}
function stop() { if (running) running.stopped = true; return status() }
function socialMemories(petAId, petBId) {
  return {
    relationship: petAId && petBId && petAId !== petBId ? petSocialMemoryDao.relationship(petAId, petBId, 30) : [],
    diary: [...(petAId ? petSocialMemoryDao.today(petAId, 20, false) : []), ...(petBId ? petSocialMemoryDao.today(petBId, 20, false) : [])]
  }
}
function clearSocialMemories(petAId, petBId) {
  return {
    relationship: petAId && petBId ? petSocialMemoryDao.clearRelationship(petAId, petBId) : { deleted: 0 }
  }
}
async function autoTick() {
  const config = settings()
  if (!config.autoEnabled || running || inQuietHours(config) || !hooks.canAutoInteract()) return
  if (powerMonitor.getSystemIdleTime() < config.idleMinutes * 60) return
  if (Date.now() - lastInteractionAt < config.cooldownMinutes * 60000) return
  const active = hooks.getActivePetIds()
  const allowed = config.participantIds.length ? active.filter((id) => config.participantIds.includes(id)) : active
  if (allowed.length < 2) return
  await start({ petAId: allowed[0], petBId: allowed[1], topic: '休息时间的自然闲聊', maxTurns: config.maxTurns, triggerType: 'auto' }).catch((error) => console.warn('[pet-interaction] auto interaction failed:', error.message))
}
function reschedule() {
  clearInterval(timer)
  timer = setInterval(() => autoTick(), 60000)
}

function init(nextHooks) {
  hooks = { ...hooks, ...nextHooks }
  lastInteractionAt = Number(settingsDao.get('petInteractionLastAt')) || 0
  reschedule()
}

module.exports = { init, start, stop, status, settings, updateSettings, reschedule, socialMemories, clearSocialMemories }
