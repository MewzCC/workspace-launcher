const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-ai-memory-'))
process.env.PORTABLE_EXECUTABLE_DIR = testRoot

app.whenReady().then(async () => {
  // 同时隔离 appData，避免存储迁移逻辑把本机真实数据库复制进测试目录。
  app.setPath('appData', path.join(testRoot, 'appData'))
  app.setPath('userData', path.join(testRoot, 'userData'))
  const db = require('../electron/db/index.cjs')
  const { conversationDao, memoryDao, petSocialMemoryDao, settingsDao } = db

  const first = conversationDao.ensureActive()
  assert.ok(first.id)
  conversationDao.appendMessage(first.id, 'user', 'I am building LaunchPad with React.')
  conversationDao.appendMessage(first.id, 'assistant', 'Understood.')
  conversationDao.setTitle(first.id, 'LaunchPad project')

  for (let index = 0; index < 22; index += 1) {
    conversationDao.appendMessage(first.id, index % 2 ? 'assistant' : 'user', `message-${index}`)
  }
  const batch = conversationDao.summaryBatch(first.id)
  assert.ok(batch && batch.messages.length >= 8)
  conversationDao.updateSummary(first.id, 'The user is building LaunchPad with React.', batch.throughMessageId)
  assert.match(conversationDao.get(first.id).summary, /LaunchPad/)

  const second = conversationDao.create('Second conversation')
  assert.strictEqual(settingsDao.get('aiActiveConversationId'), second.id)
  assert.strictEqual(conversationDao.ensureActive().id, second.id)
  conversationDao.setActive(first.id)
  assert.strictEqual(conversationDao.ensureActive().id, first.id)

  const memory = memoryDao.create({
    type: 'project',
    content: 'The user is building LaunchPad with a React frontend.',
    confidence: 0.95
  })
  assert.ok(memory.id)
  const ftsHit = db.getDb().prepare('SELECT rowid FROM ai_memories_fts WHERE ai_memories_fts MATCH ?').get('"LaunchPad"*')
  assert.strictEqual(Number(ftsHit.rowid), memory.id)
  assert.strictEqual(memoryDao.search('LaunchPad React', 8)[0].id, memory.id)
  const updated = memoryDao.update(memory.id, { content: 'LaunchPad uses React and Electron.' })
  assert.match(updated.content, /Electron/)
  assert.strictEqual(memoryDao.archive(memory.id).archived, true)
  assert.strictEqual(memoryDao.list().length, 0)

  const aiService = require('../electron/services/aiService.cjs')
  aiService.saveConfig({
    provider: 'custom',
    apiFormat: 'chat-completions',
    baseUrl: 'http://127.0.0.1/v1',
    model: 'test-model',
    apiKey: 'test-key',
    memoryMode: 'auto'
  })
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    const system = body.messages?.[0]?.content || ''
    const extractionInput = body.messages?.at(-1)?.content || ''
    const content = system.includes('Extract only durable')
      ? JSON.stringify([extractionInput.includes('secret-value')
          ? { type: 'environment', content: 'API key: secret-value-1234567890123456', confidence: 0.99, expiresAt: null }
          : { type: 'preference', content: 'The user prefers concise status updates.', confidence: 0.96, expiresAt: null }])
      : 'I will keep updates concise.'
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) }
  }
  const chatResult = await aiService.chat({ conversationId: first.id, content: 'I prefer concise status updates.' })
  assert.strictEqual(chatResult.text, 'I will keep updates concise.')
  for (let attempt = 0; attempt < 30 && memoryDao.list().length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  assert.match(memoryDao.list()[0]?.content || '', /concise status updates/)
  assert.strictEqual(memoryDao.list()[0].confirmed, true)
  memoryDao.clear()

  aiService.setMemoryMode('auto')
  await aiService.chat({ conversationId: first.id, content: 'My secret-value should never become memory.' })
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.strictEqual(memoryDao.list().length, 0)

  aiService.setMemoryMode('manual')
  await aiService.chat({ conversationId: first.id, content: 'Please remember that I prefer concise status updates.' })
  for (let attempt = 0; attempt < 30 && memoryDao.list().length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const pending = memoryDao.list()[0]
  assert.strictEqual(pending.confirmed, false)
  assert.strictEqual(memoryDao.search('concise status updates', 8).length, 0)
  memoryDao.update(pending.id, { confirmed: true })
  assert.strictEqual(memoryDao.search('concise status updates', 8)[0].id, pending.id)
  memoryDao.clear()

  conversationDao.clear(first.id)
  assert.strictEqual(conversationDao.listMessages(first.id).length, 0)
  assert.strictEqual(conversationDao.get(first.id).summary, '')

  const diary = petSocialMemoryDao.addDiary('pet-a', { content: '主人今天完成了多桌宠记忆功能。', category: 'work' })
  assert.ok(diary.id)
  assert.strictEqual(petSocialMemoryDao.today('pet-a')[0].id, diary.id)
  const relationship = petSocialMemoryDao.remember('pet-b', 'pet-a', { content: '它们约好明天继续分享新鲜事。', importance: 0.9 })
  assert.ok(relationship.id)
  assert.strictEqual(petSocialMemoryDao.relationship('pet-a', 'pet-b')[0].id, relationship.id)
  assert.strictEqual(petSocialMemoryDao.clearRelationship('pet-b', 'pet-a').deleted, 1)

  const duplicateId = 'builtin-launchbot--instance-2'
  settingsDao.set('petInstancesInitialized', true)
  settingsDao.set('petInstanceIds', ['builtin-launchbot', duplicateId])
  settingsDao.set('petKnownInstanceIds', [duplicateId])
  require('../electron/services/petProfileService.cjs').ensure(duplicateId, { displayName: 'LaunchBot 2' })
  conversationDao.create('错误重复实例会话', duplicateId)
  memoryDao.create({ type: 'fact', content: '错误重复实例记忆', confidence: 1 }, duplicateId)
  const cleanedInstances = require('../electron/services/petService.cjs').listInstances()
  assert.strictEqual(cleanedInstances.some((item) => item.id === duplicateId), false)
  assert.deepStrictEqual(settingsDao.get('petInstanceIds'), ['builtin-launchbot'])
  assert.deepStrictEqual(settingsDao.get('petKnownInstanceIds'), [])
  assert.strictEqual(conversationDao.list(30, duplicateId).length, 0)
  assert.strictEqual(memoryDao.list(undefined, duplicateId).length, 0)

  db.closeDb()
  fs.rmSync(testRoot, { recursive: true, force: true })
  console.log('AI conversation and memory verification passed.')
  app.quit()
}).catch((error) => {
  console.error(error)
  try { fs.rmSync(testRoot, { recursive: true, force: true }) } catch (_) {}
  app.exit(1)
})
