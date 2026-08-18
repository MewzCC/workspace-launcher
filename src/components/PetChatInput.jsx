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
  const [conversation, setConversation] = useState(null)
  const [chatting, setChatting] = useState(false)
  const inputRef = useRef(null)
  const streamBufferRef = useRef('')
  const displayRef = useRef('')
  const typeTimerRef = useRef(null)

  const flushTypewriter = () => {
    const chunk = streamBufferRef.current.slice(0, 3)
    if (!chunk) return
    streamBufferRef.current = streamBufferRef.current.slice(3)
    displayRef.current += chunk
    petApi.showBubble(displayRef.current, 8000).catch(() => {})
  }

  const startTypewriter = () => {
    if (typeTimerRef.current) return
    typeTimerRef.current = setInterval(flushTypewriter, 80)
  }

  const stopTypewriter = () => {
    if (typeTimerRef.current) clearInterval(typeTimerRef.current)
    typeTimerRef.current = null
    streamBufferRef.current = ''
  }

  const close = () => {
    stopTypewriter()
    displayRef.current = ''
    petApi.setChatOpen(false).catch(() => {})
  }

  useEffect(() => {
    inputRef.current?.focus()
    const loadConversation = (id) => aiApi.getConversation(id).then((result) => {
      setConversation(result.conversation)
      setMessages(result.messages || [])
    }).catch(() => {})
    loadConversation()
    const unsubscribe = aiApi.onConversationChanged((payload) => loadConversation(payload?.conversationId))
    const unsubscribeDelta = typeof aiApi.onChatDelta === 'function'
      ? aiApi.onChatDelta(({ delta }) => {
          if (!delta) return
          streamBufferRef.current += delta
          startTypewriter()
        })
      : () => {}
    const handleKeyDown = (event) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      unsubscribe()
      unsubscribeDelta()
      window.removeEventListener('keydown', handleKeyDown)
      stopTypewriter()
    }
  }, [])

  const send = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || chatting) return
    setMessages((items) => [...items, { role: 'user', content }])
    setDraft('')
    setChatting(true)
    stopTypewriter()
    displayRef.current = ''
    petApi.performAction({ state: 'working', duration: 12000 })
    petApi.showBubble(t('petCenter.bubbleThinking'), 12000).catch(() => {})
    try {
      const result = await aiApi.chat({ conversationId: conversation?.id, content })
      const response = String(result.text || '').trim()
      setConversation(result.conversation)
      stopTypewriter()
      displayRef.current = ''
      const toolLog = Array.isArray(result.toolLog) ? result.toolLog : []
      if (toolLog.length > 0) {
        const toolSummary = toolLog
          .map((item) => t('petCenter.toolCall', { tool: t(`petCenter.tool_${item.name}`) || item.name }))
          .join('、')
        setMessages((items) => [...items, { role: 'assistant', content: `🛠 ${toolSummary}`, tool: true }])
      }
      const snapshot = await aiApi.getConversation(result.conversation.id)
      setMessages(snapshot.messages || [])
      petApi.performAction({ state: 'wave', duration: 1800 })
      if (response) await petApi.showBubble(response, answerDuration(response))
    } catch (error) {
      const message = t('petCenter.aiConnectFailed', { message: error.message })
      setMessages((items) => [...items.filter((item) => item.id), { role: 'assistant', content: message }])
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
