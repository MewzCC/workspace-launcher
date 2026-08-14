import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { petApi } from '../lib/ipc'
import './PetBubble.css'

function PetBubble() {
  const [payload, setPayload] = useState(null)
  const [placement, setPlacement] = useState('top')
  const bubbleRef = useRef(null)

  useEffect(() => {
    const unsubscribeContent = petApi.onBubbleContent(setPayload)
    const unsubscribePlacement = petApi.onBubblePlacement(setPlacement)
    return () => {
      unsubscribeContent()
      unsubscribePlacement()
    }
  }, [])

  useLayoutEffect(() => {
    if (!payload || !bubbleRef.current) return
    const report = () => {
      const rect = bubbleRef.current.getBoundingClientRect()
      petApi.reportBubbleSize({ width: rect.width + 12, height: rect.height + 12 })
    }
    const frame = requestAnimationFrame(report)
    const observer = new ResizeObserver(report)
    observer.observe(bubbleRef.current)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [payload])

  if (!payload) return null
  return <div ref={bubbleRef} className={`pet-floating-bubble pet-floating-bubble--${placement}`}>{payload.text}</div>
}

export default PetBubble
