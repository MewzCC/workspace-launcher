import React, { useCallback, useEffect, useRef, useState } from 'react'
import { petApi } from '../lib/ipc'
import PetSprite from './PetSprite'
import { useT } from '../hooks/useT'
import './Pet.css'

const DRAG_THRESHOLD = 4
const DOUBLE_CLICK_DELAY = 260

function Pet() {
  const instanceId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('instance') || undefined
  const t = useT()
  const [config, setConfig] = useState(null)
  const [runtime, setRuntime] = useState(null)
  const dragRef = useRef(null)
  const dragFrameRef = useRef(null)
  const dragMovePendingRef = useRef(false)
  const clickTimerRef = useRef(null)
  const chatOpenRef = useRef(false)

  const applyChatVisibility = useCallback((open) => {
    chatOpenRef.current = Boolean(open)
    if (open) petApi.setMousePassthrough(false, instanceId)
  }, [instanceId])

  useEffect(() => {
    let mounted = true
    petApi.getConfig(instanceId).then((value) => {
      if (!mounted) return
      setConfig(value)
      setRuntime(value?.runtime)
      applyChatVisibility(value?.settings?.chatOpen)
    }).catch(() => {})
    const unsubscribeConfig = petApi.onConfigChanged((value) => { setConfig(value); setRuntime(value?.runtime); applyChatVisibility(value?.settings?.chatOpen) })
    const unsubscribeRuntime = petApi.onRuntimeChanged(setRuntime)
    const unsubscribeChat = petApi.onChatVisibility(applyChatVisibility)
    return () => {
      mounted = false
      unsubscribeConfig()
      unsubscribeRuntime()
      unsubscribeChat()
      clearTimeout(clickTimerRef.current)
      cancelAnimationFrame(dragFrameRef.current)
      petApi.setMousePassthrough(true, instanceId)
    }
  }, [applyChatVisibility, instanceId])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || !chatOpenRef.current) return
      applyChatVisibility(false)
      petApi.setChatOpen(false, instanceId).catch(() => {})
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyChatVisibility, instanceId])

  const hitIntent = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = bounds.width ? (event.clientX - bounds.left) / bounds.width : 0.5
    const y = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5
    const hitbox = (config?.model?.interactions?.hitboxes || []).find((box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)
    return hitbox?.intent || 'touch.head'
  }

  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.isPrimary === false) return
    event.preventDefault()
    petApi.setMousePassthrough(false, instanceId)
    petApi.dragStart(instanceId)
    petApi.runtimeEvent({ type: 'POINTER_DOWN' }, instanceId)
    dragRef.current = { pointerId: event.pointerId, captureTarget: event.currentTarget, pointerX: event.screenX, pointerY: event.screenY, moved: false, intent: hitIntent(event) }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  useEffect(() => {
    const handleMove = (event) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const distance = Math.hypot(event.screenX - drag.pointerX, event.screenY - drag.pointerY)
      if (!drag.moved && distance <= DRAG_THRESHOLD) return
      if (!drag.moved) {
        drag.moved = true
        petApi.runtimeEvent({ type: 'DRAG_THRESHOLD' }, instanceId)
      }
      dragMovePendingRef.current = true
      if (dragFrameRef.current != null) return
      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null
        if (!dragMovePendingRef.current || !dragRef.current) return
        dragMovePendingRef.current = false
        petApi.dragMove(instanceId)
      })
    }

    const finishPointer = (event) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      const cancelled = event.type === 'pointercancel'
      if (dragFrameRef.current != null) cancelAnimationFrame(dragFrameRef.current)
      dragFrameRef.current = null
      if (dragMovePendingRef.current) petApi.dragMove(instanceId)
      dragMovePendingRef.current = false
      petApi.dragEnd(instanceId)
      try { if (drag.captureTarget?.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId) } catch (_) {}
      dragRef.current = null
      if (drag.moved || cancelled) {
        petApi.runtimeEvent({ type: 'POINTER_UP' }, instanceId)
      } else if (!clickTimerRef.current) {
        clickTimerRef.current = setTimeout(async () => {
          clickTimerRef.current = null
          petApi.runtimeEvent({ type: 'CLICK', intent: drag.intent }, instanceId)
          const studyResult = await petApi.studyClick(instanceId).catch(() => ({ handled: false }))
          if (!studyResult?.handled) {
            const nextOpen = !chatOpenRef.current
            applyChatVisibility(nextOpen)
            petApi.setChatOpen(nextOpen, instanceId).catch(() => applyChatVisibility(!nextOpen))
            if (nextOpen) {
              const greetings = [t('petCenter.petBubbleReady'), t('petCenter.petBubbleCheer'), t('petCenter.petBubbleNext')]
              const greeting = greetings[Math.floor(Math.random() * greetings.length)]
              petApi.present({ intent: 'greet', source: 'user', priority: 90, bubble: greeting }, instanceId).catch(() => {})
            }
          }
          if (!chatOpenRef.current) petApi.setMousePassthrough(true, instanceId)
        }, DOUBLE_CLICK_DELAY)
      }
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', finishPointer)
    }
  }, [applyChatVisibility, instanceId, t])

  const handleDoubleClick = () => {
    clearTimeout(clickTimerRef.current)
    clickTimerRef.current = null
    petApi.runtimeEvent({ type: 'DOUBLE_CLICK' }, instanceId)
    petApi.openMain().catch(() => {})
  }

  const spriteSize = config?.settings?.dimensions?.spriteWidth || 116
  const dragging = runtime?.state === 'interaction.dragging'
  return (
    <div className={`pet-root${dragging ? ' pet-root--dragging' : ''}`}>
      <div className="pet-interaction-zone" onMouseEnter={() => petApi.setMousePassthrough(false, instanceId)} onMouseLeave={() => { if (!dragRef.current && !chatOpenRef.current) petApi.setMousePassthrough(true, instanceId) }} onPointerDown={handlePointerDown} onDoubleClick={handleDoubleClick} onContextMenu={(event) => { event.preventDefault(); petApi.showMenu(instanceId).catch(() => {}) }}>
        <PetSprite model={config?.model} presentation={runtime?.presentation} size={spriteSize} onComplete={(token) => petApi.animationCompleted(token, instanceId)} />
      </div>
      <div className="pet-shadow" />
    </div>
  )
}

export default Pet
