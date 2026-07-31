// 进程启动管理模块
// 提供可执行文件启动能力，支持独立子进程模式
// 主进程使用，渲染层通过 IPC 间接调用
const { spawn } = require('child_process')
const { shell } = require('electron')
const fs = require('fs')
const path = require('path')

// 解析 args 参数到数组
// 支持字符串（按空格分割）和数组两种形式
function parseArgs(args) {
  if (args == null) return []
  if (Array.isArray(args)) return args
  if (typeof args === 'string') {
    // 简单按空格分割，复杂场景请直接传数组
    return args.split(/\s+/).filter(Boolean)
  }
  return []
}

function validateExecutablePath(exePath) {
  const normalizedPath = String(exePath || '').trim()
  if (!normalizedPath) throw new Error('请选择可执行文件')
  if (path.extname(normalizedPath).toLowerCase() !== '.exe') {
    throw new Error('仅支持添加 .exe 可执行文件')
  }
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`可执行文件不存在: ${normalizedPath}`)
  }
  const stat = fs.statSync(normalizedPath)
  if (!stat.isFile()) throw new Error(`路径不是文件: ${normalizedPath}`)
  return normalizedPath
}

function friendlyLaunchError(err, exePath, shellError = '') {
  const code = err?.code || 'UNKNOWN'
  if (code === 'EACCES' || code === 'EPERM') {
    const detail = shellError ? `；系统 Shell 返回：${shellError}` : ''
    return new Error(`Windows 拒绝启动该程序（${code}），可能需要管理员权限、文件被安全软件拦截或程序已损坏${detail}: ${exePath}`)
  }
  return new Error(`程序启动失败（${code}）: ${err?.message || exePath}`)
}

// 启动可执行文件
// exePath: 可执行文件路径
// args: 启动参数，可为字符串或数组
// options: { cwd, detached, ... }
// 返回 Promise<{pid, exePath}>
function launchExe(exePath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    let targetPath
    try {
      targetPath = validateExecutablePath(exePath)
    } catch (err) {
      reject(err)
      return
    }

    const argArr = parseArgs(args)
    const spawnOptions = {
      // detached: true 让子进程独立于父进程，主进程退出不影响子进程
      detached: options.detached ?? true,
      // 不关心子进程输出
      stdio: 'ignore',
      windowsHide: false,
      cwd: options.cwd || path.dirname(targetPath)
    }

    const child = spawn(targetPath, argArr, spawnOptions)

    // spawn 事件触发表示进程已成功启动
    child.once('spawn', () => {
      child.unref()
      resolve({ pid: child.pid, exePath: targetPath, method: 'spawn' })
    })

    // error 事件触发表示启动失败
    child.once('error', async (err) => {
      // 部分需要 UAC 或由 Windows Shell 处理的 GUI 程序会让 CreateProcess
      // 返回 EACCES/EPERM。无启动参数时回退到 ShellExecute，避免误判为坏程序。
      if (process.platform === 'win32' && argArr.length === 0 && ['EACCES', 'EPERM'].includes(err.code)) {
        try {
          const shellError = await shell.openPath(targetPath)
          if (!shellError) {
            resolve({ pid: null, exePath: targetPath, method: 'shell' })
            return
          }
          reject(friendlyLaunchError(err, targetPath, shellError))
        } catch (shellErr) {
          reject(friendlyLaunchError(err, targetPath, shellErr.message))
        }
        return
      }
      reject(friendlyLaunchError(err, targetPath))
    })
  })
}

// 启动可执行文件并完全独立（调用 unref 让子进程脱离父进程生命周期）
// 与 launchExe 的区别：调用 unref() 后父进程可独立退出，子进程继续运行
// 返回 Promise<{pid, exePath}>
function launchExeDetached(exePath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(exePath)) {
      reject(new Error(`可执行文件不存在: ${exePath}`))
      return
    }

    const argArr = parseArgs(args)
    const spawnOptions = {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: options.cwd
    }

    const child = spawn(exePath, argArr, spawnOptions)
    // 让子进程完全独立，父进程退出不会等待子进程
    child.unref()

    child.once('spawn', () => {
      resolve({ pid: child.pid, exePath })
    })

    child.once('error', (err) => {
      reject(err)
    })
  })
}

function launchBatch(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`脚本文件不存在: ${scriptPath}`))
      return
    }
    if (!/\.(bat|cmd)$/i.test(scriptPath)) {
      reject(new Error('仅支持执行 .bat 或 .cmd 脚本'))
      return
    }

    const cmdExe = process.env.ComSpec || 'cmd.exe'
    const argArr = parseArgs(args)
    const child = spawn(
      cmdExe,
      ['/d', '/s', '/c', 'call', scriptPath, ...argArr],
      {
        cwd: path.dirname(scriptPath),
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      }
    )

    child.once('spawn', () => {
      child.unref()
      resolve({ pid: child.pid, scriptPath })
    })
    child.once('error', reject)
  })
}

module.exports = { launchExe, launchExeDetached, launchBatch, validateExecutablePath }
