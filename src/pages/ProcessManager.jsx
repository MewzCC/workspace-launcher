import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AppWindow,
  CircleStop,
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

const MAX_VISIBLE_ROWS = 300

function formatMemory(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function ProcessManagerPage() {
  const [processes, setProcesses] = useState([])
  const [query, setQuery] = useState('')
  const [portOnly, setPortOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const [terminatingPid, setTerminatingPid] = useState(null)

  const loadProcesses = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true)
    try {
      const result = await processApi.list()
      if (result?.error) throw new Error(result.error)
      setProcesses(Array.isArray(result) ? result : [])
      setError('')
      setLastUpdated(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    } catch (err) {
      setError(err?.message || '无法读取系统进程')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProcesses()
    const timer = window.setInterval(() => loadProcesses({ quiet: true }), 10000)
    return () => window.clearInterval(timer)
  }, [loadProcesses])

  const filteredProcesses = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return processes.filter((item) => {
      if (portOnly && !item.ports?.length) return false
      if (!keyword) return true
      const ports = (item.ports || []).flatMap((port) => [
        String(port.localPort),
        `${port.protocol}:${port.localPort}`,
        `${port.localAddress}:${port.localPort}`
      ])
      return [String(item.pid), item.name, item.path, ...ports]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
  }, [processes, portOnly, query])

  const visibleProcesses = filteredProcesses.slice(0, MAX_VISIBLE_ROWS)
  const portProcessCount = processes.filter((item) => item.ports?.length).length
  const listeningPortCount = processes.reduce(
    (total, item) => total + (item.ports?.length || 0),
    0
  )
  const totalMemory = processes.reduce(
    (total, item) => total + (Number(item.workingSetBytes) || 0),
    0
  )

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
      await loadProcesses({ quiet: true })
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
          <p className="page-subtitle">按应用名称、PID、路径或监听端口定位并关闭相关进程</p>
        </div>
        <GlowButton
          variant="ghost"
          size="md"
          onClick={() => loadProcesses()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'process-spin' : ''} />
          刷新进程
        </GlowButton>
      </section>

      <section className="process-stats" aria-label="进程概况">
        <button type="button" className={!portOnly ? 'active' : ''} onClick={() => setPortOnly(false)}>
          <span className="process-stat-icon indigo"><AppWindow size={18} /></span>
          <span><strong>{processes.length}</strong><small>系统进程</small></span>
        </button>
        <button type="button" className={portOnly ? 'active' : ''} onClick={() => setPortOnly(true)}>
          <span className="process-stat-icon cyan"><Network size={18} /></span>
          <span><strong>{listeningPortCount}</strong><small>{portProcessCount} 个进程正在监听</small></span>
        </button>
        <div className="process-stat-static">
          <span className="process-stat-icon amber"><MemoryStick size={18} /></span>
          <span><strong>{formatMemory(totalMemory)}</strong><small>已统计工作集</small></span>
        </div>
      </section>

      <GlassCard hover={false} className="process-console">
        <div className="process-toolbar">
          <div className="process-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索应用名称、PID、端口或完整路径…"
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
            <strong>{filteredProcesses.length} 个结果</strong>
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
        ) : visibleProcesses.length === 0 ? (
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
                {visibleProcesses.map((item) => (
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

        {filteredProcesses.length > MAX_VISIBLE_ROWS && (
          <div className="process-limit-note">
            当前显示前 {MAX_VISIBLE_ROWS} 项，请输入应用名、PID 或端口缩小范围。
          </div>
        )}
      </GlassCard>
    </div>
  )
}

export default ProcessManagerPage
