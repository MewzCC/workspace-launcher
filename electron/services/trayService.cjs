const { Menu, Tray, nativeImage } = require('electron')
const { workspaceDao } = require('../db/index.cjs')
const workspaceEngine = require('./workspaceEngine.cjs')
const systemPreferences = require('./systemPreferences.cjs')

const TRAY_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAKMSURBVFhH1Ze/axRBFMdTWqZMKWIrWIpV/A/sTGaQze1GOQJKCPgDEbzGwsZrlGCTRjAWSjSCQRsVAimDBNROEWJAwUTwOAjmPfnO7M83+zO3Fn7hw8HN2/nOvHkzszs29r9qVtOpQPNkGhnTqjyPJ3xFXV/RWqCZi/AVbXQ0X/fO8VHZx6HkeTweaO4FiobSrBpaxMBln7VlUqto1+24AYqG/jRNyb4r5SueOdysC+lJj0IZc7eD0VHUl16OwrS3OfMMKGTpGQsFM/Kap7g2b8n8r2g4q/ik9DZCimQnTVmYY37+lPnHdza6d9eNCTStSO9o9iOl/uWqNY20v8/cnXHjgJMFHB4yqC6XLjB/+mBN8QtjaOu9G5tAi5kB4ARzg6rp3bDphunNK/Y/DGhvj/nhkhsfo2gnNg9POzeogv6dZLbr77Jtqyu2HuQzaeJlCC8WJ6AMrG1UaBBmnF7v+333GUl8QvrTfFY2VvF6LTGP9G3b7oAXz9z4PDqa5qP178rGMm7fktaJkImq1KewxzNSkdNYyM62tLVCPaAuZHwR2HlmAOELhROQR9HsUQ/YETK+DNw50S6YkI1FYI2lsN+x9WRsFSj+cCMiC/RZBuTx9UtiPBgwP3nsxtRC0dDz+EgygIp7YOryH164SsYYg1h6UHzM1kPcBzgU3CALzI9v7vKxrZ985tVv1nMHTkxTsPUzA4AwKhnY8YhPvP1lzE8/GrRjrmlTehvlZQGmbRlH5M4+UvpWPH/xoFVji7gF8xRoWnYfHB3cuJnKLxKC2h5EaD4uvUplPkhyOmuO+UCpnnmecEz7it64ndaBPpYWXBPZK5uW67w34vsxPuf/hZCVcLdgidJMNk31X6ARJ45OPQzIAAAAAElFTkSuQmCC'

let tray = null
let callbacks = null
const launching = new Set()

function notify(title, content, iconType = 'info') {
  if (!tray || tray.isDestroyed()) return
  if (process.platform === 'win32') {
    tray.displayBalloon({ title, content, iconType, respectQuietTime: true })
  }
}

async function launchWorkspaceFromTray(workspace) {
  if (launching.has(workspace.id)) return
  launching.add(workspace.id)
  refreshTrayMenu()
  tray.setToolTip(`LaunchPad · 正在启动 ${workspace.name}`)
  try {
    await workspaceEngine.launchWorkspace(workspace.id)
    notify('工作空间启动完成', `${workspace.icon || '🚀'} ${workspace.name} 已完成一键启动`)
  } catch (error) {
    notify('工作空间启动失败', `${workspace.name}: ${error.message}`, 'error')
  } finally {
    launching.delete(workspace.id)
    tray.setToolTip('LaunchPad · 一键启动工作空间')
    refreshTrayMenu()
  }
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return
  const workspaces = workspaceDao.list()
  const prefs = systemPreferences.getPreferences()
  const workspaceItems = workspaces.length
    ? workspaces.map((workspace) => ({
        label: `${workspace.icon || '🚀'} ${workspace.name}${launching.has(workspace.id) ? '（启动中…）' : ''}`,
        enabled: !launching.has(workspace.id),
        click: () => launchWorkspaceFromTray(workspace)
      }))
    : [{ label: '暂无工作空间', enabled: false }]

  const menu = Menu.buildFromTemplate([
    { label: '打开 LaunchPad', click: callbacks.showWindow },
    { type: 'separator' },
    { label: '一键启动工作空间', submenu: workspaceItems },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: prefs.openAtLogin,
      enabled: prefs.packaged && prefs.loginSupported,
      click: async (item) => {
        try {
          systemPreferences.setOpenAtLogin(item.checked)
        } catch (error) {
          notify('开机启动设置失败', error.message, 'error')
        } finally {
          refreshTrayMenu()
        }
      }
    },
    { type: 'separator' },
    { label: '退出 LaunchPad', click: callbacks.quitApp }
  ])
  tray.setContextMenu(menu)
}

function createTray(nextCallbacks) {
  if (tray && !tray.isDestroyed()) return tray
  callbacks = nextCallbacks
  const icon = nativeImage
    .createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
    .resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('LaunchPad · 一键启动工作空间')
  tray.on('click', callbacks.toggleWindow)
  refreshTrayMenu()
  return tray
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = null
}

function hasTray() {
  return Boolean(tray && !tray.isDestroyed())
}

module.exports = { createTray, destroyTray, hasTray, refreshTrayMenu, notify }
