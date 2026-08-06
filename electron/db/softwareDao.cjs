// 软件 DAO
// 提供 software 表的 CRUD 操作（含批量插入）
// 全部使用 better-sqlite3 同步 API + prepared statements 防注入
const { getDb } = require('./database.cjs')

// 预编译语句缓存
let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    // 查询所有软件
    list: db.prepare('SELECT * FROM software ORDER BY id ASC'),
    // 按 id 查询
    get: db.prepare('SELECT * FROM software WHERE id = ?'),
    // 插入软件
    insert: db.prepare(`
      INSERT INTO software (name, description, path, args, icon, icon_mode)
      VALUES (@name, @description, @path, @args, @icon, @icon_mode)
    `),
    // 更新软件
    update: db.prepare(`
      UPDATE software
      SET name = @name,
          description = @description,
          path = @path,
          args = @args,
          icon = @icon,
          icon_mode = @icon_mode
      WHERE id = @id
    `),
    // 显式删除工作空间关联，兼容早期数据库曾关闭外键约束时留下的数据
    removeWorkspaceRelations: db.prepare('DELETE FROM workspace_software WHERE software_id = ?'),
    // 删除软件
    remove: db.prepare('DELETE FROM software WHERE id = ?')
  }
  return stmts
}

// 规范化字段缺省值，避免 undefined 写入
function normalize(item) {
  return {
    name: item.name,
    description: item.description ?? '',
    path: item.path,
    args: item.args ?? '',
    icon: item.icon ?? '📦',
    icon_mode: item.icon_mode === 'custom' ? 'custom' : 'auto'
  }
}

// 查询所有软件
function list() {
  return getStmts().list.all()
}

// 按 id 查询单个软件
function get(id) {
  return getStmts().get.get(id)
}

// 创建软件，返回新软件
function create(data) {
  const s = getStmts()
  const info = s.insert.run(normalize(data))
  return s.get.get(info.lastInsertRowid)
}

// 更新软件，返回更新后的软件
function update(id, data) {
  const s = getStmts()
  s.update.run({ id, ...normalize(data) })
  return s.get.get(id)
}

// 删除软件
// 返回是否成功
function remove(id) {
  const s = getStmts()
  const db = getDb()
  return db.transaction(() => {
    s.removeWorkspaceRelations.run(id)
    const info = s.remove.run(id)
    return info.changes > 0
  })()
}

// 批量插入软件（扫描结果添加用）
// items: 软件数组，每项含 {name, description, path, args, icon}
// 返回插入的软件列表
function bulkCreate(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  const s = getStmts()
  const db = getDb()

  const insertedIds = []
  const bulkTx = db.transaction(() => {
    for (const item of items) {
      const info = s.insert.run(normalize(item))
      insertedIds.push(info.lastInsertRowid)
    }
  })
  bulkTx()

  // 通过 id 列表查询返回结果
  return insertedIds.map((id) => s.get.get(id))
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  bulkCreate
}
