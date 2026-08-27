import React from 'react'
import PetRenderer from './pet/PetRenderer'
import './PetSprite.css'

const LEGACY_STATE_INTENTS = {
  walkRight: 'move.walk.right', walkLeft: 'move.walk.left', wave: 'greet', jump: 'react.excited',
  failed: 'error', waiting: 'rest.sit', working: 'focus.working', review: 'study.review', dragging: 'interaction.drag'
}

export function PetSprite({ model, state = 'idle', presentation, playbackToken = 0, size = 160, className = '', onComplete }) {
  const semanticState = LEGACY_STATE_INTENTS[state] || state
  const animationId = presentation?.animationId || (model?.render?.animations?.[state] ? state : model?.semantics?.bindings?.[semanticState]?.[0]) || 'idle'
  return <PetRenderer model={model} animationId={animationId} playbackToken={presentation?.playbackToken ?? playbackToken} size={size} className={className} onComplete={onComplete} />
}

export default PetSprite
