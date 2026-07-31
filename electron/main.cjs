// 主进程入口
// 负责创建 BrowserWindow、加载渲染层（开发环境走 dev server，生产环境走打包文件）
const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#080B12',
    show: false, // 等待 ready-to-show 再显示，避免白屏
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '../preload/index.cjs')
    }
  })

  // 内容准备好后再展示窗口
  win.once('ready-to-show', () => {
    win.show()
  })

  // 开发环境：加载 electron-vite 提供的渲染层 dev server
  // 生产环境：加载打包后的 index.html
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // 初始化数据库（必须在注册 IPC 处理器之前，DAO 依赖数据库连接）
  require('./db/index.cjs').getDb()

  // 注册 IPC 处理器（在窗口创建前后均可，此处放在创建窗口前确保就绪）
  require('./ipc/handlers.cjs').registerIpcHandlers()

  createWindow()

  // macOS：点击 dock 图标时若无窗口则重新创建
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 非 macOS 平台：所有窗口关闭后退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
