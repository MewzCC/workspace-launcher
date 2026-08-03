import { useEffect, useMemo, useState } from 'react'
import { softwareApi } from '../lib/ipc'

export function useProcessStatuses(softwareItems, refreshKey, intervalMs = 3000) {
  const paths = useMemo(
    () => [...new Set(
      (softwareItems || [])
        .map((item) => String(item?.path || '').trim())
        .filter(Boolean)
    )],
    [softwareItems]
  )
  const pathSignature = paths.join('\n')
  const [statuses, setStatuses] = useState({})

  useEffect(() => {
    let cancelled = false
    let timer = null

    const refresh = async () => {
      try {
        const result = await softwareApi.getProcessStatuses(paths)
        if (!cancelled && result && !result.error) setStatuses(result)
      } catch (err) {
        console.error('读取软件运行状态失败:', err)
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, intervalMs)
      }
    }

    if (paths.length === 0) {
      setStatuses({})
      return () => {}
    }

    refresh()
    return () => {
      cancelled = true
      if (timer != null) window.clearTimeout(timer)
    }
  }, [pathSignature, refreshKey, intervalMs])

  return statuses
}
