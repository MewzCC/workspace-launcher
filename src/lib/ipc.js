// 渲染层 IPC 调用封装
// 统一从 window.api 调用主进程服务
// 各 React 组件通过具名导入使用对应 API
const api = window.api

// 工作空间 API
export const workspaceApi = {
  list: () => api.workspace.list(),
  get: (id) => api.workspace.get(id),
  create: (data) => api.workspace.create(data),
  update: (id, data) => api.workspace.update(id, data),
  remove: (id) => api.workspace.delete(id),
  launch: (id) => api.workspace.launch(id)
}

// 软件 API
export const softwareApi = {
  list: () => api.software.list(),
  get: (id) => api.software.get(id),
  create: (data) => api.software.create(data),
  update: (id, data) => api.software.update(id, data),
  remove: (id) => api.software.delete(id),
  testLaunch: (id) => api.software.testLaunch(id),
  // 标准扫描：开始菜单 + Program Files 的 .lnk 快捷方式
  scan: () => api.software.scan(),
  // 批量创建软件
  bulkCreate: (items) => api.software.bulkCreate(items),
  // 获取可用盘符列表
  getDrives: () => api.software.getDrives(),
  // 扫描指定盘符的 .exe 文件
  scanDrive: (driveLetter, options) => api.software.scanDrive(driveLetter, options),
  // 扫描指定目录的 .exe 文件
  scanDirectory: (dirPath, options) => api.software.scanDirectory(dirPath, options),
  // 提取单个文件图标（返回 data URL）
  getIcon: (filePath) => api.software.getIcon(filePath),
  // 批量提取文件图标（返回 { [filePath]: dataURL }）
  getIcons: (filePaths) => api.software.getIcons(filePaths)
}

export const batScriptApi = {
  list: () => api.batScript.list(),
  listByWorkspace: (workspaceId) => api.batScript.listByWorkspace(workspaceId),
  setWorkspaceScripts: (workspaceId, items) =>
    api.batScript.setWorkspaceScripts(workspaceId, items),
  create: (data) => api.batScript.create(data),
  update: (id, data) => api.batScript.update(id, data),
  remove: (id) => api.batScript.delete(id),
  run: (id) => api.batScript.run(id)
}

// 脚本 API
export const scriptApi = {
  listByWorkspace: (workspaceId) => api.script.listByWorkspace(workspaceId),
  upsert: (data) => api.script.upsert(data)
}

// 日志 API
export const logsApi = {
  list: (workspaceId, limit) => api.logs.list(workspaceId, limit),
  listAll: (limit) => api.logs.listAll(limit)
}

// 对话框 API
export const dialogApi = {
  openFile: (filters) => api.dialog.openFile(filters),
  openFiles: (filters) => api.dialog.openFiles(filters),
  openDirectory: () => api.dialog.openDirectory()
}

export const externalApi = {
  open: (url) => api.external.open(url)
}

// 主题同步 API：通知主进程切换原生 UI（菜单栏/标题栏）配色
export const themeApi = {
  set: (theme) => api.theme.set(theme)
}

// 订阅工作空间启动进度，返回取消订阅函数
export const onLaunchProgress = (callback) => api.onLaunchProgress(callback)
