const { safeStorage } = require('electron')
const { settingsDao, conversationDao, memoryDao } = require('../db/index.cjs')
const { t } = require('../i18n.cjs')

const LEGACY_DEFAULT_PERSONALITY = '你是一只安静、友善的工作陪伴型桌宠。回答简短自然，优先鼓励用户拆分任务、专注工作和适时休息。'
const maintenanceChains = new Map()

function decryptKey(provider = settingsDao.get('aiProvider') || 'openai') {
  const providerKeys = settingsDao.get('aiProviderKeysEncrypted') || {}
  const stored = providerKeys[provider] || (provider === 'openai' ? settingsDao.get('aiApiKeyEncrypted') : '')
  if (!stored) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    return Buffer.from(stored, 'base64').toString('utf8')
  } catch (_) { return '' }
}

function encryptKey(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const buffer = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8')
  return buffer.toString('base64')
}

function getMemoryMode() {
  const mode = settingsDao.get('aiMemoryMode')
  return ['off', 'manual', 'auto'].includes(mode) ? mode : 'manual'
}

function getConfig() {
  const storedPersonality = settingsDao.get('aiPetPersonality')
  const providerKeys = Object.fromEntries(
    ['openai', 'deepseek', 'kimi', 'zhipu', 'custom'].map((provider) => [provider, Boolean(decryptKey(provider))])
  )
  return {
    provider: settingsDao.get('aiProvider') || 'custom',
    apiFormat: settingsDao.get('aiApiFormat') || 'responses',
    baseUrl: settingsDao.get('aiBaseUrl'),
    model: settingsDao.get('aiModel'),
    petName: settingsDao.get('aiPetName'),
    personality: !storedPersonality || storedPersonality === LEGACY_DEFAULT_PERSONALITY
      ? t('pet.defaultPersonality')
      : storedPersonality,
    hasApiKey: Boolean(decryptKey()),
    providerKeys,
    memoryMode: getMemoryMode()
  }
}

function saveConfig(config = {}) {
  if (Object.prototype.hasOwnProperty.call(config, 'provider')) {
    const provider = String(config.provider || '').trim()
    if (!['openai', 'deepseek', 'kimi', 'zhipu', 'custom'].includes(provider)) throw new Error(t('pet.invalidProvider'))
    settingsDao.set('aiProvider', provider)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'apiFormat')) {
    const apiFormat = String(config.apiFormat || '').trim()
    if (!['chat-completions', 'responses'].includes(apiFormat)) throw new Error(t('pet.invalidApiFormat'))
    settingsDao.set('aiApiFormat', apiFormat)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'baseUrl')) {
    const url = new URL(String(config.baseUrl || '').trim())
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error(t('pet.httpsRequired'))
    settingsDao.set('aiBaseUrl', url.toString().replace(/\/$/, ''))
  }
  if (Object.prototype.hasOwnProperty.call(config, 'model')) {
    const model = String(config.model || '').trim()
    if (!model || model.length > 100) throw new Error(t('pet.invalidModel'))
    settingsDao.set('aiModel', model)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'petName')) settingsDao.set('aiPetName', String(config.petName || t('pet.defaultName')).trim().slice(0, 40))
  if (Object.prototype.hasOwnProperty.call(config, 'personality')) settingsDao.set('aiPetPersonality', String(config.personality || '').trim().slice(0, 1200))
  if (Object.prototype.hasOwnProperty.call(config, 'memoryMode')) setMemoryMode(config.memoryMode)

  const provider = String(config.provider || settingsDao.get('aiProvider') || 'custom')
  const providerKeys = { ...(settingsDao.get('aiProviderKeysEncrypted') || {}) }
  if (config.clearApiKey) delete providerKeys[provider]
  if (String(config.apiKey || '').trim()) providerKeys[provider] = encryptKey(config.apiKey)
  settingsDao.set('aiProviderKeysEncrypted', providerKeys)
  return getConfig()
}

function setMemoryMode(mode) {
  const value = String(mode || '')
  if (!['off', 'manual', 'auto'].includes(value)) throw new Error('Invalid memory mode')
  settingsDao.set('aiMemoryMode', value)
  return { mode: value }
}

function extractText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  const parts = []
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content.text) parts.push(content.text)
    }
  }
  return parts.join('\n').trim()
}

function extractChatText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content.trim()
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('').trim()
  return ''
}

async function requestModel(instructions, input, timeout = 45000) {
  const key = decryptKey()
  if (!key) throw new Error(t('pet.keyRequired'))
  const baseUrl = String(settingsDao.get('aiBaseUrl') || '').replace(/\/$/, '')
  const apiFormat = settingsDao.get('aiApiFormat') || 'responses'
  const model = String(settingsDao.get('aiModel') || '').trim()
  const normalized = input.map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').slice(0, 12000)
  })).filter((item) => item.content.trim())
  const endpoint = apiFormat === 'responses' ? 'responses' : 'chat/completions'
  const body = apiFormat === 'responses'
    ? { model, store: false, instructions, input: normalized }
    : { model, messages: [{ role: 'system', content: instructions }, ...normalized], stream: false }
  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || t('pet.requestFailed', { status: response.status }))
  const text = apiFormat === 'responses' ? extractText(payload) : extractChatText(payload)
  if (!text) throw new Error(t('pet.emptyResponse'))
  return text
}

function getConversation(conversationId) {
  const conversation = conversationId ? conversationDao.setActive(conversationId) : conversationDao.ensureActive()
  return { conversation, messages: conversationDao.listMessages(conversation.id) }
}

function listConversations() { return conversationDao.list() }
function createConversation(title = '') { return getConversation(conversationDao.create(title).id) }
function switchConversation(id) { return getConversation(conversationDao.setActive(id).id) }
function clearConversation(id) {
  const conversation = conversationDao.clear(id || conversationDao.ensureActive().id)
  return { conversation, messages: [] }
}

function memoryContext(memories) {
  if (!memories.length) return ''
  return `\n\nRelevant long-term memories (use only when helpful; do not mention this list unless asked):\n${memories.map((item) => `- [${item.type}] ${item.content}`).join('\n')}`
}

function summaryContext(conversation) {
  return conversation.summary ? `\n\nEarlier conversation summary:\n${conversation.summary}` : ''
}

function titleFromMessage(content) {
  const compact = String(content || '').replace(/\s+/g, ' ').trim()
  return compact.length > 32 ? `${compact.slice(0, 32)}…` : compact
}

async function chat(request = {}) {
  const legacyMessages = Array.isArray(request) ? request : null
  const content = legacyMessages
    ? [...legacyMessages].reverse().find((item) => item?.role === 'user')?.content
    : request.content
  const conversation = request.conversationId
    ? conversationDao.setActive(request.conversationId)
    : conversationDao.ensureActive()
  const userMessage = conversationDao.appendMessage(conversation.id, 'user', content)
  if (!conversation.title) conversationDao.setTitle(conversation.id, titleFromMessage(content))

  const memoryMode = getMemoryMode()
  const memories = memoryMode === 'off' ? [] : memoryDao.search(content, 8)
  const recent = conversationDao.listMessages(conversation.id, 16)
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content }))
  const current = conversationDao.get(conversation.id)
  const petName = settingsDao.get('aiPetName') || t('pet.defaultName')
  const storedPersonality = settingsDao.get('aiPetPersonality')
  const personality = !storedPersonality || storedPersonality === LEGACY_DEFAULT_PERSONALITY
    ? t('pet.defaultPersonality')
    : storedPersonality
  const instructions = `${t('pet.systemInstruction', { name: petName, personality })}\n${t('pet.responseLanguageRule')}${summaryContext(current)}${memoryContext(memories)}`
  const text = await requestModel(instructions, recent)
  const assistantMessage = conversationDao.appendMessage(conversation.id, 'assistant', text)
  scheduleMaintenance(conversation.id, userMessage, assistantMessage)
  return {
    text,
    conversation: conversationDao.get(conversation.id),
    userMessage,
    assistantMessage,
    memoriesUsed: memories.map((item) => item.id)
  }
}

function parseJsonArray(text) {
  const source = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(source)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    const match = source.match(/\[[\s\S]*\]/)
    if (!match) return []
    try { return JSON.parse(match[0]) } catch (_) { return [] }
  }
}

function looksSensitiveMemory(content) {
  const value = String(content || '')
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value) ||
    /\b(?:sk|ghp|github_pat|xox[baprs])-?[a-z0-9_\-]{16,}\b/i.test(value) ||
    /\b(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i.test(value) ||
    /\bBearer\s+[a-z0-9._\-]{12,}/i.test(value)
}

async function updateConversationSummary(conversationId) {
  const batch = conversationDao.summaryBatch(conversationId)
  if (!batch?.messages?.length) return
  const transcript = batch.messages.map((item) => `${item.role}: ${item.content}`).join('\n')
  const text = await requestModel(
    'Summarize the conversation for future context. Preserve user preferences, decisions, project facts and unresolved tasks. Be concise, factual, and use the same primary language as the conversation.',
    [{ role: 'user', content: `${batch.conversation.summary ? `Previous summary:\n${batch.conversation.summary}\n\n` : ''}New messages:\n${transcript}` }],
    30000
  )
  conversationDao.updateSummary(conversationId, text, batch.throughMessageId)
}

async function extractAutomaticMemories(userMessage, assistantMessage) {
  const memoryMode = getMemoryMode()
  if (memoryMode === 'off') return
  const text = await requestModel(
    'Extract only durable, explicitly stated user facts useful in future conversations. Ignore transient requests, secrets, passwords and assistant claims. Return a JSON array only, maximum 3 items. Each item: {"type":"preference|project|person|habit|environment|task","content":"concise fact","confidence":0.0-1.0,"expiresAt":null}. Return [] when nothing should be remembered.',
    [{ role: 'user', content: `User message:\n${userMessage.content}\n\nAssistant reply for context:\n${assistantMessage.content}` }],
    30000
  )
  for (const item of parseJsonArray(text).slice(0, 3)) {
    if (!item?.content || !memoryDao.TYPES.includes(item.type) || looksSensitiveMemory(item.content)) continue
    memoryDao.create({
      type: item.type,
      content: item.content,
      confidence: item.confidence,
      sourceMessageId: userMessage.id,
      expiresAt: item.expiresAt,
      confirmed: memoryMode === 'auto'
    })
  }
}

function scheduleMaintenance(conversationId, userMessage, assistantMessage) {
  const previous = maintenanceChains.get(conversationId) || Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
      await updateConversationSummary(conversationId).catch((error) => console.warn('[ai] summary skipped:', error.message))
      await extractAutomaticMemories(userMessage, assistantMessage).catch((error) => console.warn('[ai] memory extraction skipped:', error.message))
  }).finally(() => {
    if (maintenanceChains.get(conversationId) === next) maintenanceChains.delete(conversationId)
  })
  maintenanceChains.set(conversationId, next)
}

function listMemories(options) { return memoryDao.list(options) }
function createMemory(data) { return memoryDao.create(data) }
function updateMemory(id, data) { return memoryDao.update(id, data) }
function forgetMemory(id) { return memoryDao.archive(id) }
function clearMemories() { return memoryDao.clear() }

module.exports = {
  getConfig, saveConfig, chat,
  getConversation, listConversations, createConversation, switchConversation, clearConversation,
  setMemoryMode, listMemories, createMemory, updateMemory, forgetMemory, clearMemories
}
