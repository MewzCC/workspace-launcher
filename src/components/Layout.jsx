// 主布局组件：固定 Sidebar + 主区域，根据 currentView 渲染对应真实页面
import React from 'react'
import Sidebar from './Sidebar'
import { useStore } from '../store/useStore'
import Dashboard from '../pages/Dashboard'
import Workspaces from '../pages/Workspaces'
import SoftwareLibrary from '../pages/SoftwareLibrary'
import Automation from '../pages/Automation'
import ScanCenter from '../pages/ScanCenter'
import Monitor from '../pages/Monitor'
import Settings from '../pages/Settings'
import ProcessManager from '../pages/ProcessManager'
import PetCenter from '../pages/PetCenter'
import './Layout.css'

// 页面映射：key 对应 store.currentView，value 为页面组件
const PAGES = {
  dashboard: Dashboard,
  workspaces: Workspaces,
  software: SoftwareLibrary,
  automation: Automation,
  scan: ScanCenter,
  monitor: Monitor,
  processes: ProcessManager,
  'pet-center': PetCenter,
  settings: Settings,
}

export function Layout() {
  // 当前视图 key
  const currentView = useStore((s) => s.currentView)
  const PageComponent = PAGES[currentView] || Dashboard

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-view">
        <PageComponent />
      </main>
    </div>
  )
}

export default Layout
