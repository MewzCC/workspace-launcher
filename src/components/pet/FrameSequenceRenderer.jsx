import React from 'react'
import { useClipFrame } from './useClipFrame'

export default function FrameSequenceRenderer({ clip, playbackToken, onComplete }) {
  const frame = useClipFrame(clip, playbackToken, onComplete)
  return <img className="pet-renderer__sequence-frame" src={clip.source.frames[frame]} alt="" draggable="false" />
}
