const { getDb } = require('./database.cjs')

let stmts
function pair(left, right) { return [String(left), String(right)].sort() }
function s() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    diaryInsert: db.prepare(`INSERT INTO pet_diary_entries (pet_model_id, category, content, source_conversation_id, shareable) VALUES (?, ?, ?, ?, ?)`),
    diaryDuplicate: db.prepare(`SELECT id FROM pet_diary_entries WHERE pet_model_id = ? AND entry_date = date('now', 'localtime') AND lower(content) = lower(?) LIMIT 1`),
    diaryToday: db.prepare(`SELECT * FROM pet_diary_entries WHERE pet_model_id = ? AND entry_date = date('now', 'localtime') AND (? = 0 OR shareable = 1) ORDER BY id DESC LIMIT ?`),
    diaryList: db.prepare(`SELECT * FROM pet_diary_entries WHERE (? = '' OR pet_model_id = ?) ORDER BY id DESC LIMIT ?`),
    diaryClear: db.prepare(`DELETE FROM pet_diary_entries WHERE (? = '' OR pet_model_id = ?)`),
    relationInsert: db.prepare(`INSERT INTO pet_relationship_memories (pet_a_id, pet_b_id, content, importance, source_interaction_id) VALUES (?, ?, ?, ?, ?)`),
    relationList: db.prepare(`SELECT * FROM pet_relationship_memories WHERE pet_a_id = ? AND pet_b_id = ? ORDER BY importance DESC, id DESC LIMIT ?`),
    relationTouch: db.prepare(`UPDATE pet_relationship_memories SET last_recalled_at = datetime('now') WHERE id = ?`),
    relationClear: db.prepare(`DELETE FROM pet_relationship_memories WHERE pet_a_id = ? AND pet_b_id = ?`)
  }
  return stmts
}

function addDiary(petModelId, data = {}) {
  const owner = String(petModelId)
  const content = String(data.content || '').trim().replace(/\s+/g, ' ').slice(0, 800)
  if (!content) return null
  const existing = s().diaryDuplicate.get(owner, content)
  if (existing) return s().diaryToday.all(owner, 0, 100).find((item) => item.id === existing.id) || null
  const info = s().diaryInsert.run(owner, String(data.category || 'daily').slice(0, 30), content, Number(data.sourceConversationId) || null, data.shareable === false ? 0 : 1)
  return getDb().prepare('SELECT * FROM pet_diary_entries WHERE id = ?').get(info.lastInsertRowid)
}
function today(petModelId, limit = 8, shareableOnly = true) {
  return s().diaryToday.all(String(petModelId), shareableOnly ? 1 : 0, Math.min(30, Math.max(1, Number(limit) || 8))).map((row) => ({ ...row, shareable: Boolean(row.shareable) }))
}
function listDiary(petModelId = '', limit = 30) {
  const owner = String(petModelId || '')
  return s().diaryList.all(owner, owner, Math.min(200, Math.max(1, Number(limit) || 30))).map((row) => ({ ...row, shareable: Boolean(row.shareable) }))
}
function clearDiary(petModelId = '') { const owner = String(petModelId || ''); return { deleted: s().diaryClear.run(owner, owner).changes } }
function remember(left, right, data = {}) {
  const [petA, petB] = pair(left, right)
  const content = String(data.content || '').trim().replace(/\s+/g, ' ').slice(0, 1600)
  if (!content) return null
  const info = s().relationInsert.run(petA, petB, content, Math.min(1, Math.max(0, Number(data.importance) || 0.7)), Number(data.sourceInteractionId) || null)
  return getDb().prepare('SELECT * FROM pet_relationship_memories WHERE id = ?').get(info.lastInsertRowid)
}
function relationship(left, right, limit = 12) {
  const [petA, petB] = pair(left, right)
  const rows = s().relationList.all(petA, petB, Math.min(50, Math.max(1, Number(limit) || 12)))
  for (const row of rows) s().relationTouch.run(row.id)
  return rows
}
function clearRelationship(left, right) { const [petA, petB] = pair(left, right); return { deleted: s().relationClear.run(petA, petB).changes } }

module.exports = { addDiary, today, listDiary, clearDiary, remember, relationship, clearRelationship }
