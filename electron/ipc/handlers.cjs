// IPC 处理器注册模块
// 在 app ready 时调用 registerIpcHandlers() 注册所有 ipcMain.handle 处理器
// 处理器内部用 try/catch 包裹，异常返回 {error: message}
const { ipcMain, dialog, BrowserWindow, app, shell } = require('electron')
const db = require('../db/index.cjs')
const softwareScanner = require('../services/softwareScanner.cjs')
const workspaceEngine = require('../services/workspaceEngine.cjs')
const processManager = require('../services/processManager.cjs')
const perfMonitor = require('../services/perfMonitor.cjs')
const systemPreferences = require('../services/systemPreferences.cjs')
const trayService = require('../services/trayService.cjs')
const shortcutService = require('../services/shortcutService.cjs')
const storageService = require('../services/storageService.cjs')
const updateService = require('../services/updateService.cjs')

const { workspaceDao, softwareDao, batScriptDao, scriptDao, logDao } = db
const { t } = require('../i18n.cjs')

// 通用错误包装：将处理器的异常转为 {error} 对象
// 处理器可以是同步或异步函数
async function wrap(fn) {
  try {
    return await fn()
  } catch (err) {
    console.error('[IPC] handler error:', err)
    return { error: err.message }
  }
}

// 图标缓存：filePath(小写) -> dataURL
// 进程内缓存，避免重复提取（app.getFileIcon 对同一文件会走系统缓存，但仍可省去 IPC + 编码开销）
const iconCache = new Map()
let activeSoftwareScan = null

async function runSoftwareScan(task) {
  if (activeSoftwareScan) activeSoftwareScan.controller.abort()
  const controller = new AbortController()
  const token = Symbol('software-scan')
  activeSoftwareScan = { controller, token }
  try {
    return await task(controller.signal)
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      return { cancelled: true }
    }
    throw error
  } finally {
    if (activeSoftwareScan?.token === token) activeSoftwareScan = null
  }
}

// 注册所有 IPC 处理器（在 app ready 时调用一次）
function registerIpcHandlers() {
  // ===== 工作空间 =====
  ipcMain.handle('workspace:list', () => wrap(() => workspaceDao.list()))
  ipcMain.handle('workspace:get', (_e, id) => wrap(() => workspaceDao.get(id)))
  ipcMain.handle('workspace:create', (_e, data) => wrap(() => {
    const validation = shortcutService.validateShortcut(data?.shortcut)
    if (!validation.valid) {
      const key = validation.reason === 'duplicate'
        ? 'errors.shortcutDuplicate'
        : validation.reason === 'occupied'
          ? 'errors.shortcutOccupied'
          : 'errors.shortcutInvalid'
      throw new Error(t(key, { name: validation.workspaceName || '' }))
    }
    const result = workspaceDao.create(data)
    trayService.refreshTrayMenu()
    const failure = shortcutService.syncShortcuts().find((item) => item.workspaceId === result.id)
    if (failure) {
      // 快捷键未真正注册时不保留“看似成功”的配置。
      workspaceDao.remove(result.id)
      shortcutService.syncShortcuts()
      trayService.refreshTrayMenu()
      const key = failure.reason === 'occupied'
        ? 'errors.shortcutOccupied'
        : 'errors.shortcutInvalid'
      throw new Error(t(key))
    }
    return result
  }))
  ipcMain.handle('workspace:update', (_e, id, data) => wrap(() => {
    const workspaceId = Number(id)
    const validation = shortcutService.validateShortcut(data?.shortcut, workspaceId)
    if (!validation.valid) {
      const key = validation.reason === 'duplicate'
        ? 'errors.shortcutDuplicate'
        : validation.reason === 'occupied'
          ? 'errors.shortcutOccupied'
          : 'errors.shortcutInvalid'
      throw new Error(t(key, { name: validation.workspaceName || '' }))
    }
    const previousShortcut = workspaceDao.get(workspaceId)?.shortcut || ''
    const result = workspaceDao.update(workspaceId, data)
    trayService.refreshTrayMenu()
    const failure = shortcutService.syncShortcuts().find((item) => item.workspaceId === workspaceId)
    if (failure) {
      workspaceDao.updateShortcut(workspaceId, previousShortcut)
      shortcutService.syncShortcuts()
      const key = failure.reason === 'occupied'
        ? 'errors.shortcutOccupied'
        : 'errors.shortcutInvalid'
      throw new Error(t(key))
    }
    return result
  }))
  ipcMain.handle('workspace:delete', (_e, id) => wrap(() => {
    const result = workspaceDao.remove(id)
    trayService.refreshTrayMenu()
    shortcutService.syncShortcuts()
    return result
  }))
  ipcMain.handle('workspace:launch', async (e, workspaceId, options) => {
    return wrap(async () => {
      const win = BrowserWindow.fromWebContents(e.sender)
      const onProgress = (progress) => {
        // 窗口可能已关闭，需检查 isDestroyed
        if (win && !win.isDestroyed()) {
          win.webContents.send('workspace:launch-progress', progress)
        }
      }
      await workspaceEngine.launchWorkspace(workspaceId, onProgress, options || {})
      return { success: true }
    })
  })
  ipcMain.handle('shortcut:status', () => wrap(() => shortcutService.getStatus()))
  ipcMain.handle('shortcut:validate', (_e, accelerator, workspaceId) =>
    wrap(() => shortcutService.checkShortcutAvailability(accelerator, workspaceId ?? null))
  )

  // ===== 软件 =====
  ipcMain.handle('software:list', () => wrap(() => softwareDao.list()))
  ipcMain.handle('software:get', (_e, id) => wrap(() => softwareDao.get(id)))
  ipcMain.handle('software:create', (_e, data) => wrap(() => softwareDao.create(data)))
  ipcMain.handle('software:update', (_e, id, data) => wrap(() => softwareDao.update(id, data)))
  ipcMain.handle('software:delete', (_e, id) => wrap(() => softwareDao.remove(id)))
  ipcMain.handle('software:testLaunch', async (_e, id) => {
    return wrap(async () => {
      const software = softwareDao.get(id)
      if (!software) {
        return { success: false, message: t('errors.softwareNotExist') }
      }
      try {
        await processManager.launchExe(software.path, software.args)
        return { success: true, message: t('engine.launchSuccess', { name: software.name }) }
      } catch (err) {
        return { success: false, message: err.message }
      }
    })
  })
  ipcMain.handle('software:getProcessStatuses', (_e, exePaths) =>
    wrap(() => processManager.getExecutableStatuses(exePaths))
  )
  ipcMain.handle('process:list', (_e, options) =>
    wrap(() => processManager.listProcessPage(options))
  )
  ipcMain.handle('process:terminate', (_e, pid) =>
    wrap(() => processManager.terminateProcessTree(pid))
  )
  // 性能监视：返回 CPU / 内存 / 磁盘 / GPU 快照（渲染层仅在性能页可见时轮询）
  ipcMain.handle('perf:snapshot', () => wrap(() => perfMonitor.getSnapshot()))
  // 性能监视：内存 / GPU 占用排行（渲染层在内存/GPU 页时轮询）
  ipcMain.handle('perf:topProcesses', () => wrap(() => perfMonitor.getTopProcesses()))
  ipcMain.handle('software:scan', async () =>
    wrap(() => runSoftwareScan((signal) => softwareScanner.scanAll(null, { signal })))
  )
  ipcMain.handle('software:cancelScan', () => wrap(() => {
    if (!activeSoftwareScan) return { success: true, active: false }
    activeSoftwareScan.controller.abort()
    return { success: true, active: true }
  }))
  ipcMain.handle('software:searchInstalled', (_e, query) =>
    wrap(() => softwareScanner.searchInstalledApplications(query))
  )
  ipcMain.handle('software:bulkCreate', (_e, items) => wrap(() => softwareDao.bulkCreate(items)))
  ipcMain.handle('software:createValidated', (_e, data) => {
    return wrap(async () => {
      const launch = await processManager.launchExe(data.path, data.args)
      const software = softwareDao.create(data)
      return { success: true, software, launch }
    })
  })
  ipcMain.handle('software:updateValidated', (_e, id, data) => {
    return wrap(async () => {
      const launch = await processManager.launchExe(data.path, data.args)
      const software = softwareDao.update(id, data)
      return { success: true, software, launch }
    })
  })
  ipcMain.handle('software:bulkCreateValidated', (_e, items) => {
    return wrap(async () => {
      if (!Array.isArray(items) || items.length === 0) {
        return { success: true, created: [], failed: [] }
      }
      if (items.length > 20) {
        throw new Error(t('errors.bulkLimit'))
      }

      const created = []
      const failed = []
      for (const item of items) {
        try {
          await processManager.launchExe(item.path, item.args)
          created.push(softwareDao.create(item))
        } catch (err) {
          failed.push({
            name: item.name || item.path,
            path: item.path,
            error: err.message
          })
        }
      }
      return { success: true, created, failed }
    })
  })
  // 获取可用盘符列表
  ipcMain.handle('software:getDrives', () => wrap(() => softwareScanner.getAvailableDrives()))
  // 扫描指定盘符的 .exe 文件
  // 参数: driveLetter(如 'D'), options(可选 {maxDepth})
  ipcMain.handle('software:scanDrive', (_e, driveLetter, options) =>
    wrap(() => runSoftwareScan((signal) =>
      softwareScanner.scanDrive(driveLetter, null, { ...(options || {}), signal })
    ))
  )
  // 扫描指定目录的 .exe 文件
  // 参数: dirPath(如 'D:\\Tools'), options(可选 {maxDepth})
  ipcMain.handle('software:scanDirectory', (_e, dirPath, options) =>
    wrap(() => runSoftwareScan((signal) =>
      softwareScanner.scanExeFiles(dirPath, null, { ...(options || {}), signal })
    ))
  )
  // 提取文件图标：返回 data URL（PNG base64）
  // 对 .exe 直接提取图标；对 .lnk 自动解析为目标文件的图标
  // 带进程内缓存，同一路径只提取一次
  ipcMain.handle('software:getIcon', async (_e, filePath) => {
    return wrap(async () => {
      if (!filePath) return null
      const cacheKey = filePath.toLowerCase()
      if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)
      try {
        // size: 'normal' = 32x32，兼顾清晰度与内存
        const icon = await app.getFileIcon(filePath, { size: 'normal' })
        const dataUrl = icon.toDataURL()
        iconCache.set(cacheKey, dataUrl)
        return dataUrl
      } catch (e) {
        // 提取失败返回 null，前端会回退到 emoji 图标
        return null
      }
    })
  })
  // 批量提取多个文件图标：返回 { [filePath]: dataURL }
  // 用于扫描结果列表的批量加载，减少 IPC 往返
  ipcMain.handle('software:getIcons', async (_e, filePaths) => {
    return wrap(async () => {
      if (!Array.isArray(filePaths) || filePaths.length === 0) return {}
      const result = {}
      // 并发提取（app.getFileIcon 内部有系统缓存，并发安全）
      const tasks = filePaths.map(async (fp) => {
        if (!fp) return
        const key = fp.toLowerCase()
        if (iconCache.has(key)) {
          result[fp] = iconCache.get(key)
          return
        }
        try {
          const icon = await app.getFileIcon(fp, { size: 'normal' })
          const dataUrl = icon.toDataURL()
          iconCache.set(key, dataUrl)
          result[fp] = dataUrl
        } catch (_) {
          // 失败的项不包含在结果中，前端回退到 emoji
        }
      })
      await Promise.all(tasks)
      return result
    })
  })

  // ===== BAT 脚本库 =====
  ipcMain.handle('batScript:list', () => wrap(() => batScriptDao.list()))
  ipcMain.handle('batScript:listByWorkspace', (_e, workspaceId) =>
    wrap(() => batScriptDao.listByWorkspace(workspaceId))
  )
  ipcMain.handle('batScript:setWorkspaceScripts', (_e, workspaceId, items) =>
    wrap(() => batScriptDao.setForWorkspace(workspaceId, items))
  )
  ipcMain.handle('batScript:create', (_e, data) => wrap(() => batScriptDao.create(data)))
  ipcMain.handle('batScript:update', (_e, id, data) => wrap(() => batScriptDao.update(id, data)))
  ipcMain.handle('batScript:delete', (_e, id) => wrap(() => batScriptDao.remove(id)))
  ipcMain.handle('batScript:run', (_e, id) => {
    return wrap(async () => {
      const script = batScriptDao.get(id)
      if (!script) throw new Error(t('errors.scriptNotExist'))
      await processManager.launchBatch(script.path, script.args)
      return { success: true, message: t('engine.batchStarted', { name: script.name }) }
    })
  })

  // ===== 脚本 =====
  ipcMain.handle('script:listByWorkspace', (_e, workspaceId) =>
    wrap(() => scriptDao.listByWorkspace(workspaceId))
  )
  ipcMain.handle('script:upsert', (_e, data) => wrap(() => scriptDao.upsert(data)))

  // ===== 日志 =====
  ipcMain.handle('logs:list', (_e, workspaceId, limit) =>
    wrap(() => {
      if (workspaceId) {
        return logDao.listByWorkspace(workspaceId, limit)
      }
      return logDao.listRecent(limit)
    })
  )
  ipcMain.handle('logs:listAll', (_e, limit) => wrap(() => logDao.listAll(limit)))
  ipcMain.handle('update:status', () => wrap(() => updateService.getStatus()))
  ipcMain.handle('update:check', () => wrap(() => updateService.checkForUpdates()))
  ipcMain.handle('update:download', () => wrap(() => updateService.downloadUpdate()))
  ipcMain.handle('update:install', () => wrap(() => updateService.installUpdate()))
  ipcMain.handle('update:lastResult', () => wrap(() => updateService.getLastUpdate()))
  ipcMain.handle('update:clearLastResult', () => wrap(() => {
    updateService.clearLastUpdate()
    return { success: true }
  }))
  ipcMain.handle('releases:list', () => wrap(() => updateService.getReleaseHistory()))
  ipcMain.handle('releases:download', async (_e, url) => wrap(async () => {
    const allowed = String(url || '').startsWith(
      'https://github.com/MewzCC/workspace-launcher/releases/download/'
    )
    if (!allowed) throw new Error(t('errors.externalBlocked'))
    await shell.openExternal(url)
    return { success: true }
  }))
  ipcMain.handle('storage:info', () => wrap(() => storageService.getInfo()))
  ipcMain.handle('storage:open', async () => wrap(async () => {
    const info = storageService.getInfo()
    const error = await shell.openPath(info.directory)
    if (error) throw new Error(error)
    return { success: true, path: info.directory }
  }))

  // ===== 对话框 =====
  ipcMain.handle('dialog:openFile', async (_e, filters) => {
    return wrap(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters || [{ name: t('errors.exeFilter'), extensions: ['exe'] }]
      })
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    })
  })
  // 批量选择多个文件（用于软件库批量添加）
  ipcMain.handle('dialog:openFiles', async (_e, filters) => {
    return wrap(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: filters || [{ name: t('errors.exeFilter'), extensions: ['exe'] }]
      })
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return []
      }
      return result.filePaths
    })
  })
  // 选择目录（用于盘符扫描时选择子目录）
  ipcMain.handle('dialog:openDirectory', async () => {
    return wrap(async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      })
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null
      }
      return result.filePaths[0]
    })
  })

  // ===== 安全外链 =====
  ipcMain.handle('external:open', async (_e, rawUrl) => {
    return wrap(async () => {
      const url = new URL(rawUrl)
      if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
        throw new Error(t('errors.externalBlocked'))
      }
      await shell.openExternal(url.toString())
      return { success: true }
    })
  })

  // ===== 系统与启动 =====
  ipcMain.handle('system:getPreferences', () => wrap(() => systemPreferences.getPreferences()))
  ipcMain.handle('system:setOpenAtLogin', (_e, enabled) => wrap(() => {
    const result = systemPreferences.setOpenAtLogin(enabled)
    trayService.refreshTrayMenu()
    return result
  }))
  ipcMain.handle('system:setStartMinimized', (_e, enabled) =>
    wrap(() => systemPreferences.setStartMinimized(enabled))
  )
  ipcMain.handle('system:setCloseToTray', (_e, enabled) =>
    wrap(() => systemPreferences.setCloseToTray(enabled))
  )
  ipcMain.handle('system:setKillBeforeLaunch', (_e, enabled) =>
    wrap(() => systemPreferences.setKillBeforeLaunch(enabled))
  )
}

module.exports = { registerIpcHandlers }
