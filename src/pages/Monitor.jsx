// 状态监控页面
// 顶部工作空间选择器 + 当前工作空间运行状态 + 启动日志列表
// 工作空间变化时拉取日志并更新 store.logs
import React, { useEffect, useMemo } from 'react'
import GlassCard from '../components/ui/GlassCard'
import { useStore } from '../store/useStore'
import { logsApi } from '../lib/ipc'
import { useProcessStatuses } from '../hooks/useProcessStatuses'
import { useT } from '../hooks/useT'
import './Monitor.css'

// 状态枚举到文案的映射由 useT 动态提供
// 根据启动进度判断单个软件当前状态
// launching: store.launching；softwareId: 软件记录 id；activeWorkspaceId: 当前监控的工作空间 id
function resolveSoftwareStatus(launching, software, activeWorkspaceId, processStatuses) {
  if (processStatuses[software.path]) return 'running'

  // 实际进程未运行时，仅在启动流程中展示瞬时进度
  if (
    !launching ||
    !launching.active ||
    launching.workspaceId !== activeWorkspaceId
  ) {
    return 'stopped'
  }
  // 在进度数组中找该软件的最新一条记录
  const items = (launching.progress || []).filter(
    (p) => p.softwareId === software.id
  )
  if (items.length === 0) return 'pending'
  return items[items.length - 1].status || 'pending'
}

// 单个软件状态行：状态灯 + 软件名 + 状态文案
function StatusSoftware({ software, status }) {
  const t = useT()
  const labelMap = {
    pending: t('monitor.status.pending'),
    running: t('monitor.status.running'),
    success: t('monitor.status.success'),
    failed: t('monitor.status.failed'),
    stopped: t('monitor.status.stopped')
  }
  return (
    <div className="status-software">
      <span className={`status-dot ${status}`} />
      <span className="status-software-name">{software.name}</span>
      <span className={`status-software-label status-text-${status}`}>
        {labelMap[status] || status}
      </span>
    </div>
  )
}

// 单条日志行：时间 + 状态图标 + 软件名 + 消息
// 优先按 message_key + message_params 用当前语言翻译；无 key 时回退到持久化原文
function LogItem({ log, softwareName }) {
  const t = useT()
  const isFailed = log.status === 'failed'
  const isSuccess = log.status === 'success'
  let message = log.message || ''
  if (log.message_key) {
    const translated = t(log.message_key, log.message_params || {})
    if (translated && translated !== log.message_key) {
      message = translated
    }
  }
  return (
    <div className={`log-item ${isFailed ? 'failed' : ''}`}>
      <span className="log-time">{log.timestamp || ''}</span>
      <span className={`log-status-icon ${isSuccess ? 'success' : isFailed ? 'failed' : ''}`}>
        {isSuccess ? '✓' : isFailed ? '✗' : '•'}
      </span>
      <span className="log-software">{softwareName || '-'}</span>
      <span className="log-message">{message}</span>
    </div>
  )
}

function Monitor() {
  const t = useT()
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const logs = useStore((s) => s.logs)
  const launching = useStore((s) => s.launching)
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId)
  const setLogs = useStore((s) => s.setLogs)
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const monitoredSoftware = activeWorkspace?.software || []
  const processStatuses = useProcessStatuses(
    monitoredSoftware,
    `${launching?.active || false}:${launching?.progress?.length || 0}`
  )

  // 软件 id → name 映射，用于日志展示
  const softwareNameMap = useMemo(() => {
    const map = new Map()
    for (const s of software || []) {
      if (s && s.id != null) map.set(s.id, s.name)
    }
    return map
  }, [software])

  // 挂载或 activeWorkspaceId 变化时拉取日志
  useEffect(() => {
    let cancelled = false
    const fetchLogs = async () => {
      try {
        const list = activeWorkspaceId
          ? await logsApi.list(activeWorkspaceId, 100)
          : await logsApi.listAll(50)
        if (!cancelled) setLogs(list || [])
      } catch (err) {
        console.error('加载日志失败:', err)
        if (!cancelled) setLogs([])
      }
    }
    fetchLogs()
    return () => {
      cancelled = true
    }
  }, [activeWorkspaceId, setLogs])

  return (
    <div className="monitor-page">
      {/* 页面标题 */}
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t('monitor.title')}</h1>
          <p className="page-subtitle">{t('monitor.subtitle')}</p>
        </div>
      </section>

      {/* 工作空间选择器：按钮组 */}
      <div className="ws-picker">
        <button
          type="button"
          className={`ws-picker-btn ${activeWorkspaceId == null ? 'active' : ''}`}
          onClick={() => setActiveWorkspace(null)}
        >
          {t('monitor.all')}
        </button>
        {workspaces.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`ws-picker-btn ${activeWorkspaceId === w.id ? 'active' : ''}`}
            onClick={() => setActiveWorkspace(w.id)}
          >
            <span className="ws-picker-icon">{w.icon || '🚀'}</span>
            <span>{w.name}</span>
          </button>
        ))}
      </div>

      {/* 当前工作空间运行状态区 */}
      {activeWorkspace ? (
        <GlassCard hover={false} className="status-section">
          <div className="status-section-header">
            <span className="status-section-icon">{activeWorkspace.icon || '🚀'}</span>
            <span className="status-section-title">{activeWorkspace.name}</span>
          </div>
          {activeWorkspace.software && activeWorkspace.software.length > 0 ? (
            <div className="status-software-list">
              {activeWorkspace.software.map((sw) => (
                <StatusSoftware
                  key={sw.id}
                  software={sw}
                  status={resolveSoftwareStatus(
                    launching,
                    sw,
                    activeWorkspaceId,
                    processStatuses
                  )}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">{t('monitor.noSoftware')}</div>
          )}
        </GlassCard>
      ) : (
        <GlassCard hover={false} className="status-section">
          <div className="status-section-title">{t('monitor.noSelection')}</div>
        </GlassCard>
      )}

      {/* 日志区 */}
      <GlassCard hover={false} className="log-section">
        <div className="log-section-title">{t('monitor.logs')}</div>
        {logs && logs.length > 0 ? (
          <div className="log-list">
            {logs.map((log) => (
              <LogItem
                key={log.id}
                log={log}
                softwareName={
                  log.software_id != null ? softwareNameMap.get(log.software_id) : ''
                }
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">{t('monitor.noLogs')}</div>
        )}
      </GlassCard>
    </div>
  )
}

export default Monitor
// 具名导出便于按需引入
export { Monitor }
