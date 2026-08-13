// 应用根组件：初始化加载工作空间与软件数据，订阅全局启动进度，渲染主布局
import { useEffect, useState } from 'react'
import { Layout } from './components/Layout'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import Modal from './components/Modal'
import { useStore } from './store/useStore'
import { useT } from './hooks/useT'
import { workspaceApi, softwareApi, onLaunchProgress, updateApi, diagnosticsApi } from './lib/ipc'
import { renderMarkdown } from './lib/markdown'

function App() {
  const t = useT()
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setSoftware = useStore((s) => s.setSoftware)
  const updateLaunchProgress = useStore((s) => s.updateLaunchProgress)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  // 刚完成自动更新时展示“本次更新内容”弹窗
  const [lastUpdate, setLastUpdate] = useState(null)

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
    // 初始同步主题到主进程，使原生菜单栏/标题栏跟随应用主题
    setTheme(theme)
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 全局订阅启动进度事件，常驻 App 保证切视图时进度不中断
    const unsubscribe = onLaunchProgress((progress) => {
      updateLaunchProgress(progress)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    // 读取上次自动更新记录：版本一致说明刚安装完成，展示更新内容弹窗。
    let mounted = true
    updateApi.lastResult()
      .then((record) => {
        if (mounted && record && record.version) setLastUpdate(record)
      })
      .catch(() => {
        // 读取失败不阻塞启动。
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    // 渲染层异常上报到本地崩溃日志，便于用户反馈时复制诊断信息。
    const report = (eventName, details) => {
      try {
        diagnosticsApi.report(eventName, details)
      } catch (_) {
        // 上报失败不能影响渲染层。
      }
    }
    const handleError = (event) => {
      report('error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      })
    }
    const handleRejection = (event) => {
      const reason = event.reason
      report('unhandled-rejection', {
        message: reason?.message || String(reason),
        stack: reason?.stack
      })
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  const closeLastUpdate = () => {
    setLastUpdate(null)
    updateApi.clearLastResult().catch(() => {})
  }

  return (
    <ConfirmDialogProvider>
      <Layout />
      {lastUpdate && (
        <Modal
          title={t('settings.updateInstalledTitle', { version: lastUpdate.version })}
          onClose={closeLastUpdate}
          onSave={closeLastUpdate}
          saveText={t('settings.updateGotIt')}
        >
          <p className="update-installed-intro">{t('settings.updateInstalledIntro')}</p>
          {lastUpdate.releaseName && (
            <div className="update-installed-meta">
              <strong>{lastUpdate.releaseName}</strong>
              {lastUpdate.releaseDate && (
                <span>{new Date(lastUpdate.releaseDate).toLocaleDateString()}</span>
              )}
            </div>
          )}
          {lastUpdate.releaseNotes ? (
            <div
              className="update-installed-notes md-render"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(lastUpdate.releaseNotes) }}
            />
          ) : (
            <p className="update-installed-empty">{t('settings.updateNoNotes')}</p>
          )}
        </Modal>
      )}
    </ConfirmDialogProvider>
  )
}

export default App
