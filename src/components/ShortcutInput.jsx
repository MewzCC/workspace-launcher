import React, { useState } from 'react'
import { Keyboard, X } from 'lucide-react'
import { useT } from '../hooks/useT'
import './ShortcutInput.css'

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta'])

export function keyToAccelerator(event) {
  if (MODIFIER_KEYS.has(event.key)) return null
  if (event.key === 'Escape') return { blur: true }
  if (event.key === 'Backspace' || event.key === 'Delete') return ''

  const modifiers = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')

  let key = null
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3)
  else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5)
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)) key = event.key
  else if (event.key.startsWith('Arrow')) key = event.key.slice(5)
  else {
    const supported = {
      ' ': 'Space',
      Tab: 'Tab',
      Enter: 'Enter',
      Home: 'Home',
      End: 'End',
      Insert: 'Insert',
      PageUp: 'PageUp',
      PageDown: 'PageDown'
    }
    key = supported[event.key] || null
  }

  if (!key || modifiers.length === 0) return { invalid: true }
  return [...modifiers, key].join('+')
}

function ShortcutKeys({ value }) {
  return value.split('+').map((key, index) => (
    <React.Fragment key={`${key}-${index}`}>
      {index > 0 && <span className="shortcut-plus" aria-hidden="true">+</span>}
      <kbd className="shortcut-key">{key === 'Super' ? 'Win' : key}</kbd>
    </React.Fragment>
  ))
}

export default function ShortcutInput({ value = '', onChange, error = '' }) {
  const t = useT()
  const [invalid, setInvalid] = useState(false)
  const [recording, setRecording] = useState(false)

  const clear = () => {
    setInvalid(false)
    onChange('')
  }

  const handleKeyDown = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const result = keyToAccelerator(event)
    if (result === null) return
    if (result?.blur) {
      event.currentTarget.blur()
      return
    }
    if (result === '') {
      clear()
      return
    }
    if (result?.invalid) {
      setInvalid(true)
      return
    }
    setInvalid(false)
    onChange(result)
  }

  const message = error || (invalid ? t('workspaces.shortcutInvalid') : '')

  return (
    <div className={`shortcut-field ${message ? 'has-error' : ''}`}>
      <div className="shortcut-field-row">
        <button
          type="button"
          className={`shortcut-recorder ${recording ? 'recording' : ''}`}
          onKeyDown={handleKeyDown}
          onFocus={() => { setRecording(true); setInvalid(false) }}
          onBlur={() => setRecording(false)}
          aria-label={t('workspaces.shortcut')}
        >
          <Keyboard size={16} aria-hidden="true" />
          <span className="shortcut-recorder-content">
            {value ? <ShortcutKeys value={value} /> : t('workspaces.shortcutPlaceholder')}
          </span>
          {recording && <span className="shortcut-recording-dot" aria-hidden="true" />}
        </button>
        {value && (
          <button type="button" className="shortcut-clear" onClick={clear}>
            <X size={14} />
            {t('workspaces.shortcutClear')}
          </button>
        )}
      </div>
      <p className={`shortcut-hint ${message ? 'error' : ''}`} role={message ? 'alert' : undefined}>
        {message || (recording ? t('workspaces.shortcutRecording') : t('workspaces.shortcutHint'))}
      </p>
    </div>
  )
}
