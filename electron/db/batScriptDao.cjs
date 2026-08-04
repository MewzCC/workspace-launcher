const { getDb } = require('./database.cjs')
const { t } = require('../i18n.cjs')

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
    remove: db.prepare('DELETE FROM bat_scripts WHERE id = ?'),
    listByWorkspace: db.prepare(`
      SELECT b.*, wb.launch_order, wb.delay_ms
      FROM workspace_bat_scripts wb
      JOIN bat_scripts b ON b.id = wb.bat_script_id
      WHERE wb.workspace_id = ?
      ORDER BY wb.launch_order ASC, b.id ASC
    `),
    deleteWorkspaceRelations: db.prepare(
      'DELETE FROM workspace_bat_scripts WHERE workspace_id = ?'
    ),
    insertWorkspaceRelation: db.prepare(`
      INSERT INTO workspace_bat_scripts
        (workspace_id, bat_script_id, launch_order, delay_ms)
      VALUES (@workspace_id, @bat_script_id, @launch_order, @delay_ms)
    `)
  }
  return stmts
}

function normalize(data) {
  const name = String(data?.name || '').trim()
  const scriptPath = String(data?.path || '').trim()
  if (!name) throw new Error(t('errors.scriptNameRequired'))
  if (!/\.(bat|cmd)$/i.test(scriptPath)) {
    throw new Error(t('errors.batOnly'))
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

function listByWorkspace(workspaceId) {
  return getStmts().listByWorkspace.all(workspaceId)
}

function setForWorkspace(workspaceId, scripts) {
  const db = getDb()
  const stmts = getStmts()
  const normalized = Array.isArray(scripts)
    ? scripts.map((item, index) => ({
        workspace_id: Number(workspaceId),
        bat_script_id: Number(item.bat_script_id),
        launch_order: Number.isFinite(Number(item.launch_order))
          ? Number(item.launch_order)
          : index,
        delay_ms: Math.max(0, Number(item.delay_ms) || 0)
      }))
    : []

  const replace = db.transaction(() => {
    stmts.deleteWorkspaceRelations.run(workspaceId)
    for (const item of normalized) {
      stmts.insertWorkspaceRelation.run(item)
    }
  })
  replace()
  return listByWorkspace(workspaceId)
}

module.exports = { list, get, create, update, remove, listByWorkspace, setForWorkspace }
