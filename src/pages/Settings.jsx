// 设置页面：应用信息 / 数据信息 / 危险操作区 / 版权信息
import React, { useEffect, useState } from 'react'
import {
  AppWindow,
  CheckCircle2,
  CircleAlert,
  Code2,
  Download,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Power,
  RefreshCcw,
  Rocket,
  Star
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import { useConfirmDialog } from '../components/ConfirmDialog'
import {
  appVersion,
  workspaceApi,
  softwareApi,
  externalApi,
  storageApi,
  systemApi,
  updateApi,
  onUpdateStatus
} from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import { renderMarkdown } from '../lib/markdown'
import './Settings.css'

function formatUpdateSpeed(bytesPerSecond) {
  const value = Number(bytesPerSecond) || 0
  if (value < 1024) return `${Math.round(value)} B/s`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB/s`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB/s`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB/s`
}

function formatReleaseDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}

export function Settings() {
  const t = useT()
  const confirm = useConfirmDialog()
  const repositoryUrl = 'https://github.com/MewzCC/workspace-launcher'
  // 从 store 读取工作空间、软件列表及刷新动作
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setSoftware = useStore((s) => s.setSoftware)

  // 清除操作进行中标记，避免重复点击
  const [clearing, setClearing] = useState(false)
  const [systemSettings, setSystemSettings] = useState(null)
  const [storageInfo, setStorageInfo] = useState(null)
  const [savingSetting, setSavingSetting] = useState('')
  const [systemMessage, setSystemMessage] = useState('')
  const [storageMessage, setStorageMessage] = useState('')
  const [updateStatus, setUpdateStatus] = useState({ state: 'idle', progress: 0 })

  useEffect(() => {
    systemApi.getPreferences().then((result) => {
      if (result?.error) setSystemMessage(result.error)
      else setSystemSettings(result)
    }).catch((error) => setSystemMessage(error.message))
  }, [])

  useEffect(() => {
    let mounted = true
    const unsubscribe = onUpdateStatus((status) => {
      if (mounted) setUpdateStatus(status || { state: 'idle', progress: 0 })
    })
    updateApi.status()
      .then((status) => {
        if (mounted) setUpdateStatus(status || { state: 'idle', progress: 0 })
      })
      .catch((error) => {
        if (mounted) setUpdateStatus({ state: 'error', error: error.message })
      })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    storageApi.info()
      .then((info) => setStorageInfo(info))
      .catch((error) => setStorageMessage(error.message || t('settings.storageLoadFailed')))
  }, [])

  const openStorageDirectory = async () => {
    try {
      await storageApi.open()
      setStorageMessage(t('settings.storageOpened'))
    } catch (error) {
      setStorageMessage(error.message || t('settings.storageOpenFailed'))
    }
  }

  const handleUpdateAction = async () => {
    try {
      if (updateStatus.state === 'available') {
        await updateApi.download()
      } else if (updateStatus.state === 'downloaded') {
        await updateApi.install()
      } else {
        await updateApi.check()
      }
    } catch (error) {
      setUpdateStatus((current) => ({
        ...current,
        state: 'error',
        error: error.message || String(error)
      }))
    }
  }

  const updateBusy = ['checking', 'downloading', 'installing'].includes(updateStatus.state)
  const updateMessage = (() => {
    if (updateStatus.state === 'unsupported') {
      const key = updateStatus.error === 'portable'
        ? 'settings.updateUnsupportedPortable'
        : updateStatus.error === 'development'
          ? 'settings.updateUnsupportedDevelopment'
          : 'settings.updateUnsupportedPlatform'
      return t(key)
    }
    if (updateStatus.state === 'checking') return t('settings.updateChecking')
    if (updateStatus.state === 'available') {
      return t('settings.updateAvailable', { version: updateStatus.version || '' })
    }
    if (updateStatus.state === 'downloading') {
      return t('settings.updateDownloading', {
        progress: Math.round(updateStatus.progress || 0),
        speed: formatUpdateSpeed(updateStatus.bytesPerSecond)
      })
    }
    if (updateStatus.state === 'downloaded') {
      return t('settings.updateDownloaded', { version: updateStatus.version || '' })
    }
    if (updateStatus.state === 'installing') return t('settings.updateInstalling')
    if (updateStatus.state === 'up-to-date') return t('settings.updateUpToDate')
    if (updateStatus.state === 'error') return updateStatus.error || t('settings.updateFailed')
    return t('settings.updateIdle')
  })()

  const updateSystemSetting = async (key, value) => {
    const setters = {
      openAtLogin: systemApi.setOpenAtLogin,
      startMinimized: systemApi.setStartMinimized,
      closeToTray: systemApi.setCloseToTray,
      killBeforeLaunch: systemApi.setKillBeforeLaunch
    }
    setSavingSetting(key)
    setSystemMessage('')
    try {
      const result = await setters[key](value)
      if (result?.error) throw new Error(result.error)
      setSystemSettings(result)
      setSystemMessage(t('settings.saved'))
    } catch (error) {
      setSystemMessage(error.message || t('settings.saveFailed'))
    } finally {
      setSavingSetting('')
    }
  }

  // 清除所有数据：二次确认后逐个删除工作空间与软件，并刷新 store
  const handleClearAll = async () => {
    const confirmed = await confirm({
      title: t('settings.clearAll'),
      message: t('settings.clearConfirm'),
      confirmText: t('settings.clearAll'),
      tone: 'danger',
      icon: 'warning'
    })
    if (!confirmed) return

    setClearing(true)
    try {
      // 逐个删除工作空间
      await Promise.all(
        workspaces.map((ws) => workspaceApi.remove(ws.id))
      )
      // 逐个删除软件
      await Promise.all(
        software.map((sw) => softwareApi.remove(sw.id))
      )

      // 重新拉取列表以刷新 store
      const [freshWorkspaces, freshSoftware] = await Promise.all([
        workspaceApi.list(),
        softwareApi.list()
      ])
      setWorkspaces(freshWorkspaces)
      setSoftware(freshSoftware)
    } catch (err) {
      console.error('清除数据失败:', err)
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="settings">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </section>

      {/* 应用信息 */}
      <GlassCard className="settings-section" hover={false}>
        <h3>{t('settings.appInfo')}</h3>
        <div className="info-row">
          <span className="info-label">{t('settings.name')}</span>
          <span className="info-value">LaunchPad</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('settings.version')}</span>
          <span className="info-value">{appVersion}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('settings.stack')}</span>
          <span className="info-value">Electron + React + SQLite</span>
        </div>
      </GlassCard>

      <GlassCard className="settings-section system-settings-card" hover={false}>
        <div className="system-settings-heading">
          <span className="system-settings-icon" aria-hidden="true"><Rocket size={22} /></span>
          <div>
            <h3>{t('settings.systemStartup')}</h3>
            <p>{t('settings.systemStartupDesc')}</p>
          </div>
          <span className="tray-live-badge"><span /> {t('settings.trayRunning')}</span>
        </div>

        <div className="system-setting-list">
          <div className="system-setting-row">
            <span className="system-setting-symbol"><Power size={18} /></span>
            <div className="system-setting-copy">
              <strong>{t('settings.openAtLogin')}</strong>
              <span>{systemSettings?.packaged === false ? t('settings.openAtLoginDescPackaged') : t('settings.openAtLoginDesc')}</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.openAtLogin)}
              disabled={!systemSettings || savingSetting === 'openAtLogin' || systemSettings.packaged === false}
              onChange={(event) => updateSystemSetting('openAtLogin', event.target.checked)}
              ariaLabel={t('settings.openAtLogin')}
            />
          </div>

          <div className="system-setting-row">
            <span className="system-setting-symbol"><AppWindow size={18} /></span>
            <div className="system-setting-copy">
              <strong>{t('settings.startMinimized')}</strong>
              <span>{t('settings.startMinimizedDesc')}</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.startMinimized)}
              disabled={!systemSettings || savingSetting === 'startMinimized'}
              onChange={(event) => updateSystemSetting('startMinimized', event.target.checked)}
              ariaLabel={t('settings.startMinimized')}
            />
          </div>

          <div className="system-setting-row">
            <span className="system-setting-symbol"><Rocket size={18} /></span>
            <div className="system-setting-copy">
              <strong>{t('settings.closeToTray')}</strong>
              <span>{t('settings.closeToTrayDesc')}</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.closeToTray)}
              disabled={!systemSettings || savingSetting === 'closeToTray'}
              onChange={(event) => updateSystemSetting('closeToTray', event.target.checked)}
              ariaLabel={t('settings.closeToTray')}
            />
          </div>

          <div className="system-setting-row process-policy-row">
            <span className="system-setting-symbol"><RefreshCcw size={18} /></span>
            <div className="system-setting-copy">
              <strong>{t('settings.killBeforeLaunch')}</strong>
              <span>{t('settings.killBeforeLaunchDesc')}</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.killBeforeLaunch)}
              disabled={!systemSettings || savingSetting === 'killBeforeLaunch'}
              onChange={(event) => updateSystemSetting('killBeforeLaunch', event.target.checked)}
              ariaLabel={t('settings.killBeforeLaunch')}
            />
          </div>
        </div>
        {systemMessage && <div className="system-setting-message" role="status">{systemMessage}</div>}
      </GlassCard>

      <GlassCard className="settings-section update-card" hover={false}>
        <div className="system-settings-heading">
          <span className="system-settings-icon" aria-hidden="true"><Download size={22} /></span>
          <div>
            <h3>{t('settings.updates')}</h3>
            <p>{t('settings.updatesDesc')}</p>
          </div>
          <span className="update-version">v{appVersion}</span>
        </div>
        <div className={`update-status update-status-${updateStatus.state}`} role="status" aria-live="polite">
          {updateBusy && <LoaderCircle size={16} className="process-spin" />}
          {!updateBusy && updateStatus.state === 'downloaded' && <CheckCircle2 size={16} />}
          {!updateBusy && updateStatus.state === 'error' && <CircleAlert size={16} />}
          <span>{updateMessage}</span>
        </div>
        {updateStatus.state === 'downloading' && (
          <div className="update-progress" aria-label={updateMessage}>
            <span style={{ width: `${Math.max(0, Math.min(100, updateStatus.progress || 0))}%` }} />
          </div>
        )}
        {updateStatus.releaseNotes && ['available', 'downloading', 'downloaded'].includes(updateStatus.state) && (
          <div className="update-release-notes">
            <div className="update-release-notes-heading">
              <strong>{t('settings.updateNotes')}</strong>
              <span>
                {[updateStatus.releaseName, formatReleaseDate(updateStatus.releaseDate)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <div
              className="update-release-notes-body md-render"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(updateStatus.releaseNotes) }}
            />
          </div>
        )}
        <div className="update-actions">
          <GlowButton
            variant="primary"
            size="sm"
            onClick={handleUpdateAction}
            disabled={updateBusy || updateStatus.state === 'unsupported'}
          >
            {updateStatus.state === 'available'
              ? t('settings.updateDownload')
              : updateStatus.state === 'downloaded'
                ? t('settings.updateInstall')
                : t('settings.updateCheck')}
          </GlowButton>
        </div>
      </GlassCard>

      <GlassCard className="settings-section repository-card" hover={false}>
        <div className="repository-copy">
          <span className="repository-icon" aria-hidden="true">
            <Code2 size={24} />
          </span>
          <div>
            <h3>{t('settings.repo')}</h3>
            <p className="repository-desc">
              {t('settings.repoDesc')}
            </p>
            <code className="repository-path">MewzCC/workspace-launcher</code>
          </div>
        </div>
        <GlowButton
          variant="primary"
          size="md"
          onClick={() => externalApi.open(repositoryUrl)}
        >
          <Star size={15} />
          {t('settings.github')}
          <ExternalLink size={14} />
        </GlowButton>
      </GlassCard>

      {/* 数据信息 */}
      <GlassCard className="settings-section" hover={false}>
        <h3>{t('settings.dataInfo')}</h3>
        <div className="info-row">
          <span className="info-label">{t('settings.dataDirectory')}</span>
          <span className="info-value info-path" title={storageInfo?.directory}>
            {storageInfo?.directory || t('settings.storageLoading')}
          </span>
          <GlowButton variant="ghost" size="sm" onClick={openStorageDirectory} disabled={!storageInfo}>
            <FolderOpen size={14} />
            {t('settings.openStorage')}
          </GlowButton>
        </div>
        <div className="info-row">
          <span className="info-label">{t('settings.dbPath')}</span>
          <span className="info-value info-path" title={storageInfo?.databasePath}>
            {storageInfo?.databasePath || t('settings.storageLoading')}
          </span>
        </div>
        {storageInfo?.fallback && (
          <div className="storage-fallback-message" role="status">
            {t('settings.storageFallback', { path: storageInfo.directory })}
          </div>
        )}
        {storageMessage && <div className="system-setting-message" role="status">{storageMessage}</div>}
        <div className="info-row">
          <span className="info-label">{t('settings.wsCount')}</span>
          <span className="info-value">{workspaces.length}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('settings.swCount')}</span>
          <span className="info-value">{software.length}</span>
        </div>
      </GlassCard>

      {/* 危险操作区 */}
      <GlassCard className="settings-section" hover={false}>
        <h3>{t('settings.danger')}</h3>
        <div className="danger-zone">
          <p className="danger-desc">
            {t('settings.dangerDesc')}
          </p>
          <GlowButton
            variant="ghost"
            size="md"
            className="danger-btn"
            disabled={clearing}
            onClick={handleClearAll}
          >
            {clearing ? t('settings.clearing') : t('settings.clearAll')}
          </GlowButton>
        </div>
      </GlassCard>

      {/* 底部版权信息 */}
      <p className="copyright">LaunchPad © 2026</p>
    </div>
  )
}

export default Settings
