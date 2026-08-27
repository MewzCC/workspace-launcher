import React, { useEffect, useRef, useState } from 'react'
import { Send, X } from 'lucide-react'
import { aiApi, petApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import './PetChatInput.css'

function PetChatInput() {
  const instanceId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('instance') || undefined
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
    petApi.showBubble(displayRef.current, undefined, instanceId).catch(() => {})
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
    petApi.setChatOpen(false, instanceId).catch(() => {})
  }

  useEffect(() => {
    inputRef.current?.focus()
    const loadConversation = (id) => aiApi.getConversation(id, instanceId).then((result) => {
      setConversation(result.conversation)
      setMessages(result.messages || [])
    }).catch(() => {})
    loadConversation()
    const unsubscribe = aiApi.onConversationChanged((payload) => {
      if (!payload?.petModelId || payload.petModelId === instanceId) loadConversation(payload?.conversationId)
    })
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
    petApi.resolvePresentation({ event: 'started', userText: content }, instanceId).catch(() => {})
    petApi.showBubble(t('petCenter.bubbleThinking'), undefined, instanceId).catch(() => {})
    try {
      const result = await aiApi.chat({ conversationId: conversation?.id, content, petModelId: instanceId })
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
      const snapshot = await aiApi.getConversation(result.conversation.id, instanceId)
      setMessages(snapshot.messages || [])
      petApi.resolvePresentation({ event: 'completed', userText: content, assistantText: response }, instanceId).catch(() => {})
      if (response) await petApi.showBubble(response, undefined, instanceId)
    } catch (error) {
      const message = t('petCenter.aiConnectFailed', { message: error.message })
      setMessages((items) => [...items.filter((item) => item.id), { role: 'assistant', content: message }])
      petApi.resolvePresentation({ event: 'failure', userText: content }, instanceId).catch(() => {})
      await petApi.showBubble(message, undefined, instanceId).catch(() => {})
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
