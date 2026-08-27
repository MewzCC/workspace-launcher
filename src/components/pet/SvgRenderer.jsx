import React from 'react'

export default function SvgRenderer({ model }) {
  const params = model?.render?.svgParams || model?.svgParams || {}
  const antenna = params.antennaType !== 'none'
  return (
    <svg viewBox="20 0 80 112" preserveAspectRatio="xMidYMid meet" aria-label={model?.displayName || 'Pet'}>
      {antenna && params.antennaType === 'line' && <line x1="60" y1="14" x2="60" y2="26" stroke={params.bodyColor || '#6366f1'} strokeWidth="3" strokeLinecap="round" />}
      {antenna && params.antennaType !== 'line' && <circle className="pet-sprite__antenna" cx="60" cy="10" r="5" fill={params.antennaColor || '#22d3ee'} />}
      <rect x="26" y="30" width="68" height="64" rx="16" fill={params.bodyColor || '#6366f1'} />
      <rect x="34" y="38" width="52" height="48" rx="12" fill={params.bodyInnerColor || '#4f46e5'} />
      <g className="pet-sprite__eyes"><circle cx="48" cy="58" r="7" fill={params.eyeColor || '#0f172a'} /><circle cx="72" cy="58" r="7" fill={params.eyeColor || '#0f172a'} /><circle cx="50" cy="55" r="2.4" fill="#e0f2fe" /><circle cx="74" cy="55" r="2.4" fill="#e0f2fe" /></g>
      <path d="M52 74 Q60 80 68 74" stroke={params.eyeColor || '#0f172a'} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect className="pet-sprite__foot pet-sprite__foot--left" x="38" y="94" width="16" height="8" rx="4" fill={params.bodyInnerColor || '#4f46e5'} />
      <rect className="pet-sprite__foot pet-sprite__foot--right" x="66" y="94" width="16" height="8" rx="4" fill={params.bodyInnerColor || '#4f46e5'} />
    </svg>
  )
}
