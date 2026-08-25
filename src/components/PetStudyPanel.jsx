import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Brain, ChevronLeft, ChevronRight, Columns3, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { petApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import GlowButton from './ui/GlowButton'
import ResizableTable from './ui/ResizableTable'
import ShortcutInput from './ShortcutInput'
import './PetStudyPanel.css'

const MODES = [
  ['companion', 'modeCompanion', 'modeCompanionDesc'],
  ['study', 'modeStudy', 'modeStudyDesc'],
  ['stealth-study', 'modeStealth', 'modeStealthDesc']
]

const LANGUAGES = [
  ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['es', 'Español'], ['it', 'Italiano'], ['pt', 'Português'], ['ru', 'Русский'], ['zh', '简体中文']
]

const PAGE_SIZE = 25
const COLUMN_STORAGE_KEY = 'launchpad:pet-study:columns:v1'

export default function PetStudyPanel({ instanceId, onNotice }) {
  const t = useT()
  const tableRef = useRef(null)
  const searchRequestRef = useRef(0)
  const [data, setData] = useState(null)
  const [term, setTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [topic, setTopic] = useState(t('petStudy.defaultTopic'))
  const [generating, setGenerating] = useState(false)
  const [shortcutDraft, setShortcutDraft] = useState('')
  const [shortcutValidation, setShortcutValidation] = useState({ status: 'idle', message: '' })
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(1)
  const [library, setLibrary] = useState({ items: [], total: 0 })
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryVersion, setLibraryVersion] = useState(0)

  const load = () => petApi.studyGet(instanceId).then((next) => {
    setData(next)
    setShortcutDraft(next.settings?.quickAddShortcut || '')
    setLibraryVersion((value) => value + 1)
  }).catch((error) => onNotice(error.message))

  useEffect(() => {
    load()
    const unsubscribe = petApi.onStudyChanged((payload) => {
      if (!payload?.petModelId || payload.petModelId === instanceId) load()
    })
    return unsubscribe
  }, [instanceId])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => { setPage(1) }, [debouncedQuery, data?.settings?.language])

  useEffect(() => {
    if (!data?.settings?.language) return undefined
    const requestId = ++searchRequestRef.current
    let active = true
    setLibraryLoading(true)
    petApi.studySearch({
      language: data.settings.language,
      query: debouncedQuery,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE
    }, instanceId).then((result) => {
      if (!active || requestId !== searchRequestRef.current) return
      const total = Number(result?.total) || 0
      const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
      setLibrary({ items: Array.isArray(result?.items) ? result.items : [], total })
    }).catch((error) => {
      if (active && requestId === searchRequestRef.current) onNotice(error.message)
    }).finally(() => {
      if (active && requestId === searchRequestRef.current) setLibraryLoading(false)
    })
    return () => { active = false }
  }, [data?.settings?.language, debouncedQuery, page, instanceId, libraryVersion])

  const columns = useMemo(() => [
    { key: 'term', label: t('petStudy.colTerm'), width: 24, minWidth: 150, resizable: true, className: 'pet-study-col-term', resizeLabel: t('petStudy.resizeColumn', { column: t('petStudy.colTerm') }) },
    { key: 'pronunciation', label: t('petStudy.colPronunciation'), width: 15, minWidth: 100, resizable: true, className: 'pet-study-col-pronunciation', resizeLabel: t('petStudy.resizeColumn', { column: t('petStudy.colPronunciation') }) },
    { key: 'meaning', label: t('petStudy.colMeaning'), width: 25, minWidth: 170, resizable: true, className: 'pet-study-col-meaning', resizeLabel: t('petStudy.resizeColumn', { column: t('petStudy.colMeaning') }) },
    { key: 'state', label: t('petStudy.colState'), width: 11, minWidth: 82, resizable: true, className: 'pet-study-col-state', resizeLabel: t('petStudy.resizeColumn', { column: t('petStudy.colState') }) },
    { key: 'review', label: t('petStudy.colReview'), fixedWidth: 176, className: 'pet-study-col-review' },
    { key: 'actions', label: t('petStudy.colActions'), fixedWidth: 46, className: 'pet-study-col-actions' }
  ], [t])

  if (!data) return <div className="pet-study-loading">{t('petStudy.loading')}</div>

  const update = async (patch) => {
    try { await petApi.studyUpdateSettings(patch, instanceId); await load() } catch (error) { onNotice(error.message) }
  }

  const add = async (event) => {
    event.preventDefault()
    if (!term.trim() || adding) return
    setAdding(true)
    try {
      await petApi.studyAddWithAI({ language: data.settings.language, term }, instanceId)
      setTerm('')
      await load()
      onNotice(t('petStudy.addedNotice'))
    } catch (error) { onNotice(error.message) } finally { setAdding(false) }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const result = await petApi.studyGenerate({ language: data.settings.language, topic, count: 12 }, instanceId)
      await load()
      onNotice(t('petStudy.generatedNotice', { count: result.count, language: data.settings.language }))
    } catch (error) { onNotice(error.message) } finally { setGenerating(false) }
  }

  const changeShortcut = async (accelerator) => {
    setShortcutDraft(accelerator)
    if (!accelerator) {
      setShortcutValidation({ status: 'idle', message: '' })
      await update({ quickAddShortcut: '' })
      return
    }
    setShortcutValidation({ status: 'checking', message: t('petStudy.shortcutChecking') })
    try {
      const result = await petApi.studyValidateShortcut(accelerator, instanceId)
      if (!result.valid) {
        const message = result.reason === 'duplicate'
          ? t('petStudy.shortcutDuplicate', { name: result.workspaceName })
          : result.reason === 'occupied' ? t('petStudy.shortcutOccupied') : t('petStudy.shortcutInvalid')
        setShortcutValidation({ status: 'error', message })
        return
      }
      await update({ quickAddShortcut: accelerator })
      setShortcutValidation({ status: 'valid', message: t('petStudy.shortcutSaved') })
    } catch (error) { setShortcutValidation({ status: 'error', message: error.message }) }
  }

  const stateLabel = (item) => {
    if (item.state === 'new') return t('petStudy.stateNew')
    if (item.due_at <= Date.now()) return t('petStudy.stateDue')
    return t('petStudy.stateLearning')
  }

  const reviewOptions = [
    [t('petStudy.ratingAgainShort'), t('petStudy.ratingAgain'), 1],
    [t('petStudy.ratingHardShort'), t('petStudy.ratingHard'), 2],
    [t('petStudy.ratingGoodShort'), t('petStudy.ratingGood'), 3],
    [t('petStudy.ratingEasyShort'), t('petStudy.ratingEasy'), 4]
  ]

  const renderCell = (item, column) => {
    if (column.key === 'term') return <div className="pet-study-term-cell"><strong>{item.term}</strong><small className="pet-study-compact-meta">{item.pronunciation || '—'} · {stateLabel(item)}</small></div>
    if (column.key === 'pronunciation') return <span className="pet-study-pronunciation">{item.pronunciation || '—'}</span>
    if (column.key === 'meaning') return <div className="pet-study-meaning-cell"><span>{item.meaning || t('petStudy.meaningMissing')}</span>{item.example_translation && <small>{item.example_translation}</small>}</div>
    if (column.key === 'state') return <span className={`pet-study-state pet-study-state--${item.state}`}>{stateLabel(item)}</span>
    if (column.key === 'review') return <div className="pet-study-ratings">{reviewOptions.map(([shortLabel, fullLabel, rating]) => <button type="button" key={rating} onClick={() => petApi.studyReview(item.id, rating, instanceId).then(load)} title={fullLabel} aria-label={`${item.term}：${fullLabel}`}>{shortLabel}</button>)}</div>
    return <button type="button" className="pet-study-delete" onClick={() => petApi.studyRemove(item.id, instanceId).then(load)} aria-label={t('petStudy.deleteItem', { term: item.term })} title={t('common.delete')}><Trash2 size={14} /></button>
  }

  const languageLabel = LANGUAGES.find(([code]) => code === data.settings.language)?.[1] || data.settings.language
  const pageCount = Math.max(1, Math.ceil(library.total / PAGE_SIZE))

  return (
    <div className="pet-study-layout">
      <section className="pet-settings-card pet-study-control">
        <div className="pet-section-title"><div><span>SPACED REPETITION</span><h2>{t('petStudy.title')}</h2></div><Brain size={21} /></div>
        <div className="pet-study-modes">{MODES.map(([value, titleKey, descKey]) => <button type="button" key={value} className={data.settings.mode === value ? 'active' : ''} onClick={() => update({ mode: value })}><strong>{t(`petStudy.${titleKey}`)}</strong><small>{t(`petStudy.${descKey}`)}</small></button>)}</div>
        <div className="pet-study-fields">
          <label>{t('petStudy.targetLanguage')}<select value={data.settings.language} onChange={(event) => update({ language: event.target.value })}>{LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <label>{t('petStudy.interval')}<input type="number" min="5" max="600" value={data.settings.intervalSeconds} onChange={(event) => update({ intervalSeconds: Number(event.target.value) })} /><span>{t('petStudy.seconds')}</span></label>
          <div className="pet-study-shortcut"><strong>{t('petStudy.shortcut')}</strong><ShortcutInput value={shortcutDraft} onChange={changeShortcut} validationStatus={shortcutValidation.status} validationMessage={shortcutValidation.message} ariaLabel={t('petStudy.shortcut')} placeholder={t('petStudy.shortcutPlaceholder')} recordingMessage={t('petStudy.shortcutRecording')} hint={t('petStudy.shortcutHint')} /></div>
        </div>
        <div className="pet-study-stats"><span><b>{data.stats.total}</b>{t('petStudy.statTerms')}</span><span><b>{data.stats.due}</b>{t('petStudy.statDue')}</span><span><b>{data.stats.reviewedToday}</b>{t('petStudy.statToday')}</span><span><b>{data.stats.learning}</b>{t('petStudy.statMemory')}</span></div>
      </section>

      <section className="pet-settings-card pet-study-add-card">
        <div className="pet-section-title"><div><span>VOCABULARY</span><h2>{t('petStudy.addTitle')}</h2></div><BookOpen size={21} /></div>
        <form onSubmit={add} className="pet-study-manual"><input value={term} onChange={(event) => setTerm(event.target.value)} placeholder={t('petStudy.termPlaceholder')} /><GlowButton type="submit" size="sm" disabled={adding || !term.trim()}><Plus size={15} /> {adding ? t('petStudy.adding') : t('petStudy.addWithAi')}</GlowButton></form>
        <div className="pet-study-ai"><input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t('petStudy.topicPlaceholder')} /><GlowButton type="button" size="sm" onClick={generate} disabled={generating}><Sparkles size={15} /> {generating ? t('petStudy.generating') : t('petStudy.generate')}</GlowButton></div>
        <p className="pet-study-hint">{t('petStudy.aiHint')}</p>
      </section>

      <section className="pet-settings-card pet-study-library">
        <div className="pet-study-library-head">
          <div className="pet-section-title"><div><span>MEMORY QUEUE</span><h2>{t('petStudy.libraryTitle')}</h2></div><b>{library.total}</b></div>
          <div className="pet-study-toolbar">
            <label className="pet-study-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('petStudy.searchPlaceholder', { language: languageLabel })} aria-label={t('petStudy.searchAria')} />{query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}><X size={15} /></button>}</label>
            <span className="pet-study-result-count" role="status">{libraryLoading ? t('petStudy.searching') : t('petStudy.results', { count: library.total })}</span>
            <button type="button" className="pet-study-reset-columns" onClick={() => tableRef.current?.reset()} title={t('petStudy.resetColumns')}><Columns3 size={15} /><span>{t('petStudy.resetColumns')}</span></button>
          </div>
        </div>

        <ResizableTable ref={tableRef} columns={columns} rows={library.items} getRowKey={(item) => item.id} renderCell={renderCell} storageKey={COLUMN_STORAGE_KEY} className="pet-study-table" empty={<div className="pet-study-empty">{debouncedQuery ? t('petStudy.noResults') : t('petStudy.emptyLibrary')}</div>} />

        {library.total > PAGE_SIZE && <nav className="pet-study-pagination" aria-label={t('petStudy.pagination')}><button type="button" disabled={page <= 1 || libraryLoading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label={t('petStudy.previousPage')}><ChevronLeft size={16} /></button><span>{t('petStudy.pageStatus', { page, pages: pageCount })}</span><button type="button" disabled={page >= pageCount || libraryLoading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label={t('petStudy.nextPage')}><ChevronRight size={16} /></button></nav>}
      </section>
    </div>
  )
}
