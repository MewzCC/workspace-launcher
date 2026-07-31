// 侧边栏组件：LaunchPad 品牌 + Lucide 图标导航 + 主题切换 + 响应式抽屉
// 桌面端固定 240px，移动端折叠为抽屉（通过汉堡按钮控制）
import React from 'react'
import {
  Rocket,
  LayoutGrid,
  Box,
  Workflow,
  ScanLine,
  Activity,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Menu,
  X
} from 'lucide-react'
import { useStore } from '../store/useStore'
import './Sidebar.css'

// 导航项配置：key 与 store.currentView 对应，icon 为 Lucide 组件
const NAV_ITEMS = [
  { key: 'dashboard', icon: Rocket, label: '启动台' },
  { key: 'workspaces', icon: LayoutGrid, label: '应用管理' },
  { key: 'software', icon: Box, label: '软件库' },
  { key: 'automation', icon: Workflow, label: '自动化' },
  { key: 'scan', icon: ScanLine, label: '扫描中心' },
  { key: 'monitor', icon: Activity, label: '状态监控' },
  { key: 'settings', icon: SettingsIcon, label: '设置' }
]

function Sidebar() {
  // 从 store 读取状态与 action
  const currentView = useStore((s) => s.currentView)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const mobileNavOpen = useStore((s) => s.mobileNavOpen)
  const setMobileNav = useStore((s) => s.setMobileNav)

  return (
    <>
      {/* 移动端顶部汉堡按钮 */}
      <button
        type="button"
        className="mobile-menu-btn"
        onClick={() => setMobileNav(true)}
        aria-label="打开菜单"
      >
        <Menu size={20} />
      </button>

      {/* 移动端遮罩：点击关闭抽屉 */}
      {mobileNavOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileNav(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}
        aria-label="主导航"
      >
        {/* 顶部 Logo 区 */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Rocket size={18} />
          </div>
          <span className="sidebar-logo-text">LaunchPad</span>
          {/* 移动端关闭按钮 */}
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMobileNav(false)}
            aria-label="关闭菜单"
          >
            <X size={18} />
          </button>
        </div>

        {/* 导航列表 */}
        <nav className="nav-list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = currentView === item.key
            return (
              <button
                key={item.key}
                type="button"
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setCurrentView(item.key)}
                title={item.label}
              >
                <Icon size={18} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* 底部：主题切换 + 版本信息 */}
        <div className="sidebar-footer">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label="切换主题"
            title={theme === 'dark' ? '切换到亮色' : '切换到暗色'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? '亮色模式' : '暗色模式'}</span>
          </button>
          <div className="version-card">
            <p className="version-label">版本</p>
            <p className="version-value">v1.1.0</p>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
