// 侧边栏组件：Logo + 7 个导航项 + 底部折叠按钮
// 玻璃风格 + 折叠动画 + 当前项高亮
import React from 'react'
import { useStore } from '../store/useStore'
import './Sidebar.css'

// 导航项配置：key 与 store.currentView 对应
const NAV_ITEMS = [
  { key: 'dashboard', icon: '🏠', label: '首页' },
  { key: 'workspaces', icon: '🚀', label: '工作空间' },
  { key: 'software', icon: '📦', label: '软件库' },
  { key: 'automation', icon: '🧩', label: '自动化' },
  { key: 'scan', icon: '🔍', label: '软件扫描' },
  { key: 'monitor', icon: '📊', label: '状态监控' },
  { key: 'settings', icon: '⚙', label: '设置' }
]

function Sidebar() {
  // 从 store 读取状态与 action
  const currentView = useStore((s) => s.currentView)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const toggleSidebar = useStore((s) => s.toggleSidebar)

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      {/* 顶部 Logo 区：折叠时只显示图标 */}
      <div className="logo">
        <span className="logo-icon">⚡</span>
        <span className="logo-text">Workspace</span>
      </div>

      {/* 导航列表 */}
      <nav className="nav-list">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${currentView === item.key ? 'active' : ''}`}
            onClick={() => setCurrentView(item.key)}
            title={item.label}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 底部折叠按钮：展开时 ◀，折叠时 ▶ */}
      <button
        type="button"
        className="collapse-btn"
        onClick={toggleSidebar}
        title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
      >
        {sidebarCollapsed ? '▶' : '◀'}
      </button>
    </aside>
  )
}

export default Sidebar
