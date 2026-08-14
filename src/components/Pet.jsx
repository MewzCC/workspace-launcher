import React, { useCallback, useEffect, useRef, useState } from 'react'
import { petApi } from '../lib/ipc'
import PetSprite from './PetSprite'
import { useT } from '../hooks/useT'
import './Pet.css'

const MOVE_TICK = 32
const IDLE_MIN = 6500
const IDLE_MAX = 19000
const AMBIENT_MIN = 9000
const AMBIENT_MAX = 18000
const AMBIENT_ACTIONS = [
  { state: 'wave', duration: 1600 },
  { state: 'jump', duration: 1500 },
  { state: 'waiting', duration: 2200 },
  { state: 'review', duration: 2400 }
]

function Pet() {
  const t = useT()
  const [config, setConfig] = useState(null)
  const [petState, setPetState] = useState('idle')
  const [dragging, setDragging] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const dragRef = useRef(null)
  const draggingRef = useRef(false)
  const chatOpenRef = useRef(false)
  const stateRef = useRef('idle')
  const roamTimerRef = useRef(null)
  const walkTimerRef = useRef(null)
  const routePauseRef = useRef(null)
  const motionTokenRef = useRef(0)
  const ambientTimerRef = useRef(null)
  const actionTimerRef = useRef(null)
  const scheduleRoamRef = useRef(null)
  const scheduleAmbientRef = useRef(null)

  const applyChatVisibility = useCallback((open) => {
    const visible = Boolean(open)
    chatOpenRef.current = visible
    setChatOpen(visible)
    if (visible) {
      petApi.setMousePassthrough(false)
    }
  }, [])

  const changeState = useCallback((next) => {
    stateRef.current = next
    setPetState(next)
  }, [])

  const stopMotion = useCallback(() => {
    motionTokenRef.current += 1
    clearTimeout(roamTimerRef.current)
    clearInterval(walkTimerRef.current)
    clearTimeout(routePauseRef.current)
    walkTimerRef.current = null
    routePauseRef.current = null
  }, [])

  const performAction = useCallback((action = {}) => {
    if (draggingRef.current) return
    stopMotion()
    clearTimeout(ambientTimerRef.current)
    clearTimeout(actionTimerRef.current)
    changeState(action.state || 'idle')
    actionTimerRef.current = setTimeout(() => {
      changeState('idle')
      scheduleRoamRef.current?.()
      scheduleAmbientRef.current?.()
    }, Math.max(800, Number(action.duration) || 1800))
  }, [changeState, stopMotion])

  useEffect(() => {
    let mounted = true
    petApi.getConfig().then((value) => {
      if (!mounted) return
      setConfig(value)
      applyChatVisibility(value?.settings?.chatOpen)
    }).catch(() => {})
    const unsubscribe = petApi.onConfigChanged((value) => {
      stopMotion()
      changeState('idle')
      setConfig(value)
    })
    const unsubscribeAction = petApi.onAction(performAction)
    const unsubscribeChat = petApi.onChatVisibility(applyChatVisibility)
    return () => {
      mounted = false
      unsubscribe()
      unsubscribeAction()
      unsubscribeChat()
      petApi.setMousePassthrough(true)
    }
  }, [applyChatVisibility, changeState, performAction, stopMotion])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || !chatOpenRef.current) return
      applyChatVisibility(false)
      petApi.setChatOpen(false).catch(() => {})
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyChatVisibility])

  const scheduleAmbient = useCallback(() => {
    clearTimeout(ambientTimerRef.current)
    if (chatOpenRef.current) return
    const delay = AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN)
    ambientTimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle' || draggingRef.current || walkTimerRef.current) {
        scheduleAmbient()
        return
      }
      const action = AMBIENT_ACTIONS[Math.floor(Math.random() * AMBIENT_ACTIONS.length)]
      performAction(action)
    }, delay)
  }, [chatOpen, performAction])

  const scheduleRoam = useCallback(() => {
    clearTimeout(roamTimerRef.current)
    if (!config?.settings?.roaming || chatOpenRef.current) return
    const activity = Math.min(2, Math.max(0.5, Number(config.settings.roamActivity) || 1))
    const delay = (IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)) / activity
    roamTimerRef.current = setTimeout(async () => {
      if (stateRef.current !== 'idle') {
        scheduleRoam()
        return
      }
      let area
      try {
        area = await petApi.getMovementArea()
      } catch (_) {
        scheduleRoam()
        return
      }
      if (stateRef.current !== 'idle' || draggingRef.current) return

      const range = Math.min(1, Math.max(0.2, Number(config.settings.roamRange) || 0.7))
      const routeLength = 1 + (Math.random() < 0.34 * activity ? 1 : 0) + (Math.random() < 0.12 * activity ? 1 : 0)
      const route = []
      let cursor = { x: window.screenX, y: window.screenY }
      const horizontalSpan = Math.max(0, area.maxX - area.minX)
      const verticalSpan = Math.max(0, area.maxY - area.minY)
      const maxHorizontal = Math.max(70, horizontalSpan * range * 0.42)
      const maxVertical = Math.max(24, verticalSpan * range * 0.15)
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

      for (let index = 0; index < routeLength; index += 1) {
        const horizontal = (55 + Math.random() * Math.max(20, maxHorizontal - 55)) * (Math.random() < 0.5 ? -1 : 1)
        const vertical = (-maxVertical + Math.random() * maxVertical * 2) * (index === 0 ? 1 : 0.72)
        let target = {
          x: clamp(Math.round(cursor.x + horizontal), area.minX, area.maxX),
          y: clamp(Math.round(cursor.y + vertical), area.minY, area.maxY)
        }
        // 如果随机方向撞到边缘，就改为朝屏幕内部走，避免原地踏步。
        if (Math.hypot(target.x - cursor.x, target.y - cursor.y) < 34) {
          const centerX = (area.minX + area.maxX) / 2
          const inward = cursor.x <= centerX ? 1 : -1
          target = {
            x: clamp(Math.round(cursor.x + inward * Math.max(60, maxHorizontal * 0.55)), area.minX, area.maxX),
            y: clamp(Math.round(cursor.y + vertical), area.minY, area.maxY)
          }
        }
        route.push(target)
        cursor = target
      }

      const token = motionTokenRef.current + 1
      motionTokenRef.current = token
      const walkSegment = (index) => {
        if (motionTokenRef.current !== token || draggingRef.current) return
        if (index >= route.length) {
          walkTimerRef.current = null
          changeState('idle')
          petApi.savePosition()
          scheduleRoam()
          return
        }
        const startX = window.screenX
        const startY = window.screenY
        const target = route[index]
        const deltaX = target.x - startX
        const deltaY = target.y - startY
        const distance = Math.hypot(deltaX, deltaY)
        const speed = 82 + Math.random() * 38
        const duration = Math.min(4200, Math.max(850, distance / speed * 1000))
        const steps = Math.max(1, Math.round(duration / MOVE_TICK))
        let step = 0
        changeState(deltaX >= 0 ? 'walkRight' : 'walkLeft')
        walkTimerRef.current = setInterval(() => {
          if (motionTokenRef.current !== token || draggingRef.current) {
            clearInterval(walkTimerRef.current)
            walkTimerRef.current = null
            return
          }
          step += 1
          const progress = Math.min(1, step / steps)
          const eased = 0.5 - Math.cos(Math.PI * progress) / 2
          petApi.move(startX + Math.round(deltaX * eased), startY + Math.round(deltaY * eased))
          if (step >= steps) {
            clearInterval(walkTimerRef.current)
            walkTimerRef.current = null
            if (index + 1 < route.length) {
              changeState('idle')
              routePauseRef.current = setTimeout(() => walkSegment(index + 1), 180 + Math.random() * 420)
            } else {
              walkSegment(index + 1)
            }
          }
        }, MOVE_TICK)
      }
      walkSegment(0)
    }, delay)
  }, [changeState, chatOpen, config?.settings?.roamActivity, config?.settings?.roamRange, config?.settings?.roaming])

  scheduleRoamRef.current = scheduleRoam
  scheduleAmbientRef.current = scheduleAmbient

  useEffect(() => {
    scheduleRoam()
    scheduleAmbient()
    return () => {
      motionTokenRef.current += 1
      clearTimeout(roamTimerRef.current)
      clearInterval(walkTimerRef.current)
      clearTimeout(routePauseRef.current)
      clearTimeout(ambientTimerRef.current)
      clearTimeout(actionTimerRef.current)
    }
  }, [scheduleAmbient, scheduleRoam])

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    petApi.setMousePassthrough(false)
    stopMotion()
    clearTimeout(ambientTimerRef.current)
    clearTimeout(actionTimerRef.current)
    draggingRef.current = true
    setDragging(true)
    dragRef.current = {
      pointerX: event.screenX,
      pointerY: event.screenY,
      originX: window.screenX,
      originY: window.screenY,
      moved: false
    }
    changeState('idle')
  }

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragRef.current) return
      const deltaX = event.screenX - dragRef.current.pointerX
      const deltaY = event.screenY - dragRef.current.pointerY
      const nextX = dragRef.current.originX + deltaX
      const nextY = dragRef.current.originY + deltaY
      if (!dragRef.current.moved && Math.hypot(deltaX, deltaY) <= 4) return
      dragRef.current.moved = true
      petApi.move(nextX, nextY)
    }
    const handleUp = (event) => {
      if (!dragRef.current) return
      const moved = dragRef.current.moved
      dragRef.current = null
      draggingRef.current = false
      setDragging(false)
      petApi.savePosition()
      if (!moved) {
        const nextOpen = !chatOpenRef.current
        applyChatVisibility(nextOpen)
        petApi.setChatOpen(nextOpen).catch(() => applyChatVisibility(!nextOpen))
        if (nextOpen) {
          const greetings = [
            t('petCenter.petBubbleReady'),
            t('petCenter.petBubbleCheer'),
            t('petCenter.petBubbleNext')
          ]
          const greeting = greetings[Math.floor(Math.random() * greetings.length)]
          petApi.performAction({ state: 'wave', duration: 1800 }).catch(() => {})
          petApi.showBubble(greeting, Math.max(2500, 1800 + Array.from(greeting).length * 72)).catch(() => {})
        }
      } else {
        changeState('idle')
      }
      scheduleRoam()
      scheduleAmbient()
      const element = document.elementFromPoint(event.clientX, event.clientY)
      if (!chatOpenRef.current && !element?.closest?.('.pet-interaction-zone')) petApi.setMousePassthrough(true)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [applyChatVisibility, changeState, scheduleAmbient, scheduleRoam, t])

  const spriteSize = config?.settings?.dimensions?.spriteWidth || 116

  return (
    <div
      className={`pet-root pet-root--${petState}${dragging ? ' pet-root--dragging' : ''}`}
    >
      <div
        className="pet-interaction-zone"
        onMouseEnter={() => petApi.setMousePassthrough(false)}
        onMouseLeave={() => {
          if (!draggingRef.current && !chatOpenRef.current) petApi.setMousePassthrough(true)
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => petApi.openMain().catch(() => {})}
        onContextMenu={(event) => { event.preventDefault(); petApi.showMenu().catch(() => {}) }}
      >
        <PetSprite model={config?.model} state={petState} size={spriteSize} />
      </div>
      <div className="pet-shadow" />
    </div>
  )
}

export default Pet
