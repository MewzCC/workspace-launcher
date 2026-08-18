// 存储与数据域路由：storage:* + data:*
const { app, shell } = require('electron')
const storageService = require('../../services/storageService.cjs')
const dataTransferService = require('../../services/dataTransferService.cjs')
const trayService = require('../../services/trayService.cjs')
const shortcutService = require('../../services/shortcutService.cjs')
const db = require('../../db/index.cjs')
const { workspaceDao, softwareDao, batScriptDao } = db
const { t } = require('../../i18n.cjs')
const { path } = require('../validate.cjs')

const filePathSchema = path({ max: 1024, label: '文件路径' })

const storageRoutes = [
  { channel: 'storage:info', schema: [], handler: () => storageService.getInfo() },
  {
    channel: 'storage:open',
    schema: [],
    handler: async () => {
      const info = storageService.getInfo()
      const error = await shell.openPath(info.directory)
      if (error) throw new Error(error)
      return { success: true, path: info.directory }
    }
  },
  {
    channel: 'storage:relocate',
    schema: [path({ max: 1024, label: '数据目录' })],
    handler: (_e, directory) => {
      // 把 WAL 内容同步回主数据库后再复制；旧目录保留，重启后切换到新位置
      db.getDb().pragma('wal_checkpoint(TRUNCATE)')
      const result = storageService.relocate(directory)
      if (result.changed) {
        setTimeout(() => {
          app.relaunch()
          app.exit(0)
        }, 600)
      }
      return result
    }
  },
  {
    channel: 'data:export',
    schema: [filePathSchema],
    handler: (_e, filePath) => dataTransferService.exportToFile(filePath)
  },
  {
    channel: 'data:import',
    schema: [filePathSchema],
    handler: (_e, filePath) => dataTransferService.importFromFile(filePath)
  },
  {
    // 清除全部业务数据（工作空间/软件/脚本/日志），事务执行；设置与 AI 数据不受影响
    channel: 'data:clearAll',
    schema: [],
    handler: () => {
      const database = db.getDb()
      const cleared = database.transaction(() => {
        const workspaces = workspaceDao.list()
        for (const workspace of workspaces) workspaceDao.remove(workspace.id)
        const software = softwareDao.list()
        for (const item of software) softwareDao.remove(item.id)
        const batScripts = batScriptDao.list()
        for (const item of batScripts) batScriptDao.remove(item.id)
        const logs = database.prepare('DELETE FROM launch_logs').run().changes
        return { workspaces: workspaces.length, software: software.length, batScripts: batScripts.length, logs }
      })()
      trayService.refreshTrayMenu()
      shortcutService.syncShortcuts()
      return { success: true, ...cleared }
    }
  }
]

module.exports = storageRoutes