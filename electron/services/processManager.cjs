// 进程启动管理模块
// 提供可执行文件启动能力，支持独立子进程模式
// 主进程使用，渲染层通过 IPC 间接调用
const { spawn, execFile } = require('child_process')
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

function terminateByExecutablePath(exePath) {
  return new Promise((resolve, reject) => {
    let targetPath
    try {
      targetPath = validateExecutablePath(exePath)
    } catch (err) {
      reject(err)
      return
    }
    if (targetPath.toLowerCase() === process.execPath.toLowerCase()) {
      reject(new Error('已阻止结束 LaunchPad 自身进程'))
      return
    }
    if (process.platform !== 'win32') {
      resolve({ killed: 0, exePath: targetPath })
      return
    }

    const script = [
      "$target = $env:LAUNCHPAD_TARGET_EXE",
      "$matched = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $target, [StringComparison]::OrdinalIgnoreCase) })",
      "$count = 0",
      "foreach ($proc in $matched) { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop; $count++ }",
      "Write-Output $count"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 10000,
        env: { ...process.env, LAUNCHPAD_TARGET_EXE: targetPath }
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`无法结束已有进程: ${String(stderr || err.message).trim()}`))
          return
        }
        resolve({ killed: Math.max(0, Number.parseInt(String(stdout).trim(), 10) || 0), exePath: targetPath })
      }
    )
  })
}

function getExecutableStatuses(exePaths = []) {
  return new Promise((resolve, reject) => {
    const targets = [...new Set(
      (Array.isArray(exePaths) ? exePaths : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )]

    if (targets.length === 0) {
      resolve({})
      return
    }

    if (process.platform !== 'win32') {
      resolve(Object.fromEntries(targets.map((target) => [target, false])))
      return
    }

    const script = [
      "$targets = ConvertFrom-Json $env:LAUNCHPAD_PROCESS_PATHS",
      "$running = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath } | ForEach-Object { $_.ExecutablePath })",
      "$result = [ordered]@{}",
      "foreach ($target in $targets) { $result[[string]$target] = @($running | Where-Object { [string]::Equals($_, [string]$target, [StringComparison]::OrdinalIgnoreCase) }).Count -gt 0 }",
      "$result | ConvertTo-Json -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 10000,
        env: {
          ...process.env,
          LAUNCHPAD_PROCESS_PATHS: JSON.stringify(targets)
        }
      },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`无法读取进程状态: ${String(stderr || err.message).trim()}`))
          return
        }

        try {
          const parsed = JSON.parse(String(stdout || '{}').trim() || '{}')
          resolve(Object.fromEntries(targets.map((target) => [target, Boolean(parsed[target])])))
        } catch (parseError) {
          reject(new Error(`无法解析进程状态: ${parseError.message}`))
        }
      }
    )
  })
}

const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'winlogon.exe'
])

function isProtectedProcess(item) {
  const pid = Number(item?.pid)
  const name = String(item?.name || '').toLowerCase()
  const exePath = String(item?.path || '').toLowerCase()
  return (
    !Number.isInteger(pid) ||
    pid <= 4 ||
    PROTECTED_PROCESS_NAMES.has(name) ||
    Boolean(exePath && exePath === process.execPath.toLowerCase())
  )
}

function listProcessesWithPorts() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      resolve([])
      return
    }

    const script = [
      "$portMap = @{}",
      "$addEndpoint = { param($pidValue, $protocol, $address, $port) $key = [string]$pidValue; if (-not $portMap.ContainsKey($key)) { $portMap[$key] = New-Object System.Collections.ArrayList }; $endpoint = [ordered]@{ protocol = $protocol; localAddress = [string]$address; localPort = [int]$port }; [void]$portMap[$key].Add($endpoint) }",
      "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { & $addEndpoint $_.OwningProcess 'TCP' $_.LocalAddress $_.LocalPort }",
      "Get-NetUDPEndpoint -ErrorAction SilentlyContinue | ForEach-Object { & $addEndpoint $_.OwningProcess 'UDP' $_.LocalAddress $_.LocalPort }",
      "$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { $key = [string]$_.ProcessId; $endpoints = @(); if ($portMap.ContainsKey($key)) { $endpoints = @($portMap[$key] | Sort-Object protocol, localPort -Unique) }; [ordered]@{ pid = [int]$_.ProcessId; name = [string]$_.Name; path = [string]$_.ExecutablePath; workingSetBytes = [long]$_.WorkingSetSize; ports = $endpoints } })",
      "ConvertTo-Json -InputObject $processes -Depth 5 -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`无法读取系统进程: ${String(stderr || err.message).trim()}`))
          return
        }

        try {
          const parsed = JSON.parse(String(stdout || '[]').trim() || '[]')
          const items = (Array.isArray(parsed) ? parsed : [parsed])
            .map((item) => ({
              ...item,
              pid: Number(item.pid),
              workingSetBytes: Number(item.workingSetBytes) || 0,
              ports: Array.isArray(item.ports) ? item.ports : item.ports ? [item.ports] : []
            }))
            .sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid)
          resolve(items.map((item) => ({ ...item, protected: isProtectedProcess(item) })))
        } catch (parseError) {
          reject(new Error(`无法解析系统进程: ${parseError.message}`))
        }
      }
    )
  })
}

const PROCESS_CACHE_TTL_MS = 8000
let processSnapshot = { items: [], updatedAt: 0, pending: null }

async function getProcessSnapshot(force = false) {
  const cacheFresh =
    processSnapshot.items.length > 0 &&
    Date.now() - processSnapshot.updatedAt < PROCESS_CACHE_TTL_MS
  if (!force && cacheFresh) return processSnapshot
  if (processSnapshot.pending) return processSnapshot.pending

  processSnapshot.pending = listProcessesWithPorts()
    .then((items) => {
      processSnapshot = { items, updatedAt: Date.now(), pending: null }
      return processSnapshot
    })
    .catch((error) => {
      processSnapshot.pending = null
      throw error
    })
  return processSnapshot.pending
}

async function listProcessPage(options = {}) {
  const requestedPage = Math.max(1, Number.parseInt(options.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(options.pageSize, 10) || 30))
  const keyword = String(options.query || '').trim().toLowerCase()
  const portOnly = Boolean(options.portOnly)
  const snapshot = await getProcessSnapshot(Boolean(options.force))

  const filtered = snapshot.items.filter((item) => {
    if (portOnly && !item.ports?.length) return false
    if (!keyword) return true
    const portValues = (item.ports || []).flatMap((port) => [
      String(port.localPort),
      `${port.protocol}:${port.localPort}`,
      `${port.localAddress}:${port.localPort}`
    ])
    return [String(item.pid), item.name, ...portValues]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, totalPages)
  const start = (page - 1) * pageSize
  const summary = {
    processCount: snapshot.items.length,
    portProcessCount: snapshot.items.filter((item) => item.ports?.length).length,
    listeningPortCount: snapshot.items.reduce(
      (sum, item) => sum + (item.ports?.length || 0),
      0
    ),
    totalMemory: snapshot.items.reduce(
      (sum, item) => sum + (Number(item.workingSetBytes) || 0),
      0
    )
  }

  return {
    items: filtered.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
    summary,
    updatedAt: snapshot.updatedAt
  }
}

function terminateProcessTree(pid) {
  return new Promise((resolve, reject) => {
    const processId = Number(pid)
    if (!Number.isInteger(processId) || processId <= 0) {
      reject(new Error('PID 无效'))
      return
    }
    if (process.platform !== 'win32') {
      reject(new Error('当前系统不支持结束 Windows 进程'))
      return
    }

    const inspectScript = [
      "$item = Get-CimInstance Win32_Process -Filter \"ProcessId = $env:LAUNCHPAD_TARGET_PID\" -ErrorAction Stop",
      "if ($null -eq $item) { throw '进程不存在或已经退出' }",
      "[ordered]@{ pid = [int]$item.ProcessId; name = [string]$item.Name; path = [string]$item.ExecutablePath } | ConvertTo-Json -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', inspectScript],
      {
        windowsHide: true,
        timeout: 10000,
        env: { ...process.env, LAUNCHPAD_TARGET_PID: String(processId) }
      },
      (inspectError, stdout, stderr) => {
        if (inspectError) {
          reject(new Error(String(stderr || '进程不存在或已经退出').trim()))
          return
        }

        let item
        try {
          item = JSON.parse(String(stdout).trim())
        } catch {
          reject(new Error('无法确认目标进程信息'))
          return
        }
        if (isProtectedProcess(item)) {
          reject(new Error('为保护 Windows 与 LaunchPad，禁止结束该进程'))
          return
        }

        execFile(
          'taskkill.exe',
          ['/PID', String(processId), '/T', '/F'],
          { windowsHide: true, timeout: 10000 },
          (killError) => {
            if (killError) {
              reject(new Error(`结束进程失败，可能需要管理员权限（PID ${processId}）`))
              return
            }
            resolve({ success: true, pid: processId, name: item.name })
          }
        )
      }
    )
  })
}

module.exports = {
  launchExe,
  launchExeDetached,
  launchBatch,
  validateExecutablePath,
  terminateByExecutablePath,
  getExecutableStatuses,
  listProcessesWithPorts,
  listProcessPage,
  terminateProcessTree
}
