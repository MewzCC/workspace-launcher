// 启动动画组件：工作空间启动时全屏覆盖显示
// 包含：SVG 圆形进度环、软件状态灯列表、实时日志流
import React, { useMemo, useRef } from 'react'
import GlassCard from './ui/GlassCard'
import GlowButton from './ui/GlowButton'
import SoftwareIcon from './SoftwareIcon'
import { useT } from '../hooks/useT'
import './LaunchAnimation.css'

// 时间戳格式化为 HH:MM:SS（IPC 不提供时间，按到达顺序在客户端记录）
function formatTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function LaunchAnimation({ launching, workspace, onClose }) {
  const t = useT()
  const progress = launching?.progress || []
  const softwareList = workspace?.software || []

  // 为每条进度记录稳定绑定时间戳（IPC 未提供时间，按到达顺序记录）
  // 使用 ref 追加，幂等：仅当长度落后于 progress 时才追加
  const timestampsRef = useRef([])
  // workspaceId 切换（新一次启动）时重置时间戳
  const wsIdRef = useRef(launching?.workspaceId)
  if (wsIdRef.current !== launching?.workspaceId) {
    wsIdRef.current = launching?.workspaceId
    timestampsRef.current = []
  }
  while (timestampsRef.current.length < progress.length) {
    timestampsRef.current.push(Date.now())
  }
  const timestamps = timestampsRef.current

  // 计算每个软件的最新状态（同一软件多次状态更新取最后一次）
  const statusMap = useMemo(() => {
    const map = {}
    progress.forEach((p) => {
      if (p.softwareId != null) {
        map[p.softwareId] = p.status
      }
    })
    return map
  }, [progress])

  // 进度百分比：已完成（success/failed）软件数 / 总软件数
  const total = softwareList.length
  const completed = softwareList.filter((s) => {
    const st = statusMap[s.id] || 'pending'
    return st === 'success' || st === 'failed'
  }).length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  // SVG 进度环参数
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)

  // 完成态判断：phase 为 done 或非活跃
  const isDone = launching?.phase === 'done' || launching?.active === false
  const isError = launching?.phase === 'error'

  // 倒序日志流（最新在上）
  const logs = progress
    .map((p, i) => ({ ...p, time: timestamps[i] }))
    .reverse()

  return (
    <div className="launch-overlay" role="dialog" aria-modal="true">
      <GlassCard hover={false} className="launch-panel">
        {/* 顶部标题 + 关闭按钮（完成态显示） */}
        <div className="launch-header">
          <div className="launch-title">
            <span className="launch-icon">{workspace?.icon || '🚀'}</span>
            <span>{workspace?.name || t('launch.title')}</span>
          </div>
          {isDone && (
            <GlowButton variant="ghost" size="sm" onClick={onClose}>
              {t('launch.close')}
            </GlowButton>
          )}
        </div>

        {/* 圆形进度环 */}
        <div className="progress-ring">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366F1" />
                <stop offset="100%" stopColor="#22D3EE" />
              </linearGradient>
            </defs>
            {/* 背景灰圈 */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="8"
            />
            {/* 进度圈：主色渐变，stroke-dashoffset 控制进度 */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="url(#ringGradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
          </svg>
          <div className="progress-text">
            {isDone ? (isError ? t('launch.failed') : t('launch.done')) : `${percent}%`}
          </div>
        </div>

        {/* 完成态提示 */}
        {isDone && (
          <div className={`launch-complete ${isError ? 'is-error' : ''}`}>
            {isError ? t('launch.launchFailed') : t('launch.launchCompleted')}
          </div>
        )}

        {/* 软件状态灯列表 */}
        <div className="status-list">
          {softwareList.length === 0 && (
            <div className="status-empty">{t('launch.noSoftware')}</div>
          )}
          {softwareList.map((s) => {
            const status = statusMap[s.id] || 'pending'
            return (
              <div className="status-item" key={s.id}>
                <span className={`status-dot ${status}`}></span>
                <span className="status-name">
                  <SoftwareIcon path={s.path} fallback={s.icon || '📦'} iconMode={s.icon_mode} size="xs" /> {s.name}
                </span>
                <span className={`status-label status-label--${status}`}>
                  {status === 'pending' && t('launch.waiting')}
                  {status === 'running' && t('launch.starting')}
                  {status === 'success' && t('launch.success')}
                  {status === 'failed' && t('launch.failed')}
                </span>
              </div>
            )
          })}
        </div>

        {/* 实时日志流 */}
        <div className="log-stream">
          {logs.length === 0 && <div className="log-line">{t('launch.waitingLog')}</div>}
          {logs.map((log, i) => (
            <div className={`log-line ${log.status || ''}`} key={i}>
              <span className="log-time">[{formatTime(log.time)}]</span>{' '}
              <span className="log-phase">[{log.phase}]</span>{' '}
              {log.softwareName ? `${log.softwareName}: ` : ''}
              {log.message}
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

export default LaunchAnimation
export { LaunchAnimation }
