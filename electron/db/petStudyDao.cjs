const { getDb } = require('./database.cjs')

const BUILTIN_ENGLISH = [
  ['focus', '专注；焦点', '/ˈfoʊkəs/', 'Try to focus on one small task.', '试着专注于一件小任务。'],
  ['habit', '习惯', '/ˈhæbɪt/', 'A tiny habit can change a whole year.', '一个微小的习惯可以改变一整年。'],
  ['progress', '进步；进展', '/ˈprɑːɡres/', 'Progress matters more than perfection.', '进步比完美更重要。'],
  ['curious', '好奇的', '/ˈkjʊriəs/', 'Stay curious and keep asking why.', '保持好奇，继续追问为什么。'],
  ['resilient', '有韧性的', '/rɪˈzɪliənt/', 'Resilient people recover after setbacks.', '有韧性的人能从挫折中恢复。'],
  ['clarify', '澄清；阐明', '/ˈklærəfaɪ/', 'Could you clarify what you mean?', '你能澄清一下你的意思吗？'],
  ['efficient', '高效的', '/ɪˈfɪʃənt/', 'This workflow is simple and efficient.', '这个工作流程简单而高效。'],
  ['maintain', '维持；维护', '/meɪnˈteɪn/', 'Maintain a steady learning rhythm.', '保持稳定的学习节奏。'],
  ['insight', '洞察；见解', '/ˈɪnsaɪt/', 'The experiment gave us a useful insight.', '实验给了我们一个有用的洞察。'],
  ['approach', '方法；接近', '/əˈproʊtʃ/', 'Let us try a different approach.', '让我们尝试一种不同的方法。'],
  ['context', '上下文；语境', '/ˈkɑːntekst/', 'Words are easier to remember in context.', '单词放在语境中更容易记住。'],
  ['achieve', '实现；达到', '/əˈtʃiːv/', 'Consistent practice helps you achieve goals.', '持续练习能帮助你实现目标。']
]

let statements
function stmts() {
  if (statements) return statements
  const db = getDb()
  statements = {
    upsert: db.prepare(`INSERT INTO pet_study_items
      (language, term, normalized_term, meaning, pronunciation, example, example_translation, source)
      VALUES (@language,@term,@normalized,@meaning,@pronunciation,@example,@exampleTranslation,@source)
      ON CONFLICT(language, normalized_term) DO UPDATE SET
        term=excluded.term,
        meaning=CASE WHEN excluded.meaning<>'' THEN excluded.meaning ELSE meaning END,
        pronunciation=CASE WHEN excluded.pronunciation<>'' THEN excluded.pronunciation ELSE pronunciation END,
        example=CASE WHEN excluded.example<>'' THEN excluded.example ELSE example END,
        example_translation=CASE WHEN excluded.example_translation<>'' THEN excluded.example_translation ELSE example_translation END,
        updated_at=datetime('now') RETURNING *`),
    ensureCard: db.prepare(`INSERT OR IGNORE INTO pet_study_cards (pet_model_id,item_id,due_at) VALUES (?,?,0)`),
    getItem: db.prepare('SELECT * FROM pet_study_items WHERE id=?'),
    getCard: db.prepare('SELECT * FROM pet_study_cards WHERE pet_model_id=? AND item_id=?'),
    markShown: db.prepare('UPDATE pet_study_cards SET last_shown_at=? WHERE pet_model_id=? AND item_id=?'),
    updateCard: db.prepare(`UPDATE pet_study_cards SET state=@state,due_at=@dueAt,stability=@stability,
      difficulty=@difficulty,reps=@reps,lapses=@lapses,last_review_at=@lastReviewAt,
      scheduled_days=@scheduledDays,last_shown_at=@lastShownAt WHERE pet_model_id=@petModelId AND item_id=@itemId`),
    review: db.prepare(`INSERT INTO pet_study_reviews (pet_model_id,item_id,rating,state_before,stability_before,
      difficulty_before,elapsed_days,scheduled_days,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?)`)
  }
  return statements
}

function normalizeEntry(entry = {}) {
  const term = String(entry.term || '').trim().slice(0, 120)
  if (!term) throw new Error('请输入要学习的单词或短语')
  const language = String(entry.language || 'en').trim().toLowerCase().slice(0, 24) || 'en'
  return {
    language, term, normalized: term.normalize('NFKC').toLocaleLowerCase(language).replace(/\s+/g, ' '),
    meaning: String(entry.meaning || '').trim().slice(0, 500),
    pronunciation: String(entry.pronunciation || '').trim().slice(0, 120),
    example: String(entry.example || '').trim().slice(0, 500),
    exampleTranslation: String(entry.exampleTranslation || '').trim().slice(0, 500),
    source: ['user', 'ai', 'builtin', 'import'].includes(entry.source) ? entry.source : 'user'
  }
}

function add(entry, petModelId) {
  const item = stmts().upsert.get(normalizeEntry(entry))
  stmts().ensureCard.run(String(petModelId), item.id)
  return get(item.id, petModelId)
}

function seedEnglish(petModelId) {
  const tx = getDb().transaction(() => BUILTIN_ENGLISH.forEach(([term, meaning, pronunciation, example, exampleTranslation]) =>
    add({ language: 'en', term, meaning, pronunciation, example, exampleTranslation, source: 'builtin' }, petModelId)))
  tx()
}

function get(itemId, petModelId) {
  const item = stmts().getItem.get(Number(itemId))
  const card = stmts().getCard.get(String(petModelId), Number(itemId))
  return item && card ? { ...item, ...card, id: item.id, itemId: item.id } : null
}

function list(petModelId, language, limit = 200) {
  const params = [String(petModelId)]
  let where = ''
  if (language) { where = 'AND i.language=?'; params.push(String(language).toLowerCase()) }
  params.push(Math.min(1000, Math.max(1, Number(limit) || 200)))
  return getDb().prepare(`SELECT i.*,c.state,c.due_at,c.stability,c.difficulty,c.reps,c.lapses,c.last_review_at,c.last_shown_at
    FROM pet_study_cards c JOIN pet_study_items i ON i.id=c.item_id WHERE c.pet_model_id=? ${where}
    ORDER BY c.due_at ASC,i.created_at DESC LIMIT ?`).all(...params)
}

function normalizeSearchQuery(value, language) {
  return String(value || '')
    .trim()
    .slice(0, 200)
    .normalize('NFKC')
    .toLocaleLowerCase(String(language || 'en'))
    .replace(/\s+/g, ' ')
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function search(petModelId, options = {}) {
  const language = String(options.language || 'en').trim().toLowerCase().slice(0, 24) || 'en'
  const query = normalizeSearchQuery(options.query, language)
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 25))
  const offset = Math.min(100000, Math.max(0, Number(options.offset) || 0))
  const params = [String(petModelId), language]
  let filter = ''

  if (query) {
    const pattern = `%${escapeLike(query)}%`
    filter = `AND (
      i.normalized_term LIKE ? ESCAPE '\\' OR
      LOWER(i.term) LIKE ? ESCAPE '\\' OR
      LOWER(i.pronunciation) LIKE ? ESCAPE '\\' OR
      LOWER(i.meaning) LIKE ? ESCAPE '\\' OR
      LOWER(i.example_translation) LIKE ? ESCAPE '\\'
    )`
    params.push(pattern, pattern, pattern, pattern, pattern)
  }

  const base = `FROM pet_study_cards c JOIN pet_study_items i ON i.id=c.item_id
    WHERE c.pet_model_id=? AND i.language=? ${filter}`
  const total = getDb().prepare(`SELECT COUNT(*) count ${base}`).get(...params).count || 0
  const items = getDb().prepare(`SELECT i.*,c.state,c.due_at,c.stability,c.difficulty,c.reps,c.lapses,c.last_review_at,c.last_shown_at
    ${base} ORDER BY c.due_at ASC,i.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
  return { items, total }
}

function next(petModelId, language, recentIds = []) {
  const now = Date.now(), params = [String(petModelId), String(language || 'en').toLowerCase()]
  const excluded = recentIds.slice(-5).map(Number).filter(Number.isInteger)
  const exclusion = excluded.length ? `AND i.id NOT IN (${excluded.map(() => '?').join(',')})` : ''
  params.push(...excluded, now)
  let row = getDb().prepare(`SELECT i.*,c.* FROM pet_study_cards c JOIN pet_study_items i ON i.id=c.item_id
    WHERE c.pet_model_id=? AND i.language=? AND c.state<>'mastered' ${exclusion}
    ORDER BY CASE WHEN c.due_at<=? THEN 0 ELSE 1 END,
      CASE WHEN c.due_at<=? THEN c.due_at ELSE COALESCE(c.last_shown_at,0) END ASC LIMIT 1`).get(...params, now)
  if (!row && excluded.length) return next(petModelId, language, [])
  if (row) stmts().markShown.run(now, String(petModelId), row.item_id)
  return row ? { ...row, id: row.item_id, itemId: row.item_id } : null
}

function saveReview(before, nextCard, rating, elapsedDays) {
  const now = Date.now(), db = getDb()
  db.transaction(() => {
    stmts().review.run(before.pet_model_id, before.item_id, rating, before.state, before.stability,
      before.difficulty, elapsedDays, nextCard.scheduledDays, now)
    stmts().updateCard.run({ ...nextCard, petModelId: before.pet_model_id, itemId: before.item_id,
      reps: before.reps + 1, lapses: before.lapses + (rating === 1 ? 1 : 0), lastReviewAt: now, lastShownAt: now })
  })()
  return get(before.item_id, before.pet_model_id)
}

function remove(itemId, petModelId) {
  return getDb().prepare('DELETE FROM pet_study_cards WHERE pet_model_id=? AND item_id=?').run(String(petModelId), Number(itemId)).changes > 0
}

function stats(petModelId, language) {
  const id = String(petModelId), lang = String(language || 'en').toLowerCase(), now = Date.now(), day = now - 86400000
  const cards = getDb().prepare(`SELECT COUNT(*) total,SUM(c.state='new') new_count,SUM(c.state<>'new' AND c.state<>'mastered' AND c.due_at<=?) due_count,SUM(c.state IN ('review','mastered')) review_count
    FROM pet_study_cards c JOIN pet_study_items i ON i.id=c.item_id WHERE c.pet_model_id=? AND i.language=?`).get(now, id, lang)
  const today = getDb().prepare(`SELECT COUNT(*) count FROM pet_study_reviews r JOIN pet_study_items i ON i.id=r.item_id
    WHERE r.pet_model_id=? AND i.language=? AND r.reviewed_at>=?`).get(id, lang, day).count
  return { total: cards.total || 0, new: cards.new_count || 0, due: cards.due_count || 0, learning: cards.review_count || 0, reviewedToday: today || 0 }
}

module.exports = { add, seedEnglish, get, list, search, next, saveReview, remove, stats }
