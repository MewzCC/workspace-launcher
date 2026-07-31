// 启动台（原 Dashboard）：问候语 + 实时时钟 + 快速启动卡片网格
import React, { useEffect, useState } from 'react'
import { Play, ArrowRight, Check, Pencil, Search, X } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import SoftwareIcon from '../components/SoftwareIcon'
import { workspaceApi, onLaunchProgress } from '../lib/ipc'
import { useStore } from '../store/useStore'
import './Dashboard.css'

// 根据当前小时返回对应问候语
function getGreeting(hour) {
  if (hour >= 6 && hour < 12) return 'Good Morning'
  if (hour >= 12 && hour < 18) return 'Good Afternoon'
  if (hour >= 18 && hour < 22) return 'Good Evening'
  return 'Good Night'
}

// 格式化时间为 HH:MM:SS
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

export function Dashboard() {
  // 从 store 读取工作空间列表、启动状态及相关动作
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const launching = useStore((s) => s.launching)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const startLaunch = useStore((s) => s.startLaunch)
  const updateLaunchProgress = useStore((s) => s.updateLaunchProgress)

  // 实时时钟，每秒刷新一次
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 订阅启动进度：组件挂载时订阅一次，卸载时取消订阅，避免重复订阅导致内存泄漏
  useEffect(() => {
    const unsubscribe = onLaunchProgress((progress) => {
      updateLaunchProgress(progress)
    })
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [updateLaunchProgress])

  // 点击启动按钮：初始化 store 启动状态，并通知主进程启动该工作空间
  const handleLaunch = (workspaceId) => {
    startLaunch(workspaceId)
    workspaceApi.launch(workspaceId).catch((err) => {
      console.error('启动工作空间失败:', err)
    })
  }

  const greeting = getGreeting(now.getHours())
  const [quickEditing, setQuickEditing] = useState(null)
  const [selectedSoftwareIds, setSelectedSoftwareIds] = useState([])
  const [savingQuickEdit, setSavingQuickEdit] = useState(false)
  const [quickSearch, setQuickSearch] = useState('')

  const openQuickEdit = (workspace) => {
    setQuickEditing(workspace)
    setSelectedSoftwareIds((workspace.software || []).map((item) => item.id))
    setQuickSearch('')
  }

  const toggleQuickSoftware = (softwareId) => {
    setSelectedSoftwareIds((current) =>
      current.includes(softwareId)
        ? current.filter((id) => id !== softwareId)
        : [...current, softwareId]
    )
  }

  const saveQuickEdit = async () => {
    if (!quickEditing || savingQuickEdit) return
    setSavingQuickEdit(true)
    try {
      const previous = new Map(
        (quickEditing.software || []).map((item) => [item.id, item])
      )
      await workspaceApi.update(quickEditing.id, {
        name: quickEditing.name,
        description: quickEditing.description || '',
        icon: quickEditing.icon || '🚀',
        software: selectedSoftwareIds.map((softwareId, index) => {
          const old = previous.get(softwareId)
          return {
            software_id: softwareId,
            launch_order: old?.launch_order ?? index + 1,
            delay_ms: old?.delay_ms ?? 0
          }
        })
      })
      setWorkspaces(await workspaceApi.list())
      setQuickEditing(null)
    } catch (err) {
      console.error('快速编辑工作空间失败:', err)
      window.alert('保存失败：' + (err?.message || err))
    } finally {
      setSavingQuickEdit(false)
    }
  }

  return (
    <div className="dashboard">
      {/* 顶部问候区：左侧问候语 + 副标题，右侧实时时钟 */}
      <section className="page-header greeting">
        <div className="page-header-left">
          <h1 className="page-title greeting-title">{greeting}</h1>
          <p className="page-subtitle">准备进入你的工作状态</p>
        </div>
        <div className="clock">{formatTime(now)}</div>
      </section>

      {/* 区块标题 */}
      <div className="section-title">
        快速启动
        <span className="count">{workspaces.length} 个工作空间</span>
      </div>

      {/* 快速启动卡片网格，或无工作空间时的空状态 */}
      {workspaces.length === 0 ? (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon-wrap">
            <Play size={40} />
          </div>
          <p>还没有工作空间，去应用管理页面创建一个吧</p>
          <GlowButton
            variant="primary"
            size="md"
            onClick={() => setCurrentView('workspaces')}
          >
            前往应用管理
            <ArrowRight size={16} />
          </GlowButton>
        </GlassCard>
      ) : (
        <div className="workspace-grid">
          {workspaces.map((ws) => (
            <QuickCard
              key={ws.id}
              workspace={ws}
              launching={launching}
              onLaunch={handleLaunch}
              onEdit={openQuickEdit}
            />
          ))}
        </div>
      )}

      {quickEditing && (
        <Modal
          title={`快速编辑 · ${quickEditing.name}`}
          onClose={() => setQuickEditing(null)}
          onSave={saveQuickEdit}
          saveText={savingQuickEdit ? '保存中...' : '保存应用'}
        >
          <p className="quick-edit-hint">
            这里只调整工作空间包含的应用，名称、图标、启动顺序和延迟保持不变。
          </p>
          <div className="quick-edit-search">
            <Search size={16} aria-hidden="true" />
            <input
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder="搜索应用名称或路径"
              aria-label="搜索可选应用"
            />
            {quickSearch && (
              <button type="button" onClick={() => setQuickSearch('')} aria-label="清空搜索">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="quick-edit-software">
            {software.length === 0 ? (
              <div className="quick-edit-empty">软件库暂无应用，请先添加软件。</div>
            ) : (
              software
                .filter((item) => {
                  const query = quickSearch.trim().toLowerCase()
                  return !query || [item.name, item.path].some((value) =>
                    String(value || '').toLowerCase().includes(query)
                  )
                })
                .map((item) => {
                const selected = selectedSoftwareIds.includes(item.id)
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`quick-edit-item ${selected ? 'selected' : ''}`}
                    onClick={() => toggleQuickSoftware(item.id)}
                    aria-pressed={selected}
                  >
                    <SoftwareIcon
                      path={item.path}
                      fallback={item.icon || '📦'}
                      size="sm"
                    />
                    <span className="quick-edit-name">{item.name}</span>
                    <span className="quick-edit-check" aria-hidden="true">
                      {selected && <Check size={14} />}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

// 快速启动卡片：工作空间图标与名称 + 软件列表 + 启动按钮
function QuickCard({ workspace, launching, onLaunch, onEdit }) {
  const software = workspace.software || []
  // 仅展示前 3 个软件，超出部分以 +N 形式提示
  const visible = software.slice(0, 3)
  const extraCount = software.length - visible.length
  // 判断当前工作空间是否正在启动中
  const isLaunching =
    launching && launching.workspaceId === workspace.id && launching.active

  return (
    <GlassCard className="quick-card" hover={true}>
      {/* 顶部：工作空间图标 + 名称 */}
      <div className="quick-card-header">
        <span className="quick-card-icon">{workspace.icon || '🚀'}</span>
        <span className="quick-card-name">{workspace.name}</span>
      </div>

      {/* 中间：包含的软件列表 */}
      <div className="software-list">
        {visible.map((sw) => (
          <div className="software-item" key={sw.id}>
            <span className="software-icon"><SoftwareIcon path={sw.path} fallback={sw.icon || '📦'} size="sm" /></span>
            <span className="software-name">{sw.name}</span>
          </div>
        ))}
        {extraCount > 0 && (
          <div className="software-more-wrap">
            <button
              type="button"
              className="software-item software-more"
              onClick={() => onEdit(workspace)}
              aria-label={`还有 ${extraCount} 个应用，点击快速编辑`}
            >
              +{extraCount}
            </button>
            <div className="software-more-tooltip" role="tooltip">
              <span className="software-more-title">其余应用</span>
              {software.slice(3).map((item) => (
                <span className="software-more-entry" key={item.id}>
                  <SoftwareIcon
                    path={item.path}
                    fallback={item.icon || '📦'}
                    size="xs"
                  />
                  {item.name}
                </span>
              ))}
              <span className="software-more-action">点击可快速编辑</span>
            </div>
          </div>
        )}
        {software.length === 0 && (
          <div className="software-item software-empty">暂未添加软件</div>
        )}
      </div>

      {/* 底部：启动按钮 */}
      <div className="quick-card-footer">
        <GlowButton
          variant="ghost"
          size="sm"
          onClick={() => onEdit(workspace)}
        >
          <Pencil size={14} />
          快速编辑
        </GlowButton>
        <GlowButton
          variant="primary"
          size="sm"
          disabled={isLaunching}
          onClick={() => onLaunch(workspace.id)}
        >
          <Play size={14} />
          {isLaunching ? '启动中...' : '启动'}
        </GlowButton>
      </div>
    </GlassCard>
  )
}

export default Dashboard
