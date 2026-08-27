import React from 'react'
import FrameSequenceRenderer from './FrameSequenceRenderer'
import AtlasRenderer from './AtlasRenderer'
import SvgRenderer from './SvgRenderer'

function BuiltinRenderer() {
  return (
    <svg viewBox="20 0 80 112" preserveAspectRatio="xMidYMid meet" aria-label="LaunchBot">
      <line x1="60" y1="14" x2="60" y2="26" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
      <circle className="pet-sprite__antenna" cx="60" cy="10" r="5" fill="#22d3ee" />
      <rect x="26" y="30" width="68" height="64" rx="16" fill="#6366f1" /><rect x="34" y="38" width="52" height="48" rx="12" fill="#4f46e5" />
      <g className="pet-sprite__eyes"><circle cx="48" cy="58" r="7" fill="#0f172a" /><circle cx="72" cy="58" r="7" fill="#0f172a" /><circle cx="50" cy="55" r="2.4" fill="#e0f2fe" /><circle cx="74" cy="55" r="2.4" fill="#e0f2fe" /></g>
      <path d="M52 74 Q60 80 68 74" stroke="#0f172a" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect className="pet-sprite__foot pet-sprite__foot--left" x="38" y="94" width="16" height="8" rx="4" fill="#4f46e5" /><rect className="pet-sprite__foot pet-sprite__foot--right" x="66" y="94" width="16" height="8" rx="4" fill="#4f46e5" />
    </svg>
  )
}

export default function PetRenderer({ model, animationId = 'idle', playbackToken = 0, size = 160, className = '', onComplete }) {
  const canvas = model?.render?.canvas || { width: 192, height: 208 }
  const height = size * Number(canvas.height || 208) / Number(canvas.width || 192)
  const clip = model?.render?.animations?.[animationId] || model?.render?.animations?.idle || Object.values(model?.render?.animations || {})[0]
  const placement = clip?.placement || {}
  const contentStyle = { transform: `translate(${placement.offsetX || 0}px, ${placement.offsetY || 0}px) scale(${placement.scale || 1})`, transformOrigin: '50% 100%' }
  const rootClass = `pet-sprite pet-renderer pet-renderer--${model?.render?.engine || 'builtin'} ${className}`
  if (!model || model.builtin || model.render?.engine === 'builtin') return <div className={`${rootClass} pet-sprite--builtin`} style={{ width: size, height }}><BuiltinRenderer /></div>
  if (model.render?.engine === 'svg') return <div className={`${rootClass} pet-sprite--builtin pet-sprite--svg`} style={{ width: size, height }}><SvgRenderer model={model} /></div>
  return (
    <div className={rootClass} style={{ width: size, height }} role="img" aria-label={model.displayName || 'Pet'}>
      <div className="pet-renderer__content" style={contentStyle}>
        {clip?.source?.type === 'sequence' && <FrameSequenceRenderer clip={clip} playbackToken={playbackToken} onComplete={onComplete} />}
        {clip?.source?.type === 'atlas' && <AtlasRenderer clip={clip} playbackToken={playbackToken} onComplete={onComplete} />}
      </div>
    </div>
  )
}
