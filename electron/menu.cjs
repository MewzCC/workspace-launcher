// 应用菜单构建：多语言菜单
// 替换 Electron 默认英文菜单（File/Edit/View/Window/Help）
const { app, Menu, shell, BrowserWindow } = require('electron')
const { t } = require('./i18n.cjs')

// 构建菜单模板
function buildTemplate() {
  const isMac = process.platform === 'darwin'
  const focusedWindow = () => BrowserWindow.getFocusedWindow()

  return [
    // macOS 应用菜单（首个菜单，名称为应用名）
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: t('menu.about') },
            { type: 'separator' },
            { role: 'services', label: t('menu.services') },
            { type: 'separator' },
            { role: 'hide', label: t('menu.hide', { name: app.name }) },
            { role: 'hideOthers', label: t('menu.hideOthers') },
            { role: 'unhide', label: t('menu.unhide') },
            { type: 'separator' },
            { role: 'quit', label: t('menu.quit') }
          ]
        }]
      : []),

    // 文件菜单
    {
      label: t('menu.file'),
      submenu: [
        isMac
          ? { role: 'close', label: t('menu.closeWindow') }
          : { role: 'quit', label: t('menu.quit') }
      ]
    },

    // 编辑菜单
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle', label: t('menu.pasteAndMatchStyle') },
              { role: 'delete', label: t('menu.delete') },
              { role: 'selectAll', label: t('menu.selectAll') },
              { type: 'separator' },
              {
                label: t('menu.speech'),
                submenu: [
                  { role: 'startSpeaking', label: t('menu.startSpeaking') },
                  { role: 'stopSpeaking', label: t('menu.stopSpeaking') }
                ]
              }
            ]
          : [
              { role: 'delete', label: t('menu.delete') },
              { type: 'separator' },
              { role: 'selectAll', label: t('menu.selectAll') }
            ])
      ]
    },

    // 视图菜单
    {
      label: t('menu.view'),
      submenu: [
        { role: 'reload', label: t('menu.reload') },
        { role: 'forceReload', label: t('menu.forceReload') },
        { role: 'toggleDevTools', label: t('menu.devTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menu.resetZoom') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.fullscreen') }
      ]
    },

    // 窗口菜单
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize', label: t('menu.minimize') },
        { role: 'zoom', label: t('menu.zoom') },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front', label: t('menu.front') }, { type: 'separator' }, { role: 'window', label: t('menu.window') }]
          : [{ role: 'close', label: t('menu.close') }])
      ]
    },

    // 帮助菜单
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => {
            const win = focusedWindow()
            if (win) {
              win.webContents.send('menu:about')
            }
          }
        },
        {
          label: t('menu.viewGithub'),
          click: () => {
            shell.openExternal('https://github.com/MewzCC/workspace-launcher').catch(() => {})
          }
        }
      ]
    }
  ]
}

function setupAppMenu() {
  const menu = Menu.buildFromTemplate(buildTemplate())
  Menu.setApplicationMenu(menu)
}

// 重建应用菜单（语言切换后调用）
function refreshAppMenu() {
  setupAppMenu()
}

module.exports = { setupAppMenu, refreshAppMenu }