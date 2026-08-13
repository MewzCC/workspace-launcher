// 数据迁移服务：工作空间/软件/脚本的 JSON 导出与导入
// 导出格式独立于数据库主键，跨机器通过路径去重合并，导入为追加模式。
const fs = require('fs')
const { workspaceDao, softwareDao, batScriptDao, scriptDao } = require('../db/index.cjs')

const FORMAT_VERSION = 1

function keyOf(value) {
  return String(value || '').trim().toLowerCase()
}

function uniqueName(name, taken) {
  let candidate = name
  let index = 2
  while (taken.has(candidate)) {
    candidate = `${name} (${index})`
    index += 1
  }
  taken.add(candidate)
  return candidate
}

// 导出全部数据为可移植的 JSON 对象
function exportData() {
  const software = softwareDao.list()
  const batScripts = batScriptDao.list()
  const workspaces = workspaceDao.list()

  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    software: software.map((item) => ({
      name: item.name,
      description: item.description || '',
      path: item.path,
      args: item.args || '',
      icon: item.icon || '📦',
      icon_mode: item.icon_mode || 'auto'
    })),
    batScripts: batScripts.map((item) => ({
      name: item.name,
      description: item.description || '',
      path: item.path,
      args: item.args || ''
    })),
    workspaces: workspaces.map((workspace) => ({
      name: workspace.name,
      description: workspace.description || '',
      icon: workspace.icon || '🚀',
      shortcut: workspace.shortcut || '',
      software: (workspace.software || []).map((item) => ({
        path: item.path,
        launch_order: item.launch_order ?? 0,
        delay_ms: item.delay_ms ?? 0
      })),
      batScripts: batScriptDao.listByWorkspace(workspace.id).map((item) => ({
        path: item.path,
        launch_order: item.launch_order ?? 0,
        delay_ms: item.delay_ms ?? 0
      })),
      scripts: scriptDao.listByWorkspace(workspace.id).map((item) => ({
        type: item.type,
        language: item.language || 'cmd',
        content: item.content || '',
        delay_ms: item.delay_ms ?? 0
      }))
    }))
  }
}

function validateImportData(data) {
  if (!data || typeof data !== 'object') throw new Error('数据格式无效')
  if (!Number.isInteger(data.formatVersion)) throw new Error('缺少格式版本')
  if (data.formatVersion > FORMAT_VERSION) throw new Error(`数据版本过新（${data.formatVersion}），请升级应用后再导入`)
  if (!Array.isArray(data.workspaces)) throw new Error('缺少工作空间数据')
  return {
    software: Array.isArray(data.software) ? data.software : [],
    batScripts: Array.isArray(data.batScripts) ? data.batScripts : [],
    workspaces: data.workspaces
  }
}

// 导入数据（追加模式）：
// - 软件/BAT 脚本按路径（大小写不敏感）去重，已存在则复用
// - 工作空间按名称自动避让（重名追加 "(2)"）
// 返回统计信息。
function importData(data) {
  const { software: importSoftware, batScripts: importBatScripts, workspaces: importWorkspaces } =
    validateImportData(data)

  const softwareByPath = new Map()
  for (const item of softwareDao.list()) {
    softwareByPath.set(keyOf(item.path), item)
  }
  const batByPath = new Map()
  for (const item of batScriptDao.list()) {
    batByPath.set(keyOf(item.path), item)
  }
  const workspaceNames = new Set(workspaceDao.list().map((item) => item.name))

  const stats = {
    software: 0,
    softwareSkipped: 0,
    batScripts: 0,
    batScriptsSkipped: 0,
    workspaces: 0
  }

  // 1) 软件：按路径去重
  for (const item of importSoftware) {
    const pathValue = keyOf(item.path)
    if (!pathValue || softwareByPath.has(pathValue)) {
      if (pathValue && softwareByPath.has(pathValue)) stats.softwareSkipped += 1
      continue
    }
    const created = softwareDao.create({
      name: item.name || item.path,
      description: item.description || '',
      path: item.path,
      args: item.args || '',
      icon: item.icon || '📦',
      icon_mode: item.icon_mode === 'custom' ? 'custom' : 'auto'
    })
    softwareByPath.set(pathValue, created)
    stats.software += 1
  }

  // 2) BAT 脚本：按路径去重
  for (const item of importBatScripts) {
    const pathValue = keyOf(item.path)
    if (!pathValue || batByPath.has(pathValue)) {
      if (pathValue && batByPath.has(pathValue)) stats.batScriptsSkipped += 1
      continue
    }
    try {
      const created = batScriptDao.create({
        name: item.name || item.path,
        description: item.description || '',
        path: item.path,
        args: item.args || ''
      })
      batByPath.set(pathValue, created)
      stats.batScripts += 1
    } catch (_) {
      // 非 .bat/.cmd 等无效脚本跳过
    }
  }

  // 3) 工作空间：名称避让 + 重建软件/BAT/脚本关联
  for (const workspace of importWorkspaces) {
    if (!workspace || typeof workspace !== 'object') continue
    const name = uniqueName(String(workspace.name || '未命名工作空间').trim(), workspaceNames)

    const softwareRelations = (Array.isArray(workspace.software) ? workspace.software : [])
      .map((item) => {
        const existing = softwareByPath.get(keyOf(item.path))
        return existing ? { software_id: existing.id, launch_order: item.launch_order, delay_ms: item.delay_ms } : null
      })
      .filter(Boolean)

    const created = workspaceDao.create({
      name,
      description: workspace.description || '',
      icon: workspace.icon || '🚀',
      shortcut: workspace.shortcut || '',
      software: softwareRelations
    })
    stats.workspaces += 1

    // BAT 脚本关联
    const batRelations = (Array.isArray(workspace.batScripts) ? workspace.batScripts : [])
      .map((item) => {
        const existing = batByPath.get(keyOf(item.path))
        return existing ? { bat_script_id: existing.id, launch_order: item.launch_order, delay_ms: item.delay_ms } : null
      })
      .filter(Boolean)
    if (batRelations.length > 0) {
      batScriptDao.setForWorkspace(created.id, batRelations)
    }

    // pre/post 脚本
    for (const script of (Array.isArray(workspace.scripts) ? workspace.scripts : [])) {
      if (!script || (script.type !== 'pre' && script.type !== 'post')) continue
      scriptDao.upsert({
        workspace_id: created.id,
        type: script.type,
        language: script.language || 'cmd',
        content: script.content || '',
        delay_ms: script.delay_ms || 0
      })
    }
  }

  return stats
}

function exportToFile(filePath) {
  const json = JSON.stringify(exportData(), null, 2)
  fs.writeFileSync(filePath, json, 'utf8')
  return { success: true, path: filePath }
}

function importFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(raw)
  return { success: true, stats: importData(data) }
}

module.exports = { exportData, importData, exportToFile, importFromFile }
