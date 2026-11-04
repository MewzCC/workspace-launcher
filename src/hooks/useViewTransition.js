import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

// Keep the outgoing view mounted until it has faded out; cancel stale switches.
export function useViewTransition(target) {
  const animationsEnabled = useStore((state) => state.animationsEnabled)
  const displayed = useRef(target)
  const [displayedKey, setDisplayedKey] = useState(target)
  const [phase, setPhase] = useState('idle')

  useEffect(() => {
    if (target === displayed.current) {
      setPhase('idle')
      return undefined
    }
    if (!animationsEnabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayed.current = target
      setDisplayedKey(target)
      setPhase('idle')
      return undefined
    }
    setPhase('exit')
    const fade = setTimeout(() => setPhase('loading'), 120)
    const swap = setTimeout(() => {
      displayed.current = target
      setDisplayedKey(target)
      setPhase('enter')
    }, 200)
    const finish = setTimeout(() => setPhase('idle'), 440)
    return () => { clearTimeout(fade); clearTimeout(swap); clearTimeout(finish) }
  }, [target, animationsEnabled])

  return { displayedKey, phase, busy: phase !== 'idle' }
}
