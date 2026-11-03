import React, { useEffect, useRef, useState } from 'react'
import { ImagePlus, Monitor, Send, X } from 'lucide-react'
import { aiApi, petApi } from '../lib/ipc'
import { useT } from '../hooks/useT'
import { MAX_CHAT_IMAGES, clipboardImageFiles, fileToChatImage } from '../lib/chatImages'
import './PetChatInput.css'

const BASE_HEIGHT = 48
const ATTACHMENT_HEIGHT = 106

function PetChatInput() {
  const instanceId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('instance') || undefined
  const t = useT()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState([])
  const [conversation, setConversation] = useState(null)
  const [chatting, setChatting] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [imageBusy, setImageBusy] = useState(false)
  const [visionEnabled, setVisionEnabled] = useState(false)
  const inputRef = useRef(null)
  const imageInputRef = useRef(null)
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
    setAttachments([])
    petApi.setChatOpen(false, instanceId).catch(() => {})
  }

  useEffect(() => {
    inputRef.current?.focus()
    const loadConversation = (id) => aiApi.getConversation(id, instanceId).then((result) => {
      setConversation(result.conversation)
      setMessages(result.messages || [])
    }).catch(() => {})
    loadConversation()
    aiApi.getConfig(instanceId)
      .then((config) => setVisionEnabled(config?.visionEnabled !== false))
      .catch(() => setVisionEnabled(false))
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

  // 有附件时临时增高浮窗，发送或移除后恢复默认高度。
  useEffect(() => {
    petApi.setChatHeight(attachments.length ? ATTACHMENT_HEIGHT : BASE_HEIGHT, instanceId).catch(() => {})
  }, [attachments.length])

  const appendImages = async (files) => {
    const list = Array.from(files || []).slice(0, MAX_CHAT_IMAGES - attachments.length)
    if (!list.length || imageBusy) return
    setImageBusy(true)
    try {
      const next = []
      for (const file of list) {
        const dataUrl = await fileToChatImage(file)
        if (dataUrl) next.push(dataUrl)
      }
      if (next.length) setAttachments((items) => [...items, ...next].slice(0, MAX_CHAT_IMAGES))
    } catch (error) {
      petApi.showBubble(error.message || String(error), undefined, instanceId).catch(() => {})
    } finally {
      setImageBusy(false)
    }
  }

  const handlePasteImages = (event) => {
    if (!visionEnabled) return
    const files = clipboardImageFiles(event)
    if (!files.length) return
    event.preventDefault()
    appendImages(files).catch(() => {})
  }

  const captureScreen = async () => {
    if (!visionEnabled || imageBusy || attachments.length >= MAX_CHAT_IMAGES) return
    setImageBusy(true)
    try {
      const result = await aiApi.captureScreen()
      if (result?.dataUrl) setAttachments((items) => [...items, result.dataUrl].slice(0, MAX_CHAT_IMAGES))
    } catch (error) {
      petApi.showBubble(error.message, undefined, instanceId).catch(() => {})
    } finally {
      setImageBusy(false)
    }
  }

  const send = async (event) => {
    event.preventDefault()
    const content = draft.trim()
    const images = attachments
    if ((!content && images.length === 0) || chatting || imageBusy) return
    setMessages((items) => [...items, { role: 'user', content, images: images.length ? images : undefined }])
    setDraft('')
    setAttachments([])
    setChatting(true)
    stopTypewriter()
    displayRef.current = ''
    petApi.performAction({ state: 'working', duration: 12000 }, instanceId)
    petApi.showBubble(t('petCenter.bubbleThinking'), undefined, instanceId).catch(() => {})
    try {
      const result = await aiApi.chat({
        conversationId: conversation?.id,
        content,
        images: images.length ? images : undefined,
        petModelId: instanceId
      })
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
      petApi.performAction({ state: 'wave', duration: 1800 }, instanceId)
      if (response) await petApi.showBubble(response, undefined, instanceId)
    } catch (error) {
      const message = t('petCenter.aiConnectFailed', { message: error.message })
      setMessages((items) => [...items.filter((item) => item.id), { role: 'assistant', content: message }])
      petApi.performAction({ state: 'failed', duration: 2200 }, instanceId)
      await petApi.showBubble(message, undefined, instanceId).catch(() => {})
    } finally {
      setChatting(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <form className="pet-chat-input" onSubmit={send}>
      {attachments.length > 0 && (
        <div className="pet-chat-input__attachments">
          {attachments.map((url, index) => (
            <div className="pet-chat-input__attachment" key={index}>
              <img src={url} alt="" />
              <button
                type="button"
                onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={t('petCenter.removeImage')}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="pet-chat-input__row">
        {visionEnabled && (
          <>
            <button
              className="pet-chat-input__tool"
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={chatting || imageBusy || attachments.length >= MAX_CHAT_IMAGES}
              title={t('petCenter.attachImage')}
              aria-label={t('petCenter.attachImage')}
            >
              <ImagePlus size={14} />
            </button>
            <button
              className="pet-chat-input__tool"
              type="button"
              onClick={captureScreen}
              disabled={chatting || imageBusy || attachments.length >= MAX_CHAT_IMAGES}
              title={t('petCenter.captureScreen')}
              aria-label={t('petCenter.captureScreen')}
            >
              <Monitor size={14} />
            </button>
          </>
        )}
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handlePasteImages}
          placeholder={t('petCenter.desktopChatPlaceholder')}
          aria-label={t('petCenter.desktopChatPlaceholder')}
          maxLength={1000}
        />
        <button className="pet-chat-input__send" type="submit" disabled={(!draft.trim() && attachments.length === 0) || chatting || imageBusy} aria-label={t('petCenter.send')}>
          <Send size={15} />
        </button>
        <button className="pet-chat-input__close" type="button" onClick={close} aria-label={t('common.close')}>
          <X size={14} />
        </button>
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(event) => {
          appendImages(event.target.files).catch(() => {})
          event.target.value = ''
        }}
      />
    </form>
  )
}

export default PetChatInput
