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
import { processApi } from '../lib/ipc'
import './ProcessManager.css'

const PAGE_SIZE = 30

function formatMemory(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function ProcessManagerPage() {
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
        setError(err?.message || '无法读取系统进程')
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
    loadProcesses()
    const timer = window.setInterval(
      () => loadProcesses({ quiet: true, force: true }),
      15000
    )
    return () => window.clearInterval(timer)
  }, [loadProcesses])

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
      ? `\n监听端口：${item.ports.map((port) => `${port.protocol} ${port.localPort}`).join('、')}`
      : ''
    const confirmed = window.confirm(
      `确认结束「${item.name}」及其子进程吗？\nPID：${item.pid}${portText}\n\n未保存的数据可能会丢失。`
    )
    if (!confirmed) return

    setTerminatingPid(item.pid)
    try {
      const result = await processApi.terminate(item.pid)
      if (result?.error) throw new Error(result.error)
      await loadProcesses({ quiet: true, force: true })
    } catch (err) {
      window.alert(`结束进程失败：${err?.message || err}`)
    } finally {
      setTerminatingPid(null)
    }
  }

  return (
    <div className="process-page">
      <section className="page-header process-header">
        <div className="page-header-left">
          <div className="process-eyebrow"><Activity size={13} /> SYSTEM PROCESS CONTROL</div>
          <h1 className="page-title">进程管理</h1>
          <p className="page-subtitle">按应用名称、PID 或监听端口定位并关闭相关进程</p>
        </div>
        <GlowButton
          variant="ghost"
          size="md"
          onClick={() => loadProcesses({ force: true })}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'process-spin' : ''} />
          刷新进程
        </GlowButton>
      </section>

      <section className="process-stats" aria-label="进程概况">
        <button type="button" className={!portOnly ? 'active' : ''} onClick={() => { setPortOnly(false); setPage(1) }}>
          <span className="process-stat-icon indigo"><AppWindow size={18} /></span>
          <span><strong>{summary.processCount || 0}</strong><small>系统进程</small></span>
        </button>
        <button type="button" className={portOnly ? 'active' : ''} onClick={() => { setPortOnly(true); setPage(1) }}>
          <span className="process-stat-icon cyan"><Network size={18} /></span>
          <span><strong>{summary.listeningPortCount || 0}</strong><small>{summary.portProcessCount || 0} 个进程正在监听</small></span>
        </button>
        <div className="process-stat-static">
          <span className="process-stat-icon amber"><MemoryStick size={18} /></span>
          <span><strong>{formatMemory(summary.totalMemory)}</strong><small>已统计工作集</small></span>
        </div>
      </section>

      <GlassCard hover={false} className="process-console">
        <div className="process-toolbar">
          <div className="process-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索应用名称、PID 或端口…"
              aria-label="搜索进程"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">
                <X size={16} />
              </button>
            )}
          </div>
          <div className="process-result-meta">
            {lastUpdated && <span>更新于 {lastUpdated}</span>}
            <strong>{pagination.total} 个结果</strong>
          </div>
        </div>

        {error ? (
          <div className="process-message error">
            <CircleStop size={20} />
            <span>{error}</span>
            <button type="button" onClick={() => loadProcesses()}>重新加载</button>
          </div>
        ) : loading && processes.length === 0 ? (
          <div className="process-message">
            <LoaderCircle size={22} className="process-spin" />
            正在读取 Windows 进程与监听端口…
          </div>
        ) : processes.length === 0 ? (
          <div className="process-message">没有找到匹配的进程</div>
        ) : (
          <div className="process-table-wrap">
            <table className="process-table">
              <thead>
                <tr>
                  <th>应用</th>
                  <th><Hash size={13} /> PID</th>
                  <th>监听端口</th>
                  <th>内存</th>
                  <th><span className="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                {processes.map((item) => (
                  <tr key={item.pid}>
                    <td>
                      <div className="process-app-cell">
                        <span className="process-avatar">{String(item.name || '?').charAt(0).toUpperCase()}</span>
                        <span className="process-app-copy">
                          <strong>{item.name || '未知进程'}</strong>
                          <small title={item.path || '系统进程或路径不可见'}>
                            {item.path || '系统进程或路径不可见'}
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
                        <span className="process-protected" title="Windows 核心进程或 LaunchPad 自身受到保护">
                          <ShieldCheck size={15} /> 已保护
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="process-kill"
                          disabled={terminatingPid === item.pid}
                          onClick={() => handleTerminate(item)}
                          title="结束该进程及其子进程"
                        >
                          {terminatingPid === item.pid
                            ? <LoaderCircle size={15} className="process-spin" />
                            : <CircleStop size={15} />}
                          结束
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
          <div className="process-pagination" aria-label="进程列表分页">
            <span className="process-page-summary">
              第 {page} / {pagination.totalPages} 页 · 每页 {PAGE_SIZE} 条
            </span>
            <div className="process-page-controls">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || loading}
                aria-label="上一页"
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
                aria-label="下一页"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

export default ProcessManagerPage
