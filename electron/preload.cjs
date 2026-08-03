// Preload 脚本
// 在隔离的上下文中通过 contextBridge 向渲染层暴露 IPC 调用 API
// 渲染层通过 window.api.* 调用主进程服务，禁止直接访问 Node API
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  version: '1.2.0',
  // 工作空间相关接口
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    get: (id) => ipcRenderer.invoke('workspace:get', id),
    create: (data) => ipcRenderer.invoke('workspace:create', data),
    update: (id, data) => ipcRenderer.invoke('workspace:update', id, data),
    delete: (id) => ipcRenderer.invoke('workspace:delete', id),
    launch: (id) => ipcRenderer.invoke('workspace:launch', id)
  },
  // 软件相关接口
  software: {
    list: () => ipcRenderer.invoke('software:list'),
    get: (id) => ipcRenderer.invoke('software:get', id),
    create: (data) => ipcRenderer.invoke('software:create', data),
    createValidated: (data) => ipcRenderer.invoke('software:createValidated', data),
    update: (id, data) => ipcRenderer.invoke('software:update', id, data),
    updateValidated: (id, data) => ipcRenderer.invoke('software:updateValidated', id, data),
    delete: (id) => ipcRenderer.invoke('software:delete', id),
    testLaunch: (id) => ipcRenderer.invoke('software:testLaunch', id),
    getProcessStatuses: (exePaths) => ipcRenderer.invoke('software:getProcessStatuses', exePaths),
    // 标准扫描：开始菜单 + Program Files 的 .lnk 快捷方式
    scan: () => ipcRenderer.invoke('software:scan'),
    // 批量创建软件（扫描结果批量添加用）
    bulkCreate: (items) => ipcRenderer.invoke('software:bulkCreate', items),
    bulkCreateValidated: (items) => ipcRenderer.invoke('software:bulkCreateValidated', items),
    // 获取可用盘符列表 ['C','D','E']
    getDrives: () => ipcRenderer.invoke('software:getDrives'),
    // 扫描指定盘符的 .exe 文件
    scanDrive: (driveLetter, options) => ipcRenderer.invoke('software:scanDrive', driveLetter, options),
    // 扫描指定目录的 .exe 文件
    scanDirectory: (dirPath, options) => ipcRenderer.invoke('software:scanDirectory', dirPath, options),
    // 提取单个文件图标，返回 data URL（PNG base64）
    getIcon: (filePath) => ipcRenderer.invoke('software:getIcon', filePath),
    // 批量提取文件图标，返回 { [filePath]: dataURL }
    getIcons: (filePaths) => ipcRenderer.invoke('software:getIcons', filePaths)
  },
  batScript: {
    list: () => ipcRenderer.invoke('batScript:list'),
    listByWorkspace: (workspaceId) =>
      ipcRenderer.invoke('batScript:listByWorkspace', workspaceId),
    setWorkspaceScripts: (workspaceId, items) =>
      ipcRenderer.invoke('batScript:setWorkspaceScripts', workspaceId, items),
    create: (data) => ipcRenderer.invoke('batScript:create', data),
    update: (id, data) => ipcRenderer.invoke('batScript:update', id, data),
    delete: (id) => ipcRenderer.invoke('batScript:delete', id),
    run: (id) => ipcRenderer.invoke('batScript:run', id)
  },
  // 脚本相关接口
  script: {
    listByWorkspace: (workspaceId) =>
      ipcRenderer.invoke('script:listByWorkspace', workspaceId),
    upsert: (data) => ipcRenderer.invoke('script:upsert', data)
  },
  // 日志相关接口
  logs: {
    list: (workspaceId, limit) => ipcRenderer.invoke('logs:list', workspaceId, limit),
    listAll: (limit) => ipcRenderer.invoke('logs:listAll', limit)
  },
  // 原生对话框
  dialog: {
    openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
    openFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
  },
  external: {
    open: (url) => ipcRenderer.invoke('external:open', url)
  },
  system: {
    getPreferences: () => ipcRenderer.invoke('system:getPreferences'),
    setOpenAtLogin: (enabled) => ipcRenderer.invoke('system:setOpenAtLogin', enabled),
    setStartMinimized: (enabled) => ipcRenderer.invoke('system:setStartMinimized', enabled),
    setCloseToTray: (enabled) => ipcRenderer.invoke('system:setCloseToTray', enabled),
    setKillBeforeLaunch: (enabled) => ipcRenderer.invoke('system:setKillBeforeLaunch', enabled)
  },
  // 主题同步：通知主进程切换原生 UI（菜单栏/标题栏）配色
  theme: {
    set: (theme) => ipcRenderer.invoke('theme:set', theme)
  },
  // 订阅工作空间启动进度事件
  // 返回取消订阅函数，调用以移除监听器
  onLaunchProgress: (callback) => {
    const handler = (_event, progress) => callback(progress)
    ipcRenderer.on('workspace:launch-progress', handler)
    return () => ipcRenderer.removeListener('workspace:launch-progress', handler)
  }
})
