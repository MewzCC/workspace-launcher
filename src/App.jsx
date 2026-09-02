// 应用根组件：初始化加载工作空间与软件数据，订阅全局启动进度，渲染主布局
import { useEffect, useRef, useState } from 'react'
import { Download, Sparkles, TimerOff, X } from 'lucide-react'
import { Layout } from './components/Layout'
import { ConfirmDialogProvider } from './components/ConfirmDialog'
import Modal from './components/Modal'
import GlowButton from './components/ui/GlowButton'
import { useStore } from './store/useStore'
import { useT } from './hooks/useT'
import { workspaceApi, softwareApi, onLaunchProgress, updateApi, diagnosticsApi, systemApi, onUpdateStatus, onNavigate } from './lib/ipc'
import { renderMarkdown } from './lib/markdown'

function App() {
  const t = useT()
  const setWorkspaces = useStore((s) => s.setWorkspaces)
  const setSoftware = useStore((s) => s.setSoftware)
  const updateLaunchProgress = useStore((s) => s.updateLaunchProgress)
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const setCurrentView = useStore((s) => s.setCurrentView)
  // 刚完成自动更新时展示“本次更新内容”弹窗
  const [lastUpdate, setLastUpdate] = useState(null)
  // 检测到新版本时展示提示弹窗（更新/跳过此版本/取消）
  const [availableUpdate, setAvailableUpdate] = useState(null)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const dismissedVersionRef = useRef('')

  useEffect(() => {
    // 初始化加载工作空间和软件数据
    Promise.all([workspaceApi.list(), softwareApi.list()])
      .then(([workspaces, software]) => {
        setWorkspaces(workspaces)
        setSoftware(software)
      })
      .catch((err) => console.error('初始化数据加载失败:', err))
  }, [])

  useEffect(() => onNavigate((view) => setCurrentView(view)), [setCurrentView])

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
    // 读取“新版本提醒”开关；检测到新版本时按开关决定是否弹窗。
    let mounted = true
    systemApi.getPreferences()
      .then((prefs) => {
        if (mounted && prefs && typeof prefs.updateNotify === 'boolean') {
          setNotifyEnabled(prefs.updateNotify)
        }
      })
      .catch(() => {})
    const unsubscribe = onUpdateStatus((update) => {
      if (!mounted || !update) return
      if (
        update.state === 'available' &&
        notifyEnabled &&
        update.version &&
        dismissedVersionRef.current !== update.version
      ) {
        setAvailableUpdate(update)
      }
      if (update.state === 'skipped') setAvailableUpdate(null)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [notifyEnabled])

  const handleUpdateNow = () => {
    setAvailableUpdate(null)
    updateApi.download().catch(() => {})
  }

  const handleSkipVersion = () => {
    dismissedVersionRef.current = availableUpdate?.version || ''
    setAvailableUpdate(null)
    updateApi.skip().catch(() => {})
  }

  const handleDismissUpdate = () => {
    dismissedVersionRef.current = availableUpdate?.version || ''
    setAvailableUpdate(null)
  }

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
      {availableUpdate && !lastUpdate && (
        <Modal
          className="update-modal"
          bodyClassName="update-modal__body"
          title={(
            <span className="update-modal__title">
              <span className="update-modal__title-icon"><Sparkles size={18} /></span>
              <span>{t('settings.updateAvailableTitle', { version: availableUpdate.version })}</span>
            </span>
          )}
          onClose={handleDismissUpdate}
        >
          <div className="update-modal__content">
            <p className="update-installed-intro">
              <span aria-hidden="true" />
              {t('settings.updateAvailableIntro')}
            </p>
            {availableUpdate.releaseNotes ? (
              <div
                className="update-installed-notes md-render"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(availableUpdate.releaseNotes) }}
              />
            ) : (
              <p className="update-installed-empty">{t('settings.updateNoNotes')}</p>
            )}
          </div>
          <div className="update-available-actions">
            <GlowButton className="update-action update-action--cancel" variant="ghost" size="sm" onClick={handleDismissUpdate}>
              <X size={15} /> {t('settings.updateCancel')}
            </GlowButton>
            <GlowButton className="update-action update-action--skip" variant="ghost" size="sm" onClick={handleSkipVersion}>
              <TimerOff size={15} /> {t('settings.updateSkipVersion')}
            </GlowButton>
            <GlowButton className="update-action update-action--primary" variant="primary" size="sm" onClick={handleUpdateNow}>
              <Download size={16} /> {t('settings.updateNow')}
            </GlowButton>
          </div>
        </Modal>
      )}
    </ConfirmDialogProvider>
  )
}

export default App
