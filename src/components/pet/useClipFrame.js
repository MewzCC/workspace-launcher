import { useEffect, useRef, useState } from 'react'

export function useClipFrame(clip, playbackToken, onComplete) {
  const [frame, setFrame] = useState(0)
  const completedTokenRef = useRef(null)
  const frameCount = clip?.source?.type === 'sequence' ? clip.source.frames.length : Number(clip?.source?.frameCount || 1)

  useEffect(() => {
    setFrame(0)
    completedTokenRef.current = null
  }, [clip?.id, playbackToken])

  useEffect(() => {
    if (!clip || frameCount <= 1) return undefined
    const durations = clip.timing?.durations
    const duration = clip.timing?.mode === 'durations' ? Number(durations?.[frame] || 120) : Math.round(1000 / Number(clip.timing?.fps || 8))
    const timer = setTimeout(() => {
      const last = frame >= frameCount - 1
      if (!last) return setFrame((value) => value + 1)
      if (clip.timing?.playback === 'loop') return setFrame(0)
      if (completedTokenRef.current !== playbackToken) {
        completedTokenRef.current = playbackToken
        onComplete?.(playbackToken)
      }
      // 单次动画完成后停在末帧，等待运行时切换动作；不能自行从头循环。
    }, Math.min(5000, Math.max(30, duration)))
    return () => clearTimeout(timer)
  }, [clip, frame, frameCount, onComplete, playbackToken])

  return frame
}
