import React, { useEffect, useRef, useState } from 'react'
import { Check, Download, FolderOpen, Import, LoaderCircle, Play, RotateCcw } from 'lucide-react'
import GlowButton from './ui/GlowButton'
import PetSprite from './PetSprite'
import { dialogApi, petApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import './PetImporter.css'

async function verifyImages(model) {
  const urls = new Set([model.spritesheetDataUrl, ...(model.dragAnimation?.frameDataUrls || [])].filter(Boolean))
  for (const clip of Object.values(model.render?.animations || {})) {
    for (const url of clip.source?.frames || []) urls.add(url)
    if (clip.source?.asset) urls.add(clip.source.asset)
  }
  // Decode with Chromium, which supports WebP as well as PNG. Limit concurrent
  // decodes so a large frame package does not allocate all decoded frames at once.
  const queue = [...urls]
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const url = queue.shift()
      const image = new Image()
      image.src = url
      await image.decode()
    }
  }))
}

export default function PetImporter({ onImported }) {
  const t = useT()
  const [preview, setPreview] = useState(null)
  const [engine, setEngine] = useState('auto')
  const [candidates, setCandidates] = useState([])
  const [engineReady, setEngineReady] = useState(false)
  const [actionError, setActionError] = useState('')
  const [thumbnail, setThumbnail] = useState('')
  const [mappings, setMappings] = useState({})
  const pathsRef = useRef([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [action, setAction] = useState('idle')
  const [scale, setScale] = useState(0.9)
  const [fpsOverride, setFpsOverride] = useState(null)
  const [replay, setReplay] = useState(0)
  const [background, setBackground] = useState('checker')
  const [skillBusy, setSkillBusy] = useState(false)
  const [skillNotice, setSkillNotice] = useState('')
  const live = useRef(true)
  const tokenRef = useRef(null)
  const busyRef = useRef(false)
  const dropDepth = useRef(0)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      if (tokenRef.current) petApi.cancelImport(tokenRef.current).catch(() => {})
    }
  }, [])

  const recognize = async (paths, selectedEngine = engine, entry) => {
    if (busyRef.current || !paths?.length) return
    busyRef.current = true
    setBusy(true)
    setError('')
    setPreview(null)
    setEngineReady(false)
    setActionError('')
    setThumbnail('')
    setCandidates([])
    pathsRef.current = paths
    let prepared
    try {
      const result = await petApi.previewImport(paths, { engine: selectedEngine, ...(entry ? { entry } : {}) })
      if (result.selectionRequired) { if (live.current) setCandidates(result.candidates); return }
      prepared = result
      try { await verifyImages(result.model) }
      catch (_) { throw new Error(t('petImport.decodeFailed')) }
      if (!live.current) {
        await petApi.cancelImport(result.token)
        return
      }
      tokenRef.current = result.token
      setPreview(result)
      setEngineReady(result.model.render?.engine !== 'live2d')
      setMappings(result.model.live2d?.mappings || {})
      setName(result.model.displayName)
      setAction('idle')
      setScale(0.9)
      setFpsOverride(null)
      setReplay((value) => value + 1)
    } catch (reason) {
      if (prepared) await petApi.cancelImport(prepared.token).catch(() => {})
      if (live.current) setError(reason.message)
    } finally {
      busyRef.current = false
      if (live.current) setBusy(false)
    }
  }

  const choose = async (folder) => {
    try {
      const paths = folder ? [await dialogApi.openDirectory()].filter(Boolean) : await dialogApi.openFiles([{ name: t('petImport.materials'), extensions: ['json', 'zip', 'png', 'webp'] }])
      await recognize(paths)
    } catch (reason) { setError(reason.message) }
  }

  const drop = async (event) => {
    event.preventDefault()
    dropDepth.current = 0
    setDragging(false)
    if (busyRef.current) return
    try {
      const paths = Array.from(event.dataTransfer.files).map((file) => petApi.pathForDroppedFile(file)).filter(Boolean)
      if (!paths.length) throw new Error(t('petImport.localOnly'))
      await recognize(paths)
    } catch (reason) { setError(reason.message) }
  }

  const usePet = async () => {
    if (!preview || !engineReady || busyRef.current || !name.trim()) return
    busyRef.current = true
    setBusy(true)
    setError('')
    let installed = false
    try {
      await petApi.useImport(preview.token, { displayName: name.trim(), scale, ...(preview.model.renderer === 'live2d' ? { mappings, thumbnail } : {}), ...(fpsOverride !== null ? { fps: fpsOverride } : {}) })
      installed = true
      tokenRef.current = null
      pathsRef.current = []
      setPreview(null)
      await onImported()
    } catch (reason) {
      if (live.current) setError(`${installed ? t('petImport.installedRefreshError') : ''}${reason.message}`)
    } finally {
      busyRef.current = false
      if (live.current) setBusy(false)
    }
  }

  const reset = async () => {
    if (tokenRef.current) await petApi.cancelImport(tokenRef.current).catch(() => {})
    tokenRef.current = null
    setPreview(null)
    setCandidates([])
    pathsRef.current = []
    setError('')
  }

  const exportSkill = async () => {
    setSkillBusy(true)
    setSkillNotice('')
    try {
      const result = await petApi.exportCreationSkill()
      if (!result.canceled) setSkillNotice(t('petImport.skillSaved', { path: result.path }))
    } catch (reason) { setSkillNotice(reason.message) }
    finally { setSkillBusy(false) }
  }

  const previewModel = React.useMemo(() => {
    if (!preview) return null
    if (preview.model.renderer === 'live2d') return { ...preview.model, live2d: { ...preview.model.live2d, mappings } }
    if (!preview.model.render?.animations || fpsOverride === null) return preview.model
    return { ...preview.model, render: { ...preview.model.render, animations: Object.fromEntries(Object.entries(preview.model.render.animations).map(([id, clip]) => [id, { ...clip, timing: { ...clip.timing, fps: fpsOverride } }])) } }
  }, [preview, fpsOverride, mappings])
  const fps = fpsOverride ?? preview?.model.render?.animations?.[action]?.timing?.fps ?? 8

  return <div className="pet-import-card pet-smart-import">
    <span>CREATE YOUR COMPANION</span>
    <h2>{t('petImport.title')}</h2>
    <ol className="pet-import-steps" aria-label={t('petImport.steps')}>
      {[t('petImport.stepDrop'), t('petImport.stepPreview'), t('petImport.stepUse')].map((label, index) => <li key={label} className={(preview ? 1 : 0) === index ? 'current' : ''}><b>{index + 1}</b>{label}</li>)}
    </ol>
    <label className="pet-import-engine">{t('petImport.engine')}<select aria-label={t('petImport.engine')} value={engine} disabled={busy} onChange={(event) => { const value = event.target.value; setEngine(value); if (pathsRef.current.length) recognize(pathsRef.current, value) }}>{['auto', 'sprite', 'live2d'].map(value => <option key={value} value={value}>{t(`petImport.engine_${value}`)}</option>)}</select></label>
    <div className={`pet-dropzone${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}`}
      aria-busy={busy}
      onDragEnter={(event) => { event.preventDefault(); dropDepth.current++; setDragging(true) }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? 'none' : 'copy' }}
      onDragLeave={(event) => { event.preventDefault(); if (--dropDepth.current <= 0) { dropDepth.current = 0; setDragging(false) } }}
      onDrop={drop}>
      {busy ? <LoaderCircle size={28} className="is-spinning" /> : <Import size={28} />}
      <strong>{busy ? t('petImport.processing') : t('petImport.dropTitle')}</strong>
      <p>{t('petImport.supported')}</p>
      <div className="pet-import-actions">
        <GlowButton variant="ghost" disabled={busy} onClick={() => choose(false)}>{t('petImport.chooseFiles')}</GlowButton>
        <GlowButton variant="ghost" disabled={busy} onClick={() => choose(true)}><FolderOpen size={15} />{t('petImport.chooseFolder')}</GlowButton>
      </div>
    </div>
    {error && !preview && <p className="pet-import-error" role="alert">{error}</p>}
    {!!candidates.length && <label className="pet-import-model-choice">{t('petImport.chooseModel')}<select aria-label={t('petImport.chooseModel')} defaultValue="" disabled={busy} onChange={event => recognize(pathsRef.current, engine, event.target.value)}><option value="" disabled>{t('petImport.chooseModel')}</option>{candidates.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
    {preview && <section className="pet-import-preview" aria-label={t('petImport.stepPreview')}>
      <div className="pet-import-detected"><Check size={15} /><strong>{t(`petImport.format_${preview.format}`)}</strong><span>{t('petImport.actionCount', { count: preview.actions.length })}</span></div>
      <div className={`pet-import-stage is-${background}`}><PetSprite model={previewModel} state={action} size={160 * scale} playbackToken={replay} onReady={({ thumbnail: value }) => { setThumbnail(value); setEngineReady(true); setActionError('') }} onError={reason => { setEngineReady(false); setError(reason.message) }} onActionError={reason => setActionError(reason.message)} /></div>
      <div className="pet-import-backgrounds" aria-label={t('petImport.background')}>
        {['checker', 'light', 'dark'].map((value) => <button key={value} type="button" className={background === value ? 'active' : ''} onClick={() => setBackground(value)} aria-pressed={background === value}>{t(`petImport.bg_${value}`)}</button>)}
      </div>
      <div className="pet-import-clips">{preview.actions.map((id) => <button type="button" key={id} className={action === id ? 'active' : ''} onClick={() => { setAction(id); setReplay((v) => v + 1) }} aria-pressed={action === id}>{preview.model.live2d?.actions.find(a => a.id === id)?.label || t(`petImport.action_${id}`)}</button>)}<button type="button" onClick={() => setReplay((v) => v + 1)} aria-label={t('petImport.replay')}><Play size={13} /></button></div>
      {preview.model.renderer === 'live2d' && <fieldset className="pet-import-mappings"><legend>{t('petImport.mappings')}</legend><p>{t('petImport.mappingsHint')}</p>{['idle', 'wave', 'dragging', 'walkLeft', 'walkRight', 'jump', 'failed', 'waiting', 'working', 'review'].map(state => <label key={state}>{t(`petImport.action_${state}`)}<select aria-label={t(`petImport.action_${state}`)} value={mappings[state] || ''} disabled={busy} onChange={event => setMappings(value => ({ ...value, [state]: event.target.value }))}><option value="">{t('petImport.noMapping')}</option>{preview.model.live2d.actions.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>)}</fieldset>}
      <label className="pet-import-name">{t('petImport.name')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} disabled={busy} /></label>
      <label className="pet-import-slider"><span>{t('petImport.size')}<b>{Math.round(scale * 100)}%</b></span><input type="range" min="0.65" max="1.35" step="0.05" value={scale} onChange={(event) => setScale(Number(event.target.value))} disabled={busy} /></label>
      {preview.model.renderer === 'sequence' && <label className="pet-import-slider"><span>{t('petImport.speed')}<b>{fps} FPS</b></span><input type="range" min="1" max="30" value={fps} onChange={(event) => setFpsOverride(Number(event.target.value))} disabled={busy} /></label>}
      {!!preview.warnings.length && <ul className="pet-import-warnings">{preview.warnings.map((warning) => <li key={warning}>{t(`petImport.warning_${warning}`)}</li>)}</ul>}
      {!engineReady && !error && <p className="pet-import-readiness" role="status"><LoaderCircle size={14} className="is-spinning" />{t('petImport.waitForModel')}</p>}
      {actionError && <p className="pet-import-warnings" role="status">{t('petImport.actionPreviewFailed', { message: actionError })}</p>}
      {error && <p className="pet-import-error" role="alert">{error}</p>}
      <div className="pet-import-actions"><GlowButton disabled={busy || !engineReady || !name.trim()} onClick={usePet}>{busy ? <LoaderCircle size={16} className="is-spinning" /> : <Check size={16} />}{t(busy ? 'petImport.installing' : 'petImport.use')}</GlowButton><GlowButton variant="ghost" disabled={busy} onClick={reset}><RotateCcw size={14} />{t('petImport.reset')}</GlowButton></div>
      <small className="pet-import-safe-note">{t('petImport.previewNote')}</small>
    </section>}
    <div className="pet-import-skill"><strong>{t('petImport.skillTitle')}</strong><p>{t('petImport.skillDescription')}</p><GlowButton variant="ghost" disabled={skillBusy} onClick={exportSkill}><Download size={15} />{t('petImport.exportSkill')}</GlowButton>{skillNotice && <p role="status">{skillNotice}</p>}</div>
  </div>
}
