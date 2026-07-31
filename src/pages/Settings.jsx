// 设置页面：应用信息 / 数据信息 / 危险操作区 / 版权信息
import React, { useEffect, useState } from 'react'
import { AppWindow, Code2, ExternalLink, Power, RefreshCcw, Rocket, Star } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import Toggle from '../components/ui/Toggle'
import { workspaceApi, softwareApi, externalApi, systemApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import './Settings.css'

export function Settings() {
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
      setSystemMessage('设置已保存')
    } catch (error) {
      setSystemMessage(error.message || '设置保存失败')
    } finally {
      setSavingSetting('')
    }
  }

  // 清除所有数据：二次确认后逐个删除工作空间与软件，并刷新 store
  const handleClearAll = async () => {
    const confirmed = window.confirm('确定要清除所有数据吗？此操作不可恢复！')
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
          <h1 className="page-title">设置</h1>
          <p className="page-subtitle">管理系统托盘、开机启动、进程策略与本地数据</p>
        </div>
      </section>

      {/* 应用信息 */}
      <GlassCard className="settings-section" hover={false}>
        <h3>应用信息</h3>
        <div className="info-row">
          <span className="info-label">名称</span>
          <span className="info-value">LaunchPad</span>
        </div>
        <div className="info-row">
          <span className="info-label">版本</span>
          <span className="info-value">1.2.0</span>
        </div>
        <div className="info-row">
          <span className="info-label">技术栈</span>
          <span className="info-value">Electron + React + SQLite</span>
        </div>
      </GlassCard>

      <GlassCard className="settings-section system-settings-card" hover={false}>
        <div className="system-settings-heading">
          <span className="system-settings-icon" aria-hidden="true"><Rocket size={22} /></span>
          <div>
            <h3>系统与启动</h3>
            <p>让 LaunchPad 随时驻留，并控制工作空间启动前的进程行为。</p>
          </div>
          <span className="tray-live-badge"><span /> 托盘运行中</span>
        </div>

        <div className="system-setting-list">
          <div className="system-setting-row">
            <span className="system-setting-symbol"><Power size={18} /></span>
            <div className="system-setting-copy">
              <strong>开机自动启动</strong>
              <span>{systemSettings?.packaged === false ? '请在安装版或便携版中启用此功能' : '登录 Windows 后自动启动 LaunchPad'}</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.openAtLogin)}
              disabled={!systemSettings || savingSetting === 'openAtLogin' || systemSettings.packaged === false}
              onChange={(event) => updateSystemSetting('openAtLogin', event.target.checked)}
              ariaLabel="开机自动启动"
            />
          </div>

          <div className="system-setting-row">
            <span className="system-setting-symbol"><AppWindow size={18} /></span>
            <div className="system-setting-copy">
              <strong>开机后静默驻留托盘</strong>
              <span>通过开机启动进入时不显示主窗口，需要时从托盘唤起</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.startMinimized)}
              disabled={!systemSettings || !systemSettings.openAtLogin || savingSetting === 'startMinimized'}
              onChange={(event) => updateSystemSetting('startMinimized', event.target.checked)}
              ariaLabel="开机后静默驻留托盘"
            />
          </div>

          <div className="system-setting-row">
            <span className="system-setting-symbol"><Rocket size={18} /></span>
            <div className="system-setting-copy">
              <strong>关闭窗口时驻留托盘</strong>
              <span>点击关闭按钮仅隐藏窗口，托盘仍可快速启动工作空间</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.closeToTray)}
              disabled={!systemSettings || savingSetting === 'closeToTray'}
              onChange={(event) => updateSystemSetting('closeToTray', event.target.checked)}
              ariaLabel="关闭窗口时驻留托盘"
            />
          </div>

          <div className="system-setting-row process-policy-row">
            <span className="system-setting-symbol"><RefreshCcw size={18} /></span>
            <div className="system-setting-copy">
              <strong>启动前结束已有进程</strong>
              <span>按完整 EXE 路径结束工作空间中已经运行的软件，再重新启动</span>
            </div>
            <Toggle
              checked={Boolean(systemSettings?.killBeforeLaunch)}
              disabled={!systemSettings || savingSetting === 'killBeforeLaunch'}
              onChange={(event) => updateSystemSetting('killBeforeLaunch', event.target.checked)}
              ariaLabel="启动前结束已有进程"
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
            <h3>开源仓库</h3>
            <p className="repository-desc">
              查看源代码、下载最新版本，或提交功能建议与问题反馈。
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
          在 GitHub 查看
          <ExternalLink size={14} />
        </GlowButton>
      </GlassCard>

      {/* 数据信息 */}
      <GlassCard className="settings-section" hover={false}>
        <h3>数据信息</h3>
        <div className="info-row">
          <span className="info-label">数据库路径</span>
          <span className="info-value">存储在用户数据目录</span>
        </div>
        <div className="info-row">
          <span className="info-label">工作空间数量</span>
          <span className="info-value">{workspaces.length}</span>
        </div>
        <div className="info-row">
          <span className="info-label">软件数量</span>
          <span className="info-value">{software.length}</span>
        </div>
      </GlassCard>

      {/* 危险操作区 */}
      <GlassCard className="settings-section" hover={false}>
        <h3>危险操作</h3>
        <div className="danger-zone">
          <p className="danger-desc">
            清除所有工作空间与软件数据，此操作不可恢复。
          </p>
          <GlowButton
            variant="ghost"
            size="md"
            className="danger-btn"
            disabled={clearing}
            onClick={handleClearAll}
          >
            {clearing ? '清除中...' : '清除所有数据'}
          </GlowButton>
        </div>
      </GlassCard>

      {/* 底部版权信息 */}
      <p className="copyright">LaunchPad © 2026</p>
    </div>
  )
}

export default Settings
