import React, { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { aiApi, petApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import './PetChatInput.css'

function answerDuration(text) {
  return Math.min(12000, Math.max(2500, 1800 + Array.from(String(text || '')).length * 72))
}

function PetChatInput() {
  const t = useT()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [chatting, setChatting] = useState(false)
  const inputRef = useRef(null)

  const close = () => petApi.setChatOpen(false).catch(() => {})

  useEffect(() => {
    inputRef.current?.focus()
    const handleKeyDown = (event) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const send = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || chatting) return
    const nextMessages = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setDraft('')
    setChatting(true)
    petApi.performAction({ state: 'working', duration: 12000 })
    petApi.showBubble(t('petCenter.bubbleThinking'), 12000).catch(() => {})
    try {
      const result = await aiApi.chat(nextMessages)
      const response = String(result.text || '').trim()
      setMessages((items) => [...items, { role: 'assistant', content: response }])
      petApi.performAction({ state: 'wave', duration: 1800 })
      await petApi.showBubble(response, answerDuration(response))
    } catch (error) {
      const message = t('petCenter.aiConnectFailed', { message: error.message })
      setMessages((items) => [...items, { role: 'assistant', content: message }])
      petApi.performAction({ state: 'failed', duration: 2200 })
      await petApi.showBubble(message, answerDuration(message)).catch(() => {})
    } finally {
      setChatting(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <form className="pet-chat-input" onSubmit={send}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('petCenter.desktopChatPlaceholder')}
        aria-label={t('petCenter.desktopChatPlaceholder')}
        maxLength={1000}
      />
      <button className="pet-chat-input__send" type="submit" disabled={!draft.trim() || chatting} aria-label={t('petCenter.send')}>
        <Send size={15} />
      </button>
      <button className="pet-chat-input__close" type="button" onClick={close} aria-label={t('common.close')}>
        <X size={14} />
      </button>
    </form>
  )
}

export default PetChatInput
