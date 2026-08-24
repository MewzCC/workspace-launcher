const { getDb } = require('./database.cjs')

let stmts
function s() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    insert: db.prepare(`INSERT INTO pet_interactions (pet_a_id, pet_b_id, title, trigger_type) VALUES (?, ?, ?, ?)`),
    get: db.prepare('SELECT * FROM pet_interactions WHERE id = ?'),
    list: db.prepare('SELECT * FROM pet_interactions ORDER BY id DESC LIMIT ?'),
    add: db.prepare('INSERT INTO pet_interaction_messages (interaction_id, speaker_pet_id, content) VALUES (?, ?, ?)'),
    messages: db.prepare('SELECT * FROM pet_interaction_messages WHERE interaction_id = ? ORDER BY id'),
    finish: db.prepare(`UPDATE pet_interactions SET status = ?, summary = ?, updated_at = datetime('now') WHERE id = ?`)
  }
  return stmts
}

function hydrate(row) {
  if (!row) return null
  return { ...row, messages: s().messages.all(row.id) }
}
function create({ petAId, petBId, title = '', triggerType = 'manual' }) {
  const info = s().insert.run(String(petAId), String(petBId), String(title).slice(0, 120), triggerType === 'auto' ? 'auto' : 'manual')
  return hydrate(s().get.get(info.lastInsertRowid))
}
function addMessage(id, speakerPetId, content) {
  s().add.run(Number(id), String(speakerPetId), String(content).trim().slice(0, 4000))
  return hydrate(s().get.get(Number(id)))
}
function finish(id, status = 'completed', summary = '') {
  s().finish.run(status, String(summary).slice(0, 2000), Number(id))
  return hydrate(s().get.get(Number(id)))
}
function get(id) { return hydrate(s().get.get(Number(id))) }
function list(limit = 20) { return s().list.all(Math.min(100, Math.max(1, Number(limit) || 20))).map(hydrate) }

module.exports = { create, addMessage, finish, get, list }
