// 进程占用排行组件（性能监视页）
// 进入内存 tab 时按内存占用降序展示，进入 GPU tab 时按 GPU 使用率降序展示。
// 数据由主进程 perfMonitor.getTopProcesses() 返回（GPU/进程基表均有缓存，开销低）。
// GPU 排行支持按显卡过滤（luid），默认跟随首张显卡；分页每页最多 10 条防止渲染卡顿。
// 禁止内层滚动：列表直接展开，由外层页面滚动容器统一滚动。
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  Trophy
} from 'lucide-react'
import GlassCard from '../ui/GlassCard'
import { perfApi } from '../../lib/ipc'
import { useT } from '../../hooks/useT'
import './ProcessRankList.css'

const PAGE_SIZE = 10
const REFRESH_MS = 5000

function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function ProcessRankList({ metric = 'memory', accent, gpus = [] }) {
  const t = useT()
  const isGpu = metric === 'gpu'
  const [rows, setRows] = useState([])
  const [updatedAt, setUpdatedAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  // 显卡过滤：null 表示无过滤（全部）；有值时为 LUID
  const [gpuFilter, setGpuFilter] = useState(null)

  useEffect(() => {
    if (!isGpu) return
    setGpuFilter((prev) => (prev == null && gpus.length > 0 ? gpus[0].luid : prev))
  }, [isGpu, gpus])

  const load = useCallback(async () => {
    try {
      const result = await perfApi.topProcesses()
      const list = isGpu ? result?.gpu : result?.memory
      setRows(Array.isArray(list) ? list : [])
      setUpdatedAt(
        result?.updatedAt
          ? new Date(result.updatedAt).toLocaleTimeString([], { hour12: false })
          : ''
      )
      setError('')
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [isGpu])

  useEffect(() => {
    setLoading(true)
    setRows([])
    setPage(1)
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  const filtered = useMemo(() => {
    if (!isGpu || gpuFilter == null) return rows
    return rows.filter((item) => item.luid === gpuFilter)
  }, [isGpu, gpuFilter, rows])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const gpuOptions = useMemo(
    () => [{ luid: null, label: t('perf.rankAll') }, ...gpus],
    [gpus, t]
  )

  return (
    <GlassCard hover={false} className="perf-rank">
      <div className="perf-rank-head">
        <h4>
          <Trophy size={13} />
          {t('perf.topProcesses')}
        </h4>
        <div className="perf-rank-meta">
          {isGpu && gpus.length > 1 && (
            <div className="perf-rank-gpu-filter" role="group" aria-label={t('perf.rankGpuFilter')}>
              {gpuOptions.map((opt) => (
                <button
                  key={opt.luid ?? 'all'}
                  type="button"
                  className={(gpuFilter ?? null) === opt.luid ? 'active' : ''}
                  onClick={() => { setGpuFilter(opt.luid); setPage(1) }}
                  title={opt.label}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {updatedAt && <small>{t('perf.rankUpdated', { time: updatedAt })}</small>}
          <strong>{filtered.length}</strong>
        </div>
      </div>

      {error ? (
        <div className="perf-rank-message error">
          <CircleAlert size={18} />
          <span>{error}</span>
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="perf-rank-message">
          <LoaderCircle size={18} className="perf-rank-spin" />
          {t('perf.rankLoading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="perf-rank-message">{t('perf.rankEmpty')}</div>
      ) : (
        <>
          <div className="perf-rank-list" role="list">
            {pageRows.map((item, index) => {
              const rank = (currentPage - 1) * PAGE_SIZE + index + 1
              const value = isGpu
                ? `${Math.round(item.gpu ?? 0)}%`
                : formatBytes(item.memory)
              const sub = isGpu && item.vram != null
                ? `VRAM ${formatBytes(item.vram)}`
                : item.path
              return (
                <div key={`${item.luid || ''}-${item.pid}`} className="perf-rank-row" role="listitem">
                  <span
                    className={`perf-rank-num ${rank <= 3 ? 'top' : ''}`}
                    style={rank <= 3 ? { background: accent } : undefined}
                  >
                    {rank}
                  </span>
                  <span className="perf-rank-app" title={sub || undefined}>
                    <strong>{item.name || t('processes.unknownName')}</strong>
                    <small>{sub || ''}</small>
                  </span>
                  {item.cpu != null && (
                    <span className="perf-rank-cpu" title={`CPU ${item.cpu}%`}>CPU {Math.round(item.cpu)}%</span>
                  )}
                  <code className="perf-rank-pid">{item.pid}</code>
                  <strong className="perf-rank-value" style={{ color: accent }}>
                    {value}
                  </strong>
                </div>
              )
            })}
          </div>
          {totalPages > 1 && (
            <div className="perf-rank-pager">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
                aria-label={t('processes.prevAria')}
              >
                <ChevronLeft size={14} />
              </button>
              <span>{t('perf.rankPage', { page: currentPage, total: totalPages })}</span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage >= totalPages}
                aria-label={t('processes.nextAria')}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}

export default ProcessRankList
