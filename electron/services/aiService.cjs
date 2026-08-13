const { safeStorage } = require('electron')
const { settingsDao } = require('../db/index.cjs')
const { t } = require('../i18n.cjs')
const LEGACY_DEFAULT_PERSONALITY = '你是一只安静、友善的工作陪伴型桌宠。回答简短自然，优先鼓励用户拆分任务、专注工作和适时休息。'

function decryptKey(provider = settingsDao.get('aiProvider') || 'openai') {
  const providerKeys = settingsDao.get('aiProviderKeysEncrypted') || {}
  const stored = providerKeys[provider] || (provider === 'openai' ? settingsDao.get('aiApiKeyEncrypted') : '')
  if (!stored) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    }
    return Buffer.from(stored, 'base64').toString('utf8')
  } catch (_) {
    return ''
  }
}

function encryptKey(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const buffer = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(text)
    : Buffer.from(text, 'utf8')
  return buffer.toString('base64')
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
    providerKeys
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
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error(t('pet.httpsRequired'))
    }
    settingsDao.set('aiBaseUrl', url.toString().replace(/\/$/, ''))
  }
  if (Object.prototype.hasOwnProperty.call(config, 'model')) {
    const model = String(config.model || '').trim()
    if (!model || model.length > 100) throw new Error(t('pet.invalidModel'))
    settingsDao.set('aiModel', model)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'petName')) {
    settingsDao.set('aiPetName', String(config.petName || t('pet.defaultName')).trim().slice(0, 40))
  }
  if (Object.prototype.hasOwnProperty.call(config, 'personality')) {
    settingsDao.set('aiPetPersonality', String(config.personality || '').trim().slice(0, 1200))
  }
  const provider = String(config.provider || settingsDao.get('aiProvider') || 'custom')
  const providerKeys = { ...(settingsDao.get('aiProviderKeysEncrypted') || {}) }
  if (config.clearApiKey) delete providerKeys[provider]
  if (String(config.apiKey || '').trim()) {
    providerKeys[provider] = encryptKey(config.apiKey)
  }
  settingsDao.set('aiProviderKeysEncrypted', providerKeys)
  return getConfig()
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

async function chat(messages = []) {
  const key = decryptKey()
  if (!key) throw new Error(t('pet.keyRequired'))
  const baseUrl = String(settingsDao.get('aiBaseUrl') || '').replace(/\/$/, '')
  const apiFormat = settingsDao.get('aiApiFormat') || 'responses'
  const model = String(settingsDao.get('aiModel') || '').trim()
  const petName = settingsDao.get('aiPetName') || t('pet.defaultName')
  const storedPersonality = settingsDao.get('aiPetPersonality')
  const personality = !storedPersonality || storedPersonality === LEGACY_DEFAULT_PERSONALITY
    ? t('pet.defaultPersonality')
    : storedPersonality
  const input = (Array.isArray(messages) ? messages : []).slice(-16).map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').slice(0, 4000)
  })).filter((item) => item.content.trim())
  if (!input.length) throw new Error(t('pet.messageRequired'))

  const instructions = `${t('pet.systemInstruction', { name: petName, personality })}\n${t('pet.responseLanguageRule')}`
  const endpoint = apiFormat === 'responses' ? 'responses' : 'chat/completions'
  const body = apiFormat === 'responses'
    ? { model, store: false, instructions, input }
    : { model, messages: [{ role: 'system', content: instructions }, ...input], stream: false }
  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || t('pet.requestFailed', { status: response.status }))
  const text = apiFormat === 'responses' ? extractText(payload) : extractChatText(payload)
  if (!text) throw new Error(t('pet.emptyResponse'))
  return { text }
}

module.exports = { getConfig, saveConfig, chat }
