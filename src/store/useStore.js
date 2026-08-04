// 全局状态管理：使用 zustand 创建应用 store
// 包含主题、语言、当前视图、侧边栏状态、工作空间/软件/日志数据、启动进度等状态
import { create } from 'zustand'
import { themeApi, languageApi } from '../lib/ipc'
import {
  translate,
  MESSAGES,
  DEFAULT_LANGUAGE,
  getInitialLanguage,
  LANGUAGE_STORAGE_KEY
} from '../i18n'

function createInitialScanSession() {
  return {
    mode: 'standard',
    drives: [],
    selectedDrive: '',
    dirPath: '',
    maxDepth: 4,
    scanning: false,
    cancelRequested: false,
    hasScanned: false,
    results: [],
    selected: {},
    adding: false,
    message: '',
    searchQuery: '',
    indexedResults: [],
    indexSearching: false,
    everythingAvailable: false
  }
}

// 主题初始化：读取本地存储，与 index.html 内联脚本保持一致，避免 SSR 闪烁
function getInitialTheme() {
  try {
    const saved = localStorage.getItem('lp-theme')
    return saved === 'light' || saved === 'dark' ? saved : 'light'
  } catch (e) {
    return 'light'
  }
}

// 将主题应用到 <html> 标签、持久化，并同步到主进程（驱动原生菜单栏/标题栏配色）
function applyTheme(theme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  try {
    localStorage.setItem('lp-theme', theme)
  } catch (e) {
    /* 忽略存储异常 */
  }
  // 通知主进程同步原生 UI 主题（忽略失败，不影响渲染层）
  try {
    themeApi.set(theme)
  } catch (e) {
    /* 渲染层可能在 preload 就绪前调用，忽略 */
  }
}

// 应用语言：持久化本地存储并同步主进程，同时更新 <html> lang 属性
function applyLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language.split('-')[0] || 'zh-CN'
  } catch (e) {
    /* 忽略存储异常 */
  }
  try {
    languageApi.set(language)
  } catch (e) {
    /* preload 可能未就绪，忽略 */
  }
}

export const useStore = create((set, get) => ({
  // ===== State =====
  // 主题：'dark' | 'light'
  theme: getInitialTheme(),
  // 界面语言：'zh-CN' | 'en-US' | 'ja-JP'
  language: getInitialLanguage(),
  // 当前页面 key，默认首页
  currentView: 'dashboard',
  // 侧边栏是否折叠（桌面端）
  sidebarCollapsed: false,
  // 移动端侧边栏抽屉是否展开
  mobileNavOpen: false,
  // 工作空间列表
  workspaces: [],
  // 软件列表
  software: [],
  // 日志列表
  logs: [],
  // 启动状态：null 或 {workspaceId, progress, phase, active}
  launching: null,
  // 当前监控的工作空间 id
  activeWorkspaceId: null,
  // 扫描中心会话：切换页面时保留结果、筛选条件与扫描状态
  scanSession: createInitialScanSession(),

  // ===== Actions =====
  // 切换主题（明暗）
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
  // 直接设置主题
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  // 切换界面语言
  setLanguage: (language) => {
    const next = MESSAGES[language] ? language : DEFAULT_LANGUAGE
    applyLanguage(next)
    set({ language: next })
  },

  // 当前界面语言对应的翻译函数
  t: (key, params) => translate(get().language, key, params),

  // 切换当前页面，同时关闭移动端抽屉
  setCurrentView: (view) => set({ currentView: view, mobileNavOpen: false }),

  // 切换侧边栏折叠状态
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // 切换移动端侧边栏抽屉
  toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
  setMobileNav: (open) => set({ mobileNavOpen: open }),

  // 设置工作空间列表
  setWorkspaces: (list) => set({ workspaces: list || [] }),
  // 设置软件列表
  setSoftware: (list) => set({ software: list || [] }),
  // 设置日志列表
  setLogs: (list) => set({ logs: list || [] }),

  updateScanSession: (patch) =>
    set((state) => ({
      scanSession: {
        ...state.scanSession,
        ...(typeof patch === 'function' ? patch(state.scanSession) : patch)
      }
    })),
  resetScanSession: () => set({ scanSession: createInitialScanSession() }),

  // 开始启动工作空间：初始化 launching 对象
  startLaunch: (workspaceId) =>
    set({
      launching: {
        workspaceId,
        progress: [],
        phase: 'pre_script',
        active: true
      }
    }),

  // 更新启动进度：追加进度项，更新阶段；阶段为 done 时标记为非活跃
  updateLaunchProgress: (progress) =>
    set((state) => {
      if (!state.launching) return state
      const newProgress = [...state.launching.progress, progress]
      const newPhase = progress.phase || state.launching.phase
      const active = progress.phase !== 'done'
      return {
        launching: {
          ...state.launching,
          progress: newProgress,
          phase: newPhase,
          active
        }
      }
    }),

  // 停止启动：清空 launching
  stopLaunch: () => set({ launching: null }),

  // 设置当前监控的工作空间 id
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id })
}))
