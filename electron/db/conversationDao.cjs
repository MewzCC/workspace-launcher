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
    create: db.prepare('INSERT INTO ai_conversations (title) VALUES (?)'),
    touch: db.prepare("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?"),
    title: db.prepare("UPDATE ai_conversations SET title = ?, updated_at = datetime('now') WHERE id = ?"),
    summary: db.prepare("UPDATE ai_conversations SET summary = ?, summary_message_id = ?, updated_at = datetime('now') WHERE id = ?"),
    clear: db.prepare('DELETE FROM ai_messages WHERE conversation_id = ?'),
    clearSummary: db.prepare("UPDATE ai_conversations SET summary = '', summary_message_id = NULL, updated_at = datetime('now') WHERE id = ?"),
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

function list(limit = 30) {
  return getStmts().list.all(Math.min(100, Math.max(1, Number(limit) || 30))).map(normalizeConversation)
}

function get(id) {
  return normalizeConversation(getStmts().get.get(Number(id)))
}

function create(title = '') {
  const value = String(title || '').trim().slice(0, 80)
  const info = getStmts().create.run(value)
  const conversation = get(Number(info.lastInsertRowid))
  settingsDao.set('aiActiveConversationId', conversation.id)
  return conversation
}

function ensureActive() {
  const activeId = Number(settingsDao.get('aiActiveConversationId'))
  if (activeId) {
    const active = get(activeId)
    if (active) return active
  }
  const latest = list(1)[0]
  if (latest) {
    settingsDao.set('aiActiveConversationId', latest.id)
    return latest
  }
  return create('')
}

function setActive(id) {
  const conversation = get(id)
  if (!conversation) throw new Error('Conversation not found')
  settingsDao.set('aiActiveConversationId', conversation.id)
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

module.exports = { list, get, create, ensureActive, setActive, listMessages, appendMessage, setTitle, clear, updateSummary, summaryBatch }
