// 性能监视器模块（低开销实现）
// 设计原则（基于调研，见下）：
// - CPU 使用率 / 内存：使用 Node 内置 os 模块在进程内两次采样差分计算，零外部进程开销。
//   （systeminformation.currentLoad() 在 Windows 上存在已知精度缺陷 issue#900，故不采用）
// - 磁盘 / CPU 温度：Windows 上必须借助 CIM，走 PowerShell 一次性脚本；数据变化慢，TTL 30s。
// - GPU 使用率 / 显存：Windows 性能计数器 \GPU Engine(*)\Utilization Percentage 与
//   \GPU Process Memory(*)\Local Usage（文档确认与任务管理器一致，任意 NVIDIA/AMD/Intel 可用），
//   走 PowerShell Get-Counter，TTL 2s。
// - GPU 温度 / 风扇转速：仅 NVIDIA 驱动提供免费通用读取（nvidia-smi），检测到才启用，TTL 3s。
//   无 NVIDIA 时温度/转速显示 N/A。
const os = require('os')
const { execFile, execFileSync } = require('child_process')

// ===== 缓存 helper（与 processManager 相同的去重语义）=====
function cachedLoader(holder, ttl, loader, force = false) {
  const fresh = holder.updatedAt > 0 && Date.now() - holder.updatedAt < ttl
  if (!force && fresh) return Promise.resolve(holder.value)
  if (holder.pending) return holder.pending
  holder.pending = loader()
    .then((value) => {
      holder.value = value
      holder.updatedAt = Date.now()
      holder.pending = null
      return value
    })
    .catch((error) => {
      holder.pending = null
      throw error
    })
  return holder.pending
}

function runPowerShell(script, { timeout = 10000, maxBuffer = 4 * 1024 * 1024, env } = {}) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout, maxBuffer, env },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        try {
          resolve(JSON.parse(String(stdout).trim() || 'null'))
        } catch (_) {
          resolve(null)
        }
      }
    )
  })
}

// ===== CPU（进程内，零开销）=====
let lastCpuSample = null

function readCpuUsage() {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const core of cpus) {
    const times = core.times
    total += times.user + times.nice + times.sys + times.idle + times.irq
    idle += times.idle
  }
  const now = { idle, total }
  let usage = null
  if (lastCpuSample && now.total > lastCpuSample.total) {
    const dIdle = now.idle - lastCpuSample.idle
    const dTotal = now.total - lastCpuSample.total
    usage = Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100))
  }
  lastCpuSample = now
  return usage
}

function readMemory() {
  const total = os.totalmem()
  const used = total - os.freemem()
  return {
    total,
    used,
    usage: total > 0 ? (used / total) * 100 : 0
  }
}

// ===== 磁盘 + CPU 温度（慢速，TTL 30s）=====
// MSAcpi_ThermalZoneTemperature 在部分台式机/AMD 上不可用，best-effort 返回 null
const SLOW_TTL_MS = 30000
const slowHolder = { value: null, updatedAt: 0, pending: null }

function loadSlowStats() {
  if (process.platform !== 'win32') {
    return Promise.resolve({ drives: [], cpuTemp: null, gpus: [] })
  }
  const script = [
    "$drives = @(Get-CimInstance Win32_LogicalDisk -Filter \"DriveType = 3\" -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ letter = [string]$_.DeviceID; total = [long]$_.Size; free = [long]$_.FreeSpace } })",
    "$gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ name = [string]$_.Name; adapterRam = [long]$_.AdapterRAM; status = [string]$_.Status } })",
    "$cpuTemp = $null",
    "$tz = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue",
    "if ($null -ne $tz) { $cpuTemp = [math]::Round(($tz.CurrentTemperature / 10) - 273.15, 1) }",
    "[ordered]@{ drives = $drives; cpuTemp = $cpuTemp; gpus = $gpus } | ConvertTo-Json -Depth 3 -Compress"
  ].join('; ')
  return runPowerShell(script).then((data) => ({
    drives: Array.isArray(data?.drives) ? data.drives : [],
    cpuTemp: Number.isFinite(data?.cpuTemp) ? data.cpuTemp : null,
    gpus: Array.isArray(data?.gpus) ? data.gpus : []
  }))
}

function getSlowStats() {
  return cachedLoader(slowHolder, SLOW_TTL_MS, loadSlowStats)
}

// ===== GPU 使用率 / 显存（快，TTL 2s）=====
// 按 LUID 分组，每张显卡独立采集：
// - \GPU Engine(*)\Utilization Percentage 实例名含 luid_..._engtype_...，按 luid 聚合得每卡使用率；
//   同时记录引擎类型集合（video codec / videodecode 等可区分 NVIDIA/AMD/虚拟适配器）。
// - \GPU Adapter Memory(*)\Dedicated Usage + Shared Usage 按 luid 聚合得每卡显存已用。
//   （无此计数器集时退回 \GPU Local Adapter Memory(*)\Local Usage）
const GPU_TTL_MS = 2000
const gpuHolder = { value: null, updatedAt: 0, pending: null }

function loadGpuStats() {
  if (process.platform !== 'win32') {
    return Promise.resolve({ devices: [] })
  }
  const script = [
    "$devices = @()",
    "try {",
    "  $usageMap = @{}",
    "  $typeMap = @{}",
    "  $samples = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -ErrorAction Stop).CounterSamples",
    "  foreach ($s in $samples) {",
    "    if ($null -eq $s.CookedValue) { continue }",
    "    if ($s.InstanceName -match '^pid_\\d+_luid_([^_]+_[^_]+)_phys_\\d+_eng_\\d+_engtype_(.+)$') {",
    "      $luid = $matches[1]",
    "      if (-not $usageMap.ContainsKey($luid)) { $usageMap[$luid] = 0.0; $typeMap[$luid] = @() }",
    "      $usageMap[$luid] += [double]$s.CookedValue",
    "      $et = $matches[2]",
    "      if ($typeMap[$luid] -notcontains $et) { $typeMap[$luid] += $et }",
    "    }",
    "  }",
    "  foreach ($luid in $usageMap.Keys) {",
    "    $devices += [ordered]@{ luid = $luid; usage = [math]::Min(100, [math]::Round($usageMap[$luid], 1)); vramUsed = $null; engTypes = $typeMap[$luid] }",
    "  }",
    "} catch { }",
    "try {",
    "  foreach ($ctr in @('\\GPU Adapter Memory(*)\\Dedicated Usage','\\GPU Adapter Memory(*)\\Shared Usage')) {",
    "    $samples = (Get-Counter $ctr -ErrorAction SilentlyContinue).CounterSamples",
    "    foreach ($s in $samples) {",
    "      if ($null -eq $s.CookedValue) { continue }",
    "      if ($s.InstanceName -match '^luid_([^_]+_[^_]+)_phys_') {",
    "        $luid = $matches[1]",
    "        $entry = $devices | Where-Object { $_.luid -eq $luid }",
    "        if ($null -ne $entry) {",
    "          if ($null -eq $entry.vramUsed) { $entry.vramUsed = 0 }",
    "          $entry.vramUsed = $entry.vramUsed + [long]$s.CookedValue",
    "        }",
    "      }",
    "    }",
    "  }",
    "} catch { }",
    "if ($devices.Count -eq 0) {",
    "  try {",
    "    $samples = (Get-Counter '\\GPU Local Adapter Memory(*)\\Local Usage' -ErrorAction Stop).CounterSamples",
    "    foreach ($s in $samples) {",
    "      if ($null -eq $s.CookedValue) { continue }",
    "      if ($s.InstanceName -match '^luid_([^_]+_[^_]+)') {",
    "        $luid = $matches[1]",
    "        $entry = $devices | Where-Object { $_.luid -eq $luid }",
    "        if ($null -eq $entry) { $devices += [ordered]@{ luid = $luid; usage = $null; vramUsed = [long]$s.CookedValue; engTypes = @() } }",
    "        else { $entry.vramUsed = [long]$s.CookedValue }",
    "      }",
    "    }",
    "  } catch { }",
    "}",
    "$devices | ConvertTo-Json -Compress"
  ].join('; ')
  return runPowerShell(script, { timeout: 15000 }).then((data) => ({
    devices: Array.isArray(data) ? data.map((d) => ({
      luid: d?.luid ?? null,
      usage: Number.isFinite(d?.usage) ? d.usage : null,
      vramUsed: Number.isFinite(d?.vramUsed) ? d.vramUsed : null,
      engTypes: Array.isArray(d?.engTypes) ? d.engTypes : []
    })) : []
  }))
}

function getGpuStats() {
  return cachedLoader(gpuHolder, GPU_TTL_MS, loadGpuStats)
}

// ===== NVIDIA GPU 温度 / 风扇 / 使用率（检测到才启用，TTL 3s）=====
const NVIDIA_TTL_MS = 3000
let nvidiaSmiPath = null
let nvidiaProbed = false

function probeNvidiaSmi() {
  if (nvidiaProbed) return nvidiaSmiPath
  nvidiaProbed = true
  try {
    execFileSync('where.exe', ['nvidia-smi'], { windowsHide: true, timeout: 5000 })
    nvidiaSmiPath = 'nvidia-smi'
  } catch (_) {
    nvidiaSmiPath = null
  }
  return nvidiaSmiPath
}

const nvidiaHolder = { value: null, updatedAt: 0, pending: null }

function loadNvidiaStats() {
  if (process.platform !== 'win32' || !probeNvidiaSmi()) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=name,temperature.gpu,fan.speed,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
      { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null)
          return
        }
        const line = String(stdout).split(/\r?\n/).map((s) => s.trim()).find(Boolean)
        if (!line) {
          resolve(null)
          return
        }
        // 第一列为型号名（可能含逗号前的空格），其余为指标
        const name = line.split(',')[0].trim()
        const rest = line.split(',').slice(1).map((s) => s.replace(/[\[\]]/g, '').trim())
        // nvidia-smi 对不可读字段（如笔记本风扇转速）输出 [N/A]，需按字段容错
        const toNum = (value) => {
          const parsed = Number.parseFloat(value)
          return Number.isFinite(parsed) ? parsed : null
        }
        if (rest.length < 5 || toNum(rest[2]) == null) {
          resolve(null)
          return
        }
        resolve({
          name: name || 'NVIDIA GPU',
          temp: toNum(rest[0]),
          fan: toNum(rest[1]),
          utilization: toNum(rest[2]),
          memUsedMiB: toNum(rest[3]),
          memTotalMiB: toNum(rest[4])
        })
      }
    )
  })
}

function getNvidiaStats() {
  return cachedLoader(nvidiaHolder, NVIDIA_TTL_MS, loadNvidiaStats)
}

// ===== 快照组装 =====
// 虚拟显示适配器（远程桌面 / 串流 / 投屏）不是物理显卡，识别并过滤
const VIRTUAL_NAME_RE = /virtual display|todesk|gameviewer|sunlogin|basic display|basic render|remote display|microsoft basic|mirror/i
// 不同厂商驱动暴露的引擎类型集合，用于把 LUID 分组归因到显卡
// 注意：compute / timer / security 各厂商都有，不能用于区分；NVIDIA 独有的是 video codec / video jpeg / high priority 3d
const NVIDIA_ENG_TYPES = ['video codec', 'video jpeg', 'high priority 3d', 'high priority compute']
const AMD_ENG_TYPES = ['videodecode', 'videoencode', 'vr', 'ofa', 'jpeg_decode']
const COPY_ONLY_ENG_TYPES = ['3d', 'copy']

function classifyLuid(engTypes) {
  const set = new Set(engTypes || [])
  if (NVIDIA_ENG_TYPES.some((type) => set.has(type))) return 'nvidia'
  if (AMD_ENG_TYPES.some((type) => set.has(type))) return 'amd'
  return 'other'
}

// 虚拟适配器 LUID 只出现 3d/copy 引擎（无编解码/计算/安全引擎）
function isVirtualLuid(engTypes) {
  const list = engTypes || []
  return list.length > 0 && list.every((type) => COPY_ONLY_ENG_TYPES.includes(type))
}

// 卡片标题用的短型号：去掉厂商前缀
function shortNameOf(name) {
  return String(name || '')
    .replace(/NVIDIA GeForce /i, '')
    .replace(/NVIDIA /i, '')
    .replace(/AMD Radeon\(TM\) /i, '')
    .replace(/AMD /i, '')
    .replace(/Intel\(R\) /i, '')
    .replace(/Intel /i, '')
    .trim() || 'GPU'
}

function buildGpuDevices({ nvidia, counters, adapters }) {
  const devices = []
  const seen = new Set()
  const usedAdapterNames = new Set()

  // 1) NVIDIA：nvidia-smi 权威数据（型号/温度/风扇/显存）
  if (nvidia) {
    const device = {
      id: 'nvidia-0',
      name: nvidia.name || 'NVIDIA GPU',
      shortName: shortNameOf(nvidia.name),
      vendor: 'nvidia',
      virtual: false,
      usage: nvidia.utilization,
      temp: nvidia.temp,
      fan: nvidia.fan,
      vramUsed: nvidia.memUsedMiB * 1024 * 1024,
      vramTotal: nvidia.memTotalMiB * 1024 * 1024,
      adapterRam: 0
    }
    devices.push(device)
    seen.add(device.id)
  }

  // 2) 性能计数器按 LUID 的其余真实显卡（NVIDIA 已被 nvidia-smi 覆盖则跳过其 LUID）
  const counterDevices = Array.isArray(counters?.devices) ? counters.devices : []
  for (const cd of counterDevices) {
    if (!cd.luid) continue
    const vendor = classifyLuid(cd.engTypes)
    if (nvidia && vendor === 'nvidia') continue
    if (isVirtualLuid(cd.engTypes)) continue
    if (seen.has(cd.luid)) continue
    devices.push({
      id: cd.luid,
      name: null,
      shortName: null,
      vendor,
      virtual: false,
      usage: Number.isFinite(cd.usage) ? cd.usage : null,
      temp: null,
      fan: null,
      vramUsed: Number.isFinite(cd.vramUsed) ? cd.vramUsed : null,
      vramTotal: null,
      adapterRam: 0
    })
    seen.add(cd.luid)
  }

  // 3) 用 WMI 真实适配器名填充未命名的设备（优先按厂商匹配）
  const realAdapters = adapters.filter((a) => !VIRTUAL_NAME_RE.test(a.name || ''))
  const vendorRe = {
    nvidia: /nvidia/i,
    amd: /amd|radeon|ati/i,
    intel: /intel|arc/i
  }
  devices.filter((d) => !d.name).forEach((device) => {
    const matcher = vendorRe[device.vendor]
    let pick = realAdapters.find((a) => !usedAdapterNames.has(a.name) && matcher && matcher.test(a.name))
    if (!pick) pick = realAdapters.find((a) => !usedAdapterNames.has(a.name))
    if (pick) {
      usedAdapterNames.add(pick.name)
      device.name = pick.name
      device.shortName = shortNameOf(pick.name)
      device.adapterRam = Number(pick.adapterRam) || 0
    } else {
      device.name = device.shortName = `GPU ${devices.indexOf(device) + 1}`
    }
  })

  // 4) 兜底：无计数器数据但有真实 WMI 适配器（显卡零活动 / 老系统）
  if (devices.length === 0) {
    realAdapters.forEach((adapter, index) => {
      const name = adapter.name || `GPU ${index + 1}`
      devices.push({
        id: `adapter-${index}`,
        name,
        shortName: shortNameOf(name),
        vendor: /nvidia/i.test(name) ? 'nvidia' : /amd|radeon/i.test(name) ? 'amd' : /intel|arc/i.test(name) ? 'intel' : 'other',
        virtual: false,
        usage: null,
        temp: null,
        fan: null,
        vramUsed: null,
        vramTotal: null,
        adapterRam: Number(adapter.adapterRam) || 0
      })
    })
  }

  return devices
}

async function getSnapshot() {
  const [slow, gpu, nvidia] = await Promise.all([getSlowStats(), getGpuStats(), getNvidiaStats()])
  const cpus = os.cpus()
  const hasNvidia = Boolean(nvidia)
  const adapters = slow?.gpus ?? []
  const devices = buildGpuDevices({ nvidia, counters: gpu, adapters })
  const realAdapters = adapters.filter((a) => !VIRTUAL_NAME_RE.test(a.name || ''))
  const primary = devices[0] || {}
  // 显卡识别：有 nvidia-smi / WMI 适配器 / 计数器数据任一即视为存在
  const gpuPresent = devices.length > 0 || realAdapters.length > 0
  const mem = readMemory()
  return {
    timestamp: Date.now(),
    cpu: {
      usage: readCpuUsage(),
      temp: slow?.cpuTemp ?? null,
      cores: cpus.length,
      speed: cpus.length > 0 ? cpus[0].speed : 0
    },
    memory: mem,
    disks: slow?.drives ?? [],
    gpu: {
      present: gpuPresent,
      devices,
      adapters: realAdapters,
      // 兼容字段：以主显卡为准（历史折线 / 旧调用方仍可用）
      name: primary.name || realAdapters[0]?.name || null,
      adapterRam: primary.adapterRam || 0,
      usage: primary.usage ?? null,
      vramUsed: primary.vramUsed ?? null,
      vramTotal: primary.vramTotal ?? null,
      temp: primary.temp ?? null,
      fan: primary.fan ?? null
    }
  }
}

module.exports = { getSnapshot }
