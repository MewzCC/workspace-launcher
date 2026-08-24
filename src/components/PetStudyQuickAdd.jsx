import { useEffect, useRef, useState } from 'react'
import { BookPlus, Check, X } from 'lucide-react'
import { petApi } from '../lib/ipc'
import './PetStudyQuickAdd.css'

const LANGUAGES = [
  ['en', 'EN · 英语'], ['ja', 'JA · 日语'], ['ko', 'KO · 韩语'], ['fr', 'FR · 法语'],
  ['de', 'DE · 德语'], ['es', 'ES · 西班牙语'], ['it', 'IT · 意大利语'],
  ['pt', 'PT · 葡萄牙语'], ['ru', 'RU · 俄语'], ['zh', 'ZH · 中文']
]

export default function PetStudyQuickAdd() {
  const instanceId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('instance') || undefined
  const [language, setLanguage] = useState('en')
  const [term, setTerm] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    petApi.studyGet(instanceId).then((data) => setLanguage(data.settings?.language || 'en')).catch(() => {})
    inputRef.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') petApi.studyCloseAdd(instanceId) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    if (!term.trim() || saving) return
    setSaving(true); setMessage('')
    try {
      await petApi.studyAddWithAI({ language, term }, instanceId)
      setMessage('AI 已补全释义、发音和例句，并加入记忆队列')
      setTerm('')
      inputRef.current?.focus()
    } catch (error) { setMessage(error.message) } finally { setSaving(false) }
  }

  const changeLanguage = async (event) => {
    const next = event.target.value
    setLanguage(next)
    setMessage('')
    try { await petApi.studyUpdateSettings({ language: next }, instanceId) } catch (error) { setMessage(error.message) }
    inputRef.current?.focus()
  }

  return (
    <form className="pet-study-add" onSubmit={submit}>
      <header><span><BookPlus size={18} /> 快速添加词条</span><button type="button" onClick={() => petApi.studyCloseAdd(instanceId)}><X size={17} /></button></header>
      <div className="pet-study-add__row">
        <input ref={inputRef} autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="单词或短语" maxLength={120} />
        <select className="language" value={language} onChange={changeLanguage} disabled={saving} title="选择目标语言">
          {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>
      <button className="pet-study-add__submit" disabled={saving || !term.trim()}><Check size={16} /> {saving ? 'AI 正在补全…' : 'AI 补全并加入学习'}</button>
      <p className={message.includes('记忆队列') ? 'success' : ''}>{message || '只需输入词语，其余内容由桌宠 AI 自动完成'}</p>
    </form>
  )
}
