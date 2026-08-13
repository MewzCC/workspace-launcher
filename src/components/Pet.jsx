// 桌宠组件（P1 MVP）
// codex 风格小机器人：SVG 绘制；支持拖拽、双击打开主窗口、右键菜单；
// idle 呼吸动画 + 随机漫游（walk 摆动），漫游与拖拽结束均持久化位置。
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { petApi } from '../lib/ipc'
import './Pet.css'

const MOVE_TICK = 60
const ROAM_DURATION = 1600
const IDLE_MIN = 12000
const IDLE_MAX = 30000

function Pet() {
  const [dragging, setDragging] = useState(false)
  const [walking, setWalking] = useState(false)
  const dragRef = useRef(null)
  const stateRef = useRef('idle')
  const timersRef = useRef([])

  const setState = useCallback((next) => {
    stateRef.current = next
    setDragging(next === 'drag')
    setWalking(next === 'walk')
  }, [])

  // 随机漫游：渲染层计算目标（窗口内像素偏移），通过 IPC 移动窗口。
  const scheduleRoam = useCallback(() => {
    const delay = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN)
    const timer = setTimeout(() => {
      if (stateRef.current !== 'idle') return
      const targetX = -60 + Math.random() * 120
      const targetY = -40 + Math.random() * 80
      const steps = Math.max(1, Math.round(ROAM_DURATION / MOVE_TICK))
      let step = 0
      setState('walk')
      const walkTimer = setInterval(() => {
        step += 1
        if (step >= steps) {
          clearInterval(walkTimer)
          setState('idle')
          petApi.savePosition()
          scheduleRoam()
          return
        }
        petApi.move(
          window.screenX + Math.round((targetX * step) / steps),
          window.screenY + Math.round((targetY * step) / steps)
        )
      }, MOVE_TICK)
      timersRef.current.push(walkTimer)
    }, delay)
    timersRef.current.push(timer)
  }, [setState])

  useEffect(() => {
    scheduleRoam()
    return () => {
      timersRef.current.forEach((timer) => {
        clearTimeout(timer)
        clearInterval(timer)
      })
      timersRef.current = []
    }
  }, [scheduleRoam])

  const handleMouseDown = (event) => {
    if (event.button !== 0) return
    dragRef.current = {
      offsetX: event.screenX - window.screenX,
      offsetY: event.screenY - window.screenY,
      moved: false
    }
    setState('drag')
  }

  useEffect(() => {
    const handleMove = (event) => {
      if (!dragRef.current) return
      const dx = event.screenX - dragRef.current.offsetX - window.screenX
      const dy = event.screenY - dragRef.current.offsetY - window.screenY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true
      petApi.move(event.screenX - dragRef.current.offsetX, event.screenY - dragRef.current.offsetY)
    }
    const handleUp = () => {
      if (!dragRef.current) return
      const moved = dragRef.current.moved
      dragRef.current = null
      petApi.savePosition()
      if (!moved) {
        // 单击反馈：回到 idle
        setState('idle')
        return
      }
      setState('idle')
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [setState])

  const handleDoubleClick = () => {
    petApi.openMain().catch(() => {})
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    petApi.showMenu().catch(() => {})
  }

  return (
    <div
      className={`pet-root ${dragging ? 'dragging' : ''} ${walking ? 'walking' : ''}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <svg className="pet-svg" viewBox="0 0 120 120" aria-hidden="true">
        {/* 天线 */}
        <line x1="60" y1="14" x2="60" y2="26" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="10" r="5" fill="#22d3ee" />
        {/* 身体（codex 风格圆角方块） */}
        <rect x="26" y="30" width="68" height="64" rx="16" fill="#6366f1" />
        <rect x="34" y="38" width="52" height="48" rx="12" fill="#4f46e5" />
        {/* 眼睛（可眨眼） */}
        <circle cx="48" cy="58" r="7" fill="#0f172a" />
        <circle cx="72" cy="58" r="7" fill="#0f172a" />
        <circle cx="50" cy="55" r="2.4" fill="#e0f2fe" />
        <circle cx="74" cy="55" r="2.4" fill="#e0f2fe" />
        {/* 嘴 */}
        <path d="M52 74 Q60 80 68 74" stroke="#0f172a" strokeWidth="3" fill="none" strokeLinecap="round" />
        {/* 脚 */}
        <rect className="pet-foot pet-foot-l" x="38" y="94" width="16" height="8" rx="4" fill="#4f46e5" />
        <rect className="pet-foot pet-foot-r" x="66" y="94" width="16" height="8" rx="4" fill="#4f46e5" />
      </svg>
      {walking && (
        <div className="pet-shadow" />
      )}
    </div>
  )
}

export default Pet
