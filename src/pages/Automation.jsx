// 自动化脚本页面
// 左侧工作空间选择 + 右侧 pre/post 脚本编辑器
// 选中工作空间后加载已有脚本并填充表单，保存时调 scriptApi.upsert
import React, { useEffect, useState } from 'react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import { useStore } from '../store/useStore'
import { scriptApi } from '../lib/ipc'
import './Automation.css'

// 单个脚本区块：标题、语言选择、延迟输入、内容文本域、保存按钮
// type: 'pre' | 'post'
function ScriptBlock({ title, type, workspaceId, script, onSaveStatus }) {
  // 语言（默认 cmd）、延迟毫秒（默认 0）、脚本内容
  const [language, setLanguage] = useState('cmd')
  const [delayMs, setDelayMs] = useState(0)
  const [content, setContent] = useState('')
  // 当传入的 script 变化时同步表单
  useEffect(() => {
    if (script) {
      setLanguage(script.language || 'cmd')
      setDelayMs(script.delay_ms ?? 0)
      setContent(script.content || '')
    } else {
      // 无记录时重置为默认
      setLanguage('cmd')
      setDelayMs(0)
      setContent('')
    }
  }, [script])

  // 保存当前脚本到后端
  const handleSave = async () => {
    try {
      await scriptApi.upsert({
        workspace_id: workspaceId,
        type,
        language,
        content,
        delay_ms: Number(delayMs) || 0
      })
      onSaveStatus(`${title} 保存成功`)
    } catch (err) {
      onSaveStatus(`${title} 保存失败: ${err.message}`)
    }
  }

  return (
    <GlassCard hover={false} className="script-block">
      <div className="script-block-header">
        <div className="script-block-title">{title}</div>
        <GlowButton variant="primary" size="sm" onClick={handleSave}>
          保存
        </GlowButton>
      </div>

      {/* 语言选择 */}
      <div className="script-form-group">
        <label className="script-form-label">脚本语言</label>
        <div className="lang-selector">
          <label className="lang-option">
            <input
              type="radio"
              name={`lang-${type}-${workspaceId}`}
              value="cmd"
              checked={language === 'cmd'}
              onChange={() => setLanguage('cmd')}
            />
            CMD
          </label>
          <label className="lang-option">
            <input
              type="radio"
              name={`lang-${type}-${workspaceId}`}
              value="powershell"
              checked={language === 'powershell'}
              onChange={() => setLanguage('powershell')}
            />
            PowerShell
          </label>
        </div>
      </div>

      {/* 延迟输入 */}
      <div className="script-form-group">
        <label className="script-form-label">延迟（毫秒）</label>
        <input
          type="number"
          className="delay-input"
          min="0"
          step="100"
          value={delayMs}
          onChange={(e) => setDelayMs(e.target.value)}
        />
      </div>

      {/* 脚本内容 */}
      <div className="script-form-group">
        <label className="script-form-label">脚本内容</label>
        <textarea
          className="script-textarea"
          placeholder="docker start mysql"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
    </GlassCard>
  )
}

function Automation() {
  // 工作空间列表来自 store，选中 id 为本页本地状态
  const workspaces = useStore((s) => s.workspaces)
  const [selectedId, setSelectedId] = useState(null)
  // 已加载的脚本列表（pre/post）
  const [scripts, setScripts] = useState([])
  // 全局提示信息
  const [statusMsg, setStatusMsg] = useState('')

  // 选中工作空间变化时加载已有脚本
  useEffect(() => {
    if (selectedId == null) {
      setScripts([])
      return
    }
    let cancelled = false
    scriptApi
      .listByWorkspace(selectedId)
      .then((list) => {
        if (!cancelled) setScripts(list || [])
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('加载脚本失败:', err)
          setScripts([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // 保存后的提示 3 秒后自动清除
  useEffect(() => {
    if (!statusMsg) return
    const timer = setTimeout(() => setStatusMsg(''), 3000)
    return () => clearTimeout(timer)
  }, [statusMsg])

  const selectedWorkspace = workspaces.find((w) => w.id === selectedId)
  // 分别取 pre / post 脚本记录
  const preScript = scripts.find((s) => s.type === 'pre')
  const postScript = scripts.find((s) => s.type === 'post')

  return (
    <div className="automation-page">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">自动化</h1>
          <p className="page-subtitle">为工作空间配置启动前后的脚本</p>
        </div>
      </section>

      <div className="automation-body">
      {/* 左侧：工作空间选择列表 */}
      <GlassCard hover={false} className="ws-selector">
        <h3>工作空间</h3>
        <div className="ws-selector-list">
          {workspaces.length === 0 && (
            <div className="ws-selector-empty">暂无工作空间</div>
          )}
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`ws-selector-item ${selectedId === w.id ? 'active' : ''}`}
              onClick={() => setSelectedId(w.id)}
            >
              <span className="ws-selector-icon">{w.icon || '🚀'}</span>
              <span className="ws-selector-name">{w.name}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* 右侧：脚本编辑器 */}
      <div className="script-editor">
        {selectedWorkspace == null ? (
          <GlassCard hover={false} className="empty-state">
            请从左侧选择一个工作空间
          </GlassCard>
        ) : (
          <>
            {statusMsg && <div className="save-status">{statusMsg}</div>}
            <ScriptBlock
              title="启动前脚本 (Pre-launch)"
              type="pre"
              workspaceId={selectedId}
              script={preScript}
              onSaveStatus={setStatusMsg}
            />
            <ScriptBlock
              title="启动后脚本 (Post-launch)"
              type="post"
              workspaceId={selectedId}
              script={postScript}
              onSaveStatus={setStatusMsg}
            />
          </>
        )}
      </div>
      </div>
    </div>
  )
}

export default Automation
// 具名导出便于按需引入
export { Automation }
