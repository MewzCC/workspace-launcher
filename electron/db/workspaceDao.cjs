// 工作空间 DAO
// 提供 workspaces 表及 workspace_software 关联表的 CRUD 操作
// 全部使用 better-sqlite3 同步 API + prepared statements 防注入
const { getDb } = require('./database.cjs')

// 预编译语句（首次使用时缓存到对象上，避免重复 prepare）
let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    // 查询所有工作空间
    listWorkspaces: db.prepare('SELECT * FROM workspaces ORDER BY id ASC'),
    // 按 id 查询单个工作空间
    getWorkspace: db.prepare('SELECT * FROM workspaces WHERE id = ?'),
    // 插入工作空间
    insertWorkspace: db.prepare(`
      INSERT INTO workspaces (name, description, icon)
      VALUES (@name, @description, @icon)
    `),
    // 更新工作空间（同时刷新 updated_at）
    updateWorkspace: db.prepare(`
      UPDATE workspaces
      SET name = @name,
          description = @description,
          icon = @icon,
          updated_at = datetime('now')
      WHERE id = @id
    `),
    // 删除工作空间（外键级联会自动删除 workspace_software 和 scripts）
    deleteWorkspace: db.prepare('DELETE FROM workspaces WHERE id = ?'),
    // 查询某工作空间关联的软件列表（按 launch_order 排序）
    listSoftwareByWorkspace: db.prepare(`
      SELECT s.id, s.name, s.description, s.path, s.args, s.icon, s.created_at,
             ws.launch_order, ws.delay_ms
      FROM workspace_software ws
      LEFT JOIN software s ON s.id = ws.software_id
      WHERE ws.workspace_id = ?
      ORDER BY ws.launch_order ASC
    `),
    // 删除某工作空间的全部关联
    deleteRelations: db.prepare('DELETE FROM workspace_software WHERE workspace_id = ?'),
    // 插入工作空间-软件关联
    insertRelation: db.prepare(`
      INSERT INTO workspace_software (workspace_id, software_id, launch_order, delay_ms)
      VALUES (@workspace_id, @software_id, @launch_order, @delay_ms)
    `)
  }
  return stmts
}

// 将单个工作空间行 + 其关联软件列表组装为返回对象
function assembleWorkspace(row) {
  if (!row) return null
  const s = getStmts()
  const software = s.listSoftwareByWorkspace.all(row.id)
  return { ...row, software }
}

// 查询所有工作空间（每个工作空间附带关联软件列表）
function list() {
  const s = getStmts()
  const rows = s.listWorkspaces.all()
  return rows.map(assembleWorkspace)
}

// 查询单个工作空间（含关联软件）
function get(id) {
  const s = getStmts()
  const row = s.getWorkspace.get(id)
  return assembleWorkspace(row)
}

// 创建工作空间并建立软件关联（事务）
// data: { name, description, icon, software: [{software_id, launch_order, delay_ms}] }
// 返回新创建的工作空间
function create(data) {
  const s = getStmts()
  const db = getDb()
  const { name, description = '', icon = '🚀', software = [] } = data

  const createTx = db.transaction(() => {
    const info = s.insertWorkspace.run({ name, description, icon })
    const newId = info.lastInsertRowid
    for (const rel of software) {
      s.insertRelation.run({
        workspace_id: newId,
        software_id: rel.software_id,
        launch_order: rel.launch_order ?? 0,
        delay_ms: rel.delay_ms ?? 0
      })
    }
    return newId
  })

  const newId = createTx()
  return get(newId)
}

// 更新工作空间（更新基本信息 + 重建软件关联，事务）
// 返回更新后的工作空间
function update(id, data) {
  const s = getStmts()
  const db = getDb()
  const { name, description = '', icon = '🚀', software = [] } = data

  const updateTx = db.transaction(() => {
    s.updateWorkspace.run({ id, name, description, icon })
    // 删除旧关联，重新插入新关联
    s.deleteRelations.run(id)
    for (const rel of software) {
      s.insertRelation.run({
        workspace_id: id,
        software_id: rel.software_id,
        launch_order: rel.launch_order ?? 0,
        delay_ms: rel.delay_ms ?? 0
      })
    }
  })

  updateTx()
  return get(id)
}

// 删除工作空间（外键级联会删除 workspace_software 和 scripts）
// 返回是否成功
function remove(id) {
  const s = getStmts()
  const info = s.deleteWorkspace.run(id)
  return info.changes > 0
}

module.exports = {
  list,
  get,
  create,
  update,
  remove
}
