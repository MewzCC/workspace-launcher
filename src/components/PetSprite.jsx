import React from 'react'
import PetRenderer from './pet/PetRenderer'
import './PetSprite.css'

export function PetSprite({ model, state = 'idle', presentation, playbackToken = 0, size = 160, className = '', onComplete }) {
  const animationId = presentation?.animationId || (model?.render?.animations?.[state] ? state : model?.semantics?.bindings?.[state]?.[0]) || 'idle'
  return <PetRenderer model={model} animationId={animationId} playbackToken={presentation?.playbackToken ?? playbackToken} size={size} className={className} onComplete={onComplete} />
}

export default PetSprite
