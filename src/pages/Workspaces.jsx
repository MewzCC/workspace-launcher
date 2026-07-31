// 应用管理页面（原工作空间）：工作空间 CRUD + 一键启动动画
// 视觉对齐设计稿：页头(标题+副标题+CTA) + 卡片网格 + 模态表单
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Play, PackageOpen, Search, X } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import LaunchAnimation from '../components/LaunchAnimation'
import SoftwareIcon from '../components/SoftwareIcon'
import { useStore } from '../store/useStore'
import { workspaceApi, onLaunchProgress } from '../lib/ipc'
import './Workspaces.css'

// 图标预设选项
const ICON_PRESETS = ['🚀', '💻', '🎨', '📦', '🎮', '📊', '🔍', '⚡', '🧩']

function Workspaces() {
  // store 状态与 actions
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const launching = useStore((s) => s.launching)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const startLaunch = useStore((s) => s.startLaunch)
  const updateLaunchProgress = useStore((s) => s.updateLaunchProgress)
  const stopLaunch = useStore((s) => s.stopLaunch)

  // 订阅启动进度：组件挂载期间持续转发到 store
  useEffect(() => {
    const unsubscribe = onLaunchProgress((progress) => {
      updateLaunchProgress(progress)
    })
    return () => unsubscribe()
  }, [updateLaunchProgress])

  // Modal 与表单状态
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', icon: '🚀' })
  // 已选软件：[{ software_id, name, icon, launch_order, delay_ms }]
  const [selectedSoftware, setSelectedSoftware] = useState([])
  const [softwareSearch, setSoftwareSearch] = useState('')
  const [saving, setSaving] = useState(false)
  // 防止保存重复提交
  const savingRef = useRef(false)

  // 打开新建 Modal
  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', description: '', icon: '🚀' })
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
      icon: workspace.icon || '🚀'
    })
    // 将工作空间的 software 映射为可编辑项
    setSelectedSoftware(
      (workspace.software || []).map((s, idx) => ({
        software_id: s.id,
        name: s.name,
        icon: s.icon,
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
      window.alert('请输入工作空间名称')
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      // 组装保存数据，软件按启动顺序排序
      const data = {
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon,
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
      window.alert('保存失败：' + (err?.message || err))
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
        message: '启动失败：' + (err?.message || err)
      })
    }
  }

  // 删除工作空间
  const handleDelete = async (workspace) => {
    if (!window.confirm(`确认删除工作空间「${workspace.name}」吗？`)) return
    try {
      await workspaceApi.remove(workspace.id)
      const list = await workspaceApi.list()
      setWorkspaces(list)
    } catch (err) {
      console.error('删除工作空间失败:', err)
      window.alert('删除失败：' + (err?.message || err))
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
          <h1 className="page-title">应用管理</h1>
          <p className="page-subtitle">管理工作空间，配置软件组合与启动顺序</p>
        </div>
        <GlowButton variant="primary" size="md" onClick={openCreate}>
          <Plus size={16} />
          添加工作空间
        </GlowButton>
      </section>

      {/* 工作空间网格 / 空状态 */}
      {workspaces.length === 0 ? (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon-wrap">
            <PackageOpen size={40} />
          </div>
          <p>暂无工作空间，点击右上角创建一个吧</p>
        </GlassCard>
      ) : (
        <div className="workspace-grid">
          {workspaces.map((ws) => {
            // 运行中判断：launching 命中且 active
            const isRunning =
              launching?.workspaceId === ws.id && launching?.active
            // 卡片最多显示 4 个软件，超出显示 +N
            const wsSoftware = ws.software || []
            const shownSoftware = wsSoftware.slice(0, 4)
            const extraCount = wsSoftware.length - shownSoftware.length
            return (
              <GlassCard key={ws.id} className="workspace-card" hover>
                {/* 顶部：icon + 名称 + 状态灯 */}
                <div className="ws-card-header">
                  <span className="ws-icon">{ws.icon || '🚀'}</span>
                  <span className="ws-name">{ws.name}</span>
                  <span className="ws-status">
                    <span
                      className={`ws-status-dot ${
                        isRunning ? 'running' : 'stopped'
                      }`}
                    ></span>
                    {isRunning ? '运行中' : '已停止'}
                  </span>
                </div>

                {/* 描述 */}
                <div className="ws-desc">{ws.description || '暂无描述'}</div>

                {/* 软件列表 */}
                <div className="ws-software">
                  {shownSoftware.length === 0 && (
                    <span className="ws-software-empty">未配置软件</span>
                  )}
                  {shownSoftware.map((s) => (
                    <span className="ws-software-item" key={s.id}>
                      <SoftwareIcon path={s.path} fallback={s.icon || '📦'} size="sm" />
                      <span>{s.name}</span>
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className="ws-software-item">+{extraCount}</span>
                  )}
                </div>

                {/* 底部按钮 */}
                <div className="ws-actions">
                  <GlowButton
                    variant="primary"
                    size="sm"
                    onClick={() => handleLaunch(ws)}
                    disabled={isRunning}
                  >
                    <Play size={14} />
                    {isRunning ? '启动中...' : '一键启动'}
                  </GlowButton>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(ws)}
                  >
                    <Pencil size={14} />
                    编辑
                  </GlowButton>
                  <GlowButton
                    variant="ghost"
                    size="sm"
                    className="ws-btn-delete"
                    onClick={() => handleDelete(ws)}
                  >
                    <Trash2 size={14} />
                    删除
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
          title={editingId ? '编辑工作空间' : '新建工作空间'}
          onClose={closeModal}
          onSave={handleSave}
          saveText={saving ? '保存中...' : '保存'}
        >
          {/* 名称 */}
          <div className="form-group">
            <label className="form-label">名称 *</label>
            <input
              className="form-input"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="输入工作空间名称"
            />
          </div>

          {/* 描述 */}
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea
              className="form-input"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="输入工作空间描述"
            />
          </div>

          {/* 图标 */}
          <div className="form-group">
            <label className="form-label">图标</label>
            <input
              className="form-input"
              type="text"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="输入 emoji"
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

          {/* 软件选择 */}
          <div className="form-group">
            <label className="form-label">软件选择</label>
            <div className="workspace-software-search">
              <Search size={15} aria-hidden="true" />
              <input
                value={softwareSearch}
                onChange={(event) => setSoftwareSearch(event.target.value)}
                placeholder="搜索软件名称或路径"
                aria-label="搜索软件"
              />
              {softwareSearch && (
                <button type="button" onClick={() => setSoftwareSearch('')} aria-label="清空搜索">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="software-picker">
              {software.length === 0 && (
                <div className="software-picker-empty">
                  暂无可用软件，请先在软件库添加
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
                  <span className="picker-icon"><SoftwareIcon path={sw.path} fallback={sw.icon || '📦'} size="sm" /></span>
                  <span className="picker-name">{sw.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 启动顺序与延迟 */}
          {selectedSoftware.length > 0 && (
            <div className="form-group">
              <label className="form-label">启动顺序与延迟</label>
              <div className="order-delay-list">
                {selectedSoftware
                  .slice()
                  .sort(
                    (a, b) => Number(a.launch_order) - Number(b.launch_order)
                  )
                  .map((s) => (
                    <div className="order-delay-row" key={s.software_id}>
                      <span className="od-name">
                        <SoftwareIcon path={s.path} fallback={s.icon || '📦'} size="xs" /> {s.name}
                      </span>
                      <label className="od-field">
                        顺序
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
                        延迟(ms)
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
