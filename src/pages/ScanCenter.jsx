// 软件扫描中心页面：自动发现已安装应用，批量添加到软件库
// 支持三种扫描模式：
// 1. 标准扫描：开始菜单 .lnk + Program Files（快速，覆盖已安装应用）
// 2. 盘符扫描：递归扫描指定盘符下所有 .exe（适合 D:/E: 等数据盘）
// 3. 目录扫描：扫描指定目录的 .exe（精确控制范围）
import React, { useMemo, useEffect, useRef } from 'react'
import { CircleStop, Search, Trash2, X } from 'lucide-react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import SoftwareIcon, { preloadSoftwareIcons } from '../components/SoftwareIcon'
import { softwareApi, dialogApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import { useT } from '../hooks/useT'
import './ScanCenter.css'

// 扫描结果单行：显示图标（真实图标或 emoji 回退）
function ScanResultItem({ r, added, checked, onToggle }) {
  const t = useT()
  return (
    <div className={`scan-item ${added ? 'added' : ''}`}>
      <input
        type="checkbox"
        checked={added || checked}
        disabled={added}
        onChange={() => onToggle(r.path)}
      />
      <SoftwareIcon path={r.path} fallback={r.icon || '📦'} iconMode={r.icon_mode} size="md" />
      <div className="scan-item-info">
        <div className="scan-item-name">{r.name}</div>
        <div className="scan-item-path" title={r.path}>{r.path}</div>
      </div>
      {r.source && (
        <span className={`scan-item-source ${r.source}`}>
          {r.source === 'everything' ? 'Everything' : t('scan.windowsApp')}
        </span>
      )}
      {added && <span className="scan-item-badge">{t('scan.addedBadge')}</span>}
    </div>
  )
}

// 扫描模式
const MODE_STANDARD = 'standard'
const MODE_DRIVE = 'drive'
const MODE_DIRECTORY = 'directory'

function ScanCenter() {
  const t = useT()
  const software = useStore((s) => s.software)
  const setSoftware = useStore((s) => s.setSoftware)
  const scanSession = useStore((s) => s.scanSession)
  const updateScanSession = useStore((s) => s.updateScanSession)
  const {
    mode,
    drives,
    selectedDrive,
    dirPath,
    maxDepth,
    scanning,
    cancelRequested,
    hasScanned,
    results,
    selected,
    adding,
    message,
    searchQuery,
    indexedResults,
    indexSearching,
    everythingAvailable
  } = scanSession
  const setSessionValue = (key, value) =>
    updateScanSession((session) => ({
      [key]: typeof value === 'function' ? value(session[key]) : value
    }))
  const setMode = (value) => setSessionValue('mode', value)
  const setDrives = (value) => setSessionValue('drives', value)
  const setSelectedDrive = (value) => setSessionValue('selectedDrive', value)
  const setDirPath = (value) => setSessionValue('dirPath', value)
  const setMaxDepth = (value) => setSessionValue('maxDepth', value)
  const setScanning = (value) => setSessionValue('scanning', value)
  const setCancelRequested = (value) => setSessionValue('cancelRequested', value)
  const setHasScanned = (value) => setSessionValue('hasScanned', value)
  const setResults = (value) => setSessionValue('results', value)
  const setSelected = (value) => setSessionValue('selected', value)
  const setAdding = (value) => setSessionValue('adding', value)
  const setMessage = (value) => setSessionValue('message', value)
  const setSearchQuery = (value) => setSessionValue('searchQuery', value)
  const setIndexedResults = (value) => setSessionValue('indexedResults', value)
  const setIndexSearching = (value) => setSessionValue('indexSearching', value)
  const setEverythingAvailable = (value) => setSessionValue('everythingAvailable', value)
  const searchRequestRef = useRef(0)

  // 进入页面时加载盘符列表
  useEffect(() => {
    let mounted = true
    softwareApi
      .getDrives()
      .then((list) => {
        if (!mounted) return
        if (Array.isArray(list)) {
          setDrives(list)
          // 默认选第一个非系统盘（若有），否则选 C
          const first = list.find((d) => d !== 'C') || list[0] || ''
          if (!selectedDrive) setSelectedDrive(first)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // 扫描结果变化时批量预加载图标到共享缓存
  useEffect(() => {
    const items = [...results, ...indexedResults]
    if (items.length === 0) return
    preloadSoftwareIcons(items.map((r) => r.path).filter(Boolean))
  }, [results, indexedResults])

  // 软件库中已有路径集合（小写，用于去重判断）
  const existingPaths = useMemo(() => {
    const set = new Set()
    for (const s of software) {
      if (s.path) set.add(s.path.toLowerCase())
    }
    return set
  }, [software])

  // 可选项目：扫描结果中未存在于软件库的项
  const normalizedQuery = searchQuery.trim().toLowerCase()

  useEffect(() => {
    const requestId = ++searchRequestRef.current
    if (normalizedQuery.length < 2) {
      setIndexedResults([])
      setIndexSearching(false)
      return () => {}
    }

    setIndexSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await softwareApi.searchInstalled(normalizedQuery)
        if (requestId !== searchRequestRef.current) return
        if (response?.error) throw new Error(response.error)
        setIndexedResults(Array.isArray(response?.items) ? response.items : [])
        setEverythingAvailable(Boolean(response?.everythingAvailable))
      } catch (error) {
        if (requestId === searchRequestRef.current) {
          console.error('索引搜索失败:', error)
          setIndexedResults([])
        }
      } finally {
        if (requestId === searchRequestRef.current) setIndexSearching(false)
      }
    }, 220)

    return () => window.clearTimeout(timer)
  }, [normalizedQuery])

  const filteredResults = useMemo(() => {
    if (!normalizedQuery) return results
    const localMatches = results.filter((item) =>
      String(item.name || '').toLowerCase().includes(normalizedQuery)
    )
    const seen = new Set()
    return [...indexedResults, ...localMatches].filter((item) => {
      const key = String(item.path || '').toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [results, indexedResults, normalizedQuery])

  const availableResults = useMemo(() => {
    const seen = new Set()
    return [...results, ...indexedResults].filter((item) => {
      const key = String(item.path || '').toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [results, indexedResults])

  const selectableItems = filteredResults.filter(
    (r) => !existingPaths.has((r.path || '').toLowerCase())
  )
  // 全选状态：仅针对可选项目
  const allSelected =
    selectableItems.length > 0 && selectableItems.every((r) => selected[r.path])
  // 当前选中数量
  const selectedCount = Object.keys(selected).filter((k) => selected[k]).length
  const showResultPanel =
    results.length > 0 || indexedResults.length > 0 || normalizedQuery.length > 0 || indexSearching

  // 执行扫描：根据模式调用不同接口
  const handleScan = async () => {
    if (mode === MODE_DRIVE && !selectedDrive) {
      setMessage(t('scan.selectDrive'))
      return
    }
    if (mode === MODE_DIRECTORY && !dirPath) {
      setMessage(t('scan.selectDir'))
      return
    }

    setScanning(true)
    setCancelRequested(false)
    setMessage('')
    try {
      let list
      if (mode === MODE_STANDARD) {
        list = await softwareApi.scan()
      } else if (mode === MODE_DRIVE) {
        list = await softwareApi.scanDrive(selectedDrive, { maxDepth })
      } else {
        list = await softwareApi.scanDirectory(dirPath, { maxDepth })
      }
      if (list?.cancelled) {
        setMessage(t('scan.cancelled'))
      } else if (list?.error) {
        setMessage(t('scan.scanFailed') + list.error)
      } else {
        setResults(Array.isArray(list) ? list : [])
        setSelected({})
        setHasScanned(true)
      }
    } catch (e) {
      setMessage(t('scan.scanFailed') + (e.message || t('common.unknownError')))
    } finally {
      setScanning(false)
      setCancelRequested(false)
    }
  }

  const handleCancelScan = async () => {
    if (!scanning || cancelRequested) return
    setCancelRequested(true)
    setMessage(t('scan.cancelling'))
    try {
      const response = await softwareApi.cancelScan()
      if (response?.error) throw new Error(response.error)
    } catch (error) {
      setCancelRequested(false)
      setMessage(t('scan.cancelFailed') + (error.message || t('common.unknownError')))
    }
  }

  const handleClearResults = () => {
    searchRequestRef.current += 1
    updateScanSession({
      hasScanned: false,
      results: [],
      selected: {},
      adding: false,
      message: '',
      searchQuery: '',
      indexedResults: [],
      indexSearching: false,
      everythingAvailable: false,
      cancelRequested: false
    })
  }

  // 选择目录：调用原生对话框
  const handlePickDirectory = async () => {
    const picked = await dialogApi.openDirectory()
    if (!picked) return
    setDirPath(picked)
  }

  // 切换单个选中
  const toggleSelect = (path) => {
    setSelected((s) => {
      const next = { ...s }
      if (next[path]) delete next[path]
      else next[path] = true
      return next
    })
  }

  // 全选/取消全选（仅可选项目）
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected({})
    } else {
      const next = {}
      selectableItems.forEach((r) => {
        next[r.path] = true
      })
      setSelected(next)
    }
  }

  // 添加选中项到软件库
  const handleAddSelected = async () => {
    const items = availableResults.filter((r) => selected[r.path])
    if (items.length === 0) return
    setAdding(true)
    try {
      if (items.length > 20) {
        setMessage(t('scan.tooMany'))
        return
      }
      const res = await softwareApi.bulkCreateValidated(items)
      if (res && res.error) {
        setMessage(t('scan.addFailed') + res.error)
        return
      }
      // 刷新软件库
      const list = await softwareApi.list()
      setSoftware(list)
      const createdCount = res.created?.length || 0
      const failed = res.failed || []
      const failText = failed.length
        ? t('scan.addedFailedList', { count: failed.length, names: failed.slice(0, 3).map((item) => item.name).join('、') })
        : ''
      setMessage(t('scan.addedResult', { count: createdCount, failed: failText }))
      // 清空选中
      setSelected({})
    } catch (e) {
      setMessage(t('scan.addFailed') + (e.message || t('common.unknownError')))
    } finally {
      setAdding(false)
    }
  }

  // 切换模式时保留搜索、扫描结果与选择状态
  const switchMode = (next) => {
    if (next === mode) return
    setMode(next)
  }

  return (
    <div className="scan-page">
      <section className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">{t('scan.title')}</h1>
          <p className="page-subtitle">{t('scan.subtitle')}</p>
        </div>
        <div className="page-actions">
          {(hasScanned || results.length > 0 || searchQuery) && (
            <GlowButton
              variant="ghost"
              onClick={handleClearResults}
              disabled={scanning || adding}
            >
              <Trash2 size={16} aria-hidden="true" />
              {t('scan.clearResults')}
            </GlowButton>
          )}
          {scanning ? (
            <GlowButton
              variant="ghost"
              className="scan-cancel-button"
              onClick={handleCancelScan}
              disabled={cancelRequested}
            >
              <CircleStop size={16} aria-hidden="true" />
              {cancelRequested ? t('scan.cancelling') : t('scan.cancel')}
            </GlowButton>
          ) : (
            <GlowButton variant="primary" onClick={handleScan}>
              {hasScanned ? t('scan.rescan') : t('scan.start')}
            </GlowButton>
          )}
        </div>
      </section>

      {/* 扫描模式切换 */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === MODE_STANDARD ? 'active' : ''}`}
          onClick={() => switchMode(MODE_STANDARD)}
          type="button"
        >
          {t('scan.standard')}
        </button>
        <button
          className={`mode-tab ${mode === MODE_DRIVE ? 'active' : ''}`}
          onClick={() => switchMode(MODE_DRIVE)}
          type="button"
        >
          {t('scan.drive')}
        </button>
        <button
          className={`mode-tab ${mode === MODE_DIRECTORY ? 'active' : ''}`}
          onClick={() => switchMode(MODE_DIRECTORY)}
          type="button"
        >
          {t('scan.directory')}
        </button>
      </div>

      {/* 模式说明与参数 如果是标准模式不显示*/}  
      <div className="mode-panel" style={{ display: mode === MODE_STANDARD ? 'none' : 'block' }}>
        {mode === MODE_DRIVE && (
          <>
            <div className="mode-desc">
              {t('scan.driveDesc')}
            </div>
            <div className="mode-form">
              <div className="form-group">
                <label className="form-label">{t('scan.driveLabel')}</label>
                <select
                  className="form-select"
                  value={selectedDrive}
                  onChange={(e) => setSelectedDrive(e.target.value)}
                >
                  {drives.length === 0 && <option value="">{t('scan.noDrives')}</option>}
                  {drives.map((d) => (
                    <option key={d} value={d}>
                      {d}:\
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('scan.maxDepth', { depth: maxDepth < 0 ? t('scan.unlimited') : maxDepth })}</label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={maxDepth < 0 ? 10 : maxDepth}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMaxDepth(v >= 10 ? -1 : v)
                  }}
                />
                <span className="form-hint">
                  {maxDepth < 0 ? t('scan.unlimitedDepth') : t('scan.depthHint', { depth: maxDepth })}
                </span>
              </div>
            </div>
          </>
        )}
        {mode === MODE_DIRECTORY && (
          <>
            <div className="mode-desc">
              {t('scan.directoryDesc')}
            </div>
            <div className="mode-form">
              <div className="form-group full">
                <label className="form-label">{t('scan.dirPath')}</label>
                <div className="path-row">
                  <input
                    className="form-input"
                    value={dirPath}
                    onChange={(e) => setDirPath(e.target.value)}
                    placeholder={t('scan.dirPlaceholder')}
                  />
                  <GlowButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handlePickDirectory}
                  >
                    {t('scan.pickDirectory')}
                  </GlowButton>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('scan.maxDepth', { depth: maxDepth < 0 ? t('scan.unlimited') : maxDepth })}</label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={maxDepth < 0 ? 10 : maxDepth}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMaxDepth(v >= 10 ? -1 : v)
                  }}
                />
                <span className="form-hint">
                  {maxDepth < 0 ? t('scan.unlimitedDepth') : t('scan.depthHint', { depth: maxDepth })}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="scan-search">
        <Search size={17} aria-hidden="true" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t('scan.searchPlaceholder')}
          aria-label={t('scan.searchAria')}
        />
        {normalizedQuery.length >= 2 && (
          <span className={`scan-search-engine ${indexSearching ? 'searching' : ''}`}>
            {indexSearching
              ? t('scan.indexSearching')
              : everythingAvailable
                ? t('scan.everythingWindows')
                : t('scan.windowsIndex')}
          </span>
        )}
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} aria-label={t('common.clear')}>
            <X size={15} />
          </button>
        )}
      </div>

      {/* 扫描中状态：旋转图标 + 提示文字 */}
      {scanning && (
        <div className="scanning">
          <span className="scanner-icon">🔍</span>
          <span>{cancelRequested ? t('scan.stopping') : t('scan.scanningText')}</span>
        </div>
      )}

      {/* 操作提示消息 */}
      {message && <div className="scan-message">{message}</div>}

      {/* 扫描结果：全选 + 添加按钮 + 列表 */}
      {showResultPanel && (
        <>
          <div className="scan-result-header">
            <label className="select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              <span>{t('scan.selectAll')}</span>
            </label>
            <div className="result-summary">
              {normalizedQuery
                ? t('scan.found', { count: filteredResults.length })
                : t('scan.showResults', { count: results.length })}
              {t('scan.selectedSuffix', { count: selectedCount })}
            </div>
            <GlowButton
              variant="secondary"
              onClick={handleAddSelected}
              disabled={selectedCount === 0 || adding}
            >
              {adding ? t('scan.verifying') : t('scan.verifyAdd')}
            </GlowButton>
          </div>
          <div className="scan-list">
            {filteredResults.map((r, idx) => {
              // 已存在于软件库则标记"已添加"
              const added = existingPaths.has((r.path || '').toLowerCase())
              const checked = !!selected[r.path]
              return (
                <ScanResultItem
                  key={(r.path || '') + idx}
                  r={r}
                  added={added}
                  checked={checked}
                  onToggle={toggleSelect}
                />
              )
            })}
            {filteredResults.length === 0 && (
              <div className="scan-no-results">
                {indexSearching ? t('scan.searchingIndex') : t('scan.noMatch')}
              </div>
            )}
          </div>
        </>
      )}

      {/* 空状态：未扫描或扫描后无结果 */}
      {!scanning && !showResultPanel && !message && (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>
            {hasScanned
              ? t('scan.noApps')
              : t('scan.helpText')}
          </p>
        </GlassCard>
      )}
    </div>
  )
}

export { ScanCenter }
export default ScanCenter
