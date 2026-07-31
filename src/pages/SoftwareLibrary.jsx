// 软件库页面：展示已添加的软件，支持添加/编辑/删除/测试启动
// 视觉对齐设计稿，复用共享 Modal 组件，去除重复样式
import React, { useState, useEffect } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  FolderOpen,
  Package,
  Check,
  X
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Modal from '../components/Modal'
import SoftwareIcon, { preloadSoftwareIcons } from '../components/SoftwareIcon'
import { softwareApi, dialogApi } from '../lib/ipc'
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

  // 通用字段更新
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  // 浏览选择 exe 文件，返回路径填入输入框
  const handleBrowse = async () => {
    const filePath = await dialogApi.openFile()
    if (!filePath) return
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
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        icon: form.icon || '📦',
        path: form.path.trim(),
        args: form.args.trim()
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={initial ? '编辑软件' : '添加软件'}
      onClose={onClose}
      onSave={handleSave}
      saveText={saving ? '保存中...' : '保存'}
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

function SoftwareLibrary() {
  const software = useStore((s) => s.software)
  const setSoftware = useStore((s) => s.setSoftware)
  // 模态相关状态
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  // 测试启动状态：{ [id]: 'testing' | 'success' | 'fail' }
  const [testStatus, setTestStatus] = useState({})
  // 批量添加状态
  const [bulkAdding, setBulkAdding] = useState(false)
  // 顶部提示消息（批量添加结果）
  const [notice, setNotice] = useState('')

  // 刷新软件列表到 store
  const refresh = async () => {
    const list = await softwareApi.list()
    setSoftware(list)
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
        setNotice('所选文件均已存在于软件库')
        return
      }
      const res = await softwareApi.bulkCreate(items)
      if (res && res.error) {
        setNotice('批量添加失败：' + res.error)
        return
      }
      await refresh()
      const skipped = filePaths.length - items.length
      const skipText = skipped > 0 ? `（跳过 ${skipped} 个已存在）` : ''
      setNotice(`已批量添加 ${items.length} 个软件${skipText}`)
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
      const res = await softwareApi.update(editing.id, data)
      if (res && res.error) {
        window.alert('保存失败：' + res.error)
        return
      }
    } else {
      const res = await softwareApi.create(data)
      if (res && res.error) {
        window.alert('保存失败：' + res.error)
        return
      }
    }
    await refresh()
    setModalOpen(false)
    setEditing(null)
  }

  // 关闭模态
  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
  }

  return (
    <div className="software-page">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">软件库</h1>
          <p className="page-subtitle">管理可启动的应用程序，配置路径与启动参数</p>
        </div>
        <div className="page-actions">
          <GlowButton
            variant="secondary"
            onClick={handleBulkAdd}
            disabled={bulkAdding}
          >
            <FolderOpen size={16} />
            {bulkAdding ? '添加中...' : '批量添加'}
          </GlowButton>
          <GlowButton variant="primary" onClick={handleAdd}>
            <Plus size={16} />
            添加软件
          </GlowButton>
        </div>
      </section>

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
          <p>还没有添加软件，点击右上角添加，或去扫描中心自动发现</p>
        </GlassCard>
      ) : (
        <div className="software-grid">
          {software.map((item) => (
            <SoftwareCard
              key={item.id}
              item={item}
              testStatus={testStatus}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTest={handleTest}
            />
          ))}
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
