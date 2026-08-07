// 设置页面：应用信息 / 数据信息 / 危险操作区 / 版权信息
import React, { useState } from 'react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { workspaceApi, softwareApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import './Settings.css'

export function Settings() {
  const t = useT()
  const confirm = useConfirmDialog()
  // 从 store 读取工作空间、软件列表及刷新动作
  const workspaces = useStore((s) => s.workspaces)
  const software = useStore((s) => s.software)
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setSoftware = useStore((s) => s.setSoftware)

  // 清除操作进行中标记，避免重复点击
  const [clearing, setClearing] = useState(false)

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
          <span className="info-value">{window.api?.version || '0.0.0'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">{t('settings.stack')}</span>
          <span className="info-value">Electron + React + SQLite</span>
        </div>
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
      <p className="copyright">LaunchPad © 2026 by MewzCC</p>
    </div>
  )
}

export default Settings
