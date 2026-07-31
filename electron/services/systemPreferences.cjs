const { app } = require('electron')
const { settingsDao } = require('../db/index.cjs')

function loginArgs(startMinimized) {
  return startMinimized ? ['--hidden'] : []
}

function applyLoginItem(openAtLogin, startMinimized) {
  if (process.platform !== 'win32') {
    throw new Error('当前版本仅支持在 Windows 中设置开机启动')
  }
  if (!app.isPackaged) {
    throw new Error('开机启动只能在安装版或便携版 LaunchPad 中设置')
  }
  app.setLoginItemSettings({
    openAtLogin,
    path: process.execPath,
    args: loginArgs(startMinimized),
    name: 'LaunchPad'
  })
}

function getPreferences() {
  const stored = settingsDao.getAll()
  let loginStatus = null
  if (process.platform === 'win32' && app.isPackaged) {
    loginStatus = app.getLoginItemSettings({
      path: process.execPath,
      args: loginArgs(stored.startMinimized)
    })
  }
  return {
    ...stored,
    openAtLogin: loginStatus ? loginStatus.openAtLogin : stored.openAtLogin,
    loginSupported: process.platform === 'win32',
    packaged: app.isPackaged,
    wasOpenedAtLogin: Boolean(loginStatus?.wasOpenedAtLogin)
  }
}

function setOpenAtLogin(enabled) {
  const value = Boolean(enabled)
  const startMinimized = settingsDao.get('startMinimized')
  applyLoginItem(value, startMinimized)
  settingsDao.set('openAtLogin', value)
  return getPreferences()
}

function setStartMinimized(enabled) {
  const value = Boolean(enabled)
  const openAtLogin = settingsDao.get('openAtLogin')
  if (openAtLogin) applyLoginItem(true, value)
  settingsDao.set('startMinimized', value)
  return getPreferences()
}

function setCloseToTray(enabled) {
  settingsDao.set('closeToTray', Boolean(enabled))
  return getPreferences()
}

function setKillBeforeLaunch(enabled) {
  settingsDao.set('killBeforeLaunch', Boolean(enabled))
  return getPreferences()
}

function syncLoginItem() {
  const prefs = settingsDao.getAll()
  if (prefs.openAtLogin && process.platform === 'win32' && app.isPackaged) {
    applyLoginItem(true, prefs.startMinimized)
  }
}

module.exports = {
  getPreferences,
  setOpenAtLogin,
  setStartMinimized,
  setCloseToTray,
  setKillBeforeLaunch,
  syncLoginItem
}
