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
  Terminal,
  FileText,
  LoaderCircle,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import SoftwareIcon, { preloadSoftwareIcons } from '../components/SoftwareIcon'
import { softwareApi, batScriptApi, dialogApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import './SoftwareLibrary.css'

// 预设 emoji 图标列表
const PRESET_ICONS = ['📦', '🌐', '💻', '🐳', '⌨', '🎵', '🎮', '📄', '📊']

// 内联模态：添加/编辑软件表单（复用共享 Modal）
function SoftwareModal({ initial, onSave, onClose }) {
  // 表单状态：编辑时预填，新建时默认值
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    icon: initial?.icon || '📦',
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
      setValidation({ state: 'error', message: '请填写软件名称并选择可执行文件。' })
      return
    }
    setSaving(true)
    const pathChanged = !initial || form.path.trim() !== initial.path || form.args.trim() !== (initial.args || '')
    setValidation({
      state: pathChanged ? 'testing' : 'idle',
      message: pathChanged ? '正在请求 Windows 启动程序，验证成功后才会保存…' : ''
    })
    try {
      const result = await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon || '📦',
        path: form.path.trim(),
        args: form.args.trim()
      })
      if (result?.success === false) {
        setValidation({ state: 'error', message: result.message })
      } else if (pathChanged) {
        setValidation({ state: 'success', message: '启动验证成功，软件已添加。' })
      }
    } catch (err) {
      setValidation({ state: 'error', message: err.message || '启动验证失败' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial ? '编辑软件' : '添加软件'}
      onClose={onClose}
      onSave={handleSave}
      saveText={saving ? '正在验证并启动...' : initial ? '保存' : '验证并添加'}
      saveDisabled={saving}
      closeDisabled={saving}
    >
      {/* 名称（必填） */}
      <div className="form-group">
        <label className="form-label">名称 *</label>
        <input
          className="form-input"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="例如：VS Code"
          autoFocus
        />
      </div>
      {/* 描述 */}
      <div className="form-group">
        <label className="form-label">描述</label>
        <input
          className="form-input"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="简要描述（可选）"
        />
      </div>
      {/* 图标选择：预设 emoji + 自定义输入 */}
      <div className="form-group">
        <label className="form-label">图标</label>
        <div className="emoji-picker">
          {PRESET_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              className={`emoji-chip ${form.icon === ic ? 'active' : ''}`}
              onClick={() => update('icon', ic)}
            >
              {ic}
            </button>
          ))}
          <input
            className="emoji-input"
            value={form.icon}
            onChange={(e) => update('icon', e.target.value)}
            maxLength={4}
            title="自定义 emoji"
          />
        </div>
      </div>
      {/* 可执行文件路径 + 浏览按钮 */}
      <div className="form-group">
        <label className="form-label">可执行文件路径</label>
        <div className="path-row">
          <input
            className="form-input"
            value={form.path}
            onChange={(e) => update('path', e.target.value)}
            placeholder="C:\Program Files\app\app.exe"
          />
          <GlowButton type="button" variant="ghost" size="sm" onClick={handleBrowse}>
            <FolderOpen size={14} />
            浏览
          </GlowButton>
        </div>
      </div>
      {/* 启动参数 */}
      <div className="form-group">
        <label className="form-label">启动参数</label>
        <input
          className="form-input"
          value={form.args}
          onChange={(e) => update('args', e.target.value)}
          placeholder="例如：--fullscreen（可选）"
        />
      </div>
      <div className={`launch-validation ${validation.state}`} role="status" aria-live="polite">
        <span className="launch-validation-icon">
          {validation.state === 'testing' ? <LoaderCircle size={17} /> :
            validation.state === 'error' ? <ShieldAlert size={17} /> : <ShieldCheck size={17} />}
        </span>
        <span>
          {validation.message || (initial
            ? '修改路径或启动参数时，将重新验证程序是否能够启动。'
            : '添加前会实际启动一次程序；只有启动成功才会写入软件库。')}
        </span>
      </div>
    </Modal>
  )
}

// 单个软件卡片
function SoftwareCard({ item, testStatus, onEdit, onDelete, onTest }) {
  // 测试启动状态：testing/success/fail/undefined
  const status = testStatus[item.id]
  const testIcon =
    status === 'testing' ? null :
    status === 'success' ? <Check size={14} /> :
    status === 'fail' ? <X size={14} /> : <Play size={14} />
  const testText =
    status === 'testing' ? '启动中...' :
    status === 'success' ? '已启动' :
    status === 'fail' ? '失败' : '测试启动'
  const testClass =
    status === 'success' ? 'btn-test-success' :
    status === 'fail' ? 'btn-test-fail' : ''

  return (
    <GlassCard className="software-card" hover>
      <div className="sw-card-header">
        <span className="sw-icon-wrap">
          <SoftwareIcon path={item.path} fallback={item.icon || '📦'} size="lg" />
        </span>
        <span className="sw-name">{item.name}</span>
      </div>
      <div className="sw-desc">{item.description || '暂无描述'}</div>
      <div className="sw-path" title={item.path}>{item.path || '未设置路径'}</div>
      <div className="sw-status">
        <span className="sw-status-dot available"></span>
        <span>可用</span>
      </div>
      <div className="sw-actions">
        <GlowButton variant="ghost" size="sm" onClick={() => onEdit(item)}>
          <Pencil size={14} />
          编辑
        </GlowButton>
        <GlowButton variant="ghost" size="sm" className="btn-danger" onClick={() => onDelete(item)}>
          <Trash2 size={14} />
          删除
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
  const status = testStatus[item.id]
  const testIcon =
    status === 'testing' ? null :
    status === 'success' ? <Check size={14} /> :
    status === 'fail' ? <X size={14} /> : <Play size={14} />
  const testText =
    status === 'testing' ? '启动中...' :
    status === 'success' ? '已启动' :
    status === 'fail' ? '失败' : '测试启动'
  const testClass =
    status === 'success' ? 'btn-test-success' :
    status === 'fail' ? 'btn-test-fail' : ''

  return (
    <div className="software-row">
      <div className="software-row-main">
        <span className="software-row-icon">
          <SoftwareIcon path={item.path} fallback={item.icon || '📦'} size="md" />
        </span>
        <div className="software-row-copy">
          <span className="software-row-name">{item.name}</span>
          <span className="software-row-path" title={item.path}>
            {item.path || '未设置路径'}
          </span>
        </div>
      </div>
      <div className="software-row-description">
        {item.description || '暂无描述'}
      </div>
      <div className="software-row-status">
        <span className="sw-status-dot available"></span>
        可用
      </div>
      <div className="software-row-actions">
        <GlowButton variant="ghost" size="sm" onClick={() => onEdit(item)}>
          <Pencil size={14} />
          编辑
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
          aria-label={`删除 ${item.name}`}
          title="删除"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function BatScriptModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    description: initial?.description || '',
    path: initial?.path || '',
    args: initial?.args || ''
  })
  const [saving, setSaving] = useState(false)

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const handleBrowse = async () => {
    const filePath = await dialogApi.openFile([
      { name: 'Windows 批处理脚本', extensions: ['bat', 'cmd'] }
    ])
    if (!filePath) return
    setForm((current) => ({
      ...current,
      path: filePath,
      name: current.name || filePath.split(/[\\/]/).pop().replace(/\.(bat|cmd)$/i, '')
    }))
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.path.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        path: form.path.trim(),
        args: form.args.trim()
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial ? '编辑 BAT 脚本' : '添加 BAT 脚本'}
      onClose={onClose}
      onSave={handleSave}
      saveText={saving ? '保存中...' : '保存脚本'}
    >
      <div className="bat-modal-note">
        <Terminal size={16} />
        仅支持本地 .bat 与 .cmd 文件。执行时会打开 Windows 命令窗口。
      </div>
      <div className="form-group">
        <label className="form-label">名称 *</label>
        <input
          className="form-input"
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          placeholder="例如：启动开发环境"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">描述</label>
        <input
          className="form-input"
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          placeholder="说明这个脚本会做什么（可选）"
        />
      </div>
      <div className="form-group">
        <label className="form-label">脚本路径 *</label>
        <div className="path-row">
          <input
            className="form-input"
            value={form.path}
            onChange={(event) => update('path', event.target.value)}
            placeholder="D:\\Scripts\\start-dev.bat"
          />
          <GlowButton type="button" variant="ghost" size="sm" onClick={handleBrowse}>
            <FolderOpen size={14} />
            浏览
          </GlowButton>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">启动参数</label>
        <input
          className="form-input"
          value={form.args}
          onChange={(event) => update('args', event.target.value)}
          placeholder="例如：--dev 3000（可选）"
        />
      </div>
    </Modal>
  )
}

function BatScriptCard({ item, runStatus, onEdit, onDelete, onRun }) {
  const status = runStatus[item.id]
  return (
    <GlassCard className="bat-script-card" hover>
      <div className="bat-script-heading">
        <span className="bat-script-icon"><Terminal size={20} /></span>
        <div className="bat-script-title-wrap">
          <span className="bat-script-title">{item.name}</span>
          <span className="bat-script-type">BAT / CMD</span>
        </div>
      </div>
      <p className="bat-script-desc">{item.description || '暂无描述'}</p>
      <div className="bat-script-path" title={item.path}>{item.path}</div>
      {item.args && <div className="bat-script-args">参数：{item.args}</div>}
      <div className="bat-script-actions">
        <GlowButton variant="primary" size="sm" disabled={status === 'running'} onClick={() => onRun(item)}>
          <Play size={14} />
          {status === 'running' ? '启动中...' : status === 'success' ? '已启动' : status === 'fail' ? '启动失败' : '运行脚本'}
        </GlowButton>
        <GlowButton variant="ghost" size="sm" onClick={() => onEdit(item)}>
          <Pencil size={14} /> 编辑
        </GlowButton>
        <button type="button" className="software-row-delete" onClick={() => onDelete(item)} aria-label={`删除 ${item.name}`}>
          <Trash2 size={15} />
        </button>
      </div>
    </GlassCard>
  )
}

function SoftwareLibrary() {
  const software = useStore((s) => s.software)
  const setSoftware = useStore((s) => s.setSoftware)
  const [activeTab, setActiveTab] = useState('software')
  const [searchQuery, setSearchQuery] = useState('')
  const [batScripts, setBatScripts] = useState([])
  const [batModalOpen, setBatModalOpen] = useState(false)
  const [editingBat, setEditingBat] = useState(null)
  const [batRunStatus, setBatRunStatus] = useState({})
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

  // 刷新软件列表到 store
  const refresh = async () => {
    const list = await softwareApi.list()
    setSoftware(list)
  }

  const refreshBatScripts = async () => {
    const list = await batScriptApi.list()
    setBatScripts(Array.isArray(list) ? list : [])
  }

  useEffect(() => {
    refreshBatScripts().catch((error) => {
      console.error('加载 BAT 脚本失败:', error)
    })
  }, [])

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
        setNotice('所选文件均已存在于软件库')
        return
      }
      if (items.length > 20) {
        setNotice('为避免同时打开过多程序，请每次选择不超过 20 个软件进行验证')
        return
      }
      const res = await softwareApi.bulkCreateValidated(items)
      if (res && res.error) {
        setNotice('批量添加失败：' + res.error)
        return
      }
      await refresh()
      const createdCount = res.created?.length || 0
      const failed = res.failed || []
      const skipped = filePaths.length - items.length
      const skipText = skipped > 0 ? `（跳过 ${skipped} 个已存在）` : ''
      const failText = failed.length > 0
        ? `；${failed.length} 个启动失败未添加：${failed.slice(0, 2).map((item) => item.name).join('、')}`
        : ''
      setNotice(`验证通过并添加 ${createdCount} 个软件${skipText}${failText}`)
    } catch (e) {
      setNotice('批量添加失败：' + (e.message || '未知错误'))
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
    if (!window.confirm(`确定删除「${item.name}」吗？`)) return
    const res = await softwareApi.remove(item.id)
    if (res && res.error) {
      window.alert('删除失败：' + res.error)
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

  const openAddBat = () => {
    setEditingBat(null)
    setBatModalOpen(true)
  }

  const openEditBat = (item) => {
    setEditingBat(item)
    setBatModalOpen(true)
  }

  const saveBat = async (data) => {
    const result = editingBat
      ? await batScriptApi.update(editingBat.id, data)
      : await batScriptApi.create(data)
    if (result?.error) {
      window.alert('保存失败：' + result.error)
      return
    }
    await refreshBatScripts()
    setBatModalOpen(false)
    setEditingBat(null)
  }

  const deleteBat = async (item) => {
    if (!window.confirm(`确定删除脚本「${item.name}」吗？`)) return
    const result = await batScriptApi.remove(item.id)
    if (result?.error) {
      window.alert('删除失败：' + result.error)
      return
    }
    await refreshBatScripts()
  }

  const runBat = async (item) => {
    setBatRunStatus((current) => ({ ...current, [item.id]: 'running' }))
    try {
      const result = await batScriptApi.run(item.id)
      setBatRunStatus((current) => ({
        ...current,
        [item.id]: result?.success ? 'success' : 'fail'
      }))
    } catch {
      setBatRunStatus((current) => ({ ...current, [item.id]: 'fail' }))
    }
    setTimeout(() => {
      setBatRunStatus((current) => {
        const next = { ...current }
        delete next[item.id]
        return next
      })
    }, 3000)
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredSoftware = useMemo(() => {
    if (!normalizedQuery) return software
    return software.filter((item) =>
      [item.name, item.description, item.path, item.args]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    )
  }, [software, normalizedQuery])
  const filteredBatScripts = useMemo(() => {
    if (!normalizedQuery) return batScripts
    return batScripts.filter((item) =>
      [item.name, item.description, item.path, item.args]
        .some((value) => String(value || '').toLowerCase().includes(normalizedQuery))
    )
  }, [batScripts, normalizedQuery])

  const switchLibraryTab = (tab) => {
    setActiveTab(tab)
    setSearchQuery('')
  }

  return (
    <div className="software-page">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">软件库</h1>
          <p className="page-subtitle">管理可启动的应用程序，配置路径与启动参数</p>
        </div>
        <div className="page-actions">
          {activeTab === 'software' ? (
            <>
              <div className="view-switcher" role="group" aria-label="软件库展示方式">
                <button
                  type="button"
                  className={`view-switcher-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => changeViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  title="卡片视图"
                >
                  <LayoutGrid size={16} />
                  <span>卡片</span>
                </button>
                <button
                  type="button"
                  className={`view-switcher-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => changeViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  title="列表视图"
                >
                  <List size={17} />
                  <span>列表</span>
                </button>
              </div>
              <GlowButton variant="secondary" onClick={handleBulkAdd} disabled={bulkAdding}>
                <FolderOpen size={16} />
                {bulkAdding ? '正在验证...' : '批量验证添加'}
              </GlowButton>
              <GlowButton variant="primary" onClick={handleAdd}>
                <Plus size={16} /> 添加软件
              </GlowButton>
            </>
          ) : (
            <GlowButton variant="primary" onClick={openAddBat}>
              <Plus size={16} /> 添加 BAT 脚本
            </GlowButton>
          )}
        </div>
      </section>

      <div className={`library-tabs ${activeTab === 'bat' ? 'show-bat' : ''}`} role="tablist" aria-label="软件库类型">
        <span className="library-tab-slider" aria-hidden="true" />
        <button
          type="button"
          className={`library-tab ${activeTab === 'software' ? 'active' : ''}`}
          onClick={() => switchLibraryTab('software')}
          role="tab"
          aria-selected={activeTab === 'software'}
        >
          <Package size={17} />
          应用程序
          <span className="library-tab-count">{software.length}</span>
        </button>
        <button
          type="button"
          className={`library-tab ${activeTab === 'bat' ? 'active' : ''}`}
          onClick={() => switchLibraryTab('bat')}
          role="tab"
          aria-selected={activeTab === 'bat'}
        >
          <Terminal size={17} />
          BAT 脚本
          <span className="library-tab-count">{batScripts.length}</span>
        </button>
      </div>

      <div className="library-search">
        <Search size={17} aria-hidden="true" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={activeTab === 'software' ? '搜索软件名称、路径、描述或参数' : '搜索脚本名称、路径、描述或参数'}
          aria-label={activeTab === 'software' ? '搜索软件' : '搜索 BAT 脚本'}
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} aria-label="清空搜索">
            <X size={15} />
          </button>
        )}
        <span className="library-search-result">
          {activeTab === 'software' ? filteredSoftware.length : filteredBatScripts.length} 个结果
        </span>
      </div>

      {/* 批量添加结果提示，点击可关闭 */}
      {activeTab === 'software' && notice && (
        <div className="bulk-notice" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}

      {activeTab === 'software' && (software.length === 0 ? (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon-wrap">
            <Package size={40} />
          </div>
          <p>还没有添加软件，点击右上角添加，或去扫描中心自动发现</p>
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
            <div className="library-no-results">没有找到匹配的软件</div>
          )}
        </div>
      ))}

      {activeTab === 'bat' && (batScripts.length === 0 ? (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon-wrap"><FileText size={40} /></div>
          <p>还没有 BAT 脚本，点击右上角添加本地 .bat 或 .cmd 文件</p>
        </GlassCard>
      ) : (
        <div className="bat-script-grid">
          {filteredBatScripts.map((item) => (
            <BatScriptCard
              key={item.id}
              item={item}
              runStatus={batRunStatus}
              onEdit={openEditBat}
              onDelete={deleteBat}
              onRun={runBat}
            />
          ))}
          {filteredBatScripts.length === 0 && (
            <div className="library-no-results">没有找到匹配的 BAT 脚本</div>
          )}
        </div>
      ))}

      {modalOpen && (
        <SoftwareModal
          initial={editing}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
      {batModalOpen && (
        <BatScriptModal
          initial={editingBat}
          onSave={saveBat}
          onClose={() => {
            setBatModalOpen(false)
            setEditingBat(null)
          }}
        />
      )}
    </div>
  )
}

export { SoftwareLibrary }
export default SoftwareLibrary
