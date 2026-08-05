// 性能监视器组件
// 低开销数据源（主进程 perfMonitor.cjs）：CPU/内存为 Node 原生采样，GPU/磁盘为缓存 PowerShell
// 渲染层仅在组件挂载时每 2s 轮询一次快照，切走即停止，避免后台开销。
// 图表使用 Chart.js（canvas 渲染，适合小图高频更新）。
// GPU 支持多显卡：主进程按 LUID 分组返回 devices 数组，这里逐卡渲染环形图与型号名。
import React, { useEffect, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Gauge,
  CircleAlert
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import { perfApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import './PerformanceMonitor.css'

ChartJS.register(
  ArcElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip
)

const POLL_MS = 2000
const HISTORY_MAX = 60

// 资源主题色（与 theme.css 品牌色一致，两套主题共用）
const ACCENT = {
  cpu: '#6366f1',
  memory: '#22d3ee',
  disk: '#fbbf24',
  gpu: '#34d399'
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '')
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value
  const num = Number.parseInt(full, 16)
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

function useThemeChartColors() {
  const theme = useStore((s) => s.theme)
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement)
    const get = (name) => cs.getPropertyValue(name).trim()
    return {
      track: get('--brand-muted') || 'rgba(128,128,160,0.12)',
      text: get('--brand-foreground') || '#f4f4f7',
      muted: get('--brand-muted-foreground') || 'rgba(244,244,247,0.56)',
      grid: get('--brand-border') || 'rgba(255,255,255,0.08)',
      card: get('--brand-card-solid') || '#14141b'
    }
  }, [theme])
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function formatClock(mhz) {
  const value = Number(mhz) || 0
  return value > 0 ? `${(value / 1000).toFixed(2)} GHz` : '—'
}

// ===== 环形仪表盘 =====
function RingGauge({ value, accent, label, size = 168 }) {
  const colors = useThemeChartColors()
  const shown = value == null ? null : Math.min(100, Math.max(0, Number(value)))
  const data = {
    datasets: [
      {
        data: [shown ?? 0, 100 - (shown ?? 0)],
        backgroundColor: [accent, colors.track],
        borderWidth: 0,
        borderRadius: 4
      }
    ]
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    cutout: '76%',
    events: [],
    plugins: { legend: { display: false }, tooltip: { enabled: false } }
  }
  return (
    <div className="perf-ring" style={{ width: size, height: size }}>
      <Doughnut data={data} options={options} />
      <div className="perf-ring-center">
        <strong>{shown == null ? '—' : `${Math.round(shown)}%`}</strong>
        {label && <span>{label}</span>}
      </div>
    </div>
  )
}

// ===== 历史折线 =====
function HistoryLine({ series, accent, label, unit = '%' }) {
  const colors = useThemeChartColors()
  const data = {
    labels: series.map((_, index) => index),
    datasets: [
      {
        label,
        data: series.map((value) => (value == null ? null : Math.round(value * 10) / 10)),
        borderColor: accent,
        backgroundColor: hexToRgba(accent, 0.14),
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 10,
        spanGaps: true
      }
    ]
  }
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        displayColors: false,
        backgroundColor: colors.card,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.grid,
        borderWidth: 1,
        padding: 8,
        titleFont: { size: 11 },
        bodyFont: { family: 'ui-monospace, monospace', size: 11 },
        callbacks: {
          label: (item) => `${label}: ${item.parsed.y}${unit}`
        }
      }
    },
    scales: {
      x: {
        display: false,
        grid: { display: false }
      },
      y: {
        min: 0,
        max: 100,
        beginAtZero: true,
        grid: { color: colors.grid },
        border: { display: false },
        ticks: {
          color: colors.muted,
          font: { size: 9 },
          maxTicksLimit: 5,
          callback: (value) => `${value}${unit}`
        }
      }
    }
  }
  return <Line data={data} options={options} />
}

// ===== 历史图表指标切换器 =====
function MetricPicker({ options, value, onChange }) {
  return (
    <div className="perf-metric-picker" role="tablist" aria-label="metric">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="tab"
          aria-selected={value === opt.key}
          className={`perf-metric ${value === opt.key ? 'active' : ''}`}
          onClick={() => onChange(opt.key)}
          title={opt.title}
        >
          <span className="perf-metric-dot" style={{ background: opt.accent }} />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// 历史折线卡片：标题 + 指标切换 + 图表
function HistoryCard({ title, options, value, onChange, series, accent, label }) {
  return (
    <GlassCard className="perf-history-card">
      <div className="perf-history-head">
        <h4>{title}</h4>
        <MetricPicker options={options} value={value} onChange={onChange} />
      </div>
      <div className="perf-history">
        <HistoryLine series={series} accent={accent} label={label} />
      </div>
    </GlassCard>
  )
}

function StatChip({ label, value }) {
  return (
    <div className="perf-chip">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function PerformanceMonitor() {
  const t = useT()
  const [tab, setTab] = useState('overview')
  const [metric, setMetric] = useState('cpu')
  const [snapshot, setSnapshot] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const result = await perfApi.snapshot()
        if (cancelled) return
        if (result?.error) throw new Error(result.error)
        setSnapshot(result)
        setError('')
        setHistory((prev) => {
          const disks = Array.isArray(result.disks) ? result.disks : []
          const totalBytes = disks.reduce((sum, d) => sum + (Number(d.total) || 0), 0)
          const usedBytes = disks.reduce((sum, d) => sum + (Number(d.total) || 0) - (Number(d.free) || 0), 0)
          const next = [
            ...prev,
            {
              cpu: Number.isFinite(result.cpu?.usage) ? result.cpu.usage : null,
              mem: Number.isFinite(result.memory?.usage) ? result.memory.usage : null,
              disk: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : null,
              // 多显卡：每卡使用率数组
              gpu: Array.isArray(result.gpu?.devices)
                ? result.gpu.devices.map((d) => (Number.isFinite(d.usage) ? d.usage : null))
                : []
            }
          ]
          return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next
        })
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err))
      }
    }
    poll()
    const timer = window.setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const mem = snapshot?.memory
  const disks = Array.isArray(snapshot?.disks) ? snapshot.disks : []
  const totalBytes = disks.reduce((sum, d) => sum + (Number(d.total) || 0), 0)
  const usedBytes = disks.reduce((sum, d) => sum + (Number(d.total) || 0) - (Number(d.free) || 0), 0)
  const diskUsage = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : null
  const gpu = snapshot?.gpu
  const cpu = snapshot?.cpu
  const cpuUsage = Number.isFinite(cpu?.usage) ? cpu.usage : null
  const memUsage = Number.isFinite(mem?.usage) ? mem.usage : null
  const gpuUsage = Number.isFinite(gpu?.usage) ? gpu.usage : null
  const gpuDevices = Array.isArray(gpu?.devices) && gpu.devices.length > 0 ? gpu.devices : null

  const seriesOf = (metricName, index) => {
    if (metricName === 'gpu') {
      return history.map((item) => (Number.isFinite(item.gpu?.[index]) ? item.gpu[index] : null))
    }
    return history.map((item) => (Number.isFinite(item[metricName]) ? item[metricName] : null))
  }

  // 历史图可选的指标：CPU / 内存 / 磁盘 / 每张显卡
  const metricOptions = useMemo(() => {
    const options = [
      { key: 'cpu', label: 'CPU', accent: ACCENT.cpu },
      { key: 'memory', label: t('perf.tabMemory'), accent: ACCENT.memory },
      { key: 'disk', label: t('perf.tabDisk'), accent: ACCENT.disk }
    ]
    if (gpuDevices) {
      gpuDevices.forEach((dev, index) => {
        options.push({
          key: `gpu:${index}`,
          label: dev.shortName || `GPU ${index + 1}`,
          accent: ACCENT.gpu,
          title: dev.name
        })
      })
    }
    return options
  }, [gpuDevices, t])

  const active = (() => {
    if (metric === 'cpu') return { series: seriesOf('cpu'), accent: ACCENT.cpu, label: 'CPU' }
    if (metric === 'memory') return { series: seriesOf('memory'), accent: ACCENT.memory, label: t('perf.tabMemory') }
    if (metric === 'disk') return { series: seriesOf('disk'), accent: ACCENT.disk, label: t('perf.tabDisk') }
    const index = Number(String(metric).replace('gpu:', ''))
    const dev = gpuDevices?.[index]
    return {
      series: seriesOf('gpu', index),
      accent: ACCENT.gpu,
      label: dev?.shortName || `GPU ${index + 1}`
    }
  })()

  const tabs = [
    { key: 'overview', label: t('perf.tabOverview'), icon: Gauge },
    { key: 'cpu', label: 'CPU', icon: Cpu },
    { key: 'memory', label: t('perf.tabMemory'), icon: MemoryStick },
    { key: 'disk', label: t('perf.tabDisk'), icon: HardDrive },
    { key: 'gpu', label: 'GPU', icon: Activity }
  ]

  if (error) {
    return (
      <div className="perf-page">
        <div className="perf-message error">
          <CircleAlert size={20} />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="perf-page">
      <div className="perf-tabs" role="tablist" aria-label={t('perf.title')}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`perf-tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="perf-body">
        {!snapshot ? (
          <div className="perf-message">{t('perf.loading')}</div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="perf-overview">
                <GlassCard className="perf-card perf-card-clickable" onClick={() => setTab('cpu')}>
                  <h3>CPU</h3>
                  <RingGauge value={cpuUsage} accent={ACCENT.cpu} size={128} />
                  <div className="perf-card-foot">
                    <span className="dot" style={{ background: ACCENT.cpu }} />
                    <span>{t('perf.cores')} {cpu?.cores ?? '—'} · {formatClock(cpu?.speed)}</span>
                  </div>
                </GlassCard>
                <GlassCard className="perf-card perf-card-clickable" onClick={() => setTab('memory')}>
                  <h3>{t('perf.tabMemory')}</h3>
                  <RingGauge value={memUsage} accent={ACCENT.memory} size={128} />
                  <div className="perf-card-foot">
                    <span className="dot" style={{ background: ACCENT.memory }} />
                    <span>{formatBytes(mem?.used)} / {formatBytes(mem?.total)}</span>
                  </div>
                </GlassCard>
                <GlassCard className="perf-card perf-card-clickable" onClick={() => setTab('disk')}>
                  <h3>{t('perf.tabDisk')}</h3>
                  <RingGauge value={diskUsage} accent={ACCENT.disk} size={128} />
                  <div className="perf-card-foot">
                    <span className="dot" style={{ background: ACCENT.disk }} />
                    <span>{formatBytes(usedBytes)} / {formatBytes(totalBytes)}</span>
                  </div>
                </GlassCard>
                {gpuDevices ? (
                  gpuDevices.map((dev) => (
                    <GlassCard
                      key={dev.id}
                      className="perf-card perf-card-clickable"
                      onClick={() => setTab('gpu')}
                    >
                      <h3>{dev.shortName}</h3>
                      <RingGauge value={dev.usage} accent={ACCENT.gpu} size={128} />
                      <div className="perf-card-foot">
                        <span className="dot" style={{ background: ACCENT.gpu }} />
                        <span className="perf-gpu-name" title={dev.name}>
                          {dev.name || t('perf.na')}
                        </span>
                        {(dev.temp != null || dev.fan != null) && (
                          <span>
                            {[dev.temp != null ? `${Math.round(dev.temp)}°C` : null, dev.fan != null ? `${Math.round(dev.fan)}%` : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                    </GlassCard>
                  ))
                ) : (
                  <GlassCard className="perf-card perf-card-clickable" onClick={() => setTab('gpu')}>
                    <h3>GPU</h3>
                    <RingGauge value={gpuUsage} accent={ACCENT.gpu} size={128} />
                    <div className="perf-card-foot">
                      <span className="dot" style={{ background: ACCENT.gpu }} />
                      <span className="perf-gpu-name" title={gpu?.name || ''}>
                        {gpu?.name || t('perf.na')}
                      </span>
                    </div>
                  </GlassCard>
                )}
              </div>
            )}

            {tab === 'cpu' && (
              <div className="perf-detail">
                <div className="perf-detail-main">
                  <div className="perf-gauges">
                    <GlassCard className="perf-gauge-card">
                      <h4>{t('perf.cpuUsage')}</h4>
                      <RingGauge value={cpuUsage} accent={ACCENT.cpu} size={176} />
                    </GlassCard>
                  </div>
                  <HistoryCard
                    title={t('perf.history')}
                    options={metricOptions}
                    value={metric}
                    onChange={setMetric}
                    series={active.series}
                    accent={active.accent}
                    label={active.label}
                  />
                </div>
                <div className="perf-chip-row">
                  <StatChip label={t('perf.cores')} value={cpu?.cores ?? '—'} />
                  <StatChip label={t('perf.speed')} value={formatClock(cpu?.speed)} />
                  <StatChip label={t('perf.cpuTemp')} value={cpu?.temp != null ? `${Math.round(cpu.temp)}°C` : t('perf.na')} />
                </div>
              </div>
            )}

            {tab === 'memory' && (
              <div className="perf-detail">
                <div className="perf-detail-main">
                  <div className="perf-gauges">
                    <GlassCard className="perf-gauge-card">
                      <h4>{t('perf.memoryUsage')}</h4>
                      <RingGauge value={memUsage} accent={ACCENT.memory} size={176} />
                    </GlassCard>
                  </div>
                  <HistoryCard
                    title={t('perf.history')}
                    options={metricOptions}
                    value={metric}
                    onChange={setMetric}
                    series={active.series}
                    accent={active.accent}
                    label={active.label}
                  />
                </div>
                <div className="perf-chip-row">
                  <StatChip label={t('perf.memUsed')} value={formatBytes(mem?.used)} />
                  <StatChip label={t('perf.memTotal')} value={formatBytes(mem?.total)} />
                  <StatChip label={t('perf.memoryUsage')} value={memUsage != null ? `${Math.round(memUsage)}%` : t('perf.na')} />
                </div>
              </div>
            )}

            {tab === 'disk' && (
              <div className="perf-detail">
                <div className="perf-detail-main">
                  <div className="perf-gauges">
                    <GlassCard className="perf-gauge-card">
                      <h4>{t('perf.diskUsage')}</h4>
                      <RingGauge value={diskUsage} accent={ACCENT.disk} size={176} />
                    </GlassCard>
                  </div>
                  <HistoryCard
                    title={t('perf.history')}
                    options={metricOptions}
                    value={metric}
                    onChange={setMetric}
                    series={active.series}
                    accent={active.accent}
                    label={active.label}
                  />
                </div>
                <div className="perf-drive-list">
                  {disks.length === 0 ? (
                    <div className="perf-message">{t('perf.noDrives')}</div>
                  ) : (
                    disks.map((drive) => {
                      const total = Number(drive.total) || 0
                      const used = total - (Number(drive.free) || 0)
                      const usage = total > 0 ? (used / total) * 100 : 0
                      return (
                        <GlassCard key={drive.letter} className="perf-drive">
                          <RingGauge value={usage} accent={ACCENT.disk} size={86} label={drive.letter} />
                          <div className="perf-drive-copy">
                            <strong>{drive.letter}</strong>
                            <small>{formatBytes(used)} / {formatBytes(total)}</small>
                            <small>{Math.round(usage)}%</small>
                          </div>
                        </GlassCard>
                      )
                    })
                  )}
                </div>
              </div>
            )}

            {tab === 'gpu' && (
              <div className="perf-detail">
                {!gpu?.present ? (
                  <GlassCard className="perf-message" hover={false}>
                    <CircleAlert size={20} />
                    <span>{t('perf.noGpu')}</span>
                  </GlassCard>
                ) : (
                  <>
                    {gpuDevices ? (
                      <div className="perf-gpu-grid">
                        {gpuDevices.map((dev) => {
                          const vramPct = dev.vramTotal > 0 ? ((dev.vramUsed ?? 0) / dev.vramTotal) * 100 : null
                          return (
                            <GlassCard key={dev.id} className="perf-gpu-card">
                              <div className="perf-gpu-card-head">
                                <h4 className="perf-gpu-card-name" title={dev.name}>{dev.name}</h4>
                                <span className="perf-gpu-card-badge">
                                  {dev.vendor === 'nvidia' ? 'NVIDIA' : dev.vendor === 'amd' ? 'AMD' : dev.vendor === 'intel' ? 'Intel' : 'GPU'}
                                </span>
                              </div>
                              <div className="perf-gpu-card-gauges">
                                <div className="perf-gpu-gauge">
                                  <RingGauge value={dev.usage} accent={ACCENT.gpu} size={112} label={t('perf.gpuUsage')} />
                                  <div className="perf-gpu-gauge-meta">
                                    <small>{t('perf.gpuUsage')}</small>
                                    <strong>{dev.usage != null ? `${Math.round(dev.usage)}%` : t('perf.na')}</strong>
                                  </div>
                                </div>
                                <div className="perf-gpu-gauge">
                                  <RingGauge value={vramPct} accent={ACCENT.memory} size={112} label={t('perf.gpuVram')} />
                                  <div className="perf-gpu-gauge-meta">
                                    <small>{t('perf.gpuVram')}</small>
                                    <strong>
                                      {dev.vramUsed != null ? formatBytes(dev.vramUsed) : t('perf.na')}
                                      {dev.vramTotal != null ? ` / ${formatBytes(dev.vramTotal)}` : ''}
                                    </strong>
                                  </div>
                                </div>
                              </div>
                              <div className="perf-gpu-card-foot">
                                {dev.temp != null && <span className="perf-chip-mini">{Math.round(dev.temp)}°C</span>}
                                {dev.fan != null && <span className="perf-chip-mini">{Math.round(dev.fan)}% · 风扇</span>}
                                {!gpuDevices.some((d) => d.temp != null) && <span className="perf-chip-mini muted">{t('perf.gpuTemp')}: {t('perf.na')}</span>}
                              </div>
                            </GlassCard>
                          )
                        })}
                      </div>
                    ) : (
                      <GlassCard className="perf-message" hover={false}>
                        <CircleAlert size={20} />
                        <span>{t('perf.noGpu')}</span>
                      </GlassCard>
                    )}
                    <HistoryCard
                      title={t('perf.history')}
                      options={metricOptions}
                      value={metric}
                      onChange={setMetric}
                      series={active.series}
                      accent={active.accent}
                      label={active.label}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default PerformanceMonitor
