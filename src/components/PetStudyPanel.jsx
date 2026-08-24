import { useEffect, useState } from 'react'
import { BookOpen, Brain, Plus, Sparkles, Trash2 } from 'lucide-react'
import { petApi } from '../lib/ipc'
import GlowButton from './ui/GlowButton'
import ShortcutInput from './ShortcutInput'
import './PetStudyPanel.css'

const MODES = [
  ['companion', '桌宠模式', '保持普通单击聊天，不轮播词条'],
  ['study', '单词学习', '气泡自动轮播；单击表示“记住了”'],
  ['stealth-study', '摸鱼学习', '低打扰轮播；单击或快捷键快速添加']
]

const LANGUAGES = [
  ['en', '英语（English）'],
  ['ja', '日语（日本語）'],
  ['ko', '韩语（한국어）'],
  ['fr', '法语（Français）'],
  ['de', '德语（Deutsch）'],
  ['es', '西班牙语（Español）'],
  ['it', '意大利语（Italiano）'],
  ['pt', '葡萄牙语（Português）'],
  ['ru', '俄语（Русский）'],
  ['zh', '中文（简体）']
]

export default function PetStudyPanel({ instanceId, onNotice }) {
  const [data, setData] = useState(null)
  const [term, setTerm] = useState('')
  const [adding, setAdding] = useState(false)
  const [topic, setTopic] = useState('日常高频词汇')
  const [generating, setGenerating] = useState(false)
  const [shortcutDraft, setShortcutDraft] = useState('')
  const [shortcutValidation, setShortcutValidation] = useState({ status: 'idle', message: '' })

  const load = () => petApi.studyGet(instanceId).then((next) => {
    setData(next)
    setShortcutDraft(next.settings?.quickAddShortcut || '')
  }).catch((error) => onNotice(error.message))
  useEffect(() => {
    load()
    const unsubscribe = petApi.onStudyChanged((payload) => { if (!payload?.petModelId || payload.petModelId === instanceId) load() })
    return unsubscribe
  }, [instanceId])
  if (!data) return <div className="pet-study-loading">正在加载学习引擎…</div>

  const update = async (patch) => {
    try { await petApi.studyUpdateSettings(patch, instanceId); await load() } catch (error) { onNotice(error.message) }
  }
  const add = async (event) => {
    event.preventDefault()
    if (!term.trim() || adding) return
    setAdding(true)
    try {
      await petApi.studyAddWithAI({ language: data.settings.language, term }, instanceId)
      setTerm(''); await load(); onNotice('AI 已补全词条并加入智能复习队列')
    } catch (error) { onNotice(error.message) } finally { setAdding(false) }
  }
  const generate = async () => {
    setGenerating(true)
    try {
      const result = await petApi.studyGenerate({ language: data.settings.language, topic, count: 12 }, instanceId)
      await load(); onNotice(`AI 已创建 ${result.count} 条 ${data.settings.language} 学习卡片`)
    } catch (error) { onNotice(error.message) } finally { setGenerating(false) }
  }

  const changeShortcut = async (accelerator) => {
    setShortcutDraft(accelerator)
    if (!accelerator) {
      setShortcutValidation({ status: 'idle', message: '' })
      await update({ quickAddShortcut: '' })
      return
    }
    setShortcutValidation({ status: 'checking', message: '正在检查快捷键…' })
    try {
      const result = await petApi.studyValidateShortcut(accelerator, instanceId)
      if (!result.valid) {
        const message = result.reason === 'duplicate'
          ? `已被工作空间“${result.workspaceName}”使用`
          : result.reason === 'occupied'
            ? '快捷键已被其他程序占用'
            : '无效的快捷键组合'
        setShortcutValidation({ status: 'error', message })
        return
      }
      await update({ quickAddShortcut: accelerator })
      setShortcutValidation({ status: 'valid', message: '快捷键可用并已保存' })
    } catch (error) {
      setShortcutValidation({ status: 'error', message: error.message })
    }
  }

  return (
    <div className="pet-study-layout">
      <section className="pet-settings-card pet-study-control">
        <div className="pet-section-title"><div><span>SPACED REPETITION</span><h2>桌宠学习模式</h2></div><Brain size={21} /></div>
        <div className="pet-study-modes">{MODES.map(([value, title, desc]) => (
          <button key={value} className={data.settings.mode === value ? 'active' : ''} onClick={() => update({ mode: value })}><strong>{title}</strong><small>{desc}</small></button>
        ))}</div>
        <div className="pet-study-fields">
          <label>目标语言<select value={data.settings.language} onChange={(e) => update({ language: e.target.value })}>{LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
          <label>轮播间隔<input type="number" min="5" max="600" value={data.settings.intervalSeconds} onChange={(e) => update({ intervalSeconds: Number(e.target.value) })} /><span>秒</span></label>
          <div className="pet-study-shortcut">
            <strong>快速添加快捷键</strong>
            <ShortcutInput
              value={shortcutDraft}
              onChange={changeShortcut}
              validationStatus={shortcutValidation.status}
              validationMessage={shortcutValidation.message}
              ariaLabel="快速添加快捷键"
              placeholder="点击后按下组合键"
              recordingMessage="请按下新的快捷键组合，Esc 取消"
              hint="全局生效，至少包含一个修饰键，例如 Ctrl+Alt+W"
            />
          </div>
        </div>
        <div className="pet-study-stats">
          <span><b>{data.stats.total}</b>词条</span><span><b>{data.stats.due}</b>待复习</span><span><b>{data.stats.reviewedToday}</b>今日完成</span><span><b>{data.stats.learning}</b>长期记忆</span>
        </div>
      </section>

      <section className="pet-settings-card pet-study-add-card">
        <div className="pet-section-title"><div><span>VOCABULARY</span><h2>添加与 AI 创建</h2></div><BookOpen size={21} /></div>
        <form onSubmit={add} className="pet-study-manual">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="只需输入单词或短语" />
          <GlowButton type="submit" size="sm" disabled={adding || !term.trim()}><Plus size={15} /> {adding ? 'AI 补全中…' : 'AI 补全并添加'}</GlowButton>
        </form>
        <div className="pet-study-ai">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="让 AI 创建的主题，例如：商务英语" />
          <GlowButton type="button" size="sm" onClick={generate} disabled={generating}><Sparkles size={15} /> {generating ? '创建中…' : 'AI 创建 12 条'}</GlowButton>
        </div>
        <p className="pet-study-hint">AI 使用桌宠中心已配置的模型，可将目标语言改为 ja、fr、de 等语言代码。</p>
      </section>

      <section className="pet-settings-card pet-study-library">
        <div className="pet-section-title"><div><span>MEMORY QUEUE</span><h2>当前词库</h2></div><b>{data.items.length}</b></div>
        <div className="pet-study-list">{data.items.map((item) => (
          <article key={item.id}>
            <div><strong>{item.term}</strong><small>{item.pronunciation}</small><p>{item.meaning || '待补充释义'}</p></div>
            <span className={`state state--${item.state}`}>{item.state === 'new' ? '新词' : item.due_at <= Date.now() ? '待复习' : '学习中'}</span>
            <div className="pet-study-ratings">{[['忘',1],['难',2],['会',3],['易',4]].map(([label, rating]) => <button key={rating} onClick={() => petApi.studyReview(item.id, rating, instanceId).then(load)}>{label}</button>)}</div>
            <button className="delete" onClick={() => petApi.studyRemove(item.id, instanceId).then(load)} aria-label="删除"><Trash2 size={14} /></button>
          </article>
        ))}{!data.items.length && <div className="pet-study-empty">还没有该语言的词条，手动添加或让 AI 创建一组。</div>}</div>
      </section>
    </div>
  )
}
