import { useRef } from 'react'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import PetSprite from './PetSprite'
import { useT } from '../hooks/useT'

export default function PetChatSwitcher({ models, currentId, disabled, onSelect }) {
  const t = useT()
  const dialogRef = useRef(null)
  const buttonRef = useRef(null)
  const close = () => { dialogRef.current?.close(); buttonRef.current?.focus() }
  return <>
    <button ref={buttonRef} type="button" className="pet-chat-switch" aria-haspopup="dialog" disabled={disabled} onClick={() => dialogRef.current?.showModal()} aria-label={t('petCenter.switchPet')} title={t('petCenter.switchPet')}><ArrowLeftRight size={14} /></button>
    <dialog ref={dialogRef} className="pet-chat-switch-dialog" aria-label={t('petCenter.switchPet')} onCancel={(event) => { event.preventDefault(); close() }}>
      <header><h2>{t('petCenter.switchPet')}</h2><button type="button" onClick={close} aria-label={t('common.close')}><X size={18} /></button></header>
      <div className="pet-chat-switch-list">
        {models.map((model) => <button type="button" key={model.id} data-pet-id={model.id} disabled={disabled || model.invalid} aria-pressed={currentId === model.id} onClick={async () => { if (await onSelect(model.id)) close() }}>
          <PetSprite model={model} state="idle" size={38} thumbnailOnly />
          <span>{model.displayName}</span>{currentId === model.id && <Check size={16} />}
        </button>)}
      </div>
    </dialog>
  </>
}
