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
  Cat,
  PanelsTopLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Wrench
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
  const groups = [
    { key: 'work', icon: PanelsTopLeft, label: t('nav.workGroup'), items: [
      { key: 'dashboard', icon: Rocket }, { key: 'workspaces', icon: LayoutGrid },
      { key: 'software', icon: Box }, { key: 'automation', icon: Workflow }
    ] },
    { key: 'system', icon: Wrench, label: t('nav.systemGroup'), items: [
      { key: 'scan', icon: ScanLine }, { key: 'monitor', icon: Activity },
      { key: 'processes', icon: ListTree }
    ] }
  ]
  // 从 store 读取状态与 action
  const currentView = useStore((s) => s.currentView)
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const setCurrentView = useStore((s) => s.setCurrentView)
  const mobileNavOpen = useStore((s) => s.mobileNavOpen)
  const setMobileNav = useStore((s) => s.setMobileNav)

  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const sidebarRef = useRef(null)
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1025px)').matches)
  const [railGroup, setRailGroup] = useState(null)
  const rail = collapsed && desktop
  const [openGroup, setOpenGroup] = useState(() => {
    try { return localStorage.getItem('lp-nav-group') || 'work' } catch { return 'work' }
  })
  useEffect(() => {
    const group = groups.find((item) => item.items.some((child) => child.key === currentView))
    setOpenGroup(group?.key || '')
  }, [currentView])
  useEffect(() => {
    try { localStorage.setItem('lp-nav-group', openGroup) } catch { /* Storage may be unavailable. */ }
  }, [openGroup])
  useEffect(() => {
    if (!mobileNavOpen) return undefined
    const close = (event) => { if (event.key === 'Escape') setMobileNav(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [mobileNavOpen, setMobileNav])
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1025px)')
    const resized = () => { setDesktop(media.matches); setRailGroup(null) }
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [])
  useEffect(() => { setRailGroup(null) }, [rail, currentView])
  useEffect(() => {
    if (!railGroup) return undefined
    const closeOutside = (event) => {
      const group = event.target.closest?.(`[data-nav-group="${railGroup.key}"]`)
      if (!group || !sidebarRef.current?.contains(group)) setRailGroup(null)
    }
    const escape = (event) => {
      if (event.key !== 'Escape') return
      setRailGroup(null)
      sidebarRef.current?.querySelector(`[data-nav-group="${railGroup.key}"] .nav-group-trigger`)?.focus()
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', escape)
    }
  }, [railGroup])
  const openRailGroup = (group, trigger) => {
    const height = 48 + group.items.length * 44
    const top = Math.max(12, Math.min(trigger.getBoundingClientRect().top, window.innerHeight - height - 12))
    setRailGroup({ key: group.key, top })
  }
  const destination = (key, Icon, label, child = false) => (
    <button key={key} type="button" className={`nav-item ${child ? 'nav-child' : ''} ${currentView === key ? 'active' : ''}`}
      onClick={() => { setRailGroup(null); setCurrentView(key) }} title={rail ? undefined : label} aria-label={label}
      aria-current={currentView === key ? 'page' : undefined}>
      <Icon size={18} className="nav-icon" aria-hidden="true" />
      <span className="nav-label">{label}</span>
    </button>
  )

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
        ref={sidebarRef}
        className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${mobileNavOpen ? 'mobile-open' : ''}`}
        aria-label={t('nav.mainNav')}
      >
        {/* 顶部 Logo 区 */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <img src={launchpadIcon} alt="" />
          </div>
          <span className="sidebar-logo-text">LaunchPad</span>
          <button type="button" className="sidebar-collapse" onClick={toggleSidebar}
            aria-label={t(collapsed ? 'nav.expandSidebar' : 'nav.collapseSidebar')}
            title={t(collapsed ? 'nav.expandSidebar' : 'nav.collapseSidebar')} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
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
          {groups.map((group) => {
            const Icon = group.icon
            const expanded = rail ? railGroup?.key === group.key : openGroup === group.key
            const active = group.items.some((item) => item.key === currentView)
            return (
              <div className={`nav-group ${expanded ? 'is-open' : ''}`} key={group.key} data-nav-group={group.key}>
                <button type="button" className={`nav-item nav-group-trigger ${active ? 'is-current' : ''}`}
                  aria-expanded={expanded} aria-controls={`nav-group-${group.key}`}
                  aria-label={group.label} title={rail ? undefined : group.label}
                  onClick={(event) => {
                    if (rail) {
                      if (expanded) setRailGroup(null)
                      else openRailGroup(group, event.currentTarget)
                    } else setOpenGroup(expanded ? '' : group.key)
                  }}
                  onKeyDown={(event) => {
                    if (!rail || event.key !== 'ArrowDown') return
                    event.preventDefault()
                    openRailGroup(group, event.currentTarget)
                    requestAnimationFrame(() => sidebarRef.current?.querySelector(`#nav-group-${group.key} button`)?.focus())
                  }}>
                  <Icon size={18} className="nav-icon" aria-hidden="true" />
                  <span className="nav-label">{group.label}</span>
                  <ChevronDown size={14} className="nav-group-chevron" aria-hidden="true" />
                </button>
                <div id={`nav-group-${group.key}`} className={`nav-group-items ${rail ? 'nav-group-flyout' : ''}`} hidden={!expanded}
                  style={rail && expanded ? { top: railGroup.top } : undefined}>
                  {rail && <div className="nav-flyout-heading">{group.label}</div>}
                  {group.items.map((item) => destination(item.key, item.icon, t(`nav.${item.key}`), true))}
                </div>
              </div>
            )
          })}
          <div className="nav-separator" />
          {destination('pet-center', Cat, t('nav.petCenter'))}
        </nav>

        {/* 底部：主题切换 + 版本信息 */}
        <div className="sidebar-footer">
          {destination('settings', SettingsIcon, t('nav.settings'))}
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
