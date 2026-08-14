const { getDb } = require('./database.cjs')

const TYPES = new Set(['preference', 'project', 'person', 'habit', 'environment', 'task'])
let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    list: db.prepare(`
      SELECT * FROM ai_memories
      WHERE (? = 1 OR archived = 0) AND (? = 1 OR confirmed = 1)
      ORDER BY archived ASC, updated_at DESC, id DESC
      LIMIT ?
    `),
    get: db.prepare('SELECT * FROM ai_memories WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO ai_memories (type, content, confidence, source_message_id, expires_at, confirmed)
      VALUES (@type, @content, @confidence, @source_message_id, @expires_at, @confirmed)
    `),
    update: db.prepare(`
      UPDATE ai_memories SET type=@type, content=@content, confidence=@confidence,
        expires_at=@expires_at, confirmed=@confirmed, archived=@archived, updated_at=datetime('now')
      WHERE id=@id
    `),
    archive: db.prepare("UPDATE ai_memories SET archived = 1, updated_at = datetime('now') WHERE id = ?"),
    clear: db.prepare('DELETE FROM ai_memories'),
    activeCandidates: db.prepare(`
      SELECT * FROM ai_memories
      WHERE archived = 0 AND confirmed = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY updated_at DESC LIMIT 160
    `),
    markUsed: db.prepare("UPDATE ai_memories SET last_used_at = datetime('now') WHERE id = ?"),
    duplicate: db.prepare('SELECT * FROM ai_memories WHERE archived = 0 AND lower(content) = lower(?) LIMIT 1')
  }
  try {
    const hasFts = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_memories_fts'").get()
    if (hasFts) {
      stmts.ftsSearch = db.prepare(`
        SELECT m.* FROM ai_memories_fts
        JOIN ai_memories m ON m.id = ai_memories_fts.rowid
        WHERE ai_memories_fts MATCH ?
          AND m.archived = 0 AND m.confirmed = 1
          AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
        ORDER BY bm25(ai_memories_fts) LIMIT ?
      `)
    }
  } catch (_) {
    stmts.ftsSearch = null
  }
  return stmts
}

function normalizeType(type) {
  return TYPES.has(type) ? type : 'preference'
}

function normalize(row) {
  return row ? { ...row, archived: Boolean(row.archived), confirmed: Boolean(row.confirmed), confidence: Number(row.confidence) } : null
}

function list({ includeArchived = false, includePending = true, limit = 200 } = {}) {
  return getStmts().list.all(includeArchived ? 1 : 0, includePending ? 1 : 0, Math.min(500, Math.max(1, Number(limit) || 200))).map(normalize)
}

function get(id) { return normalize(getStmts().get.get(Number(id))) }

function create(data = {}) {
  const content = String(data.content || '').trim().slice(0, 2000)
  if (!content) throw new Error('Memory content is required')
  const existing = getStmts().duplicate.get(content)
  if (existing) {
    if (data.confirmed !== false && !existing.confirmed) return update(existing.id, { confirmed: true })
    return normalize(existing)
  }
  const info = getStmts().insert.run({
    type: normalizeType(data.type),
    content,
    confidence: Math.min(1, Math.max(0, Number(data.confidence) || 0.8)),
    source_message_id: Number(data.sourceMessageId) || null,
    expires_at: data.expiresAt || null,
    confirmed: data.confirmed === false ? 0 : 1
  })
  return get(Number(info.lastInsertRowid))
}

function update(id, data = {}) {
  const current = get(id)
  if (!current) throw new Error('Memory not found')
  const content = String(data.content ?? current.content).trim().slice(0, 2000)
  if (!content) throw new Error('Memory content is required')
  getStmts().update.run({
    id: current.id,
    type: normalizeType(data.type ?? current.type),
    content,
    confidence: Math.min(1, Math.max(0, Number(data.confidence ?? current.confidence))),
    expires_at: data.expiresAt === undefined ? current.expires_at : (data.expiresAt || null),
    confirmed: data.confirmed === undefined ? (current.confirmed ? 1 : 0) : (data.confirmed ? 1 : 0),
    archived: data.archived === undefined ? (current.archived ? 1 : 0) : (data.archived ? 1 : 0)
  })
  return get(current.id)
}

function archive(id) {
  getStmts().archive.run(Number(id))
  return get(id)
}

function clear() {
  return { deleted: getStmts().clear.run().changes }
}

function queryTokens(query) {
  const text = String(query || '').toLowerCase()
  const words = text.match(/[a-z0-9_\-]{2,}|[\u3400-\u9fff]{2,}/g) || []
  const tokens = new Set(words)
  for (const word of words.filter((item) => /[\u3400-\u9fff]/.test(item))) {
    for (let index = 0; index < word.length - 1; index += 1) tokens.add(word.slice(index, index + 2))
  }
  return [...tokens].slice(0, 40)
}

function search(query, limit = 8) {
  const tokens = queryTokens(query)
  if (!tokens.length) return []
  const s = getStmts()
  let ftsRows = []
  if (s.ftsSearch) {
    try {
      const match = tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(' OR ')
      ftsRows = s.ftsSearch.all(match, Math.min(30, Math.max(8, Number(limit) * 3)))
    } catch (_) { ftsRows = [] }
  }
  const ftsIds = new Set(ftsRows.map((row) => row.id))
  const candidateMap = new Map(s.activeCandidates.all().map((row) => [row.id, row]))
  for (const row of ftsRows) candidateMap.set(row.id, row)
  const candidates = [...candidateMap.values()]
  const ranked = candidates.map((row) => {
    const content = row.content.toLowerCase()
    const hits = tokens.reduce((sum, token) => sum + (content.includes(token) ? Math.min(3, token.length) : 0), 0)
    const stableContext = ['preference', 'habit', 'environment'].includes(row.type) ? 0.85 : 0
    const score = hits * 2 + (ftsIds.has(row.id) ? 4 : 0) + Number(row.confidence || 0) + stableContext + (row.type === 'task' ? 0.35 : 0)
    return { row, score }
  }).filter((item) => item.score > 1.5)
    .sort((a, b) => b.score - a.score || b.row.id - a.row.id)
    .slice(0, Math.min(12, Math.max(1, Number(limit) || 8)))
  for (const item of ranked) getStmts().markUsed.run(item.row.id)
  return ranked.map((item) => normalize(item.row))
}

module.exports = { TYPES: [...TYPES], list, get, create, update, archive, clear, search }
