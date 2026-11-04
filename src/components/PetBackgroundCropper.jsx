import { useEffect, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { useT } from '../hooks/useT'

const clamp = (value) => Math.max(-1, Math.min(1, value))

export default function PetBackgroundCropper({ source, target, onConfirm, onCancel, onError }) {
  const t = useT()
  const dialogRef = useRef(null)
  const frameRef = useRef(null)
  const imageRef = useRef(null)
  const dragRef = useRef(null)
  const [url, setUrl] = useState('')
  const [frame, setFrame] = useState({ width: 1, height: 1 })
  const [position, setPosition] = useState({ x: 0, y: 0, zoom: 1 })
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const aspect = target.width / target.height

  useEffect(() => {
    const objectUrl = URL.createObjectURL(source.file)
    setUrl(objectUrl)
    dialogRef.current.showModal()
    const observer = new ResizeObserver(([entry]) => setFrame({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(frameRef.current)
    return () => { observer.disconnect(); URL.revokeObjectURL(objectUrl) }
  }, [source])

  const scale = Math.max(frame.width / source.width, frame.height / source.height) * position.zoom
  const width = source.width * scale
  const height = source.height * scale
  const left = (frame.width - width) * (position.x + 1) / 2
  const top = (frame.height - height) * (position.y + 1) / 2
  const close = () => { dialogRef.current?.close(); onCancel() }
  const confirm = async () => {
    if (saving || !ready) return
    setSaving(true)
    setError('')
    try {
      // Export the same source rectangle shown in the preview; keep the original for recropping.
      const sourceWidth = frame.width / scale
      const sourceHeight = frame.height / scale
      const outputScale = Math.min(window.devicePixelRatio || 1, 2048 / Math.max(target.width, target.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(target.width * outputScale))
      canvas.height = Math.max(1, Math.round(target.height * outputScale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas unavailable')
      context.drawImage(imageRef.current, -left / scale, -top / scale, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
      const image = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Crop export failed')), 'image/webp', .95))
      if (await onConfirm(image) === false) setError(t('petCenter.backgroundStorageFailed'))
      else close()
    } catch { setError(t('petCenter.backgroundImageFailed')) }
    finally { setSaving(false) }
  }

  return <dialog ref={dialogRef} className="pet-background-crop-dialog" aria-labelledby="pet-background-crop-title" aria-busy={saving} onCancel={event => { event.preventDefault(); if (!saving) close() }}>
    <header><h2 id="pet-background-crop-title">{t('petCenter.cropBackground')}</h2><button type="button" disabled={saving} onClick={close} aria-label={t('common.close')}><X size={18} /></button></header>
    <p id="pet-background-crop-hint">{t('petCenter.cropBackgroundHint')}</p>
    <div ref={frameRef} className="pet-background-crop-frame" style={{ aspectRatio: aspect, '--crop-aspect': aspect }} tabIndex={0} role="group" aria-label={t('petCenter.cropBackground')} aria-describedby="pet-background-crop-hint"
      onPointerDown={event => { if (saving) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, position }; event.currentTarget.focus() }}
      onPointerMove={event => {
        const drag = dragRef.current
        if (!drag || saving) return
        setPosition({ ...position, x: width > frame.width ? clamp(drag.position.x - 2 * (event.clientX - drag.x) / (width - frame.width)) : 0, y: height > frame.height ? clamp(drag.position.y - 2 * (event.clientY - drag.y) / (height - frame.height)) : 0 })
      }}
      onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }} onLostPointerCapture={() => { dragRef.current = null }}
      onKeyDown={event => {
        if (saving || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
        event.preventDefault()
        const delta = event.shiftKey ? .2 : .05
        setPosition(value => ({ ...value, x: clamp(value.x + (event.key === 'ArrowLeft' ? delta : event.key === 'ArrowRight' ? -delta : 0)), y: clamp(value.y + (event.key === 'ArrowUp' ? delta : event.key === 'ArrowDown' ? -delta : 0)) }))
      }}>
      {url && <img ref={imageRef} src={url} alt="" draggable={false} onLoad={() => setReady(true)} onError={() => { onError(t('petCenter.backgroundImageFailed')); close() }} style={{ width, height, left, top }} />}
      <span className="pet-background-crop-grid" aria-hidden="true" />
    </div>
    <div className="pet-background-crop-controls"><label>{t('petCenter.cropZoom')}<input type="range" min="1" max="4" step=".01" value={position.zoom} disabled={saving} onChange={event => setPosition(value => ({ ...value, zoom: Number(event.target.value) }))} /><output>{Math.round(position.zoom * 100)}%</output></label><button type="button" disabled={saving} onClick={() => setPosition({ x: 0, y: 0, zoom: 1 })}><RotateCcw size={14} />{t('petCenter.cropReset')}</button></div>
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" disabled={saving} onClick={close}>{t('common.cancel')}</button><button type="button" className="pet-background-crop-confirm" disabled={saving || !ready} onClick={confirm}>{t('petCenter.cropApply')}</button></footer>
  </dialog>
}
