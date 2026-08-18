// 工作空间域路由：workspace:* + shortcut:*
const workspaceEngine = require('../../services/workspaceEngine.cjs')
const processManager = require('../../services/processManager.cjs')
const shortcutService = require('../../services/shortcutService.cjs')
const trayService = require('../../services/trayService.cjs')
const { workspaceDao } = require('../../db/index.cjs')
const { t } = require('../../i18n.cjs')
const { str, id, num, bool, oneOf, optional, obj, arr } = require('../validate.cjs')

// 非负整数（launch_order / delay_ms 等编排参数）
const indexInt = num({ integer: true, min: 0, max: 604800000 })

// 工作空间软件关联项（workspace_software 行）
const softwareRelationSchema = obj({
  software_id: id(),
  launch_order: optional(indexInt),
  delay_ms: optional(indexInt)
}, { label: '软件关联' })

// 工作空间保存数据（新建/编辑共用）
const workspaceDataSchema = obj({
  name: str({ min: 1, max: 200, trim: true, label: '工作空间名称' }),
  description: optional(str({ max: 500 })),
  icon: optional(str({ max: 64 })),
  shortcut: optional(str({ max: 64, pattern: /^[\x20-\x7e]*$/ })),
  software: optional(arr(softwareRelationSchema, { max: 200 }))
}, { label: '工作空间数据' })

// 快捷键校验失败 → 与旧行为一致：抛出带 i18n 文案的错误
function shortcutError(validation) {
  const key = validation.reason === 'duplicate'
    ? 'errors.shortcutDuplicate'
    : validation.reason === 'occupied'
      ? 'errors.shortcutOccupied'
      : 'errors.shortcutInvalid'
  return new Error(t(key, { name: validation.workspaceName || '' }))
}

const workspaceRoutes = [
  { channel: 'workspace:list', schema: [], handler: () => workspaceDao.list() },
  { channel: 'workspace:get', schema: [id()], handler: (_e, workspaceId) => workspaceDao.get(workspaceId) },
  {
    channel: 'workspace:create',
    schema: [workspaceDataSchema],
    handler: (_e, data) => {
      const validation = shortcutService.validateShortcut(data?.shortcut)
      if (!validation.valid) throw shortcutError(validation)
      const result = workspaceDao.create(data)
      trayService.refreshTrayMenu()
      const failure = shortcutService.syncShortcuts().find((item) => item.workspaceId === result.id)
      if (failure) {
        // 快捷键未真正注册时不保留“看似成功”的配置
        workspaceDao.remove(result.id)
        shortcutService.syncShortcuts()
        trayService.refreshTrayMenu()
        throw new Error(
          failure.reason === 'occupied' ? t('errors.shortcutOccupied') : t('errors.shortcutInvalid')
        )
      }
      return result
    }
  },
  {
    channel: 'workspace:update',
    schema: [id(), workspaceDataSchema],
    handler: (_e, workspaceId, data) => {
      const validation = shortcutService.validateShortcut(data?.shortcut, workspaceId)
      if (!validation.valid) throw shortcutError(validation)
      const previousShortcut = workspaceDao.get(workspaceId)?.shortcut || ''
      const result = workspaceDao.update(workspaceId, data)
      trayService.refreshTrayMenu()
      const failure = shortcutService.syncShortcuts().find((item) => item.workspaceId === workspaceId)
      if (failure) {
        workspaceDao.updateShortcut(workspaceId, previousShortcut)
        shortcutService.syncShortcuts()
        throw new Error(
          failure.reason === 'occupied' ? t('errors.shortcutOccupied') : t('errors.shortcutInvalid')
        )
      }
      return result
    }
  },
  {
    channel: 'workspace:delete',
    schema: [id()],
    handler: (_e, workspaceId) => {
      const result = workspaceDao.remove(workspaceId)
      trayService.refreshTrayMenu()
      shortcutService.syncShortcuts()
      return result
    }
  },
  {
    channel: 'workspace:launch',
    schema: [id(), optional(obj({ restartRunning: optional(bool()) }, { label: '启动选项' }))],
    handler: async (event, workspaceId, options) => {
      const win = event.sender ? require('electron').BrowserWindow.fromWebContents(event.sender) : null
      const onProgress = (progress) => {
        if (win && !win.isDestroyed()) win.webContents.send('workspace:launch-progress', progress)
      }
      await workspaceEngine.launchWorkspace(workspaceId, onProgress, options || {})
      return { success: true }
    }
  },
  {
    channel: 'workspace:close',
    schema: [id()],
    handler: async (_e, workspaceId) => {
      const workspace = workspaceDao.get(workspaceId)
      if (!workspace) throw new Error(t('engine.notFound', { id: workspaceId }))
      const software = (workspace.software || []).filter((item) => item.path)
      let killed = 0
      const failed = []
      for (const item of software) {
        try {
          const result = await processManager.terminateByExecutablePath(item.path)
          killed += result.killed || 0
        } catch (error) {
          failed.push({ name: item.name, message: error.message })
        }
      }
      return { success: true, killed, failed }
    }
  },
  { channel: 'shortcut:status', schema: [], handler: () => shortcutService.getStatus() },
  {
    channel: 'shortcut:validate',
    schema: [optional(str({ max: 64 })), optional(id())],
    handler: (_e, accelerator, workspaceId) =>
      shortcutService.checkShortcutAvailability(accelerator, workspaceId ?? null)
  }
]

module.exports = workspaceRoutes