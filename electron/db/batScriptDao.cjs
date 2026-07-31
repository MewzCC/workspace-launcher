const { getDb } = require('./database.cjs')

let stmts = null

function getStmts() {
  if (stmts) return stmts
  const db = getDb()
  stmts = {
    list: db.prepare('SELECT * FROM bat_scripts ORDER BY id DESC'),
    get: db.prepare('SELECT * FROM bat_scripts WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO bat_scripts (name, description, path, args)
      VALUES (@name, @description, @path, @args)
    `),
    update: db.prepare(`
      UPDATE bat_scripts
      SET name = @name,
          description = @description,
          path = @path,
          args = @args,
          updated_at = datetime('now')
      WHERE id = @id
    `),
    remove: db.prepare('DELETE FROM bat_scripts WHERE id = ?')
  }
  return stmts
}

function normalize(data) {
  const name = String(data?.name || '').trim()
  const scriptPath = String(data?.path || '').trim()
  if (!name) throw new Error('请输入脚本名称')
  if (!/\.(bat|cmd)$/i.test(scriptPath)) {
    throw new Error('仅支持 .bat 或 .cmd 脚本')
  }
  return {
    name,
    description: String(data?.description || '').trim(),
    path: scriptPath,
    args: String(data?.args || '').trim()
  }
}

function list() {
  return getStmts().list.all()
}

function get(id) {
  return getStmts().get.get(id)
}

function create(data) {
  const value = normalize(data)
  const info = getStmts().insert.run(value)
  return get(info.lastInsertRowid)
}

function update(id, data) {
  const value = normalize(data)
  getStmts().update.run({ id, ...value })
  return get(id)
}

function remove(id) {
  return getStmts().remove.run(id).changes > 0
}

module.exports = { list, get, create, update, remove }
