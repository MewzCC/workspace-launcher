// 应用菜单构建：自定义中文菜单
// 替换 Electron 默认英文菜单（File/Edit/View/Window/Help）
const { app, Menu, shell, BrowserWindow } = require('electron')

// 构建并应用应用菜单
function setupAppMenu() {
  const isMac = process.platform === 'darwin'
  // 获取当前聚焦窗口（用于开发者工具等操作）
  const focusedWindow = () => BrowserWindow.getFocusedWindow()

  const template = [
    // macOS 应用菜单（首个菜单，名称为应用名）
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about', label: '关于 ' + app.name },
            { type: 'separator' },
            { role: 'services', label: '服务' },
            { type: 'separator' },
            { role: 'hide', label: '隐藏 ' + app.name },
            { role: 'hideOthers', label: '隐藏其他' },
            { role: 'unhide', label: '显示全部' },
            { type: 'separator' },
            { role: 'quit', label: '退出 ' + app.name }
          ]
        }]
      : []),

    // 文件菜单
    {
      label: '文件',
      submenu: [
        isMac
          ? { role: 'close', label: '关闭窗口' }
          : { role: 'quit', label: '退出' }
      ]
    },

    // 编辑菜单
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
              { role: 'delete', label: '删除' },
              { role: 'selectAll', label: '全选' },
              { type: 'separator' },
              {
                label: '语音',
                submenu: [
                  { role: 'startSpeaking', label: '开始朗读' },
                  { role: 'stopSpeaking', label: '停止朗读' }
                ]
              }
            ]
          : [
              { role: 'delete', label: '删除' },
              { type: 'separator' },
              { role: 'selectAll', label: '全选' }
            ])
      ]
    },

    // 视图菜单
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    },

    // 窗口菜单
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '前置全部窗口' },
              { type: 'separator' },
              { role: 'window', label: '窗口' }
            ]
          : [
              { role: 'close', label: '关闭' }
            ])
      ]
    },

    // 帮助菜单
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 LaunchPad',
          click: () => {
            const win = focusedWindow()
            if (win) {
              win.webContents.send('menu:about')
            }
          }
        },
        {
          label: '在 GitHub 上查看',
          click: () => {
            shell.openExternal('https://github.com/MewzCC/workspace-launcher').catch(() => {})
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

module.exports = { setupAppMenu }
