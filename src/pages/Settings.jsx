// 设置页面：应用信息 / 数据信息 / 危险操作区 / 版权信息
import React, { useState } from 'react'
import { Code2, ExternalLink, Star } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import { workspaceApi, softwareApi, externalApi } from '../lib/ipc'
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
          <p className="page-subtitle">查看应用信息与管理数据</p>
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
          <span className="info-value">1.1.0</span>
        </div>
        <div className="info-row">
          <span className="info-label">技术栈</span>
          <span className="info-value">Electron + React + SQLite</span>
        </div>
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
