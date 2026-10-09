import React, { useEffect, useRef, useState } from 'react'
import { createLive2DView } from './live2dRuntime'
import { useT } from '../../hooks/useT'

export default function Live2DRenderer({ model, animationId = 'idle', playbackToken = 0, size, height, onReady, onError }) {
  const t = useT()
  const host = useRef(null)
  const view = useRef(null)
  const callbacks = useRef({ onReady, onError })
  callbacks.current = { onReady, onError }
  const latest = useRef({ animationId, size, height })
  latest.current = { animationId, size, height }
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [activeAction, setActiveAction] = useState('')
  const selectAction = (id) => {
    const action = model.live2d.actions.find(action => action.id === (model.live2d.mappings?.[id] || id)) || model.live2d.actions.find(action => action.id === model.live2d.mappings?.idle)
    return action && (id === 'idle' ? { ...action, loop: true } : action)
  }
  const actionRef = useRef(selectAction)
  actionRef.current = selectAction

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError('')
    const currentHost = host.current
    createLive2DView({ host: currentHost, url: model.live2d.entryUrl, width: latest.current.size, height: latest.current.height,
      idleGroup: model.live2d.idleGroup, onStatus: (id) => { if (!cancelled) setActiveAction(id) } }).then(async (result) => {
      if (cancelled) { result.destroy(); return }
      view.current = result
      result.resize(latest.current.size, latest.current.height)
      setStatus('ready')
      try {
        await result.play(actionRef.current(latest.current.animationId))
        if (!cancelled) callbacks.current.onReady?.({ thumbnail: result.thumbnail() })
      } catch (reason) {
        if (!cancelled) { setStatus('error'); setError(reason.message); callbacks.current.onError?.(reason) }
      }
    }).catch((reason) => {
      if (cancelled) return
      setStatus('error'); setError(reason.message)
      callbacks.current.onError?.(reason)
    })
    const move = (event) => { const bounds = currentHost.getBoundingClientRect(); view.current?.focus(event.clientX - bounds.left, event.clientY - bounds.top) }
    const visibility = () => view.current?.pause(document.hidden)
    const observer = new IntersectionObserver(([entry]) => view.current?.pause(!entry.isIntersecting || document.hidden))
    observer.observe(currentHost)
    document.addEventListener('pointermove', move)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelled = true
      observer.disconnect()
      document.removeEventListener('pointermove', move)
      document.removeEventListener('visibilitychange', visibility)
      view.current?.destroy()
      view.current = null
    }
  }, [model.live2d.entryUrl])

  useEffect(() => { view.current?.resize(size, height) }, [size, height])
  useEffect(() => {
    const idle = model.live2d.actions.find(action => action.id === model.live2d.mappings?.idle && action.type === 'motion')
    view.current?.setIdleGroup(idle?.group)
    view.current?.play(selectAction(animationId)).then(applied => {
      if (applied && view.current) { setStatus('ready'); setError(''); callbacks.current.onReady?.({ thumbnail: view.current.thumbnail() }) }
    }).catch((reason) => callbacks.current.onError?.(reason))
  }, [animationId, playbackToken, model.live2d.mappings])

  return <div ref={host} className="pet-live2d-host" data-status={status} data-action={activeAction}>
    {status === 'loading' && <span className="pet-live2d-status" role="status">{t('petImport.live2dLoading')}</span>}
    {status === 'error' && <span className="pet-live2d-status is-error" role="alert">{t('petImport.live2dFailed')} {error}</span>}
  </div>
}

