// 主进程入口
// 负责创建 BrowserWindow、加载渲染层（开发环境走 dev server，生产环境走打包文件）
const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const path = require('path')
const { setupAppMenu } = require('./menu.cjs')

// 应用原生主题同步：根据应用主题（dark/light）强制原生 UI（菜单栏、标题栏等）配色
// 'dark' -> 原生暗色菜单栏；'light' -> 原生亮色菜单栏
function applyNativeTheme(theme) {
  if (theme === 'light') {
    nativeTheme.themeSource = 'light'
  } else {
    nativeTheme.themeSource = 'dark'
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f6f7fb',
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

  // 默认按亮色主题初始化原生 UI（与渲染层 index.html 内联脚本的默认值一致）
  // 渲染层加载后会通过 theme:set 同步实际存储的主题
  applyNativeTheme('light')

  // 设置中文应用菜单
  setupAppMenu()

  // 渲染层 -> 主进程：同步应用主题，使原生菜单栏/标题栏跟随
  ipcMain.handle('theme:set', (_e, theme) => {
    applyNativeTheme(theme)
    return { success: true }
  })

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
