import React, { useMemo } from 'react'
import { useClipFrame } from './useClipFrame'

export default function AtlasRenderer({ clip, playbackToken, onComplete }) {
  const frame = useClipFrame(clip, playbackToken, onComplete)
  const source = clip.source
  const style = useMemo(() => ({
    width: `${source.columns * 100}%`,
    height: `${source.rows * 100}%`,
    transform: `translate(${-((source.startColumn || 0) + frame) * 100 / source.columns}%, ${-source.row * 100 / source.rows}%)`
  }), [frame, source.columns, source.row, source.rows, source.startColumn])
  return <img className="pet-renderer__atlas-image" src={source.asset} alt="" draggable="false" style={style} />
}
