// 软件库页面：展示已添加的软件，支持添加/编辑/删除/测试启动
// 视觉对齐设计稿，复用共享 Modal 组件，去除重复样式
import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  FolderOpen,
  Package,
  Check,
  X,
  LayoutGrid,
  List,
  Search,
  LoaderCircle,
  ShieldCheck,
  ShieldAlert,
  Sparkles
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import SoftwareIcon, { preloadSoftwareIcons } from '../components/SoftwareIcon'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { softwareApi, workspaceApi, dialogApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import './SoftwareLibrary.css'

// 预设 emoji 图标列表
const PRESET_ICONS = ['📦', '🌐', '💻', '🐳', '⌨', '🎵', '🎮', '📄', '📊']

// 内联模态：添加/编辑软件表单（复用共享 Modal）
function SoftwareModal({ initial, onSave, onClose }) {
  const t = useT()
  // 表单状态：编辑时预填，新建时默认值
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    icon: initial?.icon || '📦',
    iconMode: initial?.icon_mode || (initial?.icon && initial.icon !== '📦' ? 'custom' : 'auto'),
    path: initial?.path || '',
    args: initial?.args || ''
  })
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState({ state: 'idle', message: '' })

  // 通用字段更新
  const update = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key === 'path' || key === 'args') {
      setValidation({ state: 'idle', message: '' })
    }
  }

  // 浏览选择 exe 文件，返回路径填入输入框
  const handleBrowse = async () => {
    const filePath = await dialogApi.openFile()
    if (!filePath) return
    setValidation({ state: 'idle', message: '' })
    setForm((f) => {
      const next = { ...f, path: filePath }
      // 若名称为空，用文件名（去扩展名）作为默认名称
      if (!f.name) {
        const base = filePath.split(/[\\/]/).pop().replace(/\.exe$/i, '')
        next.name = base
      }
      return next
    })
  }

  // 保存：校验名称必填，调用 onSave 提交
  const handleSave = async () => {
    if (!form.name.trim() || !form.path.trim()) {
      setValidation({ state: 'error', message: t('software.requiredFields') })
      return
    }
    setSaving(true)
    const pathChanged = !initial || form.path.trim() !== initial.path || form.args.trim() !== (initial.args || '')
    setValidation({
      state: pathChanged ? 'testing' : 'idle',
      message: pathChanged ? t('software.testingMsg') : ''
    })
    try {
      const result = await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon || '📦',
        icon_mode: form.iconMode,
        path: form.path.trim(),
        args: form.args.trim()
      })
      if (result?.success === false) {
        setValidation({ state: 'error', message: result.message })
      } else if (pathChanged) {
        setValidation({ state: 'success', message: t('software.validatedMsg') })
      }
    } catch (err) {
      setValidation({ state: 'error', message: err.message || t('software.validateFailed') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial ? t('software.editTitle') : t('software.addTitle')}
      onClose={onClose}
      onSave={handleSave}
      saveText={saving ? t('software.savingValidating') : initial ? t('common.save') : t('software.saveAndValidate')}
      saveDisabled={saving}
      closeDisabled={saving}
    >
      {/* 名称（必填） */}
      <div className="form-group">
        <label className="form-label">{t('common.nameRequired')}</label>
        <input
          className="form-input"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder={t('software.namePlaceholder')}
          autoFocus
        />
      </div>
      {/* 描述 */}
      <div className="form-group">
        <label className="form-label">{t('common.description')}</label>
        <input
          className="form-input"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder={t('software.descPlaceholder')}
        />
      </div>
      {/* 图标选择：预设 emoji + 自定义输入 */}
      <div className="form-group">
        <label className="form-label">{t('common.icon')}</label>
        <div className="emoji-picker">
          <button
            type="button"
            className={`emoji-chip emoji-chip-auto ${form.iconMode === 'auto' ? 'active' : ''}`}
            onClick={() => setForm((current) => ({ ...current, iconMode: 'auto' }))}
            title={t('software.autoIcon')}
            aria-label={t('software.autoIcon')}
          >
            <Sparkles size={17} />
          </button>
          {PRESET_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className={`emoji-chip ${form.iconMode === 'custom' && form.icon === ic ? 'active' : ''}`}
              onClick={() => setForm((current) => ({ ...current, icon: ic, iconMode: 'custom' }))}
            >
              {ic}
            </button>
          ))}
          <input
            className="emoji-input"
            value={form.icon}
            onChange={(e) => setForm((current) => ({
              ...current,
              icon: e.target.value,
              iconMode: 'custom'
            }))}
            maxLength={4}
            title={t('software.customEmoji')}
          />
        </div>
      </div>
      {/* 可执行文件路径 + 浏览按钮 */}
      <div className="form-group">
        <label className="form-label">{t('software.exePath')}</label>
        <div className="path-row">
          <input
            className="form-input"
            value={form.path}
            onChange={(e) => update('path', e.target.value)}
            placeholder={t('software.exePathPlaceholder')}
          />
          <GlowButton type="button" variant="ghost" size="sm" onClick={handleBrowse}>
            <FolderOpen size={14} />
            {t('common.browse')}
          </GlowButton>
        </div>
      </div>
      {/* 启动参数 */}
      <div className="form-group">
        <label className="form-label">{t('common.launchArgs')}</label>
        <input
          className="form-input"
          value={form.args}
          onChange={(e) => update('args', e.target.value)}
          placeholder={t('software.argsPlaceholder')}
        />
      </div>
      <div className={`launch-validation ${validation.state}`} role="status" aria-live="polite">
        <span className="launch-validation-icon">
          {validation.state === 'testing' ? <LoaderCircle size={17} /> :
            validation.state === 'error' ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
        </span>
        <span>
          {validation.message || (initial
            ? t('software.editHint')
            : t('software.addHint'))}
        </span>
      </div>
    </Modal>
  )
}

// 单个软件卡片
function SoftwareCard({ item, testStatus, onEdit, onDelete, onTest }) {
  const t = useT()
  // 测试启动状态：testing/success/fail/undefined
  const status = testStatus[item.id]
  const testIcon =
    status === 'testing' ? null :
    status === 'success' ? <Check size={14} /> :
    status === 'fail' ? <X size={14} /> : <Play size={14} />
  const testText =
    status === 'testing' ? t('common.starting') :
    status === 'success' ? t('common.started') :
    status === 'fail' ? t('common.failed') : t('software.test')
  const testClass =
    status === 'success' ? 'btn-test-success' :
    status === 'fail' ? 'btn-test-fail' : ''

  return (
    <GlassCard className="software-card" hover>
      <div className="sw-card-header">
        <span className="sw-icon-wrap">
          <SoftwareIcon path={item.path} fallback={item.icon || '📦'} iconMode={item.icon_mode} size="lg" />
        </span>
        <span className="sw-name">{item.name}</span>
      </div>
      <div className="sw-desc">{item.description || t('common.noDescription')}</div>
      <div className="sw-path" title={item.path}>{item.path || t('common.noPath')}</div>
      <div className="sw-status">
        <span className="sw-status-dot available"></span>
        <span>{t('common.available')}</span>
      </div>
      <div className="sw-actions">
        <GlowButton variant="ghost" size="sm" onClick={() => onEdit(item)}>
          <Pencil size={14} />
          {t('common.edit')}
        </GlowButton>
        <GlowButton variant="ghost" size="sm" className="btn-danger" onClick={() => onDelete(item)}>
          <Trash2 size={14} />
          {t('common.delete')}
        </GlowButton>
        <GlowButton
          variant="secondary"
          size="sm"
          className={testClass}
          disabled={status === 'testing'}
          onClick={() => onTest(item)}
        >
          {testIcon}
          {testText}
        </GlowButton>
      </div>
    </GlassCard>
  )
}

function SoftwareRow({ item, testStatus, onEdit, onDelete, onTest }) {
  const t = useT()
  const status = testStatus[item.id]
  const testIcon =
    status === 'testing' ? null :
    status === 'success' ? <Check size={14} /> :
    status === 'fail' ? <X size={14} /> : <Play size={14} />
  const testText =
    status === 'testing' ? t('common.starting') :
    status === 'success' ? t('common.started') :
    status === 'fail' ? t('common.failed') : t('software.test')
  const testClass =
    status === 'success' ? 'btn-test-success' :
    status === 'fail' ? 'btn-test-fail' : ''

  return (
    <div className="software-row">
      <div className="software-row-main">
        <span className="software-row-icon">
          <SoftwareIcon path={item.path} fallback={item.icon || '📦'} iconMode={item.icon_mode} size="md" />
        </span>
        <div className="software-row-copy">
          <span className="software-row-name">{item.name}</span>
          <span className="software-row-path" title={item.path}>
            {item.path || t('common.noPath')}
          </span>
        </div>
      </div>
      <div className="software-row-description">
        {item.description || t('common.noDescription')}
      </div>
      <div className="software-row-status">
        <span className="sw-status-dot available"></span>
        {t('common.available')}
      </div>
      <div className="software-row-actions">
        <GlowButton variant="ghost" size="sm" onClick={() => onEdit(item)}>
          <Pencil size={14} />
          {t('common.edit')}
        </GlowButton>
        <GlowButton
          variant="secondary"
          size="sm"
          className={testClass}
          disabled={status === 'testing'}
          onClick={() => onTest(item)}
        >
          {testIcon}
          {testText}
        </GlowButton>
        <button
          type="button"
          className="software-row-delete"
          onClick={() => onDelete(item)}
          aria-label={t('software.deleteAria', { name: item.name })}
          title={t('common.delete')}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function SoftwareLibrary() {
  const t = useT()
  const confirm = useConfirmDialog()
  const software = useStore((s) => s.software)
  const setSoftware = useStore((s) => s.setSoftware)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const [searchQuery, setSearchQuery] = useState('')
  // 模态相关状态
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  // 测试启动状态：{ [id]: 'testing' | 'success' | 'fail' }
  const [testStatus, setTestStatus] = useState({})
  // 批量添加状态
  const [bulkAdding, setBulkAdding] = useState(false)
  // 顶部提示消息（批量添加结果）
  const [notice, setNotice] = useState('')
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('lp-software-view') === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })

  const changeViewMode = (mode) => {
    setViewMode(mode)
    try {
      localStorage.setItem('lp-software-view', mode)
    } catch {
      // 本地偏好写入失败时仍保持本次会话状态
    }
  }

  // 软件是工作空间的嵌套数据源；增删改后同时刷新两个 store，避免残留旧快照。
  const refresh = async () => {
    const [softwareList, workspaceList] = await Promise.all([
      softwareApi.list(),
      workspaceApi.list()
    ])
    setSoftware(softwareList)
    setWorkspaces(workspaceList)
  }

  // 软件列表变化时批量预加载图标到共享缓存
  useEffect(() => {
    if (!software || software.length === 0) return
    preloadSoftwareIcons(software.map((s) => s.path).filter(Boolean))
  }, [software])

  // 打开添加模态
  const handleAdd = () => {
    setEditing(null)
    setModalOpen(true)
  }

  // 批量添加：打开多选文件对话框，选择多个 .exe 后一次性导入
  const handleBulkAdd = async () => {
    setBulkAdding(true)
    setNotice('')
    try {
      const filePaths = await dialogApi.openFiles()
      if (!filePaths || filePaths.length === 0) {
        // 用户取消
        return
      }
      // 软件库中已有路径集合（小写），用于去重
      const existing = new Set(
        software.map((s) => (s.path || '').toLowerCase())
      )
      // 构造待添加项：从文件名派生 name，跳过已存在路径
      const items = filePaths
        .filter((p) => p && !existing.has(p.toLowerCase()))
        .map((p) => {
          const base = p.split(/[\\/]/).pop().replace(/\.exe$/i, '')
          return {
            name: base,
            description: '',
            path: p,
            args: '',
            icon: '📦'
          }
        })
      if (items.length === 0) {
        setNotice(t('software.bulkAllExisting'))
        return
      }
      if (items.length > 20) {
        setNotice(t('software.bulkTooMany'))
        return
      }
      const res = await softwareApi.bulkCreateValidated(items)
      if (res && res.error) {
        setNotice(t('software.bulkFailed') + res.error)
        return
      }
      await refresh()
      const createdCount = res.created?.length || 0
      const failed = res.failed || []
      const skipped = filePaths.length - items.length
      const skipText = skipped > 0 ? t('software.bulkSkipped', { count: skipped }) : ''
      const failText = failed.length > 0
        ? t('software.bulkFailedList', { count: failed.length, names: failed.slice(0, 2).map((item) => item.name).join('、') })
        : ''
      setNotice(t('software.bulkResult', { count: createdCount }) + skipText + failText)
    } catch (e) {
      setNotice(t('software.bulkFailed') + (e.message || t('common.unknownError')))
    } finally {
      setBulkAdding(false)
    }
  }

  // 打开编辑模态（预填）
  const handleEdit = (item) => {
    setEditing(item)
    setModalOpen(true)
  }

  // 删除：确认后调用 remove 并刷新
  const handleDelete = async (item) => {
    const confirmed = await confirm({
      title: t('common.delete'),
      message: t('software.deleteConfirm', { name: item.name }),
      confirmText: t('common.delete'),
      tone: 'danger',
      icon: 'danger'
    })
    if (!confirmed) return
    const res = await softwareApi.remove(item.id)
    if (res && res.error) {
      window.alert(t('software.deleteFailed') + res.error)
      return
    }
    await refresh()
  }

  // 测试启动：记录状态，按钮文字随之变化
  const handleTest = async (item) => {
    setTestStatus((s) => ({ ...s, [item.id]: 'testing' }))
    try {
      const res = await softwareApi.testLaunch(item.id)
      if (res && res.success) {
        setTestStatus((s) => ({ ...s, [item.id]: 'success' }))
      } else {
        setTestStatus((s) => ({ ...s, [item.id]: 'fail' }))
      }
    } catch (e) {
      setTestStatus((s) => ({ ...s, [item.id]: 'fail' }))
    }
    // 3 秒后清除状态，恢复按钮文字
    setTimeout(() => {
      setTestStatus((s) => {
        const next = { ...s }
        delete next[item.id]
        return next
      })
    }, 3000)
  }

  // 保存（新建 create / 编辑 update），成功后刷新并关闭模态
  const handleSave = async (data) => {
    if (editing) {
      const requiresValidation = data.path !== editing.path || data.args !== (editing.args || '')
      const res = requiresValidation
        ? await softwareApi.updateValidated(editing.id, data)
        : await softwareApi.update(editing.id, data)
      if (res && res.error) {
        return { success: false, message: res.error }
      }
    } else {
      const res = await softwareApi.createValidated(data)
      if (res && res.error) {
        return { success: false, message: res.error }
      }
    }
    await refresh()
    setModalOpen(false)
    setEditing(null)
    return { success: true }
  }

  // 关闭模态
  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredSoftware = useMemo(() => {
    if (!normalizedQuery) return software
    return software.filter((item) =>
      [item.name, item.description, item.path, item.args]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    )
  }, [software, normalizedQuery])
  return (
    <div className="software-page">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t('software.title')}</h1>
          <p className="page-subtitle">{t('software.subtitle')}</p>
        </div>
        <div className="page-actions">
          <div className="view-switcher" role="group" aria-label={t('software.viewSwitchAria')}>
            <button
              type="button"
              className={`view-switcher-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => changeViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              title={t('software.viewGridTitle')}
            >
              <LayoutGrid size={16} />
              <span>{t('software.viewGrid')}</span>
            </button>
            <button
              type="button"
              className={`view-switcher-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => changeViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title={t('software.viewListTitle')}
            >
              <List size={17} />
              <span>{t('software.viewList')}</span>
            </button>
          </div>
          <GlowButton variant="secondary" onClick={handleBulkAdd} disabled={bulkAdding}>
            <FolderOpen size={16} />
            {bulkAdding ? t('software.bulkAdding') : t('software.bulkAdd')}
          </GlowButton>
          <GlowButton variant="primary" onClick={handleAdd}>
            <Plus size={16} /> {t('software.add')}
          </GlowButton>
        </div>
      </section>

      <div className="library-search">
        <Search size={17} aria-hidden="true" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('software.searchPlaceholder')}
          aria-label={t('software.searchAria')}
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} aria-label={t('common.clear')}>
            <X size={15} />
          </button>
        )}
        <span className="library-search-result">
          {t('software.results', { count: filteredSoftware.length })}
        </span>
      </div>

      {/* 批量添加结果提示，点击可关闭 */}
      {notice && (
        <div className="bulk-notice" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}

      {software.length === 0 ? (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon-wrap">
            <Package size={40} />
          </div>
          <p>{t('software.empty')}</p>
        </GlassCard>
      ) : (
        <div className={viewMode === 'list' ? 'software-list-view' : 'software-grid'}>
          {filteredSoftware.map((item) => (
            viewMode === 'list' ? (
              <SoftwareRow
                key={item.id}
                item={item}
                testStatus={testStatus}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTest={handleTest}
              />
            ) : (
              <SoftwareCard
                key={item.id}
                item={item}
                testStatus={testStatus}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTest={handleTest}
              />
            )
          ))}
          {filteredSoftware.length === 0 && (
            <div className="library-no-results">{t('software.noResults')}</div>
          )}
        </div>
      )}

      {modalOpen && (
        <SoftwareModal
          initial={editing}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

export { SoftwareLibrary }
export default SoftwareLibrary
