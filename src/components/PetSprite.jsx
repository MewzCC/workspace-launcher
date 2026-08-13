import React, { useEffect, useMemo, useState } from 'react'
import { useT } from '../hooks/useT'
import './PetSprite.css'

const STATES = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
  walkRight: { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  walkLeft: { row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  wave: { row: 3, frames: 4, durations: [140, 140, 140, 280] },
  jump: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260] },
  working: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 220] },
  review: { row: 8, frames: 6, durations: [150, 150, 150, 150, 150, 280] }
}

export function PetSprite({ model, state = 'idle', size = 160, className = '' }) {
  const t = useT()
  const animation = STATES[state] || STATES.idle
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    setFrame(0)
  }, [state, model?.id])

  useEffect(() => {
    if (model?.builtin) return undefined
    const timer = setTimeout(() => {
      setFrame((value) => (value + 1) % animation.frames)
    }, animation.durations[frame] || 140)
    return () => clearTimeout(timer)
  }, [animation, frame, model?.builtin])

  const atlasRows = model?.spriteVersionNumber === 1 ? 9 : 11
  const atlasStyle = useMemo(() => ({
    width: size * 8,
    height: size * (208 / 192) * atlasRows,
    transform: `translate(${-frame * size}px, ${-animation.row * size * (208 / 192)}px)`
  }), [animation.row, atlasRows, frame, size])

  if (!model || model.builtin) {
    return (
      <div className={`pet-sprite pet-sprite--builtin pet-sprite--${state} ${className}`} style={{ width: size, height: size * (208 / 192) }}>
        <svg viewBox="20 0 80 112" preserveAspectRatio="xMidYMid meet" aria-label="LaunchBot">
          <line x1="60" y1="14" x2="60" y2="26" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
          <circle className="pet-sprite__antenna" cx="60" cy="10" r="5" fill="#22d3ee" />
          <rect x="26" y="30" width="68" height="64" rx="16" fill="#6366f1" />
          <rect x="34" y="38" width="52" height="48" rx="12" fill="#4f46e5" />
          <g className="pet-sprite__eyes">
            <circle cx="48" cy="58" r="7" fill="#0f172a" />
            <circle cx="72" cy="58" r="7" fill="#0f172a" />
            <circle cx="50" cy="55" r="2.4" fill="#e0f2fe" />
            <circle cx="74" cy="55" r="2.4" fill="#e0f2fe" />
          </g>
          <path d="M52 74 Q60 80 68 74" stroke="#0f172a" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect className="pet-sprite__foot pet-sprite__foot--left" x="38" y="94" width="16" height="8" rx="4" fill="#4f46e5" />
          <rect className="pet-sprite__foot pet-sprite__foot--right" x="66" y="94" width="16" height="8" rx="4" fill="#4f46e5" />
        </svg>
      </div>
    )
  }

  return (
    <div
      className={`pet-sprite pet-sprite--atlas ${className}`}
      style={{ width: size, height: size * (208 / 192) }}
      role="img"
      aria-label={model.displayName || t('nav.petCenter')}
    >
      <img src={model.spritesheetDataUrl} alt="" draggable="false" style={atlasStyle} />
    </div>
  )
}

export default PetSprite
