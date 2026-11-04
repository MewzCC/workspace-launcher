import { useEffect, useRef, useState } from 'react'
import { Crop, ImagePlus, Palette, RotateCcw } from 'lucide-react'
import { useT } from '../hooks/useT'
import { readPetBackground, writePetBackground } from '../lib/petBackground'
import PetBackgroundCropper from './PetBackgroundCropper'

export default function PetStageBackground({ petId, onError }) {
  const t = useT()
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const scope = useRef(0)
  const [record, setRecord] = useState(null)
  const [imageSource, setImageSource] = useState(null)
  const [busy, setBusy] = useState(false)
  const [crop, setCrop] = useState(null)
  const [target, setTarget] = useState({ width: 1, height: 1 })

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        const stage = entry.target
        setTarget({ width: stage.clientWidth, height: stage.clientHeight })
      }
    })
    observer.observe(menuRef.current.closest('.pet-stage-card'))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const version = ++scope.current
    setBusy(true)
    setRecord(null)
    setCrop(null)
    readPetBackground(petId).then((saved) => {
      if (version === scope.current) setRecord(saved || { id: petId, color: null, image: null })
    }).catch(() => {
      if (version === scope.current) onError(t('petCenter.backgroundStorageFailed'))
    }).finally(() => { if (version === scope.current) setBusy(false) })
    return () => { scope.current++ }
  }, [petId])

  useEffect(() => {
    if (!record?.image) { setImageSource(null); return undefined }
    const url = URL.createObjectURL(record.image)
    setImageSource({ image: record.image, url })
    return () => URL.revokeObjectURL(url)
  }, [record?.image])

  useEffect(() => {
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type !== 'keydown' && menuRef.current?.contains(event.target)) return
      if (menuRef.current) menuRef.current.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [])

  const save = async (next, version) => {
    await writePetBackground(next)
    if (version === scope.current) setRecord(next)
  }
  const update = async (patch) => {
    if (busy || record?.id !== petId) return
    const version = scope.current
    setBusy(true)
    try { await save({ ...record, ...patch }, version) }
    catch { if (version === scope.current) onError(t('petCenter.backgroundStorageFailed')) }
    finally { if (version === scope.current) setBusy(false) }
  }
  const openCrop = async (file) => {
    if (!file || busy || record?.id !== petId) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      onError(t('petCenter.backgroundImageInvalid')); return
    }
    const version = scope.current
    setBusy(true)
    try {
      const bitmap = await createImageBitmap(file)
      const source = { file, width: bitmap.width, height: bitmap.height }
      bitmap.close()
      if (version === scope.current) {
        setCrop(source)
        menuRef.current.open = false
      }
    } catch { if (version === scope.current) onError(t('petCenter.backgroundImageFailed')) }
    finally { if (version === scope.current) setBusy(false) }
  }
  const chooseImage = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    openCrop(file)
  }
  const closeCrop = () => { setCrop(null); menuRef.current?.querySelector('summary')?.focus() }
  const applyCrop = async (image) => {
    const version = scope.current
    setBusy(true)
    try {
      await save({ ...record, image, originalImage: crop.file }, version)
    } catch { if (version === scope.current) onError(t('petCenter.backgroundStorageFailed')); return false }
    finally { if (version === scope.current) setBusy(false) }
  }
  const current = record?.id === petId ? record : null
  return <>
    {current && (current.color || current.image) && <div className="pet-stage-background" style={{ backgroundColor: current.color || undefined }} aria-hidden="true">
      {current.image && imageSource?.image === current.image && <img src={imageSource.url} alt="" />}
    </div>}
    <details className="pet-background-menu" ref={menuRef}>
      <summary aria-label={t('petCenter.customBackground')} title={t('petCenter.customBackground')}><Palette size={16} /></summary>
      <div className="pet-background-panel">
        <strong>{t('petCenter.customBackground')}</strong>
        <label className="pet-background-color">{t('petCenter.backgroundColor')}<input type="color" value={current?.color || '#222536'} disabled={busy || !current} onChange={(event) => update({ color: event.target.value, image: null, originalImage: null })} /></label>
        <button type="button" disabled={busy || !current} onClick={() => inputRef.current?.click()}><ImagePlus size={15} />{t('petCenter.chooseBackgroundImage')}</button>
        {current?.image && <button type="button" className="pet-background-recrop" disabled={busy} onClick={() => openCrop(current.originalImage || current.image)}><Crop size={15} />{t('petCenter.cropBackground')}</button>}
        <button type="button" disabled={busy || !current} onClick={() => update({ color: null, image: null, originalImage: null })}><RotateCcw size={15} />{t('petCenter.resetBackground')}</button>
        <small>{t('petCenter.backgroundLocalHint')}</small>
        <input ref={inputRef} type="file" className="pet-background-file" hidden accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
      </div>
    </details>
    {crop && <PetBackgroundCropper source={crop} target={target} onConfirm={applyCrop} onCancel={closeCrop} onError={onError} />}
  </>
}
