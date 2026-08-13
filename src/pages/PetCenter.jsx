import React, { useEffect, useRef, useState } from 'react'
import {
  Bot, Box, Check, CircleHelp, FolderOpen, Import, KeyRound, MessageCircle,
  Send, Settings2, Sparkles, Trash2, WandSparkles
} from 'lucide-react'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import PetSprite from '../components/PetSprite'
import TutorialDrawer from '../components/TutorialDrawer'
import { aiApi, dialogApi, petApi, systemApi } from '../lib/ipc'
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

function PetCenter() {
  const t = useT()
  const language = useStore((state) => state.language)
  const [activeTab, setActiveTab] = useState('companion')
  const [config, setConfig] = useState(null)
  const [models, setModels] = useState([])
  const [aiConfig, setAiConfig] = useState(null)
  const [previewState, setPreviewState] = useState('idle')
  const [messages, setMessages] = useState([
    { role: 'assistant', i18nKey: 'petCenter.greeting' }
  ])
  const [draft, setDraft] = useState('')
  const [chatting, setChatting] = useState(false)
  const [notice, setNotice] = useState('')
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [provider, setProvider] = useState('openai')
  const [apiFormat, setApiFormat] = useState('responses')
  const [baseUrl, setBaseUrl] = useState('')
  const [aiModel, setAiModel] = useState('')
  const chatEndRef = useRef(null)

  const load = async () => {
    const [nextConfig, nextModels, nextAi] = await Promise.all([
      petApi.getConfig(), petApi.listModels(), aiApi.getConfig()
    ])
    setConfig(nextConfig)
    setModels(nextModels)
    setAiConfig(nextAi)
    setProvider(nextAi.provider || 'custom')
    setApiFormat(nextAi.apiFormat || 'responses')
    setBaseUrl(nextAi.baseUrl || '')
    setAiModel(nextAi.model || '')
  }

  useEffect(() => { load().catch((error) => setNotice(error.message)) }, [language])
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, chatting])

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
    const nextMessages = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setDraft('')
    setChatting(true)
    setPreviewState('working')
    petApi.performAction({ state: 'working', bubble: t('petCenter.bubbleThinking'), duration: 12000 })
    try {
      const requestMessages = nextMessages.map((item) => ({
        ...item,
        content: item.i18nKey ? t(item.i18nKey) : item.content
      }))
      const result = await aiApi.chat(requestMessages)
      setMessages((items) => [...items, { role: 'assistant', content: result.text }])
      setPreviewState('wave')
      petApi.performAction({ state: 'wave', bubble: result.text, duration: 3000 })
      setTimeout(() => setPreviewState('idle'), 1000)
    } catch (error) {
      setMessages((items) => [...items, { role: 'assistant', content: t('petCenter.aiConnectFailed', { message: error.message }) }])
      setPreviewState('failed')
      petApi.performAction({ state: 'failed', bubble: t('petCenter.bubbleFailed'), duration: 2600 })
      setTimeout(() => setPreviewState('idle'), 1400)
    } finally { setChatting(false) }
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

  const providerModels = AI_PROVIDERS[provider]?.models || []
  const selectedModelOption = providerModels.includes(aiModel) ? aiModel : CUSTOM_MODEL

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

      <div className="pet-center-tabs" role="tablist">
        {[
          ['companion', MessageCircle, t('petCenter.tabCompanion')],
          ['models', Box, t('petCenter.tabModels')],
          ['settings', Settings2, t('petCenter.tabSettings')]
        ].map(([key, Icon, label]) => (
          <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {notice && <div className="pet-center-notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}

      {activeTab === 'companion' && (
        <section className="pet-companion-grid">
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
              <span className={`pet-ai-pill ${aiConfig.hasApiKey ? 'ready' : ''}`}>{aiConfig.hasApiKey ? t('petCenter.aiConnected') : t('petCenter.awaitingConfig')}</span>
            </div>
            <div className="pet-chat-messages">
              {messages.map((item, index) => (
                <div key={index} className={`pet-message pet-message--${item.role}`}>
                  <p>{item.i18nKey ? t(item.i18nKey) : item.content}</p>
                </div>
              ))}
              {chatting && <div className="pet-message pet-message--assistant pet-message--typing"><i /><i /><i /></div>}
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

      {activeTab === 'models' && (
        <section className="pet-models-layout">
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
        <section className="pet-settings-grid">
          <div className="pet-settings-card">
            <div className="pet-section-title"><div><span>BEHAVIOR</span><h2>{t('petCenter.desktopBehavior')}</h2></div><Settings2 size={20} /></div>
            <SettingToggle title={t('petCenter.showPet')} desc={t('petCenter.showPetDesc')} checked={config.settings.enabled} onChange={toggleEnabled} />
            <SettingToggle title={t('petCenter.roaming')} desc={t('petCenter.roamingDesc')} checked={config.settings.roaming} onChange={(value) => updatePetSetting({ roaming: value })} />
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
        </section>
      )}

      {tutorialOpen && <TutorialDrawer initialKey="pet" onClose={() => setTutorialOpen(false)} />}
    </div>
  )
}

function SettingToggle({ title, desc, checked, onChange }) {
  return <div className="pet-setting-row"><div><strong>{title}</strong><span>{desc}</span></div><Toggle checked={checked} onChange={(e) => onChange(e.target.checked)} ariaLabel={title} /></div>
}

function RangeSetting({ title, value, suffix, onChange, ...props }) {
  return <label className="pet-range-setting"><span><strong>{title}</strong><b>{suffix}</b></span><input type="range" value={value} onChange={(e) => onChange(Number(e.target.value))} {...props} /></label>
}

export default PetCenter
