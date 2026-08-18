// 更新域路由：update:* + releases:*
const { shell } = require('electron')
const updateService = require('../../services/updateService.cjs')
const { t } = require('../../i18n.cjs')
const { str } = require('../validate.cjs')

const releaseDownloadSchema = str({ max: 2048 })

const updateRoutes = [
  { channel: 'update:status', schema: [], handler: () => updateService.getStatus() },
  { channel: 'update:check', schema: [], handler: () => updateService.checkForUpdates() },
  { channel: 'update:download', schema: [], handler: () => updateService.downloadUpdate() },
  { channel: 'update:install', schema: [], handler: () => updateService.installUpdate() },
  { channel: 'update:skip', schema: [], handler: () => updateService.skipVersion() },
  { channel: 'update:lastResult', schema: [], handler: () => updateService.getLastUpdate() },
  {
    channel: 'update:clearLastResult',
    schema: [],
    handler: () => {
      updateService.clearLastUpdate()
      return { success: true }
    }
  },
  { channel: 'releases:list', schema: [], handler: () => updateService.getReleaseHistory() },
  {
    channel: 'releases:download',
    schema: [releaseDownloadSchema],
    handler: async (_e, url) => {
      // 仅允许本仓库 Releases 的下载链接
      const allowed = String(url || '').startsWith(
        'https://github.com/MewzCC/workspace-launcher/releases/download/'
      )
      if (!allowed) throw new Error(t('errors.externalBlocked'))
      await shell.openExternal(url)
      return { success: true }
    }
  }
]

module.exports = updateRoutes