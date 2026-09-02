// 系统域路由：system:* + theme:set + language:set
// theme/language 原注册在 main.cjs，迁移至此统一走契约校验
const { nativeTheme, BrowserWindow } = require('electron')
const systemPreferences = require('../../services/systemPreferences.cjs')
const trayService = require('../../services/trayService.cjs')
const { settingsDao } = require('../../db/index.cjs')
const { bool, oneOf } = require('../validate.cjs')
const { refreshAppMenu } = require('../../menu.cjs')

// 切换原生 UI（菜单栏/标题栏）配色，并广播到所有窗口
function applyNativeTheme(theme) {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'
}

function broadcastTheme(theme) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('theme:changed', theme)
  }
}

const systemRoutes = [
  { channel: 'system:getPreferences', schema: [], handler: () => systemPreferences.getPreferences() },
  {
    channel: 'system:setOpenAtLogin',
    schema: [bool()],
    handler: (_e, enabled) => {
      const result = systemPreferences.setOpenAtLogin(enabled)
      trayService.refreshTrayMenu()
      return result
    }
  },
  {
    channel: 'system:setStartMinimized',
    schema: [bool()],
    handler: (_e, enabled) => systemPreferences.setStartMinimized(enabled)
  },
  {
    channel: 'system:setCloseToTray',
    schema: [bool()],
    handler: (_e, enabled) => systemPreferences.setCloseToTray(enabled)
  },
  {
    channel: 'system:setKillBeforeLaunch',
    schema: [bool()],
    handler: (_e, enabled) => systemPreferences.setKillBeforeLaunch(enabled)
  },
  {
    channel: 'system:setUpdateNotify',
    schema: [bool()],
    handler: (_e, enabled) => systemPreferences.setUpdateNotify(enabled)
  },
  {
    channel: 'system:setUpdateMode',
    schema: [oneOf(['manual', 'background', 'auto'], { label: '更新方式' })],
    handler: (_e, mode) => systemPreferences.setUpdateMode(mode)
  },
  {
    channel: 'system:setPetEnabled',
    schema: [bool()],
    handler: (_e, enabled) => {
      const result = systemPreferences.setPetEnabled(enabled)
      require('../../services/petService.cjs').refresh()
      return result
    }
  },
  {
    channel: 'theme:set',
    schema: [oneOf(['light', 'dark'], { label: '主题' })],
    handler: (_e, theme) => {
      applyNativeTheme(theme)
      broadcastTheme(theme)
      return { success: true }
    }
  },
  {
    channel: 'language:set',
    schema: [oneOf(['zh-CN', 'en-US', 'ja-JP'], { label: '语言' })],
    handler: (_e, language) => {
      settingsDao.set('language', String(language))
      // 语言切换后刷新原生菜单与托盘菜单
      refreshAppMenu()
      trayService.refreshTrayMenu()
      return { success: true }
    }
  }
]

module.exports = systemRoutes
module.exports.applyNativeTheme = applyNativeTheme