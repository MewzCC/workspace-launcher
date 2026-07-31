// 脚本 DAO
// 提供 scripts 表的查询、upsert、删除操作
// scripts 表的 type 字段取值 'pre'（启动前脚本）或 'post'（启动后脚本）
// 全部使用 better-sqlite3 同步 API + prepared statements 防注入
const { getDb } = require('./database.cjs')

// 预编译语句缓存
let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    // 查询某工作空间的全部脚本（pre 和 post）
    listByWorkspace: db.prepare(`
      SELECT * FROM scripts
      WHERE workspace_id = ?
      ORDER BY id ASC
    `),
    // 查询某工作空间某类型的脚本
    getByWorkspaceAndType: db.prepare(`
      SELECT * FROM scripts
      WHERE workspace_id = ? AND type = ?
      LIMIT 1
    `),
    // 插入脚本
    insert: db.prepare(`
      INSERT INTO scripts (workspace_id, type, language, content, delay_ms)
      VALUES (@workspace_id, @type, @language, @content, @delay_ms)
    `),
    // 更新脚本（按 workspace_id + type 唯一定位）
    update: db.prepare(`
      UPDATE scripts
      SET language = @language,
          content = @content,
          delay_ms = @delay_ms
      WHERE workspace_id = @workspace_id AND type = @type
    `),
    // 删除某工作空间的全部脚本
    removeByWorkspace: db.prepare('DELETE FROM scripts WHERE workspace_id = ?'),
    // 按 id 查询（用于 upsert 返回结果）
    getById: db.prepare('SELECT * FROM scripts WHERE id = ?')
  }
  return stmts
}

// 规范化字段缺省值
function normalize(data) {
  return {
    workspace_id: data.workspace_id,
    type: data.type,
    language: data.language ?? 'cmd',
    content: data.content ?? '',
    delay_ms: data.delay_ms ?? 0
  }
}

// 查询某工作空间的全部脚本
function listByWorkspace(workspaceId) {
  return getStmts().listByWorkspace.all(workspaceId)
}

// 查询某工作空间某类型（pre/post）的脚本
function getByWorkspaceAndType(workspaceId, type) {
  return getStmts().getByWorkspaceAndType.get(workspaceId, type)
}

// 按 workspace_id + type 唯一性 upsert
// 存在则更新，不存在则插入
// 返回脚本记录
function upsert(data) {
  const s = getStmts()
  const db = getDb()
  const normalized = normalize(data)

  const upsertTx = db.transaction(() => {
    const existing = s.getByWorkspaceAndType.get(
      normalized.workspace_id,
      normalized.type
    )
    if (existing) {
      s.update.run(normalized)
    } else {
      s.insert.run(normalized)
    }
  })

  upsertTx()
  // 通过唯一键重新查询返回
  return s.getByWorkspaceAndType.get(normalized.workspace_id, normalized.type)
}

// 删除某工作空间的全部脚本
function removeByWorkspace(workspaceId) {
  const info = getStmts().removeByWorkspace.run(workspaceId)
  return info.changes > 0
}

module.exports = {
  listByWorkspace,
  getByWorkspaceAndType,
  upsert,
  removeByWorkspace
}
