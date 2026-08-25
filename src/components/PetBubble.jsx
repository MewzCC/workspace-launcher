import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { petApi } from '../lib/ipc'
import { renderMarkdown } from '../lib/markdown'
import './PetBubble.css'

function PetBubble() {
  const instanceId = new URLSearchParams(window.location.hash.split('?')[1] || '').get('instance') || undefined
  const [payload, setPayload] = useState(null)
  const [placement, setPlacement] = useState('top')
  const bubbleRef = useRef(null)
  const reportedSizeRef = useRef('')

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
    let cancelled = false
    const report = () => {
      const element = bubbleRef.current
      if (cancelled || !element) return
      // offsetWidth/offsetHeight 不受入场 scale 动画影响，也不会把 BrowserWindow
      // 当前的透明画布高度计入内容尺寸，避免“测量 → 扩窗 → 再测量”的反馈循环。
      const width = Math.ceil(element.offsetWidth + 12)
      const height = Math.ceil(element.offsetHeight + 12)
      const signature = `${width}x${height}`
      if (reportedSizeRef.current === signature) return
      reportedSizeRef.current = signature
      petApi.reportBubbleSize({ width, height }, instanceId)
    }
    const frame = requestAnimationFrame(report)
    document.fonts?.ready?.then(report).catch(() => {})
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [instanceId, payload])

  if (!payload) return null
  return (
    <div ref={bubbleRef} className={`pet-floating-bubble pet-floating-bubble--${placement}`}>
      <div
        className="md-render pet-bubble-md"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(payload.text) }}
      />
    </div>
  )
}

export default PetBubble
