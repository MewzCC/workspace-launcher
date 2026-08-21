const { getDb } = require('./database.cjs')
const settingsDao = require('./settingsDao.cjs')

let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    list: db.prepare(`
      SELECT c.*, COUNT(m.id) AS message_count
      FROM ai_conversations c
      LEFT JOIN ai_messages m ON m.conversation_id = c.id
      WHERE c.pet_model_id = ?
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT ?
    `),
    get: db.prepare(`
      SELECT c.*, COUNT(m.id) AS message_count
      FROM ai_conversations c
      LEFT JOIN ai_messages m ON m.conversation_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `),
    create: db.prepare('INSERT INTO ai_conversations (pet_model_id, title) VALUES (?, ?)'),
    touch: db.prepare("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?"),
    title: db.prepare("UPDATE ai_conversations SET title = ?, updated_at = datetime('now') WHERE id = ?"),
    summary: db.prepare("UPDATE ai_conversations SET summary = ?, summary_message_id = ?, updated_at = datetime('now') WHERE id = ?"),
    clear: db.prepare('DELETE FROM ai_messages WHERE conversation_id = ?'),
    clearSummary: db.prepare("UPDATE ai_conversations SET summary = '', summary_message_id = NULL, updated_at = datetime('now') WHERE id = ?"),
    deleteConversation: db.prepare('DELETE FROM ai_conversations WHERE id = ?'),
    deleteByPet: db.prepare('DELETE FROM ai_conversations WHERE pet_model_id = ?'),
    insertMessage: db.prepare(`
      INSERT INTO ai_messages (conversation_id, role, content, metadata)
      VALUES (@conversation_id, @role, @content, @metadata)
    `),
    getMessage: db.prepare('SELECT * FROM ai_messages WHERE id = ?'),
    recentMessages: db.prepare(`
      SELECT * FROM (
        SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
      ) ORDER BY id ASC
    `),
    messagesThrough: db.prepare(`
      SELECT * FROM ai_messages
      WHERE conversation_id = ? AND id > COALESCE(?, 0) AND id <= ?
      ORDER BY id ASC
    `),
    countAfterSummary: db.prepare('SELECT COUNT(*) AS count, MAX(id) AS max_id FROM ai_messages WHERE conversation_id = ? AND id > COALESCE(?, 0)')
  }
  return stmts
}

function normalizeConversation(row) {
  if (!row) return null
  return { ...row, message_count: Number(row.message_count || 0) }
}

function currentPetId() {
  return String(settingsDao.get('petModelId') || 'builtin-launchbot')
}

function activeConversationIds() {
  const value = settingsDao.get('aiActiveConversationIds')
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function setActiveId(petModelId, conversationId) {
  const ids = activeConversationIds()
  ids[String(petModelId)] = Number(conversationId)
  settingsDao.set('aiActiveConversationIds', ids)
  // 保留旧字段供降级版本读取。
  settingsDao.set('aiActiveConversationId', Number(conversationId))
}

function list(limit = 30, petModelId = currentPetId()) {
  return getStmts().list.all(String(petModelId), Math.min(100, Math.max(1, Number(limit) || 30))).map(normalizeConversation)
}

function get(id) {
  return normalizeConversation(getStmts().get.get(Number(id)))
}

function create(title = '', petModelId = currentPetId()) {
  const value = String(title || '').trim().slice(0, 80)
  const petId = String(petModelId || currentPetId())
  const info = getStmts().create.run(petId, value)
  const conversation = get(Number(info.lastInsertRowid))
  setActiveId(petId, conversation.id)
  return conversation
}

function ensureActive(petModelId = currentPetId()) {
  const petId = String(petModelId || currentPetId())
  const ids = activeConversationIds()
  const activeId = Number(ids[petId])
  if (activeId) {
    const active = get(activeId)
    if (active?.pet_model_id === petId) return active
  }
  const latest = list(1, petId)[0]
  if (latest) {
    setActiveId(petId, latest.id)
    return latest
  }
  return create('', petId)
}

function setActive(id, petModelId = currentPetId()) {
  const petId = String(petModelId || currentPetId())
  const conversation = get(id)
  if (!conversation || conversation.pet_model_id !== petId) throw new Error('Conversation not found')
  setActiveId(petId, conversation.id)
  return conversation
}

function listMessages(conversationId, limit = 200) {
  return getStmts().recentMessages.all(Number(conversationId), Math.min(500, Math.max(1, Number(limit) || 200)))
    .map((row) => ({ ...row, metadata: parseMetadata(row.metadata) }))
}

function parseMetadata(value) {
  if (!value) return null
  try { return JSON.parse(value) } catch (_) { return null }
}

function appendMessage(conversationId, role, content, metadata = null) {
  const id = Number(conversationId)
  if (!get(id)) throw new Error('Conversation not found')
  const normalizedRole = ['user', 'assistant', 'tool', 'system'].includes(role) ? role : 'user'
  const text = String(content || '').trim().slice(0, 12000)
  if (!text) throw new Error('Message content is required')
  const info = getStmts().insertMessage.run({
    conversation_id: id,
    role: normalizedRole,
    content: text,
    metadata: metadata ? JSON.stringify(metadata) : null
  })
  getStmts().touch.run(id)
  const row = getStmts().getMessage.get(Number(info.lastInsertRowid))
  return { ...row, metadata: parseMetadata(row.metadata) }
}

function setTitle(id, title) {
  getStmts().title.run(String(title || '').trim().slice(0, 80), Number(id))
  return get(id)
}

function remove(id, petModelId = currentPetId()) {
  const petId = String(petModelId || currentPetId())
  const conversation = get(id)
  if (!conversation || conversation.pet_model_id !== petId) throw new Error('Conversation not found')
  getStmts().deleteConversation.run(conversation.id)
  const ids = activeConversationIds()
  if (Number(ids[petId]) === conversation.id) {
    delete ids[petId]
    settingsDao.set('aiActiveConversationIds', ids)
  }
  return ensureActive(petId)
}

function deleteByPet(petModelId) {
  const petId = String(petModelId || '')
  const result = getStmts().deleteByPet.run(petId)
  const ids = activeConversationIds()
  delete ids[petId]
  settingsDao.set('aiActiveConversationIds', ids)
  return Number(result.changes || 0)
}

function clear(id) {
  const conversationId = Number(id)
  const db = getDb()
  db.transaction(() => {
    getStmts().clear.run(conversationId)
    getStmts().clearSummary.run(conversationId)
  })()
  return get(conversationId)
}

function updateSummary(id, summary, summaryMessageId) {
  getStmts().summary.run(String(summary || '').trim().slice(0, 8000), Number(summaryMessageId) || null, Number(id))
  return get(id)
}

function summaryBatch(id, keepRecent = 12) {
  const conversation = get(id)
  if (!conversation) return null
  const progress = getStmts().countAfterSummary.get(conversation.id, conversation.summary_message_id)
  if (Number(progress.count) <= keepRecent + 8) return null
  const cutoffOffset = Number(progress.count) - keepRecent
  const cutoff = getDb().prepare(`
    SELECT id FROM ai_messages
    WHERE conversation_id = ? AND id > COALESCE(?, 0)
    ORDER BY id ASC LIMIT 1 OFFSET ?
  `).get(conversation.id, conversation.summary_message_id, cutoffOffset - 1)
  if (!cutoff) return null
  return {
    conversation,
    messages: getStmts().messagesThrough.all(conversation.id, conversation.summary_message_id, cutoff.id),
    throughMessageId: cutoff.id
  }
}

module.exports = { list, get, create, ensureActive, setActive, listMessages, appendMessage, setTitle, clear, remove, deleteByPet, updateSummary, summaryBatch }
