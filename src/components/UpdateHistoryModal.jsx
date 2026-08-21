// 更新日志弹窗：展示全部版本发布历史，每个版本一张卡片，支持下载旧版安装包回滚
import React, { useEffect, useMemo, useState } from 'react'
import { Download, History, LoaderCircle, CircleAlert } from 'lucide-react'
import Modal from './Modal'
import GlowButton from './ui/GlowButton'
import { updateApi, appVersion as currentAppVersion } from '../lib/ipc'
import { renderMarkdown } from '../lib/markdown'
import { useT } from '../hooks/useT'
import './UpdateHistoryModal.css'

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}

function UpdateHistoryModal({ onClose }) {
  const t = useT()
  const [releases, setReleases] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState('')

  useEffect(() => {
    let mounted = true
    updateApi.releases()
      .then((list) => {
        if (mounted) setReleases(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        if (mounted) setError(err?.message || String(err))
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const currentVersion = useMemo(
    () => String(currentAppVersion || '').replace(/^v/i, ''),
    []
  )

  const handleDownload = async (release) => {
    if (!release.url || downloading) return
    setDownloading(release.version)
    try {
      await updateApi.downloadRelease(release.url)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setDownloading('')
    }
  }

  return (
    <Modal title={t('settings.updateHistoryTitle')} onClose={onClose}>
      <div className="update-history-intro">{t('settings.updateHistoryDesc')}</div>
      {loading && (
        <div className="update-history-message">
          <LoaderCircle size={18} className="update-history-spin" />
          {t('settings.updateHistoryLoading')}
        </div>
      )}
      {!loading && error && (
        <div className="update-history-message error">
          <CircleAlert size={18} />
          <span>{error}</span>
        </div>
      )}
      {!loading && !error && releases.length === 0 && (
        <div className="update-history-message">{t('settings.updateHistoryEmpty')}</div>
      )}
      {!loading && releases.length > 0 && (
        <div className="update-history-list">
          {releases.map((release) => {
            const isCurrent = release.version === currentVersion
            return (
              <div className="update-history-item" key={release.tag || release.version}>
                <div className="update-history-item-head">
                  <span className="update-history-version">
                    <History size={13} />
                    {release.name || `v${release.version}`}
                    {isCurrent && (
                      <span className="update-history-current">{t('settings.updateHistoryCurrent')}</span>
                    )}
                  </span>
                  <span className="update-history-date">{formatDate(release.publishedAt)}</span>
                  {release.url && !isCurrent && (
                    <GlowButton
                      variant="ghost"
                      size="sm"
                      disabled={downloading === release.version}
                      onClick={() => handleDownload(release)}
                      title={t('settings.updateHistoryDownload')}
                    >
                      {downloading === release.version ? (
                        <LoaderCircle size={13} className="update-history-spin" />
                      ) : (
                        <Download size={13} />
                      )}
                      {t('settings.updateHistoryDownload')}
                    </GlowButton>
                  )}
                </div>
                {release.notes && (
                  <div
                    className="update-history-notes md-render"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(release.notes) }}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

export default UpdateHistoryModal
