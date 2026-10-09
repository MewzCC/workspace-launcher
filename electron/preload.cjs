// Preload 脚本
// 在隔离的上下文中通过 contextBridge 向渲染层暴露 IPC 调用 API
// 渲染层通过 window.api.* 调用主进程服务，禁止直接访问 Node API
const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  version: process.env.LAUNCHPAD_VERSION || '0.0.0',
  // 工作空间相关接口
  workspace: {
    list: () => ipcRenderer.invoke('workspace:list'),
    get: (id) => ipcRenderer.invoke('workspace:get', id),
    create: (data) => ipcRenderer.invoke('workspace:create', data),
    update: (id, data) => ipcRenderer.invoke('workspace:update', id, data),
    delete: (id) => ipcRenderer.invoke('workspace:delete', id),
    launch: (id, options) => ipcRenderer.invoke('workspace:launch', id, options),
    close: (id) => ipcRenderer.invoke('workspace:close', id)
  },
  shortcut: {
    status: () => ipcRenderer.invoke('shortcut:status'),
    validate: (accelerator, workspaceId) =>
      ipcRenderer.invoke('shortcut:validate', accelerator, workspaceId)
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
    cancelScan: () => ipcRenderer.invoke('software:cancelScan'),
    searchInstalled: (query) => ipcRenderer.invoke('software:searchInstalled', query),
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
  process: {
    list: (options) => ipcRenderer.invoke('process:list', options),
    terminate: (pid) => ipcRenderer.invoke('process:terminate', pid)
  },
  perf: {
    snapshot: () => ipcRenderer.invoke('perf:snapshot'),
    topProcesses: () => ipcRenderer.invoke('perf:topProcesses')
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
  storage: {
    info: () => ipcRenderer.invoke('storage:info'),
    open: () => ipcRenderer.invoke('storage:open'),
    relocate: (directory) => ipcRenderer.invoke('storage:relocate', directory)
  },
  data: {
    clearAll: () => ipcRenderer.invoke('data:clearAll'),
    export: (filePath) => ipcRenderer.invoke('data:export', filePath),
    import: (filePath) => ipcRenderer.invoke('data:import', filePath)
  },
  diagnostics: {
    getReport: () => ipcRenderer.invoke('diagnostics:getReport'),
    copyReport: () => ipcRenderer.invoke('diagnostics:copyReport'),
    openLogs: () => ipcRenderer.invoke('diagnostics:openLogs'),
    report: (eventName, details) => ipcRenderer.send('diagnostics:report', eventName, details)
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    skip: () => ipcRenderer.invoke('update:skip'),
    lastResult: () => ipcRenderer.invoke('update:lastResult'),
    clearLastResult: () => ipcRenderer.invoke('update:clearLastResult'),
    releases: () => ipcRenderer.invoke('releases:list'),
    downloadRelease: (url) => ipcRenderer.invoke('releases:download', url)
  },
  // 原生对话框
  dialog: {
    openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
    openFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options)
  },
  external: {
    open: (url) => ipcRenderer.invoke('external:open', url)
  },
  system: {
    getPreferences: () => ipcRenderer.invoke('system:getPreferences'),
    setOpenAtLogin: (enabled) => ipcRenderer.invoke('system:setOpenAtLogin', enabled),
    setStartMinimized: (enabled) => ipcRenderer.invoke('system:setStartMinimized', enabled),
    setCloseToTray: (enabled) => ipcRenderer.invoke('system:setCloseToTray', enabled),
    setKillBeforeLaunch: (enabled) => ipcRenderer.invoke('system:setKillBeforeLaunch', enabled),
    setUpdateNotify: (enabled) => ipcRenderer.invoke('system:setUpdateNotify', enabled),
    setUpdateMode: (mode) => ipcRenderer.invoke('system:setUpdateMode', mode),
    setPetEnabled: (enabled) => ipcRenderer.invoke('system:setPetEnabled', enabled)
  },
  pet: {
    move: (x, y, instanceId) => ipcRenderer.send('pet:move', instanceId, { x, y }),
    dragStart: (instanceId) => ipcRenderer.send('pet:dragStart', instanceId),
    dragMove: (instanceId) => ipcRenderer.send('pet:dragMove', instanceId),
    dragEnd: (instanceId) => ipcRenderer.send('pet:dragEnd', instanceId),
    setMousePassthrough: (passthrough, instanceId) => ipcRenderer.send('pet:setMousePassthrough', instanceId, passthrough),
    savePosition: (instanceId) => ipcRenderer.send('pet:savePosition', instanceId),
    performAction: (action, instanceId) => ipcRenderer.send('pet:performAction', instanceId, action),
    openMain: () => ipcRenderer.invoke('pet:openMain'),
    showMenu: (instanceId) => ipcRenderer.invoke('pet:showMenu', instanceId),
    setChatOpen: (open, instanceId) => ipcRenderer.invoke('pet:setChatOpen', instanceId, open),
    showBubble: (text, duration, instanceId) => ipcRenderer.invoke('pet:showBubble', instanceId, text, duration),
    reportBubbleSize: (size, instanceId) => ipcRenderer.send('pet:bubbleSize', instanceId, size),
    home: (instanceId) => ipcRenderer.invoke('pet:home', instanceId),
    getConfig: (instanceId) => ipcRenderer.invoke('pet:getConfig', instanceId),
    getMovementArea: (instanceId) => ipcRenderer.invoke('pet:getMovementArea', instanceId),
    listModels: () => ipcRenderer.invoke('pet:listModels'),
    refreshModels: () => ipcRenderer.invoke('pet:refreshModels'),
    listInstances: () => ipcRenderer.invoke('pet:listInstances'),
    setInstanceEnabled: (id, enabled) => ipcRenderer.invoke('pet:setInstanceEnabled', id, enabled),
    getModelsStorage: () => ipcRenderer.invoke('pet:getModelsStorage'),
    openModelsStorage: () => ipcRenderer.invoke('pet:openModelsStorage'),
    importModel: (manifestPath) => ipcRenderer.invoke('pet:importModel', manifestPath),
    pathForDroppedFile: (file) => webUtils.getPathForFile(file),
    previewImport: (paths, options) => ipcRenderer.invoke('pet:previewImport', paths, options),
    cancelImport: (token) => ipcRenderer.invoke('pet:cancelImport', token),
    useImport: (token, options) => ipcRenderer.invoke('pet:useImport', token, options),
    exportCreationSkill: () => ipcRenderer.invoke('pet:exportCreationSkill'),
    selectModel: (id) => ipcRenderer.invoke('pet:selectModel', id),
    removeModel: (id) => ipcRenderer.invoke('pet:removeModel', id),
    updateSettings: (settings, instanceId) => ipcRenderer.invoke('pet:updateSettings', instanceId, settings),
    interactionStatus: () => ipcRenderer.invoke('pet:interaction:status'),
    listInteractions: (limit) => ipcRenderer.invoke('pet:interaction:list', limit),
    updateInteractionSettings: (settings) => ipcRenderer.invoke('pet:interaction:updateSettings', settings),
    startInteraction: (request) => ipcRenderer.invoke('pet:interaction:start', request),
    stopInteraction: () => ipcRenderer.invoke('pet:interaction:stop'),
    getInteractionMemories: (petAId, petBId) => ipcRenderer.invoke('pet:interaction:memories', petAId, petBId),
    clearInteractionMemories: (petAId, petBId) => ipcRenderer.invoke('pet:interaction:clearMemories', petAId, petBId),
    studyGet: (instanceId) => ipcRenderer.invoke('pet:study:get', instanceId),
    studyUpdateSettings: (instanceId, settings) => ipcRenderer.invoke('pet:study:updateSettings', instanceId, settings),
    studyAdd: (instanceId, entry) => ipcRenderer.invoke('pet:study:add', instanceId, entry),
    studyAddWithAI: (instanceId, request) => ipcRenderer.invoke('pet:study:addWithAI', instanceId, request),
    studyList: (instanceId, language, limit) => ipcRenderer.invoke('pet:study:list', instanceId, language, limit),
    studySearch: (instanceId, options) => ipcRenderer.invoke('pet:study:search', instanceId, options),
    studyReview: (instanceId, itemId, rating) => ipcRenderer.invoke('pet:study:review', instanceId, itemId, rating),
    studyRemove: (instanceId, itemId) => ipcRenderer.invoke('pet:study:remove', instanceId, itemId),
    studyGenerate: (instanceId, request) => ipcRenderer.invoke('pet:study:generate', instanceId, request),
    studyClick: (instanceId) => ipcRenderer.invoke('pet:study:click', instanceId),
    studyOpenAdd: (instanceId) => ipcRenderer.invoke('pet:study:openAdd', instanceId),
    studyValidateShortcut: (instanceId, accelerator, kind) => ipcRenderer.invoke('pet:study:validateShortcut', instanceId, accelerator, kind),
    studyCloseAdd: (instanceId) => ipcRenderer.invoke('pet:study:closeAdd', instanceId),
    onStudyChanged: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('pet:studyChanged', handler)
      return () => ipcRenderer.removeListener('pet:studyChanged', handler)
    },
    onInteractionChanged: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('pet:interactionChanged', handler)
      return () => ipcRenderer.removeListener('pet:interactionChanged', handler)
    },
    onConfigChanged: (callback) => {
      const handler = (_event, config) => callback(config)
      ipcRenderer.on('pet:configChanged', handler)
      return () => ipcRenderer.removeListener('pet:configChanged', handler)
    },
    onAction: (callback) => {
      const handler = (_event, action) => callback(action)
      ipcRenderer.on('pet:action', handler)
      return () => ipcRenderer.removeListener('pet:action', handler)
    },
    onChatVisibility: (callback) => {
      const handler = (_event, open) => callback(Boolean(open))
      ipcRenderer.on('pet:chatVisibility', handler)
      return () => ipcRenderer.removeListener('pet:chatVisibility', handler)
    },
    onBubbleContent: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('pet:bubbleContent', handler)
      return () => ipcRenderer.removeListener('pet:bubbleContent', handler)
    },
    onBubblePlacement: (callback) => {
      const handler = (_event, placement) => callback(placement)
      ipcRenderer.on('pet:bubblePlacement', handler)
      return () => ipcRenderer.removeListener('pet:bubblePlacement', handler)
    }
  },
  ai: {
    getConfig: (petModelId) => ipcRenderer.invoke('ai:getConfig', petModelId),
    saveConfig: (config, petModelId) => ipcRenderer.invoke('ai:saveConfig', config, petModelId),
    chat: (request) => ipcRenderer.invoke('ai:chat', request),
    getConversation: (id, petModelId) => ipcRenderer.invoke('ai:conversation:get', id, petModelId),
    listConversations: (petModelId) => ipcRenderer.invoke('ai:conversation:list', petModelId),
    createConversation: (title, petModelId) => ipcRenderer.invoke('ai:conversation:create', title, petModelId),
    switchConversation: (id, petModelId) => ipcRenderer.invoke('ai:conversation:switch', id, petModelId),
    clearConversation: (id, petModelId) => ipcRenderer.invoke('ai:conversation:clear', id, petModelId),
    renameConversation: (id, title, petModelId) => ipcRenderer.invoke('ai:conversation:rename', id, title, petModelId),
    deleteConversation: (id, petModelId) => ipcRenderer.invoke('ai:conversation:delete', id, petModelId),
    setMemoryMode: (mode, petModelId) => ipcRenderer.invoke('ai:memory:setMode', mode, petModelId),
    listMemories: (options, petModelId) => ipcRenderer.invoke('ai:memory:list', options, petModelId),
    createMemory: (data, petModelId) => ipcRenderer.invoke('ai:memory:create', data, petModelId),
    updateMemory: (id, data, petModelId) => ipcRenderer.invoke('ai:memory:update', id, data, petModelId),
    forgetMemory: (id, petModelId) => ipcRenderer.invoke('ai:memory:forget', id, petModelId),
    clearMemories: (petModelId) => ipcRenderer.invoke('ai:memory:clear', petModelId),
    onConversationChanged: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('ai:conversationChanged', handler)
      return () => ipcRenderer.removeListener('ai:conversationChanged', handler)
    },
    onMemoryChanged: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('ai:memoryChanged', handler)
      return () => ipcRenderer.removeListener('ai:memoryChanged', handler)
    },
    onChatDelta: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('ai:chatDelta', handler)
      return () => ipcRenderer.removeListener('ai:chatDelta', handler)
    },
    onChatTool: (callback) => {
      const handler = (_event, payload) => callback(payload)
      ipcRenderer.on('ai:chatTool', handler)
      return () => ipcRenderer.removeListener('ai:chatTool', handler)
    }
  },
  // 主题同步：通知主进程切换原生 UI（菜单栏/标题栏）配色
  theme: {
    set: (theme) => ipcRenderer.invoke('theme:set', theme),
    onChanged: (callback) => {
      const handler = (_event, theme) => callback(theme)
      ipcRenderer.on('theme:changed', handler)
      return () => ipcRenderer.removeListener('theme:changed', handler)
    }
  },
  // 语言同步：通知主进程切换托盘/菜单等原生 UI 语言
  language: {
    set: (language) => ipcRenderer.invoke('language:set', language)
  },
  // 订阅工作空间启动进度事件
  // 返回取消订阅函数，调用以移除监听器
  onLaunchProgress: (callback) => {
    const handler = (_event, progress) => callback(progress)
    ipcRenderer.on('workspace:launch-progress', handler)
    return () => ipcRenderer.removeListener('workspace:launch-progress', handler)
  },
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  },
  onNavigate: (callback) => {
    const handler = (_event, view) => callback(view)
    ipcRenderer.on('app:navigate', handler)
    return () => ipcRenderer.removeListener('app:navigate', handler)
  }
})
