import React, { useMemo } from 'react'
import PetRenderer from './pet/PetRenderer'
import './PetSprite.css'

const STATES = {
  idle: { row: 0, frames: 6, durations: [280, 110, 110, 140, 140, 320] },
  walkRight: { row: 1, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  walkLeft: { row: 2, frames: 8, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  wave: { row: 3, frames: 4, durations: [140, 140, 140, 280] },
  jump: { row: 4, frames: 5, durations: [140, 140, 140, 140, 280] },
  failed: { row: 5, frames: 8, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  waiting: { row: 6, frames: 6, durations: [150, 150, 150, 150, 150, 260] },
  working: { row: 7, frames: 6, durations: [120, 120, 120, 120, 120, 120, 220] },
  review: { row: 8, frames: 6, durations: [150, 150, 150, 150, 150, 280] }
}

// All previews and desktop windows share this adapter and the same renderer.
export function PetSprite({ model, state = 'idle', size = 160, className = '', playbackToken = 0, onComplete, onReady, onError, thumbnailOnly = false }) {
  const normalized = useMemo(() => {
    if (!model || model.builtin || model.render) return model
    if (model.renderer === 'svg') return { ...model, render: { engine: 'svg', svgParams: model.svgParams } }
    const animations = Object.fromEntries(Object.entries(STATES).map(([id, value]) => [id, {
      id, source: { type: 'atlas', asset: model.spritesheetDataUrl, columns: 8, rows: model.spriteVersionNumber === 1 ? 9 : 11, row: value.row, frameCount: value.frames },
      timing: { mode: 'durations', durations: value.durations, playback: 'loop' }
    }]))
    const drag = model.dragAnimation
    if (drag?.frameDataUrls?.length) animations.dragging = {
      id: 'dragging', source: { type: 'sequence', frames: drag.frameDataUrls }, timing: { mode: 'durations', durations: drag.durations, playback: 'loop' }
    }
    else if (drag?.atlasState && animations[drag.atlasState]) animations.dragging = {
      ...animations[drag.atlasState], id: 'dragging', timing: { mode: 'durations', durations: drag.durations, playback: 'loop' }
    }
    return { ...model, render: { engine: 'atlas', canvas: { width: 192, height: 208 }, animations } }
  }, [model])
  return <PetRenderer key={model?.id || 'builtin'} model={normalized} animationId={state} size={size} playbackToken={playbackToken} onComplete={onComplete} onReady={onReady} onError={onError} thumbnailOnly={thumbnailOnly} className={`pet-sprite--${state} ${state === 'dragging' && model?.dragAnimation?.atlasState ? 'pet-sprite--drag-atlas' : ''} ${className}`} />
}

export default PetSprite
