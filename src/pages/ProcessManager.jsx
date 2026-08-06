import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AppWindow,
  CircleStop,
  ChevronLeft,
  ChevronRight,
  Hash,
  LoaderCircle,
  MemoryStick,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  X
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import { useConfirmDialog } from '../components/ConfirmDialog'
import PerformanceMonitor from './PerformanceMonitor'
import { processApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import './ProcessManager.css'

const PAGE_SIZE = 30

function formatMemory(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function ProcessManagerPage() {
  const t = useT()
  const confirm = useConfirmDialog()
  const [processes, setProcesses] = useState([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [portOnly, setPortOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [summary, setSummary] = useState({
    processCount: 0,
    portProcessCount: 0,
    listeningPortCount: 0,
    totalMemory: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [terminatingPid, setTerminatingPid] = useState(null)
  // 'list' = 进程列表，'perf' = 性能监视
  const [mode, setMode] = useState('list')
  const requestIdRef = useRef(0)

  const loadProcesses = useCallback(async ({ quiet = false, force = false } = {}) => {
    const requestId = ++requestIdRef.current
    if (!quiet) {
      setLoading(true)
      setProcesses([])
    }
    try {
      const result = await processApi.list({
        page,
        pageSize: PAGE_SIZE,
        query: debouncedQuery,
        portOnly,
        force
      })
      if (result?.error) throw new Error(result.error)
      if (requestId !== requestIdRef.current) return
      setProcesses(Array.isArray(result?.items) ? result.items : [])
      setPage(result?.page || 1)
      setPagination({
        total: Number(result?.total) || 0,
        totalPages: Math.max(1, Number(result?.totalPages) || 1)
      })
      setSummary(result?.summary || {})
      setError('')
      setLastUpdated(
        new Date(result?.updatedAt || Date.now()).toLocaleTimeString('zh-CN', { hour12: false })
      )
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(err?.message || t('processes.loadFailed'))
      }
    } finally {
      if (!quiet && requestId === requestIdRef.current) setLoading(false)
    }
  }, [debouncedQuery, page, portOnly])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    // 性能监视页打开时暂停进程轮询，避免后台开销
    if (mode !== 'list') return
    loadProcesses()
    const timer = window.setInterval(
      () => loadProcesses({ quiet: true, force: true }),
      15000
    )
    return () => window.clearInterval(timer)
  }, [loadProcesses, mode])

  const pageNumbers = useMemo(() => {
    const totalPages = pagination.totalPages
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
    const numbers = [...new Set([1, page - 1, page, page + 1, totalPages])]
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((a, b) => a - b)
    const result = []
    numbers.forEach((value, index) => {
      if (index > 0 && value - numbers[index - 1] > 1) result.push(`ellipsis-${value}`)
      result.push(value)
    })
    return result
  }, [page, pagination.totalPages])

  const handleTerminate = async (item) => {
    const portText = item.ports?.length
      ? t('processes.killPorts', { ports: item.ports.map((port) => `${port.protocol} ${port.localPort}`).join('、') })
      : ''
    const confirmed = await confirm({
      title: t('processes.kill'),
      message: t('processes.killConfirm', { name: item.name, pid: item.pid, ports: portText }),
      confirmText: t('processes.kill'),
      tone: 'danger',
      icon: 'warning'
    })
    if (!confirmed) return

    setTerminatingPid(item.pid)
    try {
      const result = await processApi.terminate(item.pid)
      if (result?.error) throw new Error(result.error)
      await loadProcesses({ quiet: true, force: true })
    } catch (err) {
      window.alert(`${t('processes.killFailed')}${err?.message || err}`)
    } finally {
      setTerminatingPid(null)
    }
  }

  return (
    <div className="process-page">
      <section className="page-header process-header">
        <div className="page-header-left">
          <div className="process-eyebrow"><Activity size={13} /> {t('processes.eyebrow')}</div>
          <h1 className="page-title">{t('processes.title')}</h1>
          <p className="page-subtitle">{mode === 'perf' ? t('perf.subtitle') : t('processes.subtitle')}</p>
        </div>
        <div className="process-header-actions">
          {mode === 'list' && (
            <GlowButton
              variant="ghost"
              size="md"
              onClick={() => loadProcesses({ force: true })}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'process-spin' : ''} />
              {t('processes.refresh')}
            </GlowButton>
          )}
          <div className="process-view-switch" role="group" aria-label={t('processes.viewSwitchAria')}>
            <button
              type="button"
              className={mode === 'list' ? 'active' : ''}
              onClick={() => setMode('list')}
            >
              <AppWindow size={14} />
              <span>{t('processes.viewProcesses')}</span>
            </button>
            <button
              type="button"
              className={mode === 'perf' ? 'active' : ''}
              onClick={() => setMode('perf')}
            >
              <Activity size={14} />
              <span>{t('processes.viewPerformance')}</span>
            </button>
          </div>
        </div>
      </section>

      {mode === 'perf' ? (
        <PerformanceMonitor />
      ) : (
        <>
          <section className="process-stats" aria-label={t('processes.statsAria')}>
        <button type="button" className={!portOnly ? 'active' : ''} onClick={() => { setPortOnly(false); setPage(1) }}>
          <span className="process-stat-icon indigo"><AppWindow size={18} /></span>
          <span><strong>{summary.processCount || 0}</strong><small>{t('processes.processCount')}</small></span>
        </button>
        <button type="button" className={portOnly ? 'active' : ''} onClick={() => { setPortOnly(true); setPage(1) }}>
          <span className="process-stat-icon cyan"><Network size={18} /></span>
          <span><strong>{summary.listeningPortCount || 0}</strong><small>{t('processes.listening', { count: summary.portProcessCount || 0 })}</small></span>
        </button>
        <div className="process-stat-static">
          <span className="process-stat-icon amber"><MemoryStick size={18} /></span>
          <span><strong>{formatMemory(summary.totalMemory)}</strong><small>{t('processes.totalMemory')}</small></span>
        </div>
      </section>

      <GlassCard hover={false} className="process-console">
        <div className="process-toolbar">
          <div className="process-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('processes.searchPlaceholder')}
              aria-label={t('processes.searchAria')}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}>
                <X size={16} />
              </button>
            )}
          </div>
          <div className="process-result-meta">
            {lastUpdated && <span>{t('processes.updatedAt', { time: lastUpdated })}</span>}
            <strong>{t('processes.results', { count: pagination.total })}</strong>
          </div>
        </div>

        {error ? (
          <div className="process-message error">
            <CircleStop size={20} />
            <span>{error}</span>
            <button type="button" onClick={() => loadProcesses()}>{t('processes.reload')}</button>
          </div>
        ) : loading && processes.length === 0 ? (
          <div className="process-message">
            <LoaderCircle size={22} className="process-spin" />
            {t('processes.loading')}
          </div>
        ) : processes.length === 0 ? (
          <div className="process-message">{t('processes.noMatch')}</div>
        ) : (
          <div className="process-table-wrap">
            <table className="process-table">
              <thead>
                <tr>
                  <th>{t('processes.colApp')}</th>
                  <th><Hash size={13} /> PID</th>
                  <th>{t('processes.colPorts')}</th>
                  <th>{t('processes.colMemory')}</th>
                  <th><span className="sr-only">{t('processes.colAction')}</span></th>
                </tr>
              </thead>
              <tbody>
                {processes.map((item) => (
                  <tr key={item.pid}>
                    <td>
                      <div className="process-app-cell">
                        <span className="process-avatar">{String(item.name || '?').charAt(0).toUpperCase()}</span>
                        <span className="process-app-copy">
                          <strong>{item.name || t('processes.unknownName')}</strong>
                          <small title={item.path || t('processes.systemPath')}>
                            {item.path || t('processes.systemPath')}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td><code className="process-pid">{item.pid}</code></td>
                    <td>
                      <div className="process-ports">
                        {(item.ports || []).length === 0 ? (
                          <span className="process-port-empty">—</span>
                        ) : (
                          item.ports.slice(0, 5).map((port, index) => (
                            <span
                              key={`${port.protocol}-${port.localAddress}-${port.localPort}-${index}`}
                              className={`process-port ${port.protocol.toLowerCase()}`}
                              title={`${port.protocol} ${port.localAddress}:${port.localPort}`}
                            >
                              {port.protocol} {port.localPort}
                            </span>
                          ))
                        )}
                        {item.ports?.length > 5 && <span className="process-port-more">+{item.ports.length - 5}</span>}
                      </div>
                    </td>
                    <td><span className="process-memory">{formatMemory(item.workingSetBytes)}</span></td>
                    <td className="process-action-cell">
                      {item.protected ? (
                        <span className="process-protected" title={t('processes.protectedTitle')}>
                          <ShieldCheck size={15} /> {t('processes.protected')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="process-kill"
                          disabled={terminatingPid === item.pid}
                          onClick={() => handleTerminate(item)}
                          title={t('processes.killTitle')}
                        >
                          {terminatingPid === item.pid
                            ? <LoaderCircle size={15} className="process-spin" />
                            : <CircleStop size={15} />}
                          {t('processes.kill')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!error && (
          <div className="process-pagination" aria-label={t('processes.pageAria')}>
            <span className="process-page-summary">
              {t('processes.pageSummary', { page, total: pagination.totalPages, size: PAGE_SIZE })}
            </span>
            <div className="process-page-controls">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loading}
                aria-label={t('processes.prevAria')}
              >
                <ChevronLeft size={15} />
              </button>
              {pagination.totalPages > 1 && pageNumbers.map((value) => typeof value === 'number' ? (
                <button
                  key={value}
                  type="button"
                  className={value === page ? 'active' : ''}
                  onClick={() => setPage(value)}
                  disabled={loading}
                  aria-current={value === page ? 'page' : undefined}
                >
                  {value}
                </button>
              ) : (
                <span key={value}>…</span>
              ))}
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))}
                disabled={page >= pagination.totalPages || loading}
                aria-label={t('processes.nextAria')}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </GlassCard>
        </>
      )}
    </div>
  )
}

export default ProcessManagerPage
