import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Archive, Bot, Box, Brain, Check, CircleHelp, Eraser, FolderOpen, Import,
  KeyRound, MessageCircle, Pencil, Plus, Save, Send, Settings2, Sparkles,
  Terminal, Trash2, WandSparkles
} from 'lucide-react'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import PetSprite from '../components/PetSprite'
import TutorialDrawer from '../components/TutorialDrawer'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { aiApi, dialogApi, petApi, systemApi } from '../lib/ipc'
import { renderMarkdown } from '../lib/markdown'
import { useT } from '../hooks/useT'
import { useStore } from '../store/useStore'
import './PetCenter.css'

const PREVIEW_STATES = [
  ['idle', 'idle'], ['walkRight', 'walkRight'], ['walkLeft', 'walkLeft'], ['wave', 'wave'],
  ['jump', 'jump'], ['failed', 'failed'], ['waiting', 'waiting'], ['working', 'working'], ['review', 'review']
]

const AI_PROVIDERS = {
  openai: { label: 'OpenAI', apiFormat: 'responses', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-4o'] },
  deepseek: { label: 'DeepSeek', apiFormat: 'chat-completions', baseUrl: 'https://api.deepseek.com', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  kimi: { label: 'Kimi', apiFormat: 'chat-completions', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k3', 'kimi-k2.6'] },
  zhipu: { label: 'Zhipu GLM', apiFormat: 'chat-completions', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-5.2', 'glm-5.1', 'glm-4.7'] },
  custom: { labelKey: 'providerCustom', apiFormat: 'chat-completions', baseUrl: '', models: [] }
}

const CUSTOM_MODEL = '__custom__'
const PET_TAB_KEYS = ['companion', 'memory', 'models', 'settings']

function PetCenter() {
  const t = useT()
  const confirm = useConfirmDialog()
  const language = useStore((state) => state.language)
  const [activeTab, setActiveTab] = useState('companion')
  const [tabDirection, setTabDirection] = useState('forward')
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0, ready: false })
  const [config, setConfig] = useState(null)
  const [models, setModels] = useState([])
  const [aiConfig, setAiConfig] = useState(null)
  const [previewState, setPreviewState] = useState('idle')
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [conversation, setConversation] = useState(null)
  const [memories, setMemories] = useState([])
  const [memoryMode, setMemoryMode] = useState('manual')
  const [memoryType, setMemoryType] = useState('preference')
  const [memoryDraft, setMemoryDraft] = useState('')
  const [draft, setDraft] = useState('')
  const [chatting, setChatting] = useState(false)
  const [notice, setNotice] = useState('')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [apiFormat, setApiFormat] = useState('responses')
  const [baseUrl, setBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [shellEnabled, setShellEnabled] = useState(false)
  const chatEndRef = useRef(null)
  const chatScrollRef = useRef(null)
  const prevConversationIdRef = useRef(null)
  const typeBufferRef = useRef('')
  const typeTimerRef = useRef(null)

  const startTypewriter = () => {
    if (typeTimerRef.current) return
    typeTimerRef.current = setInterval(() => {
      const chunk = typeBufferRef.current.slice(0, 3)
      if (!chunk) return
      typeBufferRef.current = typeBufferRef.current.slice(3)
      setMessages((items) => items.map((item) =>
        item.id === 'streaming' && item.role === 'assistant'
          ? { ...item, content: item.content + chunk }
          : item
      ))
    }, 80)
  }

  const stopTypewriter = () => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current)
    typeTimerRef.current = null
    typeBufferRef.current = ''
  }
  const tabsRef = useRef(null)

  const load = async () => {
    const [nextConfig, nextModels, nextAi, nextConversation, nextConversations, nextMemories] = await Promise.all([
      petApi.getConfig(), petApi.listModels(), aiApi.getConfig(), aiApi.getConversation(),
      aiApi.listConversations(), aiApi.listMemories()
    ])
    setConfig(nextConfig)
    setModels(nextModels)
    setAiConfig(nextAi)
    setProvider(nextAi.provider || 'custom')
    setApiFormat(nextAi.apiFormat || 'responses')
    setBaseUrl(nextAi.baseUrl || '')
    setAiModel(nextAi.model || '')
    setMemoryMode(nextAi.memoryMode || 'manual')
    setShellEnabled(Boolean(nextAi.shellEnabled))
    setConversation(nextConversation.conversation)
    setMessages(nextConversation.messages || [])
    setConversations(nextConversations)
    setMemories(nextMemories)
  }

  useEffect(() => { load().catch((error) => setNotice(error.message)) }, [language])
  useEffect(() => {
    if (activeTab !== 'memory') return
    Promise.all([aiApi.listMemories(), aiApi.getConfig()]).then(([nextMemories, nextAi]) => {
      setMemories(nextMemories)
      setMemoryMode(nextAi.memoryMode || 'manual')
    }).catch((error) => setNotice(error.message))
  }, [activeTab])
  useEffect(() => {
    const unsubscribeConversation = aiApi.onConversationChanged(async (payload) => {
      try {
        const [nextConversation, nextConversations] = await Promise.all([
          aiApi.getConversation(payload?.conversationId), aiApi.listConversations()
        ])
        setConversation(nextConversation.conversation)
        setMessages(nextConversation.messages || [])
        setConversations(nextConversations)
      } catch (_) {}
    })
    const unsubscribeMemory = aiApi.onMemoryChanged(() => {
      aiApi.listMemories().then(setMemories).catch(() => {})
    })
    return () => { unsubscribeConversation(); unsubscribeMemory() }
  }, [])
  useEffect(() => {
    if (typeof aiApi.onChatDelta !== 'function') return undefined
    const unsubscribeDelta = aiApi.onChatDelta(({ delta }) => {
      if (!delta) return
      typeBufferRef.current += delta
      startTypewriter()
    })
    return () => unsubscribeDelta()
  }, [])
  useEffect(() => {
    const container = chatScrollRef.current
    if (!container) return
    const sameConversation = prevConversationIdRef.current === conversation?.id
    prevConversationIdRef.current = conversation?.id
    const scrollToBottom = () => { container.scrollTop = container.scrollHeight }
    // 进入聊天、切换会话、清空时立即定位到最新消息；正常收发时平滑滚动
    if (!sameConversation || messages.length === 0) {
      scrollToBottom()
      requestAnimationFrame(scrollToBottom)
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, chatting, conversation?.id])
  useLayoutEffect(() => {
    const tabList = tabsRef.current
    if (!tabList) return undefined

    const updateIndicator = () => {
      const activeButton = tabList.querySelector(`[data-tab-key="${activeTab}"]`)
      if (!activeButton) return
      setTabIndicator({ left: activeButton.offsetLeft, width: activeButton.offsetWidth, ready: true })
    }

    updateIndicator()
    const observer = new ResizeObserver(updateIndicator)
    observer.observe(tabList)
    return () => observer.disconnect()
  }, [activeTab, language, config, aiConfig])

  const importModel = async (mode = 'directory') => {
    setNotice('')
    try {
      const selectedPath = mode === 'directory'
        ? await dialogApi.openDirectory()
        : await dialogApi.openFile([{ name: 'Codex Pet Manifest', extensions: ['json'] }])
      if (!selectedPath) return
      await petApi.importModel(selectedPath)
      await load()
      setNotice(t('petCenter.importSuccess'))
    } catch (error) {
      setNotice(error.message)
    }
  }

  const selectModel = async (id) => {
    try {
      await petApi.selectModel(id)
      await load()
      setPreviewState('wave')
      setTimeout(() => setPreviewState('idle'), 1200)
    } catch (error) { setNotice(error.message) }
  }

  const removeModel = async (id) => {
    if (!window.confirm(t('petCenter.removeConfirm'))) return
    try { await petApi.removeModel(id); await load() } catch (error) { setNotice(error.message) }
  }

  const updatePetSetting = async (patch) => {
    try {
      const next = await petApi.updateSettings(patch)
      setConfig(next)
    } catch (error) { setNotice(error.message) }
  }

  const toggleEnabled = async (enabled) => {
    try {
      await systemApi.setPetEnabled(enabled)
      setConfig((value) => ({ ...value, settings: { ...value.settings, enabled } }))
    } catch (error) { setNotice(error.message) }
  }

  const sendMessage = async (event) => {
    event?.preventDefault()
    const content = draft.trim()
    if (!content || chatting) return
    setMessages((items) => [
      ...items.filter((item) => item.id),
      { id: `local-u-${Date.now()}`, role: 'user', content },
      { id: 'streaming', role: 'assistant', content: '' }
    ])
    setDraft('')
    setChatting(true)
    stopTypewriter()
    setPreviewState('working')
    petApi.performAction({ state: 'working', bubble: t('petCenter.bubbleThinking'), duration: 12000 })
    try {
      const result = await aiApi.chat({ conversationId: conversation?.id, content })
      stopTypewriter()
      const snapshot = await aiApi.getConversation(result.conversation.id)
      setConversation(snapshot.conversation)
      setMessages(snapshot.messages || [])
      setPreviewState('wave')
      petApi.performAction({ state: 'wave', bubble: result.text, duration: 3000 })
      setTimeout(() => setPreviewState('idle'), 1000)
    } catch (error) {
      stopTypewriter()
      setMessages((items) => [
        ...items.filter((item) => item.id !== 'streaming'),
        { role: 'assistant', content: t('petCenter.aiConnectFailed', { message: error.message }) }
      ])
      setPreviewState('failed')
      petApi.performAction({ state: 'failed', bubble: t('petCenter.bubbleFailed'), duration: 2600 })
      setTimeout(() => setPreviewState('idle'), 1400)
    } finally { setChatting(false) }
  }

  const createConversation = async () => {
    try {
      const result = await aiApi.createConversation()
      setConversation(result.conversation)
      setMessages([])
    } catch (error) { setNotice(error.message) }
  }

  const switchConversation = async (id) => {
    try {
      const result = await aiApi.switchConversation(Number(id))
      setConversation(result.conversation)
      setMessages(result.messages || [])
    } catch (error) { setNotice(error.message) }
  }

  const clearConversation = async () => {
    if (!conversation || !window.confirm(t('petCenter.clearConversationConfirm'))) return
    try {
      const result = await aiApi.clearConversation(conversation.id)
      setConversation(result.conversation)
      setMessages([])
    } catch (error) { setNotice(error.message) }
  }

  const changeMemoryMode = async (mode) => {
    try {
      await aiApi.setMemoryMode(mode)
      setMemoryMode(mode)
      setAiConfig((value) => ({ ...value, memoryMode: mode }))
    } catch (error) { setNotice(error.message) }
  }

  const addMemory = async (event) => {
    event.preventDefault()
    if (!memoryDraft.trim()) return
    try {
      await aiApi.createMemory({ type: memoryType, content: memoryDraft, confidence: 1 })
      setMemoryDraft('')
      setMemories(await aiApi.listMemories())
    } catch (error) { setNotice(error.message) }
  }

  const saveMemory = async (id, data) => {
    try {
      await aiApi.updateMemory(id, data)
      setMemories(await aiApi.listMemories())
    } catch (error) { setNotice(error.message) }
  }

  const forgetMemory = async (id) => {
    try {
      await aiApi.forgetMemory(id)
      setMemories(await aiApi.listMemories())
    } catch (error) { setNotice(error.message) }
  }

  const confirmMemory = async (id) => {
    try {
      await aiApi.updateMemory(id, { confirmed: true })
      setMemories(await aiApi.listMemories())
    } catch (error) { setNotice(error.message) }
  }

  const clearMemories = async () => {
    if (!window.confirm(t('petCenter.clearMemoriesConfirm'))) return
    try {
      await aiApi.clearMemories()
      setMemories([])
    } catch (error) { setNotice(error.message) }
  }

  const saveAi = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const next = await aiApi.saveConfig({
        provider, apiFormat, baseUrl, model: aiModel, apiKey: form.get('apiKey'),
        petName: form.get('petName'), personality: form.get('personality')
      })
      setAiConfig(next)
      setNotice(t('petCenter.aiSaved'))
    } catch (error) { setNotice(error.message) }
  }

  const selectProvider = (nextProvider) => {
    const preset = AI_PROVIDERS[nextProvider]
    setProvider(nextProvider)
    setApiFormat(preset.apiFormat)
    setBaseUrl(preset.baseUrl)
    setAiModel(preset.models[0] || '')
  }

  // 完全权限（Shell 接管）：开启时必须二次确认危险授权
  const toggleShellPermission = async (enabled) => {
    if (enabled) {
      const allowed = await confirm({
        title: t('petCenter.shellPermission'),
        message: t('petCenter.shellPermissionConfirm'),
        confirmText: t('petCenter.shellPermissionAgree'),
        tone: 'danger',
        icon: 'danger'
      })
      if (!allowed) return
    }
    try {
      const next = await aiApi.saveConfig({ shellEnabled: enabled })
      setAiConfig(next)
      setShellEnabled(Boolean(next.shellEnabled))
      setNotice(enabled ? t('petCenter.shellPermissionOn') : t('petCenter.shellPermissionOff'))
    } catch (error) {
      setNotice(error.message)
    }
  }

  const providerModels = AI_PROVIDERS[provider]?.models || []
  const selectedModelOption = providerModels.includes(aiModel) ? aiModel : CUSTOM_MODEL
  const activeTabIndex = PET_TAB_KEYS.indexOf(activeTab)
  const panelMotionClass = `pet-tab-panel pet-tab-panel--${tabDirection}`
  const tabs = [
    ['companion', MessageCircle, t('petCenter.tabCompanion')],
    ['memory', Brain, t('petCenter.tabMemory')],
    ['models', Box, t('petCenter.tabModels')],
    ['settings', Settings2, t('petCenter.tabSettings')]
  ]

  const changeTab = (nextTab, button) => {
    const nextIndex = PET_TAB_KEYS.indexOf(nextTab)
    if (nextIndex === activeTabIndex) return
    setTabDirection(nextIndex > activeTabIndex ? 'forward' : 'backward')
    setActiveTab(nextTab)
    button?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center'
    })
  }

  const handleTabKeyDown = (event, index) => {
    let nextIndex = index
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    const nextButton = tabsRef.current?.querySelector(`[data-tab-key="${tabs[nextIndex][0]}"]`)
    nextButton?.focus()
    changeTab(tabs[nextIndex][0], nextButton)
  }

  if (!config || !aiConfig) return <div className="pet-center-loading"><Sparkles /> {t('petCenter.loading')}</div>

  return (
    <div className="pet-center-page">
      <header className="pet-center-header">
        <div>
          <span className="pet-center-eyebrow"><WandSparkles size={14} /> DESKTOP COMPANION</span>
          <h1>{t('petCenter.title')}</h1>
          <p>{t('petCenter.subtitle')}</p>
        </div>
        <button className="pet-help-button" onClick={() => setTutorialOpen(true)}>
          <CircleHelp size={17} /> {t('petCenter.tutorial')}
        </button>
      </header>

      <div className="pet-center-tabs" role="tablist" ref={tabsRef}>
        <span
          className={`pet-center-tabs__indicator ${tabIndicator.ready ? 'is-ready' : ''}`}
          style={{ width: `${tabIndicator.width}px`, transform: `translate3d(${tabIndicator.left}px, 0, 0)` }}
          aria-hidden="true"
        />
        {tabs.map(([key, Icon, label], index) => (
          <button
            key={key}
            id={`pet-tab-${key}`}
            data-tab-key={key}
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`pet-panel-${key}`}
            tabIndex={activeTab === key ? 0 : -1}
            className={activeTab === key ? 'active' : ''}
            onClick={(event) => changeTab(key, event.currentTarget)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <Icon size={16} /> <span>{label}</span>
          </button>
        ))}
      </div>

      {notice && <div className="pet-center-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {activeTab === 'companion' && (
        <section id="pet-panel-companion" role="tabpanel" aria-labelledby="pet-tab-companion" className={`pet-companion-grid ${panelMotionClass}`}>
          <div className="pet-stage-card">
            <div className="pet-stage-light" />
            <div className="pet-stage-status"><span /> ONLINE · {config.model.displayName || 'LaunchBot'}</div>
            <PetSprite model={config.model} state={previewState} size={210} />
            <div className="pet-stage-platform" />
            <div className="pet-state-picker">
              {PREVIEW_STATES.map(([key, labelKey]) => (
                <button key={key} className={previewState === key ? 'active' : ''} onClick={() => setPreviewState(key)}>{t(`petCenter.animation.${labelKey}`)}</button>
              ))}
            </div>
          </div>

          <div className="pet-chat-card">
            <div className="pet-chat-head">
              <div className="pet-chat-avatar"><Bot size={19} /></div>
              <div><strong>{aiConfig.petName || t('petCenter.companion')}</strong><span>{t('petCenter.conciseMode')}</span></div>
              <div className="pet-conversation-actions">
                <select className="pet-themed-select" value={conversation?.id || ''} onChange={(event) => switchConversation(event.target.value)} aria-label={t('petCenter.conversation')}>
                  {conversations.map((item) => <option key={item.id} value={item.id}>{item.title || t('petCenter.newConversation')}</option>)}
                </select>
                <button type="button" onClick={createConversation} title={t('petCenter.newConversation')}><Plus size={15} /></button>
                <button type="button" onClick={clearConversation} title={t('petCenter.clearConversation')}><Eraser size={15} /></button>
              </div>
              <span className={`pet-ai-pill ${aiConfig.hasApiKey ? 'ready' : ''}`}>{aiConfig.hasApiKey ? t('petCenter.aiConnected') : t('petCenter.awaitingConfig')}</span>
            </div>
            <div className="pet-chat-messages" ref={chatScrollRef}>
              {!messages.length && <div className="pet-message pet-message--assistant"><p>{t('petCenter.greeting')}</p></div>}
              {messages.filter((item) => item.tool || String(item.content || '').trim()).map((item, index) => (
                <div key={item.id || index} className={`pet-message pet-message--${item.role}`}>
                  {item.tool ? (
                    <p className="pet-message-tool">{item.content}</p>
                  ) : item.role === 'assistant' ? (
                    <div className="md-render pet-message-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />
                  ) : (
                    <p>{item.content}</p>
                  )}
                </div>
              ))}
              {chatting && (
                <div
                  className="pet-message pet-message--assistant pet-message--typing"
                  role="status"
                  aria-label={t('petCenter.bubbleThinking')}
                >
                  <span className="pet-typing-indicator" aria-hidden="true"><i /><i /><i /></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form className="pet-chat-compose" onSubmit={sendMessage}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('petCenter.chatPlaceholder')} rows="2" onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }} />
              <button type="submit" disabled={!draft.trim() || chatting} aria-label={t('petCenter.send')}><Send size={18} /></button>
            </form>
          </div>
        </section>
      )}

      {activeTab === 'memory' && (
        <section id="pet-panel-memory" role="tabpanel" aria-labelledby="pet-tab-memory" className={`pet-memory-layout ${panelMotionClass}`}>
          <div className="pet-memory-control pet-settings-card">
            <div className="pet-section-title">
              <div><span>MEMORY CONTROL</span><h2>{t('petCenter.memoryTitle')}</h2></div>
              <Brain size={21} />
            </div>
            <p className="pet-memory-intro">{t('petCenter.memoryDescription')}</p>
            <div className="pet-memory-modes" role="radiogroup" aria-label={t('petCenter.memoryMode')}>
              {['off', 'manual', 'auto'].map((mode) => (
                <button type="button" role="radio" aria-checked={memoryMode === mode} key={mode} className={memoryMode === mode ? 'active' : ''} onClick={() => changeMemoryMode(mode)}>
                  <span>{t(`petCenter.memoryMode_${mode}`)}</span>
                  <small>{t(`petCenter.memoryMode_${mode}Desc`)}</small>
                </button>
              ))}
            </div>
            <form className="pet-memory-create" onSubmit={addMemory}>
              <label>{t('petCenter.memoryType')}
                <select className="pet-themed-select" value={memoryType} onChange={(event) => setMemoryType(event.target.value)}>
                  {['preference', 'project', 'person', 'habit', 'environment', 'task'].map((type) => (
                    <option key={type} value={type}>{t(`petCenter.memoryType_${type}`)}</option>
                  ))}
                </select>
              </label>
              <label>{t('petCenter.memoryContent')}
                <textarea value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} rows="4" maxLength="2000" placeholder={t('petCenter.memoryPlaceholder')} />
              </label>
              <GlowButton type="submit" disabled={!memoryDraft.trim()}><Plus size={15} /> {t('petCenter.addMemory')}</GlowButton>
            </form>
          </div>

          <div className="pet-memory-ledger pet-settings-card">
            <div className="pet-section-title">
              <div><span>LOCAL MEMORY</span><h2>{t('petCenter.memoryLedger')}</h2></div>
              <b>{memories.length}</b>
            </div>
            <div className="pet-memory-ledger__meta">
              <span>{t('petCenter.memoryLocalOnly')}</span>
              {!!memories.length && <button className="danger" type="button" onClick={clearMemories}><Trash2 size={14} /> {t('petCenter.clearMemories')}</button>}
            </div>
            <div className="pet-memory-list">
              {!memories.length && <div className="pet-memory-empty"><Brain size={28} /><strong>{t('petCenter.noMemories')}</strong><span>{t('petCenter.noMemoriesDesc')}</span></div>}
              {memories.map((memory) => <MemoryCard key={memory.id} memory={memory} t={t} onSave={saveMemory} onConfirm={confirmMemory} onForget={forgetMemory} />)}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'models' && (
        <section id="pet-panel-models" role="tabpanel" aria-labelledby="pet-tab-models" className={`pet-models-layout ${panelMotionClass}`}>
          <div className="pet-import-card">
            <div className="pet-import-icon"><Import size={24} /></div>
            <span>CODEX PET IMPORTER</span>
            <h2>{t('petCenter.importTitle')}</h2>
            <p>{t('petCenter.importDescriptionBefore')} <code>pet.json</code>{t('petCenter.importDescriptionAfter')}</p>
            <div className="pet-import-actions">
              <GlowButton onClick={() => importModel('directory')}><FolderOpen size={16} /> {t('petCenter.chooseFolder')}</GlowButton>
              <GlowButton variant="ghost" onClick={() => importModel('manifest')}>{t('petCenter.chooseManifest')}</GlowButton>
            </div>
            <div className="pet-contract-row"><Check size={14} /> {t('petCenter.contractV1')}</div>
            <div className="pet-contract-row"><Check size={14} /> {t('petCenter.contractV2')}</div>
            <div className="pet-contract-row"><Check size={14} /> {t('petCenter.contractLegacy')}</div>
            <div className="pet-contract-row"><Check size={14} /> {t('petCenter.contractImage')}</div>
          </div>
          <div className="pet-model-library">
            <div className="pet-section-title"><div><span>LOCAL LIBRARY</span><h2>{t('petCenter.modelLibrary')}</h2></div><b>{models.length}</b></div>
            <div className="pet-model-list">
              {models.map((model) => {
                const active = config.model.id === model.id
                return (
                  <article key={model.id} className={`pet-model-card ${active ? 'active' : ''}`}>
                    <div className="pet-model-thumb">
                      <PetSprite model={model} state="idle" size={82} />
                    </div>
                    <div className="pet-model-info"><strong>{model.displayName}</strong><p>{model.description || t('petCenter.customPetDescription', { version: model.spriteVersionNumber || 1 })}</p><span>{model.imported ? `V${model.spriteVersionNumber || 1} · IMPORTED` : 'BUILT-IN'}</span></div>
                    <div className="pet-model-actions">
                      <button className={active ? 'selected' : ''} onClick={() => selectModel(model.id)}>{active ? <><Check size={14} /> {t('petCenter.inUse')}</> : t('petCenter.setAsPet')}</button>
                      {model.imported && <button className="danger" onClick={() => removeModel(model.id)} aria-label={t('common.delete')}><Trash2 size={15} /></button>}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'settings' && (
        <section id="pet-panel-settings" role="tabpanel" aria-labelledby="pet-tab-settings" className={`pet-settings-grid ${panelMotionClass}`}>
          <div className="pet-settings-card">
            <div className="pet-section-title"><div><span>BEHAVIOR</span><h2>{t('petCenter.desktopBehavior')}</h2></div><Settings2 size={20} /></div>
            <SettingToggle title={t('petCenter.showPet')} desc={t('petCenter.showPetDesc')} checked={config.settings.enabled} onChange={toggleEnabled} />
            <SettingToggle title={t('petCenter.roaming')} desc={t('petCenter.roamingDesc')} checked={config.settings.roaming} onChange={(value) => updatePetSetting({ roaming: value })} />
            <RangeSetting title={t('petCenter.roamRange')} value={config.settings.roamRange} min="0.2" max="1" step="0.05" disabled={!config.settings.roaming} suffix={`${Math.round(config.settings.roamRange * 100)}%`} onChange={(value) => updatePetSetting({ roamRange: value })} />
            <RangeSetting title={t('petCenter.roamActivity')} value={config.settings.roamActivity} min="0.5" max="2" step="0.1" disabled={!config.settings.roaming} suffix={`${Math.round(config.settings.roamActivity * 100)}%`} onChange={(value) => updatePetSetting({ roamActivity: value })} />
            <SettingToggle title={t('petCenter.alwaysOnTop')} desc={t('petCenter.alwaysOnTopDesc')} checked={config.settings.alwaysOnTop} onChange={(value) => updatePetSetting({ alwaysOnTop: value })} />
            <RangeSetting title={t('petCenter.petSize')} value={config.settings.scale} min="0.65" max="1.35" step="0.05" suffix={`${Math.round(config.settings.scale * 100)}%`} onChange={(value) => updatePetSetting({ scale: value })} />
            <RangeSetting title={t('petCenter.opacity')} value={config.settings.opacity} min="0.55" max="1" step="0.05" suffix={`${Math.round(config.settings.opacity * 100)}%`} onChange={(value) => updatePetSetting({ opacity: value })} />
          </div>

          <form className="pet-settings-card pet-ai-settings" onSubmit={saveAi}>
            <div className="pet-section-title"><div><span>AI CONNECTION</span><h2>{t('petCenter.chatCapability')}</h2></div><KeyRound size={20} /></div>
            <label>{t('petCenter.provider')}
              <select className="pet-themed-select" value={provider} onChange={(event) => selectProvider(event.target.value)}>
                {Object.entries(AI_PROVIDERS).map(([key, item]) => <option key={key} value={key}>{item.labelKey ? t(`petCenter.${item.labelKey}`) : item.label}</option>)}
              </select>
            </label>
            <fieldset className="pet-api-format">
              <legend>{t('petCenter.apiFormat')}</legend>
              <label className={apiFormat === 'chat-completions' ? 'active' : ''}>
                <input type="radio" name="apiFormat" value="chat-completions" checked={apiFormat === 'chat-completions'} onChange={(event) => setApiFormat(event.target.value)} />
                <span><strong>Chat Completions</strong><small>{t('petCenter.chatCompletionsDesc')}</small></span>
              </label>
              <label className={apiFormat === 'responses' ? 'active' : ''}>
                <input type="radio" name="apiFormat" value="responses" checked={apiFormat === 'responses'} onChange={(event) => setApiFormat(event.target.value)} />
                <span><strong>Responses API</strong><small>{t('petCenter.responsesDesc')}</small></span>
              </label>
            </fieldset>
            <label>{t('petCenter.model')}
              <select
                className="pet-themed-select"
                value={selectedModelOption}
                onChange={(event) => setAiModel(event.target.value === CUSTOM_MODEL ? '' : event.target.value)}
              >
                {providerModels.map((model) => <option key={model} value={model}>{model}</option>)}
                <option value={CUSTOM_MODEL}>{t('petCenter.customModelOption')}</option>
              </select>
            </label>
            {selectedModelOption === CUSTOM_MODEL && (
              <label className="pet-custom-model">{t('petCenter.customModelId')}
                <input value={aiModel} onChange={(event) => setAiModel(event.target.value)} placeholder={t('petCenter.customModelPlaceholder')} />
              </label>
            )}
            <div className="pet-provider-summary">
              <span>{apiFormat === 'responses' ? 'Responses API' : 'OpenAI Compatible'}</span>
              <code>{baseUrl}</code>
              <b>{aiModel || t('petCenter.awaitingModel')}</b>
            </div>
            {provider === 'custom' && (
              <div className="pet-custom-provider-fields">
                <label>{t('petCenter.apiAddress')}<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://example.com/v1" /></label>
              </div>
            )}
            <div className="pet-form-row">
              <label>{t('petCenter.companionName')}<input name="petName" defaultValue={aiConfig.petName} /></label>
              <label>API Key<input name="apiKey" type="password" placeholder={aiConfig.providerKeys?.[provider] ? t('petCenter.keySaved') : t('petCenter.keyPlaceholder')} autoComplete="off" /></label>
            </div>
            <label>{t('petCenter.personality')}<textarea key={`${language}-${aiConfig.personality}`} name="personality" defaultValue={aiConfig.personality} rows="5" /></label>
            <div className="pet-ai-security"><KeyRound size={14} /> {t('petCenter.keySecurity')}</div>
            <GlowButton type="submit">{t('petCenter.saveAi')}</GlowButton>
          </form>

          <div className="pet-settings-card pet-shell-permission">
            <div className="pet-section-title"><div><span>FULL CONTROL</span><h2>{t('petCenter.shellPermission')}</h2></div><Terminal size={20} /></div>
            <p className="pet-shell-permission-desc">{t('petCenter.shellPermissionDesc')}</p>
            <SettingToggle
              title={t('petCenter.shellPermissionToggle')}
              desc={t('petCenter.shellPermissionToggleDesc')}
              checked={shellEnabled}
              onChange={toggleShellPermission}
            />
            {shellEnabled && <div className="pet-shell-permission-active">{t('petCenter.shellPermissionActive')}</div>}
          </div>
        </section>
      )}

      {tutorialOpen && <TutorialDrawer initialKey="pet" onClose={() => setTutorialOpen(false)} />}
    </div>
  )
}

function MemoryCard({ memory, t, onSave, onConfirm, onForget }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(memory.content)
  const [type, setType] = useState(memory.type)

  const save = async () => {
    if (!content.trim()) return
    await onSave(memory.id, { content, type })
    setEditing(false)
  }

  return (
    <article className={`pet-memory-card ${editing ? 'editing' : ''}${memory.confirmed ? '' : ' pending'}`}>
      <div className="pet-memory-card__head">
        <span>{memory.confirmed ? t(`petCenter.memoryType_${type}`) : t('petCenter.memoryPending')}</span>
        <b>{Math.round(memory.confidence * 100)}%</b>
      </div>
      {editing ? (
        <div className="pet-memory-card__editor">
          <select className="pet-themed-select" value={type} onChange={(event) => setType(event.target.value)}>
            {['preference', 'project', 'person', 'habit', 'environment', 'task'].map((item) => <option key={item} value={item}>{t(`petCenter.memoryType_${item}`)}</option>)}
          </select>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows="3" maxLength="2000" />
        </div>
      ) : <p>{memory.content}</p>}
      <div className="pet-memory-card__foot">
        <small>{memory.last_used_at ? t('petCenter.memoryUsed') : t('petCenter.memoryNotUsed')}</small>
        <div>
          {!memory.confirmed && <button className="confirm" type="button" onClick={() => onConfirm(memory.id)}><Check size={14} /> {t('petCenter.confirmMemory')}</button>}
          {editing
            ? <button type="button" onClick={save}><Save size={14} /> {t('common.save')}</button>
            : <button type="button" onClick={() => setEditing(true)}><Pencil size={14} /> {t('common.edit')}</button>}
          <button className="danger" type="button" onClick={() => onForget(memory.id)}><Archive size={14} /> {t('petCenter.forgetMemory')}</button>
        </div>
      </div>
    </article>
  )
}

function SettingToggle({ title, desc, checked, onChange }) {
  return <div className="pet-setting-row"><div><strong>{title}</strong><span>{desc}</span></div><Toggle checked={checked} onChange={(e) => onChange(e.target.checked)} ariaLabel={title} /></div>
}

function RangeSetting({ title, value, suffix, onChange, ...props }) {
  return <label className="pet-range-setting"><span><strong>{title}</strong><b>{suffix}</b></span><input type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} {...props} /></label>
}

export default PetCenter
