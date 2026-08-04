// 设置页面：应用信息 / 数据信息 / 危险操作区 / 版权信息
import React, { useEffect, useState } from 'react'
import { AppWindow, Code2, ExternalLink, Power, RefreshCcw, Rocket, Star } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import { workspaceApi, softwareApi, externalApi, systemApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import './Settings.css'

export function Settings() {
  const t = useT()
  const repositoryUrl = 'https://github.com/MewzCC/workspace-launcher'
  // 从 store 读取工作空间、软件列表及刷新动作
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setSoftware = useStore((s) => s.setSoftware)

  // 清除操作进行中标记，避免重复点击
  const [clearing, setClearing] = useState(false)
  const [systemSettings, setSystemSettings] = useState(null)
  const [savingSetting, setSavingSetting] = useState('')
  const [systemMessage, setSystemMessage] = useState('')

  useEffect(() => {
    systemApi.getPreferences().then((result) => {
      if (result?.error) setSystemMessage(result.error)
      else setSystemSettings(result)
    }).catch((error) => setSystemMessage(error.message))
  }, [])

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
    const confirmed = window.confirm(t('settings.clearConfirm'))
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
          <span className="info-value">1.3.0</span>
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
          <span className="info-label">{t('settings.dbPath')}</span>
          <span className="info-value">{t('settings.dbPathDesc')}</span>
        </div>
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
