// 全局快捷键服务
// 为工作空间注册系统级快捷键：按下即启动对应工作空间（主进程直接调用 workspaceEngine，无渲染器发送方）。
// 复用 trayService 的启动守卫与通知，启动进度广播到所有窗口以便渲染层播放启动动画。
const { globalShortcut, BrowserWindow, dialog } = require('electron')
const { workspaceDao } = require('../db/index.cjs')
const workspaceEngine = require('./workspaceEngine.cjs')
const processManager = require('./processManager.cjs')
const trayService = require('./trayService.cjs')
const { t } = require('../i18n.cjs')

let callbacks = null
const launching = new Set()
const registeredShortcuts = new Map()

function shortcutId(accelerator) {
  return String(accelerator || '').trim().toLowerCase()
}

function broadcastProgress(progress) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('workspace:launch-progress', progress)
    }
  }
}

async function launchWorkspaceByShortcut(workspaceId) {
  if (launching.has(workspaceId)) return
  const workspace = workspaceDao.get(workspaceId)
  if (!workspace) return
  launching.add(workspaceId)
  try {
    const paths = (workspace.software || []).map((item) => item.path).filter(Boolean)
    let restartRunning = false
    if (paths.length > 0) {
      try {
        const statuses = await processManager.getExecutableStatuses(paths)
        restartRunning = paths.every((path) => statuses[path])
      } catch (error) {
        console.warn('[shortcut] 无法检查工作空间运行状态:', error.message)
      }
    }

    if (restartRunning) {
      if (callbacks?.showWindow) callbacks.showWindow()
      const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
      const dialogOptions = {
        type: 'question',
        title: t('shortcut.restartTitle'),
        message: t('shortcut.restartMessage', { name: workspace.name }),
        detail: t('shortcut.restartDetail'),
        buttons: [t('shortcut.restart'), t('shortcut.cancel')],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      }
      const result = parent
        ? await dialog.showMessageBox(parent, dialogOptions)
        : await dialog.showMessageBox(dialogOptions)
      if (result.response !== 0) return
    }

    // 唤起主窗口，让用户看到启动动画
    if (callbacks?.showWindow) callbacks.showWindow()
    broadcastProgress({
      phase: 'shortcut_started',
      status: 'running',
      workspaceId
    })
    await workspaceEngine.launchWorkspace(workspace.id, (progress) => {
      broadcastProgress({ ...progress, workspaceId: workspace.id })
    }, { restartRunning })
    trayService.notify(
      t('tray.completeTitle'),
      t('tray.completeBody', { icon: workspace.icon || '🚀', name: workspace.name })
    )
  } catch (error) {
    trayService.notify(
      t('tray.failedTitle'),
      t('tray.failedBody', { name: workspace.name, message: error.message }),
      'error'
    )
  } finally {
    launching.delete(workspaceId)
  }
}

// 保存前校验：同一组合不能分配给多个空间，也不能覆盖其他程序已占用的系统快捷键。
function validateShortcut(accelerator, workspaceId = null) {
  const accel = String(accelerator || '').trim()
  if (!accel) return { valid: true }

  const id = shortcutId(accel)
  const duplicate = workspaceDao.list().find((workspace) =>
    workspace.id !== workspaceId && shortcutId(workspace.shortcut) === id
  )
  if (duplicate) {
    return { valid: false, reason: 'duplicate', workspaceName: duplicate.name }
  }

  // 当前空间已经持有该快捷键时无需重复探测。
  if (registeredShortcuts.get(id)?.workspaceId === workspaceId) return { valid: true }
  // 不再通过“临时注册后立即注销”探测；部分 Windows 环境不会立即释放该组合，
  // 导致随后正式注册失败。真正的系统占用检查由 syncShortcuts 的注册结果负责。
  return { valid: true }
}

// 表单保存前主动探测快捷键是否可被系统注册。
// 已由当前工作空间持有的快捷键直接视为可用；其它组合会短暂注册后立即释放。
function checkShortcutAvailability(accelerator, workspaceId = null) {
  const validation = validateShortcut(accelerator, workspaceId)
  if (!validation.valid || !String(accelerator || '').trim()) return validation

  const accel = String(accelerator).trim()
  const id = shortcutId(accel)
  if (registeredShortcuts.get(id)?.workspaceId === workspaceId) return { valid: true }

  try {
    const registered = globalShortcut.register(accel, () => {})
    if (!registered) return { valid: false, reason: 'occupied' }
    globalShortcut.unregister(accel)
    return { valid: true }
  } catch (_) {
    return { valid: false, reason: 'invalid' }
  }
}

function unregisterManagedShortcuts() {
  for (const accelerator of registeredShortcuts.values()) {
    if (accelerator?.accelerator) globalShortcut.unregister(accelerator.accelerator)
  }
  registeredShortcuts.clear()
}

// 全量同步：只注销本服务持有的快捷键，不影响应用中其他全局快捷键。
function syncShortcuts() {
  unregisterManagedShortcuts()
  const workspaces = workspaceDao.list()
  const used = new Set()
  const failures = []
  for (const workspace of workspaces) {
    const accel = String(workspace.shortcut || '').trim()
    if (!accel) continue
    const id = shortcutId(accel)
    // 同一快捷键被多个工作空间共用时，只保留第一个
    if (used.has(id)) {
      failures.push({ workspaceId: workspace.id, accelerator: accel, reason: 'duplicate' })
      continue
    }
    used.add(id)
    try {
      const registered = globalShortcut.register(accel, () => {
        launchWorkspaceByShortcut(workspace.id).catch((error) => {
          console.error('[shortcut] 启动工作空间失败:', workspace.id, error)
        })
      })
      if (!registered) {
        console.warn('[shortcut] 快捷键被占用，注册失败:', accel)
        failures.push({ workspaceId: workspace.id, accelerator: accel, reason: 'occupied' })
      } else {
        registeredShortcuts.set(id, { workspaceId: workspace.id, accelerator: accel })
      }
    } catch (error) {
      console.warn('[shortcut] 无效快捷键:', accel, error.message)
      failures.push({ workspaceId: workspace.id, accelerator: accel, reason: 'invalid' })
    }
  }
  return failures
}

function unregisterAll() {
  unregisterManagedShortcuts()
}

function init(nextCallbacks) {
  callbacks = nextCallbacks
}

function getStatus() {
  return workspaceDao.list()
    .filter((workspace) => workspace.shortcut)
    .map((workspace) => {
      const accelerator = String(workspace.shortcut).trim()
      const registration = registeredShortcuts.get(shortcutId(accelerator))
      return {
        workspaceId: workspace.id,
        accelerator,
        registered: registration?.workspaceId === workspace.id &&
          globalShortcut.isRegistered(registration.accelerator)
      }
    })
}

module.exports = {
  init,
  syncShortcuts,
  unregisterAll,
  validateShortcut,
  checkShortcutAvailability,
  getStatus
}
