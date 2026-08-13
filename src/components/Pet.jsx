import React, { useCallback, useEffect, useRef, useState } from 'react'
import { petApi } from '../lib/ipc'
import PetSprite from './PetSprite'
import { useT } from '../hooks/useT'
import './Pet.css'

const MOVE_TICK = 36
const ROAM_DURATION = 1500
const IDLE_MIN = 14000
const IDLE_MAX = 32000
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
  const [bubble, setBubble] = useState('')
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const draggingRef = useRef(false)
  const stateRef = useRef('idle')
  const roamTimerRef = useRef(null)
  const walkTimerRef = useRef(null)
  const ambientTimerRef = useRef(null)
  const actionTimerRef = useRef(null)
  const scheduleRoamRef = useRef(null)
  const scheduleAmbientRef = useRef(null)

  const changeState = useCallback((next) => {
    stateRef.current = next
    setPetState(next)
  }, [])

  const stopMotion = useCallback(() => {
    clearTimeout(roamTimerRef.current)
    clearInterval(walkTimerRef.current)
    walkTimerRef.current = null
  }, [])

  const performAction = useCallback((action = {}) => {
    if (draggingRef.current) return
    stopMotion()
    clearTimeout(ambientTimerRef.current)
    clearTimeout(actionTimerRef.current)
    changeState(action.state || 'idle')
    setBubble(String(action.bubble || ''))
    actionTimerRef.current = setTimeout(() => {
      changeState('idle')
      setBubble('')
      scheduleRoamRef.current?.()
      scheduleAmbientRef.current?.()
    }, Math.max(800, Number(action.duration) || 1800))
  }, [changeState, stopMotion])

  useEffect(() => {
    let mounted = true
    petApi.getConfig().then((value) => mounted && setConfig(value)).catch(() => {})
    const unsubscribe = petApi.onConfigChanged((value) => setConfig(value))
    const unsubscribeAction = petApi.onAction(performAction)
    return () => {
      mounted = false
      unsubscribe()
      unsubscribeAction()
      petApi.setMousePassthrough(true)
    }
  }, [performAction])

  const scheduleAmbient = useCallback(() => {
    clearTimeout(ambientTimerRef.current)
    const delay = AMBIENT_MIN + Math.random() * (AMBIENT_MAX - AMBIENT_MIN)
    ambientTimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle' || draggingRef.current || walkTimerRef.current) {
        scheduleAmbient()
        return
      }
      const action = AMBIENT_ACTIONS[Math.floor(Math.random() * AMBIENT_ACTIONS.length)]
      performAction(action)
    }, delay)
  }, [performAction])

  const scheduleRoam = useCallback(() => {
    clearTimeout(roamTimerRef.current)
    if (!config?.settings?.roaming) return
    const delay = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
    roamTimerRef.current = setTimeout(() => {
      if (stateRef.current !== 'idle') {
        scheduleRoam()
        return
      }
      const startX = window.screenX
      const startY = window.screenY
      const deltaX = -90 + Math.random() * 180
      const deltaY = -55 + Math.random() * 100
      const steps = Math.max(1, Math.round(ROAM_DURATION / MOVE_TICK))
      const direction = deltaX >= 0 ? 'walkRight' : 'walkLeft'
      let step = 0
      changeState(direction)
      walkTimerRef.current = setInterval(() => {
        step += 1
        const progress = Math.min(1, step / steps)
        const eased = 1 - Math.pow(1 - progress, 3)
        petApi.move(startX + Math.round(deltaX * eased), startY + Math.round(deltaY * eased))
        if (step >= steps) {
          clearInterval(walkTimerRef.current)
          walkTimerRef.current = null
          changeState('idle')
          petApi.savePosition()
          scheduleRoam()
        }
      }, MOVE_TICK)
    }, delay)
  }, [changeState, config?.settings?.roaming])

  scheduleRoamRef.current = scheduleRoam
  scheduleAmbientRef.current = scheduleAmbient

  useEffect(() => {
    scheduleRoam()
    scheduleAmbient()
    return () => {
      clearTimeout(roamTimerRef.current)
      clearInterval(walkTimerRef.current)
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
      if (Math.hypot(deltaX, deltaY) > 3) dragRef.current.moved = true
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
        const clickActions = [
          { state: 'wave', bubble: t('petCenter.petBubbleReady'), duration: 1800 },
          { state: 'jump', bubble: t('petCenter.petBubbleCheer'), duration: 1500 },
          { state: 'waiting', bubble: t('petCenter.petBubbleNext'), duration: 1900 }
        ]
        performAction(clickActions[Math.floor(Math.random() * clickActions.length)])
      } else {
        changeState('idle')
      }
      scheduleRoam()
      scheduleAmbient()
      const element = document.elementFromPoint(event.clientX, event.clientY)
      if (!element?.closest?.('.pet-interaction-zone')) petApi.setMousePassthrough(true)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [changeState, performAction, scheduleAmbient, scheduleRoam, t])

  const spriteSize = config?.settings?.dimensions?.spriteWidth || 116

  return (
    <div
      className={`pet-root pet-root--${petState}${dragging ? ' pet-root--dragging' : ''}`}
    >
      {bubble && <div className="pet-bubble">{bubble}</div>}
      <div
        className="pet-interaction-zone"
        onMouseEnter={() => petApi.setMousePassthrough(false)}
        onMouseLeave={() => {
          if (!draggingRef.current) petApi.setMousePassthrough(true)
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
