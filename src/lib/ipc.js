// 渲染层 IPC 调用封装
// 统一从 window.api 调用主进程服务
// 各 React 组件通过具名导入使用对应 API
const api = window.api

export const appVersion = api.version || '0.0.0'

async function unwrap(result) {
  const value = await result
  if (value && typeof value === 'object' && value.error) {
    throw new Error(value.error)
  }
  return value
}

// 工作空间 API
export const workspaceApi = {
  list: () => unwrap(api.workspace.list()),
  get: (id) => unwrap(api.workspace.get(id)),
  create: (data) => unwrap(api.workspace.create(data)),
  update: (id, data) => unwrap(api.workspace.update(id, data)),
  remove: (id) => unwrap(api.workspace.delete(id)),
  launch: (id, options) => unwrap(api.workspace.launch(id, options)),
  close: (id) => unwrap(api.workspace.close(id))
}

export const shortcutApi = {
  status: () => unwrap(api.shortcut.status()),
  validate: (accelerator, workspaceId) =>
    unwrap(api.shortcut.validate(accelerator, workspaceId))
}

// 软件 API
export const softwareApi = {
  list: () => api.software.list(),
  get: (id) => api.software.get(id),
  create: (data) => api.software.create(data),
  createValidated: (data) => api.software.createValidated(data),
  update: (id, data) => api.software.update(id, data),
  updateValidated: (id, data) => api.software.updateValidated(id, data),
  remove: (id) => api.software.delete(id),
  testLaunch: (id) => api.software.testLaunch(id),
  getProcessStatuses: (exePaths) => api.software.getProcessStatuses(exePaths),
  // 标准扫描：开始菜单 + Program Files 的 .lnk 快捷方式
  scan: () => api.software.scan(),
  cancelScan: () => api.software.cancelScan(),
  searchInstalled: (query) => api.software.searchInstalled(query),
  // 批量创建软件
  bulkCreate: (items) => api.software.bulkCreate(items),
  bulkCreateValidated: (items) => api.software.bulkCreateValidated(items),
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

export const processApi = {
  list: (options) => api.process.list(options),
  terminate: (pid) => api.process.terminate(pid)
}

// 性能监视 API：返回 CPU / 内存 / 磁盘 / GPU 快照
export const perfApi = {
  snapshot: () => api.perf.snapshot(),
  topProcesses: () => api.perf.topProcesses()
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

export const storageApi = {
  info: () => unwrap(api.storage.info()),
  open: () => unwrap(api.storage.open())
}

export const dataApi = {
  clearAll: () => unwrap(api.data.clearAll()),
  export: (filePath) => unwrap(api.data.export(filePath)),
  import: (filePath) => unwrap(api.data.import(filePath))
}

export const diagnosticsApi = {
  getReport: () => unwrap(api.diagnostics.getReport()),
  copyReport: () => unwrap(api.diagnostics.copyReport()),
  openLogs: () => unwrap(api.diagnostics.openLogs()),
  report: (eventName, details) => api.diagnostics.report(eventName, details)
}

export const updateApi = {
  status: () => unwrap(api.update.status()),
  check: () => unwrap(api.update.check()),
  download: () => unwrap(api.update.download()),
  install: () => unwrap(api.update.install()),
  skip: () => unwrap(api.update.skip()),
  lastResult: () => unwrap(api.update.lastResult()),
  clearLastResult: () => unwrap(api.update.clearLastResult()),
  releases: () => unwrap(api.update.releases()),
  downloadRelease: (url) => unwrap(api.update.downloadRelease(url))
}

// 对话框 API
export const dialogApi = {
  openFile: (filters) => api.dialog.openFile(filters),
  openFiles: (filters) => api.dialog.openFiles(filters),
  openDirectory: () => api.dialog.openDirectory(),
  saveFile: (options) => api.dialog.saveFile(options)
}

export const externalApi = {
  open: (url) => api.external.open(url)
}

export const systemApi = {
  getPreferences: () => api.system.getPreferences(),
  setOpenAtLogin: (enabled) => api.system.setOpenAtLogin(enabled),
  setStartMinimized: (enabled) => api.system.setStartMinimized(enabled),
  setCloseToTray: (enabled) => api.system.setCloseToTray(enabled),
  setKillBeforeLaunch: (enabled) => api.system.setKillBeforeLaunch(enabled),
  setUpdateNotify: (enabled) => api.system.setUpdateNotify(enabled),
  setUpdateMode: (mode) => api.system.setUpdateMode(mode)
}

// 主题同步 API：通知主进程切换原生 UI（菜单栏/标题栏）配色
export const themeApi = {
  set: (theme) => api.theme.set(theme)
}

// 语言同步 API：通知主进程切换托盘/菜单等原生 UI 语言
export const languageApi = {
  set: (language) => api.language.set(language)
}

// 订阅工作空间启动进度，返回取消订阅函数
export const onLaunchProgress = (callback) => api.onLaunchProgress(callback)
export const onUpdateStatus = (callback) => api.onUpdateStatus(callback)
