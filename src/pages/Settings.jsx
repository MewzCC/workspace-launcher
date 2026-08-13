// 设置页面：应用信息 / 数据信息 / 危险操作区 / 版权信息
import React, { useEffect, useState } from 'react'
import {
  AppWindow,
  Bug,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  FileInput,
  FolderOpen,
  History,
  LoaderCircle,
  Power,
  RefreshCcw,
  Rocket,
  Star
} from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import UpdateHistoryModal from '../components/UpdateHistoryModal'
import { useConfirmDialog } from '../components/ConfirmDialog'
import {
  appVersion,
  workspaceApi,
  softwareApi,
  externalApi,
  storageApi,
  systemApi,
  updateApi,
  dataApi,
  dialogApi,
  diagnosticsApi,
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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transferring, setTransferring] = useState('')
  const [dataMessage, setDataMessage] = useState('')
  const [copyingReport, setCopyingReport] = useState(false)
  const [diagnosticMessage, setDiagnosticMessage] = useState('')
  const [activeTab, setActiveTab] = useState('general')

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

  const refreshData = async () => {
    const [freshWorkspaces, freshSoftware] = await Promise.all([
      workspaceApi.list(),
      softwareApi.list()
    ])
    setWorkspaces(freshWorkspaces)
    setSoftware(freshSoftware)
  }

  const handleExportData = async () => {
    setDataMessage('')
    try {
      const filePath = await dialogApi.saveFile({
        title: t('settings.exportData'),
        defaultPath: `launchpad-backup-${new Date().toISOString().slice(0, 10)}.json`
      })
      if (!filePath) return
      setTransferring('export')
      await dataApi.export(filePath)
      setDataMessage(t('settings.exportSuccess', { path: filePath }))
    } catch (error) {
      setDataMessage(t('settings.exportFailed') + (error?.message || error))
    } finally {
      setTransferring('')
    }
  }

  const handleImportData = async () => {
    setDataMessage('')
    try {
      const filePath = await dialogApi.openFile([{ name: 'JSON', extensions: ['json'] }])
      if (!filePath) return
      const confirmed = await confirm({
        title: t('settings.importData'),
        message: t('settings.importConfirm'),
        confirmText: t('settings.importData'),
        tone: 'warning',
        icon: 'warning'
      })
      if (!confirmed) return
      setTransferring('import')
      const result = await dataApi.import(filePath)
      await refreshData()
      const stats = result?.stats || {}
      setDataMessage(t('settings.importSuccess', {
        workspaces: stats.workspaces || 0,
        software: stats.software || 0,
        scripts: stats.batScripts || 0,
        skipped: (stats.softwareSkipped || 0) + (stats.batScriptsSkipped || 0)
      }))
    } catch (error) {
      setDataMessage(t('settings.importFailed') + (error?.message || error))
    } finally {
      setTransferring('')
    }
  }

  const handleOpenLogs = async () => {
    try {
      await diagnosticsApi.openLogs()
      setDiagnosticMessage(t('settings.logsOpened'))
    } catch (error) {
      setDiagnosticMessage(error.message || t('settings.logsOpenFailed'))
    }
  }

  const handleCopyReport = async () => {
    setCopyingReport(true)
    setDiagnosticMessage('')
    try {
      await diagnosticsApi.copyReport()
      setDiagnosticMessage(t('settings.reportCopied'))
    } catch (error) {
      setDiagnosticMessage(error.message || t('settings.reportCopyFailed'))
    } finally {
      setCopyingReport(false)
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
      killBeforeLaunch: systemApi.setKillBeforeLaunch,
      updateNotify: systemApi.setUpdateNotify,
      updateMode: systemApi.setUpdateMode
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

  const settingsTabs = [
    { key: 'general', label: t('settings.tabGeneral'), icon: Rocket },
    { key: 'updates', label: t('settings.tabUpdates'), icon: Download },
    { key: 'data', label: t('settings.tabData'), icon: FolderOpen },
    { key: 'diagnostics', label: t('settings.tabDiagnostics'), icon: Bug }
  ]

  return (
    <div className="settings">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t('settings.title')}</h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </section>

      <div className="settings-tabs" role="tablist" aria-label={t('settings.title')}>
        {settingsTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={`settings-tab ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
      <>
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
      </>
      )}

      {activeTab === 'updates' && (
      <>
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
            variant="ghost"
            size="sm"
            onClick={() => setHistoryOpen(true)}
          >
            <History size={14} />
            {t('settings.updateHistory')}
          </GlowButton>
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
        <div className="update-settings-list">
          <div className="update-setting-row">
            <div className="system-setting-copy">
              <strong>{t('settings.updateNotify')}</strong>
              <span>{t('settings.updateNotifyDesc')}</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.updateNotify)}
              disabled={!systemSettings || savingSetting === 'updateNotify'}
              onChange={(event) => updateSystemSetting('updateNotify', event.target.checked)}
              ariaLabel={t('settings.updateNotify')}
            />
          </div>
          <div className="update-setting-row">
            <div className="system-setting-copy">
              <strong>{t('settings.updateMode')}</strong>
              <span>{t('settings.updateModeDesc')}</span>
            </div>
            <select
              className="update-mode-select"
              value={systemSettings?.updateMode || 'background'}
              disabled={!systemSettings || savingSetting === 'updateMode'}
              onChange={(event) => updateSystemSetting('updateMode', event.target.value)}
              aria-label={t('settings.updateMode')}
            >
              <option value="manual">{t('settings.updateModeManual')}</option>
              <option value="background">{t('settings.updateModeBackground')}</option>
              <option value="auto">{t('settings.updateModeAuto')}</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {historyOpen && <UpdateHistoryModal onClose={() => setHistoryOpen(false)} />}
      </>
      )}

      {activeTab === 'data' && (
      <>
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
        <div className="data-transfer-actions">
          <GlowButton variant="ghost" size="sm" onClick={handleExportData} disabled={transferring}>
            {transferring === 'export' ? <LoaderCircle size={14} className="process-spin" /> : <Download size={14} />}
            {t('settings.exportData')}
          </GlowButton>
          <GlowButton variant="ghost" size="sm" onClick={handleImportData} disabled={transferring}>
            {transferring === 'import' ? <LoaderCircle size={14} className="process-spin" /> : <FileInput size={14} />}
            {t('settings.importData')}
          </GlowButton>
        </div>
        {dataMessage && <div className="system-setting-message" role="status">{dataMessage}</div>}
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
      </>
      )}

      {activeTab === 'diagnostics' && (
      <>
      {/* 诊断与崩溃日志 */}
      <GlassCard className="settings-section diagnostics-card" hover={false}>
        <div className="repository-copy">
          <span className="repository-icon" aria-hidden="true"><FolderOpen size={24} /></span>
          <div>
            <h3>{t('settings.diagnostics')}</h3>
            <p className="repository-desc">{t('settings.diagnosticsDesc')}</p>
          </div>
        </div>
        <div className="diagnostics-actions">
          <GlowButton variant="ghost" size="sm" onClick={handleOpenLogs}>
            <FolderOpen size={14} />
            {t('settings.openLogs')}
          </GlowButton>
          <GlowButton variant="ghost" size="sm" onClick={handleCopyReport} disabled={copyingReport}>
            {copyingReport ? <LoaderCircle size={14} className="process-spin" /> : <ClipboardCopy size={14} />}
            {t('settings.copyReport')}
          </GlowButton>
          <GlowButton variant="ghost" size="sm" onClick={() => externalApi.open(`${repositoryUrl}/issues`)}>
            <Bug size={14} />
            {t('settings.reportIssue')}
          </GlowButton>
        </div>
        {diagnosticMessage && <div className="system-setting-message" role="status">{diagnosticMessage}</div>}
      </GlassCard>

      {/* 开源仓库 */}
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
      </>
      )}

      {/* 底部版权信息 */}
      <p className="copyright">LaunchPad © 2026</p>
    </div>
  )
}

export default Settings
