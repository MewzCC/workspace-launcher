// 全局状态管理：使用 zustand 创建应用 store
// 包含当前视图、侧边栏折叠、工作空间/软件/日志数据、启动进度等状态
import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // ===== State =====
  // 当前页面 key，默认首页
  currentView: 'dashboard',
  // 侧边栏是否折叠
  sidebarCollapsed: false,
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

  // ===== Actions =====
  // 切换当前页面
  setCurrentView: (view) => set({ currentView: view }),

  // 切换侧边栏折叠状态
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // 设置工作空间列表
  setWorkspaces: (list) => set({ workspaces: list || [] }),
  // 设置软件列表
  setSoftware: (list) => set({ software: list || [] }),
  // 设置日志列表
  setLogs: (list) => set({ logs: list || [] }),

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
