import React, { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Library, Search, Terminal } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import { useStore } from '../store/useStore'
import { batScriptApi, scriptApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import './Automation.css'

function ScriptBlock({ title, type, workspaceId, script, onSaveStatus }) {
  const t = useT()
  const [language, setLanguage] = useState('cmd')
  const [delayMs, setDelayMs] = useState(0)
  const [content, setContent] = useState('')

  useEffect(() => {
    setLanguage(script?.language || 'cmd')
    setDelayMs(script?.delay_ms ?? 0)
    setContent(script?.content || '')
  }, [script])

  const handleSave = async () => {
    try {
      const result = await scriptApi.upsert({
        workspace_id: workspaceId,
        type,
        language,
        content,
        delay_ms: Number(delayMs) || 0
      })
      if (result?.error) throw new Error(result.error)
      onSaveStatus(t('automation.saved', { title }))
    } catch (err) {
      onSaveStatus(t('automation.saveFailed', { title, message: err.message }))
    }
  }

  return (
    <GlassCard hover={false} className="script-block">
      <div className="script-block-header">
        <div className="script-block-title">{title}</div>
        <GlowButton variant="primary" size="sm" onClick={handleSave}>{t('automation.save')}</GlowButton>
      </div>

      <div className="script-form-group">
        <label className="script-form-label">{t('automation.scriptLang')}</label>
        <div className="lang-selector">
          <label className="lang-option">
            <input type="radio" name={`lang-${type}-${workspaceId}`} checked={language === 'cmd'} onChange={() => setLanguage('cmd')} />
            CMD
          </label>
          <label className="lang-option">
            <input type="radio" name={`lang-${type}-${workspaceId}`} checked={language === 'powershell'} onChange={() => setLanguage('powershell')} />
            PowerShell
          </label>
        </div>
      </div>

      <div className="script-form-group">
        <label className="script-form-label">{t('automation.delayMs')}</label>
        <input type="number" className="delay-input" min="0" step="100" value={delayMs} onChange={(e) => setDelayMs(e.target.value)} />
      </div>

      <div className="script-form-group">
        <label className="script-form-label">{t('automation.content')}</label>
        <textarea className="script-textarea" placeholder="docker start mysql" value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
    </GlassCard>
  )
}

function BatchScriptBlock({ workspaceId, scripts, linkedScripts, onSaveStatus }) {
  const t = useT()
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    setSelected(
      (linkedScripts || []).map((script, index) => ({
        id: script.id,
        delay_ms: script.delay_ms ?? 0,
        launch_order: script.launch_order ?? index
      }))
    )
  }, [workspaceId, linkedScripts])

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.id)), [selected])
  const filteredScripts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return scripts
    return scripts.filter((script) =>
      [script.name, script.description, script.path].some((value) =>
        String(value || '').toLowerCase().includes(needle)
      )
    )
  }, [query, scripts])

  const orderedSelected = useMemo(
    () => selected
      .map((item) => ({ ...item, script: scripts.find((script) => script.id === item.id) }))
      .filter((item) => item.script)
      .sort((a, b) => a.launch_order - b.launch_order),
    [scripts, selected]
  )

  const toggleScript = (script) => {
    setSelected((current) => {
      if (current.some((item) => item.id === script.id)) {
        return current.filter((item) => item.id !== script.id)
      }
      return [...current, { id: script.id, delay_ms: 0, launch_order: current.length }]
    })
  }

  const moveScript = (id, direction) => {
    setSelected((current) => {
      const ordered = [...current].sort((a, b) => a.launch_order - b.launch_order)
      const index = ordered.findIndex((item) => item.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= ordered.length) return current
      ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
      return ordered.map((item, launch_order) => ({ ...item, launch_order }))
    })
  }

  const updateDelay = (id, value) => {
    setSelected((current) => current.map((item) =>
      item.id === id ? { ...item, delay_ms: Math.max(0, Number(value) || 0) } : item
    ))
  }

  const handleSave = async () => {
    try {
      const items = orderedSelected.map((item, launch_order) => ({
        bat_script_id: item.id,
        launch_order,
        delay_ms: item.delay_ms
      }))
      const result = await batScriptApi.setWorkspaceScripts(workspaceId, items)
      if (result?.error) throw new Error(result.error)
      setSelected((result || []).map((script, index) => ({
        id: script.id,
        delay_ms: script.delay_ms ?? 0,
        launch_order: script.launch_order ?? index
      })))
      onSaveStatus(t('automation.batchSaved', { count: items.length }))
    } catch (err) {
      onSaveStatus(t('automation.batchSaveFailed', { message: err.message }))
    }
  }

  return (
    <GlassCard hover={false} className="batch-automation-card">
      <div className="script-block-header batch-card-heading">
        <div>
          <div className="batch-card-title"><Terminal size={19} />{t('automation.batchTitle')}</div>
          <p>{t('automation.batchDesc')}</p>
        </div>
        <GlowButton variant="primary" size="sm" onClick={handleSave}>{t('automation.saveConfig')}</GlowButton>
      </div>

      {scripts.length === 0 ? (
        <div className="batch-empty-state">
          <Library size={24} />
          <div><strong>{t('automation.emptyLibraryTitle')}</strong><span>{t('automation.emptyLibraryHint')}</span></div>
        </div>
      ) : (
        <>
          <div className="batch-picker-header">
            <div className="batch-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('automation.searchPlaceholder')} /></div>
            <span>{t('automation.selected', { selected: selected.length, total: scripts.length })}</span>
          </div>
          <div className="batch-script-picker">
            {filteredScripts.map((script) => {
              const active = selectedIds.has(script.id)
              return (
                <button key={script.id} type="button" className={`batch-picker-item ${active ? 'active' : ''}`} onClick={() => toggleScript(script)}>
                  <span className="batch-file-icon">BAT</span>
                  <span className="batch-picker-copy"><strong>{script.name}</strong><small>{script.path}</small></span>
                  <span className="batch-check">{active && <Check size={15} />}</span>
                </button>
              )
            })}
          </div>

          {orderedSelected.length > 0 && (
            <div className="batch-run-plan">
              <div className="batch-run-plan-title">{t('automation.runOrder')}</div>
              {orderedSelected.map((item, index) => (
                <div className="batch-run-row" key={item.id}>
                  <span className="batch-order">{index + 1}</span>
                  <div className="batch-run-name"><strong>{item.script.name}</strong><small>{item.script.args || t('automation.noArgs')}</small></div>
                  <label className="batch-delay"><span>{t('automation.preDelay')}</span><input type="number" min="0" step="100" value={item.delay_ms} onChange={(e) => updateDelay(item.id, e.target.value)} /><em>ms</em></label>
                  <div className="batch-order-actions">
                    <button type="button" disabled={index === 0} onClick={() => moveScript(item.id, -1)} aria-label={t('automation.moveUp')}><ChevronUp size={16} /></button>
                    <button type="button" disabled={index === orderedSelected.length - 1} onClick={() => moveScript(item.id, 1)} aria-label={t('automation.moveDown')}><ChevronDown size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}

function Automation() {
  const t = useT()
  const workspaces = useStore((state) => state.workspaces)
  const [selectedId, setSelectedId] = useState(null)
  const [scripts, setScripts] = useState([])
  const [batchScripts, setBatchScripts] = useState([])
  const [linkedBatchScripts, setLinkedBatchScripts] = useState([])
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    if (selectedId == null) {
      setScripts([])
      setLinkedBatchScripts([])
      return
    }
    let cancelled = false
    Promise.all([
      scriptApi.listByWorkspace(selectedId),
      batScriptApi.list(),
      batScriptApi.listByWorkspace(selectedId)
    ]).then(([inlineList, libraryList, linkedList]) => {
      if (cancelled) return
      setScripts(inlineList?.error ? [] : inlineList || [])
      setBatchScripts(libraryList?.error ? [] : libraryList || [])
      setLinkedBatchScripts(linkedList?.error ? [] : linkedList || [])
    }).catch((err) => {
      if (!cancelled) setStatusMsg(t('automation.loadFailed', { message: err.message }))
    })
    return () => { cancelled = true }
  }, [selectedId])

  useEffect(() => {
    if (!statusMsg) return undefined
    const timer = setTimeout(() => setStatusMsg(''), 3000)
    return () => clearTimeout(timer)
  }, [statusMsg])

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedId)
  const preScript = scripts.find((script) => script.type === 'pre')
  const postScript = scripts.find((script) => script.type === 'post')

  return (
    <div className="automation-page">
      <section className="page-header">
        <div className="page-header-left"><h1 className="page-title">{t('automation.title')}</h1><p className="page-subtitle">{t('automation.subtitle')}</p></div>
      </section>

      <div className="automation-body">
        <GlassCard hover={false} className="ws-selector">
          <h3>{t('automation.workspace')}</h3>
          <div className="ws-selector-list">
            {workspaces.length === 0 && <div className="ws-selector-empty">{t('automation.noWorkspace')}</div>}
            {workspaces.map((workspace) => (
              <button key={workspace.id} type="button" className={`ws-selector-item ${selectedId === workspace.id ? 'active' : ''}`} onClick={() => setSelectedId(workspace.id)}>
                <span className="ws-selector-icon">{workspace.icon || '🚀'}</span><span className="ws-selector-name">{workspace.name}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="script-editor">
          {selectedWorkspace == null ? (
            <GlassCard hover={false} className="empty-state page-fill-state">{t('automation.selectWorkspace')}</GlassCard>
          ) : (
            <>
              {statusMsg && <div className="save-status">{statusMsg}</div>}
              <BatchScriptBlock workspaceId={selectedId} scripts={batchScripts} linkedScripts={linkedBatchScripts} onSaveStatus={setStatusMsg} />
              <ScriptBlock title={t('automation.preTitle')} type="pre" workspaceId={selectedId} script={preScript} onSaveStatus={setStatusMsg} />
              <ScriptBlock title={t('automation.postTitle')} type="post" workspaceId={selectedId} script={postScript} onSaveStatus={setStatusMsg} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Automation
export { Automation }
