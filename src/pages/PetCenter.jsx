import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Archive, Bot, Box, Brain, BookOpen, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleHelp, Eraser,
  KeyRound, MessageCircle, Pencil, Plus, Save, Send, Settings2, Sparkles, Square,
  RefreshCw, Terminal, Trash2, WandSparkles
} from 'lucide-react'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import ResizableTable from '../components/ui/ResizableTable'
import PetSprite from '../components/PetSprite'
import PetImporter from '../components/PetImporter'
import TutorialDrawer from '../components/TutorialDrawer'
import PetStudyPanel from '../components/PetStudyPanel'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { aiApi, petApi } from '../lib/ipc'
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
const PET_TAB_KEYS = ['companion', 'study', 'memory', 'models', 'settings']
const CHAT_MODES = ['concise', 'focus', 'creative', 'casual']

function PetCenter() {
  const t = useT()
  const confirm = useConfirmDialog()
  const language = useStore((state) => state.language)
  const [activeTab, setActiveTab] = useState('companion')
  const [tabDirection, setTabDirection] = useState('forward')
  const [tabIndicator, setTabIndicator] = useState({ left: 0, width: 0, ready: false })
  const [config, setConfig] = useState(null)
  const [models, setModels] = useState([])
  const [modelPage, setModelPage] = useState(1)
  const MODEL_PAGE_SIZE = 5
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [interactionStatus, setInteractionStatus] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [interactionPair, setInteractionPair] = useState(['', ''])
  const [interactionTopic, setInteractionTopic] = useState('')
  const [socialMemories, setSocialMemories] = useState({ relationship: [], diary: [] })
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
  const [chatMode, setChatMode] = useState('concise')
  const [renamingConversation, setRenamingConversation] = useState(false)
  const [conversationTitleDraft, setConversationTitleDraft] = useState('')
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
      petApi.getConfig(), petApi.listInstances(), aiApi.getConfig(), aiApi.getConversation(),
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
    setChatMode(nextAi.mode || 'concise')
    setRenamingConversation(false)
    setConversation(nextConversation.conversation)
    setMessages(nextConversation.messages || [])
    setConversations(nextConversations)
    setMemories(nextMemories)
    const [nextStatus, nextInteractions] = await Promise.all([petApi.interactionStatus(), petApi.listInteractions(12)])
    setInteractionStatus(nextStatus)
    setInteractions(nextInteractions)
    const activePets = nextModels.filter((item) => item.active)
    setInteractionPair((current) => [current[0] || activePets[0]?.id || '', current[1] || activePets[1]?.id || ''])
  }

  useEffect(() => { load().catch((error) => setNotice(error.message)) }, [language])
  useEffect(() => {
    if (activeTab !== 'memory') return
    const petModelId = config?.model?.id
    Promise.all([aiApi.listMemories(undefined, petModelId), aiApi.getConfig(petModelId)]).then(([nextMemories, nextAi]) => {
      setMemories(nextMemories)
      setMemoryMode(nextAi.memoryMode || 'manual')
    }).catch((error) => setNotice(error.message))
  }, [activeTab, config?.model?.id])
  useEffect(() => {
    if (!interactionPair[0] || !interactionPair[1] || interactionPair[0] === interactionPair[1]) {
      setSocialMemories({ relationship: [], diary: [] })
      return
    }
    petApi.getInteractionMemories(interactionPair[0], interactionPair[1]).then(setSocialMemories).catch(() => {})
  }, [interactionPair[0], interactionPair[1], interactions])
  useEffect(() => {
    if (activeTab !== 'models') return undefined
    const refreshModelList = () => petApi.refreshModels()
      .then(async (nextModels) => {
        setModels(nextModels)
        setConfig(await petApi.getConfig())
      })
      .catch(() => {})
    window.addEventListener('focus', refreshModelList)
    return () => window.removeEventListener('focus', refreshModelList)
  }, [activeTab])
  useEffect(() => {
    const unsubscribeConversation = aiApi.onConversationChanged(async (payload) => {
      const petModelId = config?.model?.id
      if (payload?.petModelId && payload.petModelId !== petModelId) return
      try {
        const [nextConversation, nextConversations] = await Promise.all([
          aiApi.getConversation(payload?.conversationId, petModelId), aiApi.listConversations(petModelId)
        ])
        setConversation(nextConversation.conversation)
        setMessages(nextConversation.messages || [])
        setConversations(nextConversations)
      } catch (_) {}
    })
    const unsubscribeMemory = aiApi.onMemoryChanged(() => {
      aiApi.listMemories(undefined, config?.model?.id).then(setMemories).catch(() => {})
    })
    const unsubscribeInteraction = petApi.onInteractionChanged(() => {
      Promise.all([petApi.interactionStatus(), petApi.listInteractions(12)]).then(([nextStatus, nextItems]) => { setInteractionStatus(nextStatus); setInteractions(nextItems) }).catch(() => {})
    })
    return () => { unsubscribeConversation(); unsubscribeMemory(); unsubscribeInteraction() }
  }, [config?.model?.id])
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

  const refreshModels = async () => {
    if (refreshingModels) return
    setRefreshingModels(true)
    setNotice('')
    try {
      const nextModels = await petApi.refreshModels()
      const nextConfig = await petApi.getConfig()
      setModels(nextModels)
      setConfig(nextConfig)
      setNotice(t('petCenter.modelsRefreshSuccess', { count: nextModels.length }))
    } catch (error) {
      setNotice(error.message)
    } finally {
      setRefreshingModels(false)
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
    const model = models.find((item) => item.id === id)
    const confirmed = await confirm({
      title: t('common.delete'),
      message: `${model?.displayName ? `「${model.displayName}」` : ''}${t('petCenter.removeConfirm')}`,
      confirmText: t('common.delete'),
      tone: 'danger',
      icon: 'danger'
    })
    if (!confirmed) return
    try { await petApi.removeModel(id); await load() } catch (error) { setNotice(error.message) }
  }

  const updatePetSetting = async (patch) => {
    try {
      const next = await petApi.updateSettings(patch, config?.model?.id)
      setConfig(next)
    } catch (error) { setNotice(error.message) }
  }

  const toggleEnabled = async (enabled) => {
    try {
      const nextModels = await petApi.setInstanceEnabled(config?.model?.id, enabled)
      setModels(nextModels)
      setConfig((value) => ({ ...value, settings: { ...value.settings, enabled } }))
    } catch (error) { setNotice(error.message) }
  }

  const toggleModelInstance = async (id, enabled) => {
    try {
      const nextModels = await petApi.setInstanceEnabled(id, enabled)
      setModels(nextModels)
    } catch (error) { setNotice(error.message) }
  }

  const saveInteractionSettings = async (patch) => {
    try {
      const next = await petApi.updateInteractionSettings(patch)
      setInteractionStatus((value) => ({ ...value, settings: next }))
    } catch (error) { setNotice(error.message) }
  }

  const startInteraction = async () => {
    if (!interactionPair[0] || !interactionPair[1] || interactionPair[0] === interactionPair[1]) return
    setNotice('')
    try {
      await petApi.startInteraction({ petAId: interactionPair[0], petBId: interactionPair[1], topic: interactionTopic, maxTurns: interactionStatus?.settings?.maxTurns || 4 })
      setInteractions(await petApi.listInteractions(12))
    } catch (error) { setNotice(error.message) }
  }

  const clearInteractionMemories = async () => {
    if (!interactionPair[0] || !interactionPair[1] || !window.confirm(t('petCenter.clearInteractionMemoryConfirm'))) return
    try {
      await petApi.clearInteractionMemories(interactionPair[0], interactionPair[1])
      setSocialMemories((value) => ({ ...value, relationship: [] }))
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
    petApi.performAction({ state: 'working', bubble: t('petCenter.bubbleThinking'), duration: 12000 }, config?.model?.id)
    try {
      const result = await aiApi.chat({ conversationId: conversation?.id, content, petModelId: config?.model?.id })
      stopTypewriter()
      const snapshot = await aiApi.getConversation(result.conversation.id, config?.model?.id)
      setConversation(snapshot.conversation)
      setMessages(snapshot.messages || [])
      setPreviewState('wave')
      petApi.performAction({ state: 'wave', bubble: result.text, duration: 3000 }, config?.model?.id)
      setTimeout(() => setPreviewState('idle'), 1000)
    } catch (error) {
      stopTypewriter()
      setMessages((items) => [
        ...items.filter((item) => item.id !== 'streaming'),
        { role: 'assistant', content: t('petCenter.aiConnectFailed', { message: error.message }) }
      ])
      setPreviewState('failed')
      petApi.performAction({ state: 'failed', bubble: t('petCenter.bubbleFailed'), duration: 2600 }, config?.model?.id)
      setTimeout(() => setPreviewState('idle'), 1400)
    } finally { setChatting(false) }
  }

  const createConversation = async () => {
    try {
      const result = await aiApi.createConversation(undefined, config?.model?.id)
      setConversation(result.conversation)
      setMessages([])
    } catch (error) { setNotice(error.message) }
  }

  const switchConversation = async (id) => {
    try {
      const result = await aiApi.switchConversation(Number(id), config?.model?.id)
      setConversation(result.conversation)
      setMessages(result.messages || [])
    } catch (error) { setNotice(error.message) }
  }

  const clearConversation = async () => {
    if (!conversation || !window.confirm(t('petCenter.clearConversationConfirm'))) return
    try {
      const result = await aiApi.clearConversation(conversation.id, config?.model?.id)
      setConversation(result.conversation)
      setMessages([])
    } catch (error) { setNotice(error.message) }
  }

  const beginRenameConversation = () => {
    if (!conversation) return
    setConversationTitleDraft(conversation.title || t('petCenter.newConversation'))
    setRenamingConversation(true)
  }

  const renameConversation = async (event) => {
    event?.preventDefault()
    const title = conversationTitleDraft.trim()
    if (!conversation || !title) {
      setNotice(t('petCenter.conversationTitleRequired'))
      return
    }
    try {
      const result = await aiApi.renameConversation(conversation.id, title, config?.model?.id)
      setConversation(result.conversation)
      setConversations(await aiApi.listConversations(config?.model?.id))
      setRenamingConversation(false)
    } catch (error) { setNotice(error.message) }
  }

  const deleteConversation = async () => {
    if (!conversation) return
    const allowed = await confirm({
      title: t('petCenter.deleteConversation'),
      message: t('petCenter.deleteConversationConfirm', { title: conversation.title || t('petCenter.newConversation') }),
      confirmText: t('common.delete'),
      tone: 'danger',
      icon: 'danger'
    })
    if (!allowed) return
    try {
      const result = await aiApi.deleteConversation(conversation.id, config?.model?.id)
      setConversation(result.conversation)
      setMessages(result.messages || [])
      setConversations(await aiApi.listConversations(config?.model?.id))
      setRenamingConversation(false)
    } catch (error) { setNotice(error.message) }
  }

  const changeChatMode = async (mode) => {
    if (!CHAT_MODES.includes(mode) || mode === chatMode) return
    const previous = chatMode
    setChatMode(mode)
    try {
      const next = await aiApi.saveConfig({ mode }, config?.model?.id)
      setAiConfig(next)
      setChatMode(next.mode || mode)
    } catch (error) {
      setChatMode(previous)
      setNotice(error.message)
    }
  }

  const changeMemoryMode = async (mode) => {
    try {
      await aiApi.setMemoryMode(mode, config?.model?.id)
      setMemoryMode(mode)
      setAiConfig((value) => ({ ...value, memoryMode: mode }))
    } catch (error) { setNotice(error.message) }
  }

  const addMemory = async (event) => {
    event.preventDefault()
    if (!memoryDraft.trim()) return
    try {
      await aiApi.createMemory({ type: memoryType, content: memoryDraft, confidence: 1 }, config?.model?.id)
      setMemoryDraft('')
      setMemories(await aiApi.listMemories(undefined, config?.model?.id))
    } catch (error) { setNotice(error.message) }
  }

  const saveMemory = async (id, data) => {
    try {
      await aiApi.updateMemory(id, data, config?.model?.id)
      setMemories(await aiApi.listMemories(undefined, config?.model?.id))
    } catch (error) { setNotice(error.message) }
  }

  const forgetMemory = async (id) => {
    try {
      await aiApi.forgetMemory(id, config?.model?.id)
      setMemories(await aiApi.listMemories(undefined, config?.model?.id))
    } catch (error) { setNotice(error.message) }
  }

  const confirmMemory = async (id) => {
    try {
      await aiApi.updateMemory(id, { confirmed: true }, config?.model?.id)
      setMemories(await aiApi.listMemories(undefined, config?.model?.id))
    } catch (error) { setNotice(error.message) }
  }

  const clearMemories = async () => {
    if (!window.confirm(t('petCenter.clearMemoriesConfirm'))) return
    try {
      await aiApi.clearMemories(config?.model?.id)
      setMemories([])
    } catch (error) { setNotice(error.message) }
  }

  const saveAi = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      const next = await aiApi.saveConfig({
        provider, apiFormat, baseUrl, model: aiModel, apiKey: form.get('apiKey'),
        petName: form.get('petName'), personality: form.get('personality'), mode: chatMode
      }, config?.model?.id)
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
      const next = await aiApi.saveConfig({ shellEnabled: enabled }, config?.model?.id)
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
    ['study', BookOpen, '学习模式'],
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

  const activePetCount = models.filter((item) => item.active).length
  const modelTotalPages = Math.max(1, Math.ceil(models.length / MODEL_PAGE_SIZE))
  const currentModelPage = Math.min(modelPage, modelTotalPages)
  const pagedModels = models.slice((currentModelPage - 1) * MODEL_PAGE_SIZE, currentModelPage * MODEL_PAGE_SIZE)

  const modelPageItems = (() => {
    if (modelTotalPages <= 7) return Array.from({ length: modelTotalPages }, (_, i) => i + 1)
    const items = [1]
    const start = Math.max(2, currentModelPage - 1)
    const end = Math.min(modelTotalPages - 1, currentModelPage + 1)
    if (start > 2) items.push('start-ellipsis')
    for (let page = start; page <= end; page += 1) items.push(page)
    if (end < modelTotalPages - 1) items.push('end-ellipsis')
    items.push(modelTotalPages)
    return items
  })()

  useEffect(() => {
    if (modelPage > modelTotalPages) setModelPage(modelTotalPages)
  }, [modelTotalPages, modelPage])

  if (!config || !aiConfig) return <div className="pet-center-loading"><Sparkles /> {t('petCenter.loading')}</div>

  const modelColumns = [
    { key: 'pet', label: t('petCenter.modelColumnPet'), width: 1.9, minWidth: 150, resizable: true, className: 'pet-model-col-pet' },
    { key: 'description', label: t('petCenter.modelColumnDesc'), width: 1.5, minWidth: 90, resizable: true, className: 'pet-model-col-desc' },
    { key: 'format', label: t('petCenter.modelColumnSpec'), width: 0.8, minWidth: 84, resizable: true, className: 'pet-model-col-format' },
    { key: 'actions', label: t('petCenter.modelColumnActions'), fixedWidth: 190, resizable: false, className: 'pet-model-actions-cell' }
  ]

  const renderModelCell = (model, column) => {
    const selected = config.model.id === model.id
    const format = model.builtin ? 'BUILT-IN' : model.invalid ? 'INVALID' : String(model.sourceFormat || 'legacy').toUpperCase()
    const diagnostic = model.diagnostics?.[0]
    const diagnosticText = diagnostic ? `${diagnostic.code}: ${diagnostic.message}` : ''
    const description = model.description || (model.renderer === 'sequence'
      ? t('petImport.sequenceDescription', { count: Object.keys(model.animations || {}).length })
      : t('petCenter.customPetDescription', { version: model.spriteVersionNumber || 1 }))
    switch (column.key) {
      case 'pet':
        return (
          <div className="pet-model-cell-pet">
            <div className="pet-model-cell-thumb"><PetSprite model={model} state="idle" size={48} /></div>
            <div className="pet-model-cell-info">
              <div className="pet-model-cell-name">
                <strong title={model.displayName}>{model.displayName}</strong>
                {model.active && <span className="pet-model-cell-active-dot" aria-label={t('petCenter.inUse')} />}
              </div>
              {model.invalid && diagnosticText && (
                <span className="pet-model-cell-error" title={diagnosticText}>{diagnosticText}</span>
              )}
            </div>
          </div>
        )
      case 'description':
        return (
          <p className={`pet-model-cell-desc${model.invalid ? ' is-invalid' : ''}`} title={diagnosticText || description}>
            {diagnosticText || description}
          </p>
        )
      case 'format':
        return (
          <div className="pet-model-cell-meta">
            <span className={`pet-model-format${model.invalid ? ' is-invalid' : ''}${model.builtin ? ' is-builtin' : ''}`}>{format}</span>
            {model.capabilities?.animations?.length > 0 && <span className="pet-model-anim-count">{model.capabilities.animations.length} ANIMATIONS</span>}
          </div>
        )
      case 'actions':
        return (
          <div className="pet-model-cell-actions">
            <button disabled={model.invalid} className={selected ? 'selected' : ''} onClick={() => selectModel(model.id)}>
              {selected ? <><Check size={13} /> {t('petCenter.selectedPet')}</> : t('petCenter.setAsPet')}
            </button>
            <button disabled={model.invalid} className={model.active ? 'selected' : ''} onClick={() => toggleModelInstance(model.id, !model.active)}>
              {model.active ? t('petCenter.closePet') : t('petCenter.openPet')}
            </button>
            {model.imported && <button className="danger" onClick={() => removeModel(model.id)} aria-label={t('common.delete')}><Trash2 size={14} /></button>}
          </div>
        )
      default:
        return null
    }
  }

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
              <div className="pet-chat-profile">
                <div className="pet-chat-avatar"><PetSprite model={config.model} state="idle" size={34} /></div>
                <div className="pet-chat-identity">
                  <strong title={aiConfig.petName || t('petCenter.companion')}>{aiConfig.petName || t('petCenter.companion')}</strong>
                  <select className="pet-chat-mode-select pet-themed-select" value={chatMode} onChange={(event) => changeChatMode(event.target.value)} aria-label={t('petCenter.chatMode')}>
                    {CHAT_MODES.map((mode) => <option key={mode} value={mode}>{t(`petCenter.mode_${mode}`)}</option>)}
                  </select>
                </div>
              </div>
              <div className="pet-conversation-actions">
                <select className="pet-themed-select" value={conversation?.id || ''} onChange={(event) => switchConversation(event.target.value)} aria-label={t('petCenter.conversation')}>
                  {conversations.map((item) => <option key={item.id} value={item.id}>{item.title || t('petCenter.newConversation')}</option>)}
                </select>
                <button type="button" onClick={createConversation} title={t('petCenter.newConversation')}><Plus size={15} /></button>
                <button type="button" onClick={beginRenameConversation} title={t('petCenter.renameConversation')}><Pencil size={15} /></button>
                <button type="button" onClick={clearConversation} title={t('petCenter.clearConversation')}><Eraser size={15} /></button>
                <button type="button" className="danger" onClick={deleteConversation} title={t('petCenter.deleteConversation')}><Trash2 size={15} /></button>
              </div>
              <span className={`pet-ai-pill ${aiConfig.hasApiKey ? 'ready' : ''}`} role="status"><i />{aiConfig.hasApiKey ? t('petCenter.aiConnected') : t('petCenter.awaitingConfig')}</span>
            </div>
            {renamingConversation && (
              <form className="pet-conversation-editor" onSubmit={renameConversation}>
                <Pencil size={14} aria-hidden="true" />
                <input autoFocus value={conversationTitleDraft} onChange={(event) => setConversationTitleDraft(event.target.value)} maxLength="80" placeholder={t('petCenter.conversationTitlePlaceholder')} aria-label={t('petCenter.conversationTitle')} />
                <button type="submit" disabled={!conversationTitleDraft.trim()}><Save size={14} /> {t('common.save')}</button>
                <button type="button" onClick={() => setRenamingConversation(false)}>{t('common.cancel')}</button>
              </form>
            )}
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

      {activeTab === 'study' && (
        <section id="pet-panel-study" role="tabpanel" aria-labelledby="pet-tab-study" className={panelMotionClass}>
          <PetStudyPanel instanceId={config?.model?.id} onNotice={setNotice} />
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
          <PetImporter onImported={async () => { await load(); setNotice(t('petCenter.importSuccess')) }} />
          <div className="pet-model-library">
            <div className="pet-section-title pet-model-library-title">
              <div><span>LOCAL LIBRARY</span><h2>{t('petCenter.modelLibrary')}</h2></div>
              <div className="pet-model-library-tools">
                <b aria-label={t('petCenter.modelCount', { count: models.length })}>{models.length}</b>
                <button type="button" className="pet-model-refresh" onClick={refreshModels} disabled={refreshingModels} aria-busy={refreshingModels}>
                  <RefreshCw size={14} className={refreshingModels ? 'is-spinning' : ''} />
                  {refreshingModels ? t('petCenter.refreshingModels') : t('petCenter.refreshModels')}
                </button>
              </div>
            </div>
            <ResizableTable
              columns={modelColumns}
              rows={pagedModels}
              getRowKey={(model) => model.id}
              getRowClassName={(model) => {
                const selected = config.model.id === model.id
                return `${selected ? ' active' : ''}${model.invalid ? ' invalid' : ''}`
              }}
              renderCell={renderModelCell}
              storageKey="pet-model-table-columns"
              className={`pet-model-table${refreshingModels ? ' is-loading' : ''}`}
              empty={<div className="pet-model-empty">{t('petCenter.noModels')}</div>}
            />
            {models.length > MODEL_PAGE_SIZE && (
              <nav className="pet-model-pagination" aria-label={t('petCenter.modelPagination')}>
                <span className="pet-model-pagination-info" aria-live="polite">
                  {(currentModelPage - 1) * MODEL_PAGE_SIZE + 1}–{Math.min(currentModelPage * MODEL_PAGE_SIZE, models.length)} / {models.length}
                </span>
                <div className="pet-model-pagination-controls">
                  <button type="button" onClick={() => setModelPage(1)} disabled={currentModelPage <= 1} aria-label={t('petCenter.modelPageFirst')}>
                    <ChevronsLeft size={15} />
                  </button>
                  <button type="button" onClick={() => setModelPage((p) => Math.max(1, p - 1))} disabled={currentModelPage <= 1} aria-label={t('petCenter.modelPagePrev')}>
                    <ChevronLeft size={15} />
                  </button>
                  {modelPageItems.map((item, index) => (
                    item === 'start-ellipsis' || item === 'end-ellipsis'
                      ? <span key={`${item}-${index}`} className="pet-model-pagination-ellipsis" aria-hidden="true">…</span>
                      : (
                        <button
                          key={item}
                          type="button"
                          className={item === currentModelPage ? 'active' : ''}
                          aria-current={item === currentModelPage ? 'page' : undefined}
                          onClick={() => setModelPage(item)}
                        >
                          {item}
                        </button>
                      )
                  ))}
                  <button type="button" onClick={() => setModelPage((p) => Math.min(modelTotalPages, p + 1))} disabled={currentModelPage >= modelTotalPages} aria-label={t('petCenter.modelPageNext')}>
                    <ChevronRight size={15} />
                  </button>
                  <button type="button" onClick={() => setModelPage(modelTotalPages)} disabled={currentModelPage >= modelTotalPages} aria-label={t('petCenter.modelPageLast')}>
                    <ChevronsRight size={15} />
                  </button>
                </div>
              </nav>
            )}
          </div>
          <div className="pet-interaction-console pet-settings-card">
            <div className="pet-interaction-console__head">
              <div className="pet-section-title"><div><span>MULTI COMPANION</span><h2>{t('petCenter.multiPetTitle')}</h2></div><MessageCircle size={20} /></div>
              <div className={`pet-multi-status ${activePetCount >= 2 ? 'ready' : ''}`}>
                <div><span>{activePetCount >= 2 ? t('petCenter.multiPetReady') : t('petCenter.multiPetNeedsAnother')}</span><small>{t('petCenter.multiPetActiveCount', { count: activePetCount })}</small></div>
                <b>{activePetCount}<em>/2</em></b>
              </div>
            </div>
            <p className="pet-interaction-console__desc">{t('petCenter.multiPetDesc')}</p>
            <div className="pet-interaction-switches">
              <SettingToggle title={t('petCenter.autoInteraction')} desc={t('petCenter.autoInteractionDesc')} checked={Boolean(interactionStatus?.settings?.autoEnabled)} onChange={(value) => saveInteractionSettings({ autoEnabled: value })} />
              <SettingToggle title={t('petCenter.interactionMemory')} desc={t('petCenter.interactionMemoryDesc')} checked={interactionStatus?.settings?.interactionMemoryEnabled !== false} onChange={(value) => saveInteractionSettings({ interactionMemoryEnabled: value })} />
              <SettingToggle title={t('petCenter.shareOwnerMoments')} desc={t('petCenter.shareOwnerMomentsDesc')} checked={interactionStatus?.settings?.shareOwnerContext !== false} onChange={(value) => saveInteractionSettings({ shareOwnerContext: value })} />
              <RangeSetting title={t('petCenter.interactionTurns')} value={interactionStatus?.settings?.maxTurns || 4} min="2" max="10" step="1" suffix={`${interactionStatus?.settings?.maxTurns || 4}`} onChange={(value) => saveInteractionSettings({ maxTurns: value })} />
            </div>
            <form className="pet-interaction-compose" onSubmit={(event) => { event.preventDefault(); if (!interactionStatus?.running) startInteraction() }}>
              <label className="pet-interaction-compose__field pet-interaction-compose__select">
                <span>{t('petCenter.firstPet')}</span>
                <select className="pet-themed-select" value={interactionPair[0]} onChange={(event) => setInteractionPair([event.target.value, interactionPair[1]])} aria-label={t('petCenter.chooseFirstPet')}>
                  <option value="">{t('petCenter.chooseFirstPet')}</option>{models.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                </select>
              </label>
              <div className="pet-interaction-compose__vs" aria-hidden="true">×</div>
              <label className="pet-interaction-compose__field pet-interaction-compose__select">
                <span>{t('petCenter.secondPet')}</span>
                <select className="pet-themed-select" value={interactionPair[1]} onChange={(event) => setInteractionPair([interactionPair[0], event.target.value])} aria-label={t('petCenter.chooseSecondPet')}>
                  <option value="">{t('petCenter.chooseSecondPet')}</option>{models.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}
                </select>
              </label>
              <label className="pet-interaction-compose__field pet-interaction-compose__topic">
                <span>{t('petCenter.interactionTopicLabel')}</span>
                <input value={interactionTopic} onChange={(event) => setInteractionTopic(event.target.value)} placeholder={t('petCenter.interactionTopic')} maxLength="500" />
              </label>
              <div className="pet-interaction-compose__actions">
                {interactionStatus?.running
                  ? <button type="button" className="pet-interaction-btn danger" onClick={() => petApi.stopInteraction()}><Square size={14} /> {t('petCenter.stopInteraction')}</button>
                  : <GlowButton type="submit" disabled={!interactionPair[0] || !interactionPair[1] || interactionPair[0] === interactionPair[1]}><Sparkles size={15} /> {t('petCenter.startInteraction')}</GlowButton>}
              </div>
            </form>
            {!!interactions.length && (
              <div className="pet-interaction-history" aria-label={t('petCenter.recentInteractions')}>
                <div className="pet-interaction-history__head"><strong>{t('petCenter.recentInteractions')}</strong><small>{t('petCenter.recentInteractionsHint', { count: Math.min(3, interactions.length) })}</small></div>
                {interactions.slice(0, 3).map((item) => (
                  <article key={item.id} className={`is-${item.status}`}>
                    <header>
                      <strong title={item.title || t('petCenter.petInteraction')}>{item.title || t('petCenter.petInteraction')}</strong>
                      <span className={`pet-interaction-chip is-${item.status}`}>{item.status}</span>
                      <span className="pet-interaction-chip is-mode">{item.trigger_type === 'auto' ? 'AUTO' : 'MANUAL'}</span>
                    </header>
                    <p>{item.summary || item.messages?.map((message) => message.content).join(' / ')}</p>
                  </article>
                ))}
              </div>
            )}
            {(socialMemories.relationship.length > 0 || socialMemories.diary.length > 0) && (
              <div className="pet-social-memory">
                <div className="pet-social-memory__head"><div><Brain size={17} /><strong>{t('petCenter.sharedMemoryTitle')}</strong></div>{socialMemories.relationship.length > 0 && <button type="button" className="pet-danger-btn" onClick={clearInteractionMemories}><Trash2 size={13} /> {t('petCenter.clearRelationshipMemory')}</button>}</div>
                <div className="pet-social-memory__columns">
                  <section><span>{t('petCenter.relationshipMemories')}</span>{socialMemories.relationship.slice(0, 6).map((item) => <p key={item.id}>{item.content}</p>)}{!socialMemories.relationship.length && <small>{t('petCenter.noRelationshipMemories')}</small>}</section>
                  <section><span>{t('petCenter.todayOwnerMoments')}</span>{socialMemories.diary.slice(0, 8).map((item) => <p key={item.id}>{item.content}</p>)}{!socialMemories.diary.length && <small>{t('petCenter.noOwnerMoments')}</small>}</section>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'settings' && (
        <section id="pet-panel-settings" role="tabpanel" aria-labelledby="pet-tab-settings" className={`pet-settings-grid ${panelMotionClass}`}>
          <div className="pet-settings-behavior-column">
          <div className="pet-settings-card">
            <div className="pet-section-title"><div><span>BEHAVIOR</span><h2>{t('petCenter.desktopBehavior')}</h2></div><Settings2 size={20} /></div>
            <div className="pet-profile-scope"><Bot size={17} /><div><strong>{t('petCenter.profileScopedTitle')}</strong><span>{t('petCenter.profileScopedDesc', { name: config.model.displayName || aiConfig.petName })}</span></div></div>
            <SettingToggle title={t('petCenter.showPet')} desc={t('petCenter.showPetDesc')} checked={config.settings.enabled} onChange={toggleEnabled} />
            <SettingToggle title={t('petCenter.roaming')} desc={t('petCenter.roamingDesc')} checked={config.settings.roaming} onChange={(value) => updatePetSetting({ roaming: value })} />
            <RangeSetting title={t('petCenter.roamRange')} value={config.settings.roamRange} min="0.2" max="1" step="0.05" disabled={!config.settings.roaming} suffix={`${Math.round(config.settings.roamRange * 100)}%`} onChange={(value) => updatePetSetting({ roamRange: value })} />
            <RangeSetting title={t('petCenter.roamActivity')} value={config.settings.roamActivity} min="0.5" max="2" step="0.1" disabled={!config.settings.roaming} suffix={`${Math.round(config.settings.roamActivity * 100)}%`} onChange={(value) => updatePetSetting({ roamActivity: value })} />
            <SettingToggle title={t('petCenter.alwaysOnTop')} desc={t('petCenter.alwaysOnTopDesc')} checked={config.settings.alwaysOnTop} onChange={(value) => updatePetSetting({ alwaysOnTop: value })} />
            <RangeSetting title={t('petCenter.petSize')} value={config.settings.scale} min="0.65" max="1.35" step="0.05" suffix={`${Math.round(config.settings.scale * 100)}%`} onChange={(value) => updatePetSetting({ scale: value })} />
            <RangeSetting title={t('petCenter.opacity')} value={config.settings.opacity} min="0.55" max="1" step="0.05" suffix={`${Math.round(config.settings.opacity * 100)}%`} onChange={(value) => updatePetSetting({ opacity: value })} />
          </div>

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
          </div>

          <div className="pet-settings-ai-column">
          <form className="pet-settings-card pet-ai-settings" onSubmit={saveAi}>
            <div className="pet-section-title"><div><span>AI CONNECTION</span><h2>{t('petCenter.chatCapability')}</h2></div><KeyRound size={20} /></div>
            <fieldset className="pet-chat-mode-grid">
              <legend>{t('petCenter.chatMode')}</legend>
              {CHAT_MODES.map((mode) => (
                <button key={mode} type="button" className={chatMode === mode ? 'active' : ''} onClick={() => changeChatMode(mode)} aria-pressed={chatMode === mode}>
                  <strong>{t(`petCenter.mode_${mode}`)}</strong>
                  <small>{t(`petCenter.mode_${mode}Desc`)}</small>
                </button>
              ))}
            </fieldset>
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
              <label>{t('petCenter.companionName')}<input key={`name-${aiConfig.petModelId}`} name="petName" defaultValue={aiConfig.petName} /></label>
              <label>API Key<input name="apiKey" type="password" placeholder={aiConfig.providerKeys?.[provider] ? t('petCenter.keySaved') : t('petCenter.keyPlaceholder')} autoComplete="off" /></label>
            </div>
            <label>{t('petCenter.personality')}<textarea key={`${language}-${aiConfig.petModelId}-${aiConfig.personality}`} name="personality" defaultValue={aiConfig.personality} rows="5" /></label>
            <div className="pet-ai-security"><KeyRound size={14} /> {t('petCenter.keySecurity')}</div>
            <GlowButton type="submit">{t('petCenter.saveAi')}</GlowButton>
          </form>

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
