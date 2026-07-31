// 应用根组件：初始化加载工作空间与软件数据，订阅全局启动进度，渲染主布局
import { useEffect } from 'react'
import { Layout } from './components/Layout'
import { useStore } from './store/useStore'
import { workspaceApi, softwareApi, onLaunchProgress } from './lib/ipc'

function App() {
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setSoftware = useStore((s) => s.setSoftware)
  const updateLaunchProgress = useStore((s) => s.updateLaunchProgress)

  useEffect(() => {
    // 初始化加载工作空间和软件数据
    Promise.all([workspaceApi.list(), softwareApi.list()])
      .then(([workspaces, software]) => {
        setWorkspaces(workspaces)
        setSoftware(software)
      })
      .catch((err) => console.error('初始化数据加载失败:', err))
  }, [])

  useEffect(() => {
    // 全局订阅启动进度事件，常驻 App 保证切视图时进度不中断
    const unsubscribe = onLaunchProgress((progress) => {
      updateLaunchProgress(progress)
    })
    return unsubscribe
  }, [])

  return <Layout />
}

export default App
