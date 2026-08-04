// 软件扫描器模块
// 支持两种扫描模式：
// 1. 标准扫描：开始菜单 .lnk 快捷方式 + Program Files（批量 PowerShell 解析，高性能）
// 2. 盘符扫描：递归扫描指定盘符/目录下的 .exe 文件
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const { t } = require('../i18n.cjs')

function createAbortError() {
  const error = new Error(t('errors.scanCancelled'))
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError()
}

function findEverythingCli() {
  const candidates = [
    process.env.EVERYTHING_ES_PATH,
    process.resourcesPath && path.join(process.resourcesPath, 'tools', 'everything', 'es.exe'),
    path.resolve(__dirname, '..', '..', 'vendor', 'everything', 'es.exe'),
    'C:\\Program Files\\Everything\\es.exe',
    'C:\\Program Files (x86)\\Everything\\es.exe'
  ].filter(Boolean)
  return candidates.find((candidate) => fs.existsSync(candidate)) || null
}

function searchEverythingExecutables(query, limit = 120) {
  return new Promise((resolve) => {
    const esPath = findEverythingCli()
    const keyword = String(query || '').trim()
    if (!esPath || keyword.length < 2) {
      resolve({ available: Boolean(esPath), items: [] })
      return
    }

    const fileNameQuery = keyword
      .replace(/[\r\n]+/g, ' ')
      .replace(/[?*"<>|:]/g, '')
      .trim()
    if (!fileNameQuery) {
      resolve({ available: true, items: [] })
      return
    }
    const searchText = `${fileNameQuery}*.exe`
    execFile(
      esPath,
      [
        '-n', String(Math.min(300, Math.max(1, limit))),
        '-timeout', '3000',
        '-full-path-and-name',
        searchText
      ],
      { windowsHide: true, timeout: 6000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        const lines = err ? [] : String(stdout || '').split(/\r?\n/)

        const items = lines
          .map((item) => item.trim())
          .filter((item) => item && item.toLowerCase().endsWith('.exe'))
          .filter((item) => fs.existsSync(item))
          .map((exePath) => ({
            name: path.basename(exePath, path.extname(exePath)),
            path: exePath,
            icon: '📦',
            source: 'everything'
          }))
        resolve({ available: !err, items })
      }
    )
  })
}

function searchWindowsApps(query) {
  return new Promise((resolve) => {
    const keyword = String(query || '').trim()
    if (keyword.length < 2 || process.platform !== 'win32') {
      resolve([])
      return
    }

    const script = [
      "$query = $env:LAUNCHPAD_APP_QUERY",
      "$packages = @(Get-AppxPackage -ErrorAction SilentlyContinue)",
      "$matches = @(Get-StartApps | Where-Object { $_.Name -like ('*' + $query + '*') } | Select-Object -First 60)",
      "$results = @()",
      "foreach ($entry in $matches) { $parts = [string]$entry.AppID -split '!', 2; if ($parts.Count -ne 2) { continue }; $package = $packages | Where-Object { $_.PackageFamilyName -eq $parts[0] } | Select-Object -First 1; if ($null -eq $package) { continue }; $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'; if (-not (Test-Path -LiteralPath $manifestPath)) { continue }; try { [xml]$manifest = Get-Content -LiteralPath $manifestPath -ErrorAction Stop; $application = @($manifest.Package.Applications.Application) | Where-Object { $_.Id -eq $parts[1] } | Select-Object -First 1; $relativeExe = [string]$application.Executable; if (-not $relativeExe) { continue }; $exePath = Join-Path $package.InstallLocation $relativeExe; if ((Test-Path -LiteralPath $exePath) -and $exePath.EndsWith('.exe', [StringComparison]::OrdinalIgnoreCase)) { $results += [ordered]@{ name = [string]$entry.Name; path = $exePath; icon = '📦'; source = 'windows-app' } } } catch {} }",
      "ConvertTo-Json -InputObject @($results) -Compress"
    ].join('; ')

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LAUNCHPAD_APP_QUERY: keyword }
      },
      (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(String(stdout || '[]').trim() || '[]')
          resolve(Array.isArray(parsed) ? parsed : [parsed])
        } catch (_) {
          resolve([])
        }
      }
    )
  })
}

async function searchInstalledApplications(query) {
  const keyword = String(query || '').trim()
  if (keyword.length < 2) {
    return { items: [], everythingAvailable: Boolean(findEverythingCli()) }
  }
  const [everything, windowsApps] = await Promise.all([
    searchEverythingExecutables(keyword),
    searchWindowsApps(keyword)
  ])
  const seen = new Set()
  const items = []
  for (const item of [...windowsApps, ...everything.items]) {
    const key = String(item.path || '').toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return { items, everythingAvailable: everything.available }
}

// 应跳过的系统目录（盘符扫描时避免扫描无意义目录或权限受限目录）
const SKIP_DIRS = new Set([
  'windows', '$recycle.bin', 'system volume information', '$windows.~bt',
  '$windows.~ws', 'recovery', 'config.msi', 'msocache', 'programdata',
  'appdata', 'intel', 'perflogs', 'drivers'
])

// 获取要扫描的标准目录列表
// 包含开始菜单（用户/系统）和 Program Files（64/32 位）
function getScanDirectories() {
  const dirs = []

  // 开始菜单 - 用户目录
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  }

  // 开始菜单 - 系统目录
  const programData = process.env.ProgramData || 'C:\\ProgramData'
  dirs.push(path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))

  // Program Files
  dirs.push('C:\\Program Files')

  // Program Files (x86)（32 位程序目录，存在则加入）
  const programFilesX86 = 'C:\\Program Files (x86)'
  if (fs.existsSync(programFilesX86)) {
    dirs.push(programFilesX86)
  }

  // 过滤掉不存在的目录
  return dirs.filter((d) => fs.existsSync(d))
}

// 解析单个 .lnk 快捷方式的目标路径
// 通过 PowerShell 调用 WScript.Shell COM 对象获取 TargetPath
// 失败返回 null
function resolveLnk(lnkPath, options = {}) {
  const signal = options.signal
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    // PowerShell 单引号字符串中，单引号需用 '' 转义
    const escapedPath = lnkPath.replace(/'/g, "''")
    const psCommand =
      `$s=(New-Object -COM WScript.Shell).CreateShortcut('${escapedPath}'); Write-Output $s.TargetPath`

    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', psCommand],
      { windowsHide: true, timeout: 10000, ...(signal ? { signal } : {}) },
      (err, stdout) => {
        if (signal?.aborted) {
          reject(createAbortError())
          return
        }
        if (err) {
          resolve(null)
          return
        }
        const target = (stdout || '').trim()
        resolve(target || null)
      }
    )
  })
}

// 批量解析 .lnk 快捷方式的目标路径（高性能）
// 一次性启动单个 PowerShell 进程解析所有 .lnk，避免逐个启动的巨大开销
// lnkPaths: .lnk 文件绝对路径数组
// 返回 { [lnkPath]: targetPath } 映射，未解析成功的 targetPath 为空字符串
async function resolveLnkBatch(lnkPaths, options = {}) {
  if (!lnkPaths || lnkPaths.length === 0) return {}
  const signal = options.signal
  throwIfAborted(signal)

  // 将路径列表写入临时文件，避免命令行长度限制
  const tmpFile = path.join(os.tmpdir(), `lnk_scan_${Date.now()}_${process.pid}.txt`)
  // 用换行分隔，PowerShell 用 Get-Content 逐行读取
  fs.writeFileSync(tmpFile, lnkPaths.join('\r\n'), 'utf8')

  // PowerShell 脚本：读取临时文件，逐行解析 .lnk，输出 "lnk路径|目标路径"
  // 临时文件路径需转义单引号
  const escapedTmp = tmpFile.replace(/'/g, "''")
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -COM WScript.Shell
Get-Content -LiteralPath '${escapedTmp}' | ForEach-Object {
  $lnk = $_
  if ($lnk) {
    try {
      $s = $shell.CreateShortcut($lnk)
      $target = $s.TargetPath
      if ($target) { Write-Output "$lnk|$target" }
      else { Write-Output "$lnk|" }
    } catch {
      Write-Output "$lnk|"
    }
  }
}`.trim()

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', psScript],
      {
        windowsHide: true,
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        ...(signal ? { signal } : {})
      },
      (err, stdout) => {
        // 清理临时文件
        try { fs.unlinkSync(tmpFile) } catch (_) {}

        if (signal?.aborted) {
          reject(createAbortError())
          return
        }
        if (err) {
          // 批量解析失败，返回空映射（调用方可回退到逐个解析）
          resolve({})
          return
        }

        const results = {}
        const lines = (stdout || '').split('\n')
        for (const line of lines) {
          const sepIdx = line.indexOf('|')
          if (sepIdx === -1) continue
          const lnk = line.slice(0, sepIdx).trim()
          const target = line.slice(sepIdx + 1).trim()
          if (lnk) results[lnk] = target
        }
        resolve(results)
      }
    )
  })
}

// 定期让出主进程事件循环，确保扫描期间窗口仍可拖动、缩小和关闭。
async function yieldDuringScan(context) {
  throwIfAborted(context.signal)
  context.visited += 1
  if (context.visited % 128 === 0) {
    await new Promise((resolve) => setImmediate(resolve))
    throwIfAborted(context.signal)
  }
}

// 异步递归获取目录下所有 .lnk 文件，避免 readdirSync 阻塞 Electron 主进程。
// 返回绝对路径数组
async function walkLnkFiles(dirPath, context = { visited: 0, signal: null }) {
  throwIfAborted(context.signal)
  const results = []
  let entries
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  } catch (e) {
    // 目录不可读，跳过
    return results
  }
  for (const entry of entries) {
    await yieldDuringScan(context)
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkLnkFiles(fullPath, context)))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lnk')) {
      results.push(fullPath)
    }
  }
  return results
}

// 扫描单个目录下所有 .lnk 文件并解析为软件对象
// dirPath: 要扫描的根目录
// onProgress: 可选回调 ({found, current}) => void，用于 UI 显示进度
// 返回软件对象数组 [{name, path, icon}]
async function scanDirectory(dirPath, onProgress, options = {}) {
  const signal = options.signal
  const lnkFiles = await walkLnkFiles(dirPath, { visited: 0, signal })
  const results = []

  for (const lnkFile of lnkFiles) {
    throwIfAborted(signal)
    const name = path.basename(lnkFile, path.extname(lnkFile))
    if (typeof onProgress === 'function') {
      onProgress({ found: results.length, current: lnkFile })
    }
    const target = await resolveLnk(lnkFile, { signal })
    if (!target) continue
    // 只保留 .exe 目标，跳过其他类型（如文档、URL）
    if (!target.toLowerCase().endsWith('.exe')) continue
    results.push({
      name,
      path: target,
      icon: '📦'
    })
  }

  return results
}

// 扫描所有标准目录，合并结果并按 path 去重
// 使用批量 .lnk 解析，大幅提升性能（从逐个启动 PowerShell 改为单次批量解析）
// onProgress: 可选回调 ({found, current}) => void
// 返回去重后的软件数组
async function scanAll(onProgress, options = {}) {
  const signal = options.signal
  const dirs = getScanDirectories()

  // 1. 收集所有目录下的 .lnk 文件
  const allLnkFiles = []
  for (const dir of dirs) {
    throwIfAborted(signal)
    const lnkFiles = await walkLnkFiles(dir, { visited: 0, signal })
    allLnkFiles.push(...lnkFiles)
  }

  if (allLnkFiles.length === 0) return []

  // 2. 通知开始解析
  if (typeof onProgress === 'function') {
    onProgress({ found: 0, current: `正在解析 ${allLnkFiles.length} 个快捷方式...` })
  }

  // 3. 批量解析所有 .lnk
  const targetMap = await resolveLnkBatch(allLnkFiles, { signal })

  // 4. 组装结果：只保留 .exe 目标
  const all = []
  for (const lnkFile of allLnkFiles) {
    throwIfAborted(signal)
    const target = targetMap[lnkFile]
    if (!target) continue
    if (!target.toLowerCase().endsWith('.exe')) continue
    const name = path.basename(lnkFile, path.extname(lnkFile))
    all.push({ name, path: target, icon: '📦' })
  }

  if (typeof onProgress === 'function') {
    onProgress({ found: all.length, current: '解析完成' })
  }

  // 5. 按 path 去重（不区分大小写，因为 Windows 路径不区分大小写）
  const seen = new Set()
  const deduped = []
  for (const item of all) {
    throwIfAborted(signal)
    const key = item.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  return deduped
}

// 获取系统可用的盘符列表（A-Z 中存在的盘）
// 返回盘符字母数组，如 ['C', 'D', 'E']
function getAvailableDrives() {
  const drives = []
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i)
    const drivePath = `${letter}:\\`
    try {
      // fs.existsSync 对盘符检测可靠
      if (fs.existsSync(drivePath)) {
        drives.push(letter)
      }
    } catch (_) {
      // 忽略不可访问的盘符
    }
  }
  return drives
}

// 递归扫描指定目录下的可执行文件
// 同时收集 .exe 文件和 .lnk 快捷方式，.lnk 会批量解析为目标 .exe 路径
// dirPath: 要扫描的根目录（如 'D:\\' 或 'D:\\Tools'）
// onProgress: 可选回调 ({found, current}) => void
// options: { maxDepth?: number, skipDirs?: string[] }
// 返回软件对象数组 [{name, path, icon}]，按 path 去重
async function scanExeFiles(dirPath, onProgress, options = {}) {
  const maxDepth = options.maxDepth ?? -1 // -1 表示不限制深度
  const skipDirs = options.skipDirs || SKIP_DIRS
  const signal = options.signal
  const results = []
  const seenPaths = new Set()
  const lnkFiles = [] // 收集 .lnk 快捷方式，稍后批量解析
  const scanContext = { visited: 0, signal }

  async function walk(dir, depth) {
    throwIfAborted(signal)
    // 深度限制
    if (maxDepth >= 0 && depth > maxDepth) return

    let entries
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch (e) {
      // 目录不可读（权限不足等），跳过
      return
    }

    for (const entry of entries) {
      await yieldDuringScan(scanContext)
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // 跳过系统目录和无意义目录
        const lowerName = entry.name.toLowerCase()
        if (skipDirs.has(lowerName)) continue
        // 跳过隐藏目录（以 . 开头）
        if (entry.name.startsWith('.') || entry.name.startsWith('$')) continue
        await walk(fullPath, depth + 1)
      } else if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase()
        if (lowerName.endsWith('.exe')) {
          // 直接找到的 .exe 文件
          const key = fullPath.toLowerCase()
          if (seenPaths.has(key)) continue
          seenPaths.add(key)
          const name = entry.name.replace(/\.exe$/i, '')
          results.push({ name, path: fullPath, icon: '📦' })
          if (typeof onProgress === 'function') {
            onProgress({ found: results.length, current: fullPath })
          }
        } else if (lowerName.endsWith('.lnk')) {
          // 收集 .lnk 快捷方式，稍后批量解析目标路径
          lnkFiles.push(fullPath)
        }
      }
    }
  }

  await walk(dirPath, 0)

  // 批量解析 .lnk 快捷方式的目标路径
  if (lnkFiles.length > 0) {
    if (typeof onProgress === 'function') {
      onProgress({ found: results.length, current: `正在解析 ${lnkFiles.length} 个快捷方式...` })
    }
    const targetMap = await resolveLnkBatch(lnkFiles, { signal })
    for (const lnkFile of lnkFiles) {
      throwIfAborted(signal)
      const target = targetMap[lnkFile]
      if (!target) continue
      // 只保留 .exe 目标，跳过文档/URL 等
      if (!target.toLowerCase().endsWith('.exe')) continue
      // 与直接找到的 .exe 去重
      const key = target.toLowerCase()
      if (seenPaths.has(key)) continue
      seenPaths.add(key)
      // 名称取 .lnk 文件名（去扩展名），更友好
      const name = path.basename(lnkFile, path.extname(lnkFile))
      results.push({ name, path: target, icon: '📦' })
    }
    if (typeof onProgress === 'function') {
      onProgress({ found: results.length, current: '解析完成' })
    }
  }

  return results
}

// 扫描指定盘符的可执行文件（.exe + .lnk）
// driveLetter: 盘符字母（如 'D'），内部会拼成 'D:\'
// onProgress: 可选回调
// options: 同 scanExeFiles
// 返回软件对象数组
async function scanDrive(driveLetter, onProgress, options = {}) {
  const letter = (driveLetter || 'C').charAt(0).toUpperCase()
  const drivePath = `${letter}:\\`
  if (!fs.existsSync(drivePath)) {
    return []
  }
  return scanExeFiles(drivePath, onProgress, options)
}

module.exports = {
  getScanDirectories,
  resolveLnk,
  resolveLnkBatch,
  walkLnkFiles,
  scanDirectory,
  scanAll,
  getAvailableDrives,
  scanExeFiles,
  scanDrive,
  searchInstalledApplications
}
