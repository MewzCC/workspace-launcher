import { useCallback, useEffect, useRef, useState } from 'react'
import { shortcutApi } from '../lib/ipc'
import { useT } from './useT'

function useShortcutValidation(value, workspaceId = null) {
  const t = useT()
  const tRef = useRef(t)
  tRef.current = t
  const requestIdRef = useRef(0)
  const [result, setResult] = useState({ status: 'idle', message: '' })

  const messageFor = useCallback((validation) => {
    if (validation?.valid) return tRef.current('workspaces.shortcutAvailable')
    if (validation?.reason === 'duplicate') {
      return tRef.current('workspaces.shortcutConflict', { name: validation.workspaceName || '' })
    }
    if (validation?.reason === 'occupied') return tRef.current('workspaces.shortcutOccupied')
    if (validation?.reason === 'invalid') return tRef.current('workspaces.shortcutInvalid')
    return tRef.current('workspaces.shortcutCheckFailed')
  }, [])

  const validate = useCallback(async (shortcut = value) => {
    const normalized = String(shortcut || '').trim()
    const requestId = ++requestIdRef.current
    if (!normalized) {
      setResult({ status: 'idle', message: '' })
      return true
    }

    setResult({ status: 'checking', message: tRef.current('workspaces.shortcutChecking') })
    try {
      const validation = await shortcutApi.validate(normalized, workspaceId)
      if (requestId !== requestIdRef.current) return false
      const valid = Boolean(validation?.valid)
      setResult({
        status: valid ? 'valid' : 'error',
        message: messageFor(validation)
      })
      return valid
    } catch (_) {
      if (requestId === requestIdRef.current) {
        setResult({ status: 'error', message: tRef.current('workspaces.shortcutCheckFailed') })
      }
      return false
    }
  }, [messageFor, value, workspaceId])

  useEffect(() => {
    const normalized = String(value || '').trim()
    if (!normalized) {
      requestIdRef.current += 1
      setResult({ status: 'idle', message: '' })
      return undefined
    }

    setResult({ status: 'checking', message: tRef.current('workspaces.shortcutChecking') })
    const timer = window.setTimeout(() => validate(normalized), 280)
    return () => window.clearTimeout(timer)
  }, [validate, value])

  const setError = useCallback((message) => {
    requestIdRef.current += 1
    setResult({ status: 'error', message })
  }, [])

  return { ...result, validateNow: validate, setError }
}

export default useShortcutValidation
export { useShortcutValidation }
