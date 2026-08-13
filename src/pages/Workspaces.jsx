// 空间管理页面：工作空间 CRUD + 一键启动动画
// 视觉对齐设计稿：页头(标题+副标题+CTA) + 卡片网格 + 模态表单
import React, { useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Play, PackageOpen, Search, X, CircleStop, LoaderCircle } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import LaunchAnimation from '../components/LaunchAnimation'
import SoftwareIcon from '../components/SoftwareIcon'
import SoftwareOverflowPreview from '../components/SoftwareOverflowPreview'
import ShortcutInput from '../components/ShortcutInput'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { useStore } from '../store/useStore'
import { workspaceApi } from '../lib/ipc'
import { useProcessStatuses } from '../hooks/useProcessStatuses'
import { useShortcutValidation } from '../hooks/useShortcutValidation'
import { useT } from '../hooks/useT'
import './Workspaces.css'

// 图标预设选项
const ICON_PRESETS = ['🚀', '💻', '🎨', '📦', '🎮', '📊', '🔍', '⚡', '🧩']

function Workspaces() {
  const t = useT()
  const confirm = useConfirmDialog()
  // store 状态与 actions
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const launching = useStore((s) => s.launching)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const startLaunch = useStore((s) => s.startLaunch)
  const updateLaunchProgress = useStore((s) => s.updateLaunchProgress)
  const stopLaunch = useStore((s) => s.stopLaunch)

  const workspaceSoftware = useMemo(
    () => workspaces.flatMap((workspace) => workspace.software || []),
    [workspaces]
  )
  const processStatuses = useProcessStatuses(
    workspaceSoftware,
    `${launching?.active || false}:${launching?.progress?.length || 0}`
  )

  // Modal 与表单状态
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', icon: '🚀', shortcut: '' })
  // 已选软件：[{ software_id, name, icon, launch_order, delay_ms }]
  const [selectedSoftware, setSelectedSoftware] = useState([])
  const [softwareSearch, setSoftwareSearch] = useState('')
  const [saving, setSaving] = useState(false)
  // 防止保存重复提交
  const savingRef = useRef(false)
  const shortcutValidation = useShortcutValidation(form.shortcut, editingId)

  // 打开新建 Modal
  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', description: '', icon: '🚀', shortcut: '' })
    setSelectedSoftware([])
    setSoftwareSearch('')
    setModalOpen(true)
  }

  // 打开编辑 Modal，预填工作空间数据
  const openEdit = (workspace) => {
    setSoftwareSearch('')
    setEditingId(workspace.id)
    setForm({
      name: workspace.name || '',
      description: workspace.description || '',
      icon: workspace.icon || '🚀',
      shortcut: workspace.shortcut || ''
    })
    // 将工作空间的 software 映射为可编辑项
    setSelectedSoftware(
      (workspace.software || []).map((s, idx) => ({
        software_id: s.id,
        name: s.name,
        icon: s.icon,
        icon_mode: s.icon_mode,
        path: s.path,
        launch_order: s.launch_order ?? idx + 1,
        delay_ms: s.delay_ms ?? 0
      }))
    )
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSaving(false)
    savingRef.current = false
  }

  // 切换软件勾选
  const toggleSoftware = (sw) => {
    setSelectedSoftware((prev) => {
      const exists = prev.find((s) => s.software_id === sw.id)
      if (exists) {
        return prev.filter((s) => s.software_id !== sw.id)
      }
      return [
        ...prev,
        {
          software_id: sw.id,
          name: sw.name,
          icon: sw.icon,
          icon_mode: sw.icon_mode,
          path: sw.path,
          launch_order: prev.length + 1,
          delay_ms: 0
        }
      ]
    })
  }

  // 更新已选软件的启动顺序/延迟
  const updateSelected = (softwareId, field, value) => {
    setSelectedSoftware((prev) =>
      prev.map((s) =>
        s.software_id === softwareId ? { ...s, [field]: value } : s
      )
    )
  }

  // 保存（新建/编辑）
  const handleSave = async () => {
    if (savingRef.current) return
    if (!form.name.trim()) {
      window.alert(t('workspaces.nameRequired'))
      return
    }
    if (!(await shortcutValidation.validateNow(form.shortcut))) return
    savingRef.current = true
    setSaving(true)
    try {
      // 组装保存数据，软件按启动顺序排序
      const data = {
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon,
        shortcut: form.shortcut.trim(),
        software: selectedSoftware
          .slice()
          .sort((a, b) => Number(a.launch_order) - Number(b.launch_order))
          .map((s) => ({
            software_id: s.software_id,
            launch_order: Number(s.launch_order) || 0,
            delay_ms: Number(s.delay_ms) || 0
          }))
      }
      if (editingId) {
        await workspaceApi.update(editingId, data)
      } else {
        await workspaceApi.create(data)
      }
      // 成功后刷新 store
      const list = await workspaceApi.list()
      setWorkspaces(list)
      closeModal()
    } catch (err) {
      console.error('保存工作空间失败:', err)
      if (form.shortcut) {
        shortcutValidation.setError(err?.message || t('workspaces.shortcutCheckFailed'))
      } else {
        window.alert(t('common.savingFailed') + (err?.message || err))
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  // 一键启动
  const handleLaunch = async (workspace) => {
    startLaunch(workspace.id)
    try {
      await workspaceApi.launch(workspace.id)
    } catch (err) {
      console.error('启动工作空间失败:', err)
      // 推送一条错误进度，便于动画展示失败状态
      updateLaunchProgress({
        phase: 'error',
        softwareId: null,
        softwareName: '',
        status: 'failed',
        message: t('workspaces.launchFailed') + (err?.message || err)
      })
    }
  }

  // 删除工作空间
  const handleDelete = async (workspace) => {
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('workspaces.deleteConfirm', { name: workspace.name }),
      confirmText: t('common.delete'),
      tone: 'danger',
      icon: 'danger'
    })
    if (!confirmed) return
    try {
      await workspaceApi.remove(workspace.id)
      const list = await workspaceApi.list()
      setWorkspaces(list)
    } catch (err) {
      console.error('删除工作空间失败:', err)
      window.alert(t('workspaces.deleteFailed') + (err?.message || err))
    }
  }

  // 一键关闭工作空间：按路径结束工作空间内全部软件进程
  const [closingId, setClosingId] = useState(null)
  const handleClose = async (workspace) => {
    const confirmed = await confirm({
      title: t('workspaces.close'),
      message: t('workspaces.closeConfirm', { name: workspace.name }),
      confirmText: t('workspaces.close'),
      tone: 'warning',
      icon: 'warning'
    })
    if (!confirmed) return
    setClosingId(workspace.id)
    try {
      await workspaceApi.close(workspace.id)
    } catch (err) {
      console.error('关闭工作空间失败:', err)
      window.alert(t('workspaces.closeFailed') + (err?.message || err))
    } finally {
      setClosingId(null)
    }
  }

  // 当前启动的工作空间对象
  const launchingWorkspace = useMemo(() => {
    if (!launching) return null
    return workspaces.find((w) => w.id === launching.workspaceId) || null
  }, [launching, workspaces])

  const isSelected = (id) => selectedSoftware.some((s) => s.software_id === id)

  return (
    <div className="workspaces-page">
      {/* 页头：标题 + 副标题 + 添加按钮 */}
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t('workspaces.title')}</h1>
          <p className="page-subtitle">{t('workspaces.subtitle')}</p>
        </div>
        <GlowButton variant="primary" size="md" onClick={openCreate}>
          <Plus size={16} />
          {t('workspaces.add')}
        </GlowButton>
      </section>

      {/* 工作空间网格 / 空状态 */}
      {workspaces.length === 0 ? (
        <GlassCard hover={false} className="empty-state page-fill-state">
          <div className="empty-icon-wrap">
            <PackageOpen size={40} />
          </div>
          <p>{t('workspaces.empty')}</p>
        </GlassCard>
      ) : (
        <div className="workspace-grid">
          {workspaces.map((ws) => {
            const isLaunching =
              launching?.workspaceId === ws.id && launching?.active
            const wsSoftware = ws.software || []
            const runningCount = wsSoftware.filter(
              (item) => processStatuses[item.path]
            ).length
            const isRunning = runningCount > 0
            const statusText = isLaunching
              ? t('workspaces.launching')
              : runningCount === 0
                ? t('common.stopped')
                : runningCount === wsSoftware.length
                  ? t('common.running')
                  : t('workspaces.partialRunning', { running: runningCount, total: wsSoftware.length })
            // 卡片最多显示 4 个软件，超出显示 +N
            const shownSoftware = wsSoftware.slice(0, 4)
            const hiddenSoftware = wsSoftware.slice(shownSoftware.length)
            return (
              <GlassCard key={ws.id} className="workspace-card" hover>
                {/* 顶部：icon + 名称 + 快捷键 + 状态灯 */}
                <div className="ws-card-header">
                  <span className="ws-icon">{ws.icon || '🚀'}</span>
                  <span className="ws-name">{ws.name}</span>
                  {ws.shortcut && <kbd className="ws-shortcut">{ws.shortcut}</kbd>}
                  <span className="ws-status">
                    <span
                      className={`ws-status-dot ${
                        isRunning ? 'running' : 'stopped'
                      }`}
                    ></span>
                    {statusText}
                  </span>
                </div>

                {/* 描述 */}
                <div className="ws-desc">{ws.description || t('common.noDescription')}</div>

                {/* 软件列表 */}
                <div className="ws-software">
                  {shownSoftware.length === 0 && (
                    <span className="ws-software-empty">{t('workspaces.noSoftware')}</span>
                  )}
                  {shownSoftware.map((s) => (
                    <span className="ws-software-item" key={s.id}>
                      <SoftwareIcon path={s.path} fallback={s.icon || '📦'} iconMode={s.icon_mode} size="sm" />
                      <span>{s.name}</span>
                    </span>
                  ))}
                  <SoftwareOverflowPreview
                    items={hiddenSoftware}
                    processStatuses={processStatuses}
                    onEdit={() => openEdit(ws)}
                  />
                </div>

                {/* 底部按钮 */}
                <div className="ws-actions">
                  <GlowButton
                    variant="primary"
                    size="sm"
                    onClick={() => handleLaunch(ws)}
                    disabled={isLaunching}
                  >
                    <Play size={14} />
                    {isLaunching ? t('common.starting') : t('workspaces.launch')}
                  </GlowButton>
                  {isRunning && (
                    <GlowButton
                      variant="ghost"
                      size="sm"
                      onClick={() => handleClose(ws)}
                      disabled={closingId === ws.id}
                    >
                      {closingId === ws.id ? <LoaderCircle size={14} className="process-spin" /> : <CircleStop size={14} />}
                      {t('workspaces.close')}
                    </GlowButton>
                  )}
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(ws)}
                  >
                    <Pencil size={14} />
                    {t('common.edit')}
                  </GlowButton>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    className="ws-btn-delete"
                    onClick={() => handleDelete(ws)}
                  >
                    <Trash2 size={14} />
                    {t('common.delete')}
                  </GlowButton>
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* 新建/编辑 Modal */}
      {modalOpen && (
        <Modal
          title={editingId ? t('workspaces.editTitle') : t('workspaces.newTitle')}
          onClose={closeModal}
          onSave={handleSave}
          saveText={saving ? t('common.saving') : t('common.save')}
          saveDisabled={saving || shortcutValidation.status === 'checking' || shortcutValidation.status === 'error'}
          closeDisabled={saving}
        >
          {/* 名称 */}
          <div className="form-group">
            <label className="form-label">{t('common.nameRequired')}</label>
            <input
              className="form-input"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('workspaces.namePlaceholder')}
            />
          </div>

          {/* 描述 */}
          <div className="form-group">
            <label className="form-label">{t('common.description')}</label>
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder={t('workspaces.descPlaceholder')}
            />
          </div>

          {/* 图标 */}
          <div className="form-group">
            <label className="form-label">{t('common.icon')}</label>
            <input
              className="form-input"
              type="text"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder={t('workspaces.iconPlaceholder')}
            />
            <div className="icon-presets">
              {ICON_PRESETS.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  className={`icon-preset ${
                    form.icon === ic ? 'active' : ''
                  }`}
                  onClick={() => setForm({ ...form, icon: ic })}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* 全局快捷键 */}
          <div className="form-group">
            <label className="form-label">{t('workspaces.shortcut')}</label>
            <ShortcutInput
              value={form.shortcut}
              validationStatus={shortcutValidation.status}
              validationMessage={shortcutValidation.message}
              onChange={(shortcut) => {
                setForm((current) => ({ ...current, shortcut }))
              }}
            />
          </div>

          {/* 软件选择 */}
          <div className="form-group">
            <label className="form-label">{t('workspaces.softwareSelection')}</label>
            <div className="workspace-software-search">
              <Search size={15} aria-hidden="true" />
              <input
                value={softwareSearch}
                onChange={(event) => setSoftwareSearch(event.target.value)}
                placeholder={t('workspaces.searchPlaceholder')}
                aria-label={t('workspaces.searchAria')}
              />
              {softwareSearch && (
                <button type="button" onClick={() => setSoftwareSearch('')} aria-label={t('dashboard.clearSearch')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="software-picker">
              {software.length === 0 && (
                <div className="software-picker-empty">
                  {t('workspaces.noAvailableSoftware')}
                </div>
              )}
              {software
                .filter((sw) => {
                  const query = softwareSearch.trim().toLowerCase()
                  return !query || [sw.name, sw.path].some((value) =>
                    String(value || '').toLowerCase().includes(query)
                  )
                })
                .map((sw) => (
                <label className="software-picker-item" key={sw.id}>
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={isSelected(sw.id)}
                    onChange={() => toggleSoftware(sw)}
                  />
                  <span className="picker-icon"><SoftwareIcon path={sw.path} fallback={sw.icon || '📦'} iconMode={sw.icon_mode} size="sm" /></span>
                  <span className="picker-name">{sw.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 启动顺序与延迟 */}
          {selectedSoftware.length > 0 && (
            <div className="form-group">
              <label className="form-label">{t('workspaces.orderDelay')}</label>
              <div className="order-delay-list">
                {selectedSoftware
                  .slice()
                  .sort(
                    (a, b) => Number(a.launch_order) - Number(b.launch_order)
                  )
                  .map((s) => (
                    <div className="order-delay-row" key={s.software_id}>
                      <span className="od-name">
                        <SoftwareIcon path={s.path} fallback={s.icon || '📦'} iconMode={s.icon_mode} size="xs" /> {s.name}
                      </span>
                      <label className="od-field">
                        {t('workspaces.order')}
                        <input
                          className="form-input od-input"
                          type="number"
                          min="1"
                          value={s.launch_order}
                          onChange={(e) =>
                            updateSelected(
                              s.software_id,
                              'launch_order',
                              e.target.value
                            )
                          }
                        />
                      </label>
                      <label className="od-field">
                        {t('workspaces.delayMs')}
                        <input
                          className="form-input od-input"
                          type="number"
                          min="0"
                          value={s.delay_ms}
                          onChange={(e) =>
                            updateSelected(
                              s.software_id,
                              'delay_ms',
                              e.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* 启动动画：launching 存在且对应工作空间时渲染 */}
      {launching && launchingWorkspace && (
        <LaunchAnimation
          launching={launching}
          workspace={launchingWorkspace}
          onClose={stopLaunch}
        />
      )}
    </div>
  )
}

export default Workspaces
export { Workspaces }
