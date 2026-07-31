// 进程启动管理模块
// 提供可执行文件启动能力，支持独立子进程模式
// 主进程使用，渲染层通过 IPC 间接调用
const { spawn } = require('child_process')
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

// 启动可执行文件
// exePath: 可执行文件路径
// args: 启动参数，可为字符串或数组
// options: { cwd, detached, ... }
// 返回 Promise<{pid, exePath}>
function launchExe(exePath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    // 验证可执行文件存在
    if (!fs.existsSync(exePath)) {
      reject(new Error(`可执行文件不存在: ${exePath}`))
      return
    }

    const argArr = parseArgs(args)
    const spawnOptions = {
      // detached: true 让子进程独立于父进程，主进程退出不影响子进程
      detached: options.detached ?? true,
      // 不关心子进程输出
      stdio: 'ignore',
      windowsHide: false,
      cwd: options.cwd
    }

    const child = spawn(exePath, argArr, spawnOptions)

    // spawn 事件触发表示进程已成功启动
    child.once('spawn', () => {
      resolve({ pid: child.pid, exePath })
    })

    // error 事件触发表示启动失败
    child.once('error', (err) => {
      reject(err)
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

module.exports = { launchExe, launchExeDetached, launchBatch }
