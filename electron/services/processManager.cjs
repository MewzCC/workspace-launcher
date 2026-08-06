// 进程启动管理模块
// 提供可执行文件启动能力，支持独立子进程模式
// 主进程使用，渲染层通过 IPC 间接调用
const { spawn, execFile } = require('child_process')
const { shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { t } = require('../i18n.cjs')

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
  if (!normalizedPath) throw new Error(t('errors.exeRequired'))
  if (path.extname(normalizedPath).toLowerCase() !== '.exe') {
    throw new Error(t('errors.exeOnly'))
  }
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(t('errors.exeNotExist', { path: normalizedPath }))
  }
  const stat = fs.statSync(normalizedPath)
  if (!stat.isFile()) throw new Error(t('errors.notAFile', { path: normalizedPath }))
  return normalizedPath
}

function friendlyLaunchError(err, exePath, shellError = '') {
  const code = err?.code || 'UNKNOWN'
  if (code === 'EACCES' || code === 'EPERM') {
    const detail = shellError
      ? t('errors.shellDetail', { message: shellError })
      : ''
    return new Error(t('errors.winDenied', { code, path: exePath }) + detail)
  }
  return new Error(t('errors.launchFailedCode', { code, message: err?.message || exePath }))
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
      reject(new Error(t('errors.exeNotExist', { path: exePath })))
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
      reject(new Error(t('errors.scriptNotExist', { path: scriptPath })))
      return
    }
    if (!/\.(bat|cmd)$/i.test(scriptPath)) {
      reject(new Error(t('errors.batOnly')))
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
      reject(new Error(t('errors.killSelfBlocked')))
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
          reject(new Error(t('errors.killExistingFailed', { message: String(stderr || err.message).trim() })))
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
          reject(new Error(t('errors.processStatusFailed', { message: String(stderr || err.message).trim() })))
          return
        }

        try {
          const parsed = JSON.parse(String(stdout || '{}').trim() || '{}')
          resolve(Object.fromEntries(targets.map((target) => [target, Boolean(parsed[target])])))
        } catch (parseError) {
          reject(new Error(t('errors.parseProcessFailed', { message: parseError.message })))
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

// ===== 增量进程/端口快照 =====
// 将「进程列表」与「端口列表」拆分为两个独立缓存层，避免每次刷新都全量重跑
// 昂贵的 Get-CimInstance Win32_Process：
// - 进程基表：进程增删变化慢，TTL 较长（30s）
// - 端口表：端口监听变化相对快，TTL 较短（4s），按需以更高频率增量拉取
// 每次请求时合并两层数据；端口表中新出现、但基表尚未覆盖的 PID（新进程），
// 通过一次性过滤查询补齐进程信息，保证新监听进程立即可见。

const PROCESS_BASE_TTL_MS = 30000
const PORT_MAP_TTL_MS = 4000
const MAX_ORPHAN_RESOLVE = 50

// 通用缓存 holder：{ value, updatedAt, pending }
function cachedLoader(holder, ttl, loader, force) {
  const fresh =
    holder.updatedAt > 0 && Date.now() - holder.updatedAt < ttl
  if (!force && fresh) return Promise.resolve(holder)
  if (holder.pending) return holder.pending
  holder.pending = loader()
    .then((value) => {
      holder.value = value
      holder.updatedAt = Date.now()
      holder.pending = null
      return holder
    })
    .catch((error) => {
      holder.pending = null
      throw error
    })
  return holder.pending
}

function listProcessesBase() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      resolve([])
      return
    }

    const script = [
      "$processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { [ordered]@{ pid = [int]$_.ProcessId; name = [string]$_.Name; path = [string]$_.ExecutablePath; workingSetBytes = [long]$_.WorkingSetSize } })",
      "ConvertTo-Json -InputObject $processes -Depth 3 -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(t('errors.systemProcessFailed', { message: String(stderr || err.message).trim() })))
          return
        }
        try {
          const parsed = JSON.parse(String(stdout || '[]').trim() || '[]')
          const items = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
            pid: Number(item.pid),
            name: String(item.name || ''),
            path: String(item.path || ''),
            workingSetBytes: Number(item.workingSetBytes) || 0
          }))
          resolve(items)
        } catch (parseError) {
          reject(new Error(t('errors.parseProcessFailed', { message: parseError.message })))
        }
      }
    )
  })
}

function listPortMap() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      resolve({})
      return
    }

    const script = [
      "$portMap = @{}",
      "$addEndpoint = { param($pidValue, $protocol, $address, $port) $key = [string]$pidValue; if (-not $portMap.ContainsKey($key)) { $portMap[$key] = New-Object System.Collections.ArrayList }; $endpoint = [ordered]@{ protocol = $protocol; localAddress = [string]$address; localPort = [int]$port }; [void]$portMap[$key].Add($endpoint) }",
      "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { & $addEndpoint $_.OwningProcess 'TCP' $_.LocalAddress $_.LocalPort }",
      "Get-NetUDPEndpoint -ErrorAction SilentlyContinue | ForEach-Object { & $addEndpoint $_.OwningProcess 'UDP' $_.LocalAddress $_.LocalPort }",
      "ConvertTo-Json -InputObject $portMap -Depth 4 -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(t('errors.systemPortFailed', { message: String(stderr || err.message).trim() })))
          return
        }
        try {
          const parsed = JSON.parse(String(stdout || '{}').trim() || '{}')
          const map = {}
          for (const [pid, endpoints] of Object.entries(parsed)) {
            const seen = new Set()
            const items = []
            for (const endpoint of (Array.isArray(endpoints) ? endpoints : [endpoints])) {
              const e = {
                protocol: String(endpoint.protocol || ''),
                localAddress: String(endpoint.localAddress || ''),
                localPort: Number(endpoint.localPort) || 0
              }
              const key = `${e.protocol}:${e.localAddress}:${e.localPort}`
              if (seen.has(key)) continue
              seen.add(key)
              items.push(e)
            }
            items.sort((a, b) => a.protocol.localeCompare(b.protocol) || a.localPort - b.localPort)
            map[Number(pid)] = items
          }
          resolve(map)
        } catch (parseError) {
          reject(new Error(t('errors.parsePortFailed', { message: parseError.message })))
        }
      }
    )
  })
}

// 按 PID 列表增量查询缺失进程的信息（用于端口表新出现的进程）
function listProcessesByPids(pids) {
  const targets = [...new Set(pids)]
    .filter((pid) => Number.isInteger(pid) && pid > 0)
    .slice(0, MAX_ORPHAN_RESOLVE)
  if (targets.length === 0) return Promise.resolve([])
  if (process.platform !== 'win32') return Promise.resolve([])

  return new Promise((resolve) => {
    const script = [
      "$pids = @($env:LAUNCHPAD_ORPHAN_PIDS -split ',' | ForEach-Object { [int]$_ } | Where-Object { $_ -gt 0 })",
      "if ($pids.Count -eq 0) { '[]'; exit }",
      "$filter = ($pids | ForEach-Object { 'ProcessId = ' + $_ }) -join ' OR '",
      "$processes = @(Get-CimInstance Win32_Process -Filter $filter -ErrorAction Stop | ForEach-Object { [ordered]@{ pid = [int]$_.ProcessId; name = [string]$_.Name; path = [string]$_.ExecutablePath; workingSetBytes = [long]$_.WorkingSetSize } })",
      "ConvertTo-Json -InputObject $processes -Depth 3 -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LAUNCHPAD_ORPHAN_PIDS: targets.join(',') }
      },
      (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(String(stdout || '[]').trim() || '[]')
          resolve((Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
            pid: Number(item.pid),
            name: String(item.name || ''),
            path: String(item.path || ''),
            workingSetBytes: Number(item.workingSetBytes) || 0
          })))
        } catch (_) {
          resolve([])
        }
      }
    )
  })
}

const processBaseHolder = { value: [], updatedAt: 0, pending: null }
const portMapHolder = { value: {}, updatedAt: 0, pending: null }

function getProcessBase(force) {
  return cachedLoader(processBaseHolder, PROCESS_BASE_TTL_MS, listProcessesBase, force)
}

function getPortMap(force) {
  return cachedLoader(portMapHolder, PORT_MAP_TTL_MS, listPortMap, force)
}

// 合并进程基表与端口表，返回带 ports 的完整进程列表
// 对外保持与旧 listProcessesWithPorts 一致的语义
// force 为 true 时强制刷新两层缓存
async function listProcessesWithPorts(force = false) {
  const [base, port] = await Promise.all([getProcessBase(force), getPortMap(force)])
  const portMap = port.value
  const baseByPid = new Map(base.value.map((item) => [item.pid, item]))

  const orphanPids = Object.keys(portMap)
    .map(Number)
    .filter((pid) => !baseByPid.has(pid))

  let items = base.value.map((item) => ({ ...item, ports: portMap[item.pid] || [] }))
  if (orphanPids.length > 0) {
    try {
      const orphans = await listProcessesByPids(orphanPids)
      items = items.concat(
        orphans.map((item) => ({ ...item, ports: portMap[item.pid] || [] }))
      )
    } catch (_) {
      // 孤儿进程补齐失败不影响主列表
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name) || a.pid - b.pid)
  return items.map((item) => ({ ...item, protected: isProtectedProcess(item) }))
}

async function getProcessSnapshot(force = false) {
  if (process.platform === 'win32') {
    const snapshot = { items: await listProcessesWithPorts(force), updatedAt: Date.now() }
    return snapshot
  }
  // 非 Windows 平台直接返回空快照，避免无意义的合并查询
  return { items: [], updatedAt: Date.now() }
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
      reject(new Error(t('errors.pidInvalid')))
      return
    }
    if (process.platform !== 'win32') {
      reject(new Error(t('errors.noWindows')))
      return
    }

    const inspectScript = [
      "$item = Get-CimInstance Win32_Process -Filter \"ProcessId = $env:LAUNCHPAD_TARGET_PID\" -ErrorAction Stop",
      `if ($null -eq $item) { throw '${t('errors.processGone').replace(/'/g, "''")}' }`,
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
          reject(new Error(String(stderr || t('errors.processGone')).trim()))
          return
        }

        let item
        try {
          item = JSON.parse(String(stdout).trim())
        } catch {
          reject(new Error(t('errors.confirmTargetFailed')))
          return
        }
        if (isProtectedProcess(item)) {
          reject(new Error(t('errors.processProtected')))
          return
        }

        execFile(
          'taskkill.exe',
          ['/PID', String(processId), '/T', '/F'],
          { windowsHide: true, timeout: 10000 },
          (killError) => {
            if (killError) {
              reject(new Error(t('errors.killFailed', { pid: processId })))
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
  getProcessBase,
  terminateProcessTree
}
