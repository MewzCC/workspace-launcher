// 对话框与外链域路由：dialog:* + external:*
const { dialog, shell } = require('electron')
const { t } = require('../../i18n.cjs')
const { str, optional, obj, arr } = require('../validate.cjs')

// dialog.showOpenDialog filters 结构（扩展名仅允许字母数字与点号，防过滤器注入）
const filterSchema = obj({
  name: optional(str({ max: 100 })),
  extensions: optional(arr(str({ max: 20, pattern: /^[a-z0-9]+(\.[a-z0-9]+)*$/i, label: '扩展名' }), { max: 50 }))
}, { label: '文件过滤器' })

const filtersSchema = optional(arr(filterSchema, { max: 32 }))

const saveOptionsSchema = optional(obj({
  title: optional(str({ max: 200 })),
  defaultPath: optional(str({ max: 1024 })),
  filters: optional(arr(filterSchema, { max: 32 }))
}, { label: '保存对话框选项' }))

const dialogRoutes = [
  {
    channel: 'dialog:openFile',
    schema: [filtersSchema],
    handler: async (_e, filters) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters || [{ name: t('errors.exeFilter'), extensions: ['exe'] }]
      })
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null
      return result.filePaths[0]
    }
  },
  {
    channel: 'dialog:openFiles',
    schema: [filtersSchema],
    handler: async (_e, filters) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: filters || [{ name: t('errors.exeFilter'), extensions: ['exe'] }]
      })
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return []
      return result.filePaths
    }
  },
  {
    channel: 'dialog:openDirectory',
    schema: [],
    handler: async () => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return null
      return result.filePaths[0]
    }
  },
  {
    channel: 'dialog:saveFile',
    schema: [saveOptionsSchema],
    handler: async (_e, options) => {
      const opts = options || {}
      const result = await dialog.showSaveDialog({
        title: opts.title,
        defaultPath: opts.defaultPath || '',
        filters: opts.filters || [{ name: 'JSON', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) return null
      return result.filePath
    }
  },
  {
    channel: 'external:open',
    schema: [str({ max: 2048 })],
    handler: async (_e, rawUrl) => {
      const url = new URL(rawUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
        throw new Error(t('errors.externalBlocked'))
      }
      await shell.openExternal(url.toString())
      return { success: true }
    }
  }
]

module.exports = dialogRoutes