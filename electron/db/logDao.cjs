// 日志 DAO
// 提供 launch_logs 表的插入和查询操作
// 全部使用 better-sqlite3 同步 API + prepared statements 防注入
const { getDb } = require('./database.cjs')

// 预编译语句缓存
let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    // 插入日志
    insert: db.prepare(`
      INSERT INTO launch_logs (workspace_id, software_id, status, message)
      VALUES (@workspace_id, @software_id, @status, @message)
    `),
    // 按工作空间查询日志（时间倒序，limit 条）
    listByWorkspace: db.prepare(`
      SELECT * FROM launch_logs
      WHERE workspace_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    // 查询最近 limit 条日志（时间倒序）
    listRecent: db.prepare(`
      SELECT * FROM launch_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `),
    // 查询所有日志（时间倒序，limit 条）
    listAll: db.prepare(`
      SELECT * FROM launch_logs
      ORDER BY timestamp DESC
      LIMIT ?
    `)
  }
  return stmts
}

// 规范化字段缺省值
function normalize(data) {
  return {
    workspace_id: data.workspace_id ?? null,
    software_id: data.software_id ?? null,
    status: data.status,
    message: data.message ?? ''
  }
}

// 插入日志
// data: { workspace_id, software_id, status, message }
// 返回新插入的日志 id
function create(data) {
  const s = getStmts()
  const info = s.insert.run(normalize(data))
  return info.lastInsertRowid
}

// 按工作空间查询日志（时间倒序）
function listByWorkspace(workspaceId, limit = 100) {
  return getStmts().listByWorkspace.all(workspaceId, limit)
}

// 查询最近 limit 条日志（时间倒序）
function listRecent(limit = 50) {
  return getStmts().listRecent.all(limit)
}

// 查询所有日志（时间倒序，limit 条）
function listAll(limit = 200) {
  return getStmts().listAll.all(limit)
}

module.exports = {
  create,
  listByWorkspace,
  listRecent,
  listAll
}
