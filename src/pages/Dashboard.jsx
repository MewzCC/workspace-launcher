// 启动台（原 Dashboard）：问候语 + 实时时钟 + 快速启动卡片网格
import React, { useEffect, useMemo, useState } from 'react'
import { Play, ArrowRight, Check, Pencil, Search, X, RotateCcw } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import SoftwareIcon from '../components/SoftwareIcon'
import SoftwareOverflowPreview from '../components/SoftwareOverflowPreview'
import ShortcutInput from '../components/ShortcutInput'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { workspaceApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import { useProcessStatuses } from '../hooks/useProcessStatuses'
import { useShortcutValidation } from '../hooks/useShortcutValidation'
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
  const t = useT()
  const confirm = useConfirmDialog()
  // 从 store 读取工作空间列表、启动状态及相关动作
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const launching = useStore((s) => s.launching)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const startLaunch = useStore((s) => s.startLaunch)
  const workspaceSoftware = useMemo(
    () => workspaces.flatMap((workspace) => workspace.software || []),
    [workspaces]
  )
  const processStatuses = useProcessStatuses(
    workspaceSoftware,
    String(launching?.active || false)
  )

  // 实时时钟，每秒刷新一次
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 点击启动按钮：初始化 store 启动状态，并通知主进程启动该工作空间
  const handleLaunch = async (workspace, restartRunning = false) => {
    if (restartRunning) {
      const confirmed = await confirm({
        title: t('dashboard.relaunchDialogTitle'),
        message: t('dashboard.relaunchConfirm', { name: workspace.name }),
        confirmText: t('dashboard.relaunch'),
        tone: 'warning',
        icon: 'restart'
      })
      if (!confirmed) return
    }
    startLaunch(workspace.id)
    workspaceApi.launch(workspace.id, { restartRunning }).catch((err) => {
      console.error('启动工作空间失败:', err)
    })
  }

  const greeting = getGreeting(now.getHours())
  const [quickEditing, setQuickEditing] = useState(null)
  const [selectedSoftwareIds, setSelectedSoftwareIds] = useState([])
  const [savingQuickEdit, setSavingQuickEdit] = useState(false)
  const [quickSearch, setQuickSearch] = useState('')
  const [quickShortcut, setQuickShortcut] = useState('')
  const shortcutValidation = useShortcutValidation(quickShortcut, quickEditing?.id ?? null)

  const openQuickEdit = (workspace) => {
    setQuickEditing(workspace)
    setSelectedSoftwareIds((workspace.software || []).map((item) => item.id))
    setQuickSearch('')
    setQuickShortcut(workspace.shortcut || '')
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
    if (!(await shortcutValidation.validateNow(quickShortcut))) return
    setSavingQuickEdit(true)
    try {
      const previous = new Map(
        (quickEditing.software || []).map((item) => [item.id, item])
      )
      await workspaceApi.update(quickEditing.id, {
        name: quickEditing.name,
        description: quickEditing.description || '',
        icon: quickEditing.icon || '🚀',
        shortcut: quickShortcut,
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
      if (quickShortcut) {
        shortcutValidation.setError(err?.message || t('workspaces.shortcutCheckFailed'))
      } else {
        window.alert(t('common.savingFailed') + (err?.message || err))
      }
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
          <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        </div>
        <div className="clock">{formatTime(now)}</div>
      </section>

      {/* 区块标题 */}
      <div className="section-title">
        {t('dashboard.quickLaunch')}
        <span className="count">{t('dashboard.workspaceCount', { count: workspaces.length })}</span>
      </div>

      {/* 快速启动卡片网格，或无工作空间时的空状态 */}
      {workspaces.length === 0 ? (
        <GlassCard hover={false} className="empty-state page-fill-state">
          <div className="empty-icon-wrap">
            <Play size={40} />
          </div>
          <p>{t('dashboard.empty')}</p>
          <GlowButton
            variant="primary"
            size="md"
            onClick={() => setCurrentView('workspaces')}
          >
            {t('dashboard.goManage')}
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
              processStatuses={processStatuses}
              onLaunch={handleLaunch}
              onEdit={openQuickEdit}
            />
          ))}
        </div>
      )}

      {quickEditing && (
        <Modal
          title={t('dashboard.quickEditTitle', { name: quickEditing.name })}
          onClose={() => setQuickEditing(null)}
          onSave={saveQuickEdit}
          saveText={savingQuickEdit ? t('common.saving') : t('dashboard.save')}
          saveDisabled={savingQuickEdit || shortcutValidation.status === 'checking' || shortcutValidation.status === 'error'}
          closeDisabled={savingQuickEdit}
        >
          <p className="quick-edit-hint">
            {t('dashboard.quickEditHint')}
          </p>
          <div className="quick-edit-shortcut">
            <label className="form-label">{t('workspaces.shortcut')}</label>
            <ShortcutInput
              value={quickShortcut}
              validationStatus={shortcutValidation.status}
              validationMessage={shortcutValidation.message}
              onChange={(shortcut) => {
                setQuickShortcut(shortcut)
              }}
            />
          </div>
          <div className="quick-edit-search">
            <Search size={16} aria-hidden="true" />
            <input
              value={quickSearch}
              onChange={(event) => setQuickSearch(event.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              aria-label={t('dashboard.searchAria')}
            />
            {quickSearch && (
              <button type="button" onClick={() => setQuickSearch('')} aria-label={t('dashboard.clearSearch')}>
                <X size={14} />
              </button>
            )}
          </div>
          <div className="quick-edit-software">
            {software.length === 0 ? (
              <div className="quick-edit-empty">{t('dashboard.emptyLibrary')}</div>
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
                      iconMode={item.icon_mode}
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
function QuickCard({ workspace, launching, processStatuses, onLaunch, onEdit }) {
  const t = useT()
  const software = workspace.software || []
  // 仅展示前 3 个软件，超出部分以 +N 形式提示
  const visible = software.slice(0, 3)
  const hiddenSoftware = software.slice(visible.length)
  // 判断当前工作空间是否正在启动中
  const isLaunching =
    launching && launching.workspaceId === workspace.id && launching.active
  const runningCount = software.filter((item) => processStatuses[item.path]).length
  const allRunning = software.length > 0 && runningCount === software.length
  const statusText = isLaunching
    ? t('workspaces.launching')
    : allRunning
      ? t('common.running')
      : runningCount > 0
        ? t('workspaces.partialRunning', { running: runningCount, total: software.length })
        : t('common.stopped')

  return (
    <GlassCard className="quick-card" hover={true}>
      {/* 顶部：工作空间图标 + 名称 */}
      <div className="quick-card-header">
        <span className="quick-card-icon">{workspace.icon || '🚀'}</span>
        <span className="quick-card-name">{workspace.name}</span>
        {workspace.shortcut && <kbd className="quick-card-shortcut">{workspace.shortcut}</kbd>}
      </div>

      <div
        className={`quick-card-status ${allRunning ? 'running' : runningCount > 0 ? 'partial' : 'stopped'}`}
        role="status"
        aria-live="polite"
      >
        <span className="quick-card-status-dot" aria-hidden="true" />
        <span>{statusText}</span>
      </div>

      {/* 中间：包含的软件列表 */}
      <div className="software-list">
        {visible.map((sw) => (
          <div className={`software-item ${processStatuses[sw.path] ? 'is-running' : ''}`} key={sw.id}>
            <span className="software-icon"><SoftwareIcon path={sw.path} fallback={sw.icon || '📦'} iconMode={sw.icon_mode} size="sm" /></span>
            <span className="software-name">{sw.name}</span>
            <span className="software-running-dot" aria-label={processStatuses[sw.path] ? t('common.running') : t('common.stopped')} />
          </div>
        ))}
        <SoftwareOverflowPreview
          items={hiddenSoftware}
          processStatuses={processStatuses}
          onEdit={() => onEdit(workspace)}
        />
        {software.length === 0 && (
          <div className="software-item software-empty">{t('dashboard.noSoftware')}</div>
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
          {t('dashboard.quickEdit')}
        </GlowButton>
        <GlowButton
          variant="primary"
          size="sm"
          disabled={isLaunching}
          onClick={() => onLaunch(workspace, allRunning)}
        >
          {allRunning ? <RotateCcw size={14} /> : <Play size={14} />}
          {isLaunching
            ? t('common.starting')
            : allRunning
              ? t('dashboard.relaunch')
              : t('dashboard.launch')}
        </GlowButton>
      </div>
    </GlassCard>
  )
}

export default Dashboard
