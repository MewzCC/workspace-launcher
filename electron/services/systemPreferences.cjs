const { app } = require('electron')
const { execFileSync } = require('child_process')
const path = require('path')
const { settingsDao } = require('../db/index.cjs')

const WINDOWS_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const LOGIN_ITEM_NAME = 'LaunchPad'

function loginArgs(startMinimized) {
  return startMinimized ? ['--hidden'] : []
}

function readWindowsLoginCommand() {
  if (process.platform !== 'win32') return null
  try {
    const output = execFileSync(
      'reg.exe',
      ['query', WINDOWS_RUN_KEY, '/v', LOGIN_ITEM_NAME],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const match = output.match(/\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)$/mi)
    return match ? match[1].trim() : null
  } catch (_) {
    return null
  }
}

function executableFromCommand(command) {
  const value = String(command || '').trim()
  const match = value.match(/^"([^"]+\.exe)"|^(.+?\.exe)(?:\s|$)/i)
  return match ? (match[1] || match[2]) : ''
}

function isCurrentExecutableCommand(command) {
  const executable = executableFromCommand(command)
  if (!executable) return false
  return path.normalize(executable).toLowerCase() === path.normalize(process.execPath).toLowerCase()
}

function isExpectedLoginCommand(command, startMinimized) {
  if (!isCurrentExecutableCommand(command)) return false
  const hasHiddenArgument = /(?:^|\s)--hidden(?:\s|$)/i.test(String(command || ''))
  return hasHiddenArgument === Boolean(startMinimized)
}

function writeWindowsLoginCommand(openAtLogin, startMinimized) {
  if (openAtLogin) {
    const command = `"${process.execPath}"${startMinimized ? ' --hidden' : ''}`
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Set-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'LaunchPad' -Value $env:LAUNCHPAD_LOGIN_COMMAND -Type String"
      ],
      {
        windowsHide: true,
        stdio: 'ignore',
        env: { ...process.env, LAUNCHPAD_LOGIN_COMMAND: command }
      }
    )
  } else {
    try {
      execFileSync(
        'reg.exe',
        ['delete', WINDOWS_RUN_KEY, '/v', LOGIN_ITEM_NAME, '/f'],
        { windowsHide: true, stdio: 'ignore' }
      )
    } catch (_) {
      // 启动项本来就不存在时同样视为关闭成功。
    }
  }
}

function applyLoginItem(openAtLogin, startMinimized) {
  if (process.platform !== 'win32') {
    throw new Error('当前版本仅支持在 Windows 中设置开机启动')
  }
  if (!app.isPackaged) {
    throw new Error('开机启动只能在安装版或便携版 LaunchPad 中设置')
  }
  let electronError = null
  try {
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: loginArgs(startMinimized),
      name: LOGIN_ITEM_NAME
    })
  } catch (error) {
    electronError = error
  }

  const electronSucceeded = openAtLogin
    ? isExpectedLoginCommand(readWindowsLoginCommand(), startMinimized)
    : readWindowsLoginCommand() == null
  if (!electronSucceeded) writeWindowsLoginCommand(openAtLogin, startMinimized)

  const verified = openAtLogin
    ? isExpectedLoginCommand(readWindowsLoginCommand(), startMinimized)
    : readWindowsLoginCommand() == null
  if (!verified) {
    throw new Error(electronError?.message || 'Windows 启动项写入后校验失败')
  }
}

function getPreferences() {
  const stored = settingsDao.getAll()
  let loginStatus = null
  let registryCommand = null
  if (process.platform === 'win32' && app.isPackaged) {
    loginStatus = app.getLoginItemSettings({
      path: process.execPath,
      args: loginArgs(stored.startMinimized)
    })
    registryCommand = readWindowsLoginCommand()
  }
  const openAtLogin = loginStatus
    ? (loginStatus.openAtLogin || isCurrentExecutableCommand(registryCommand))
    : stored.openAtLogin
  if (openAtLogin !== stored.openAtLogin) settingsDao.set('openAtLogin', openAtLogin)
  return {
    ...stored,
    openAtLogin,
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
  const openAtLogin = getPreferences().openAtLogin
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
