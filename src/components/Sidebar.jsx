// 侧边栏组件：LaunchPad 品牌 + Lucide 图标导航 + 主题切换 + 响应式抽屉
// 桌面端固定 240px，移动端折叠为抽屉（通过汉堡按钮控制）
import React, { useEffect, useRef, useState } from 'react'
import {
  Rocket,
  LayoutGrid,
  Box,
  Workflow,
  ScanLine,
  Activity,
  ListTree,
  Settings as SettingsIcon,
  Sun,
  Moon,
  Menu,
  X,
  Globe,
  ChevronDown,
  Check,
  Cat
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { appVersion } from '../lib/ipc'
import launchpadIcon from '../assets/launchpad-icon.png'
import './Sidebar.css'

// 自定义语言下拉框：玻璃风格 + 展开动效，替代原生 select
function LanguageSelect() {
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // 点击外部或按 ESC 关闭
  useEffect(() => {
    if (!open) return undefined
    const handleClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false)
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleClick)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleClick)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const current =
    SUPPORTED_LANGUAGES.find((item) => item.code === language) || SUPPORTED_LANGUAGES[0]

  return (
    <span className="language-select" ref={ref}>
      <button
        type="button"
        className={`language-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('settings.language')}
      >
        <Globe size={14} className="language-select-globe" aria-hidden="true" />
        <span className="language-select-current">{current.label}</span>
        <ChevronDown
          size={14}
          className={`language-select-chevron ${open ? 'rotated' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="language-select-panel" role="listbox" aria-label={t('settings.language')}>
          {SUPPORTED_LANGUAGES.map((item) => {
            const active = language === item.code
            return (
              <button
                key={item.code}
                type="button"
                role="option"
                aria-selected={active}
                className={`language-option ${active ? 'active' : ''}`}
                onClick={() => {
                  setLanguage(item.code)
                  setOpen(false)
                }}
              >
                <span className="language-option-label">{item.label}</span>
                {active && <Check size={14} className="language-option-check" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}

// 导航项配置：key 与 store.currentView 对应，icon 为 Lucide 组件
function Sidebar() {
  const t = useT()
  const NAV_ITEMS = [
    { key: 'dashboard', icon: Rocket, label: t('nav.dashboard') },
    { key: 'workspaces', icon: LayoutGrid, label: t('nav.workspaces') },
    { key: 'software', icon: Box, label: t('nav.software') },
    { key: 'automation', icon: Workflow, label: t('nav.automation') },
    { key: 'scan', icon: ScanLine, label: t('nav.scan') },
    { key: 'monitor', icon: Activity, label: t('nav.monitor') },
    { key: 'processes', icon: ListTree, label: t('nav.processes') },
    { key: 'pet-center', icon: Cat, label: t('nav.petCenter') },
    { key: 'settings', icon: SettingsIcon, label: t('nav.settings') }
  ]
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
        aria-label={t('nav.openMenu')}
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
        aria-label={t('nav.mainNav')}
      >
        {/* 顶部 Logo 区 */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <img src={launchpadIcon} alt="" />
          </div>
          <span className="sidebar-logo-text">LaunchPad</span>
          {/* 移动端关闭按钮 */}
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setMobileNav(false)}
            aria-label={t('nav.closeMenu')}
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
            aria-label={t('nav.toggleTheme')}
            title={theme === 'dark' ? t('nav.toLight') : t('nav.toDark')}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? t('nav.lightMode') : t('nav.darkMode')}</span>
          </button>
          <div className="version-card">
            <p className="version-label">{t('nav.version')}</p>
            <div className="version-row">
              <span className="version-value">v{appVersion}</span>
              <LanguageSelect />
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
