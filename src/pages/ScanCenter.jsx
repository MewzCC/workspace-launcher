// 软件扫描中心页面：自动发现已安装应用，批量添加到软件库
// 支持三种扫描模式：
// 1. 标准扫描：开始菜单 .lnk + Program Files（快速，覆盖已安装应用）
// 2. 盘符扫描：递归扫描指定盘符下所有 .exe（适合 D:/E: 等数据盘）
// 3. 目录扫描：扫描指定目录的 .exe（精确控制范围）
import React, { useState, useMemo, useEffect } from 'react'
import GlassCard from '../components/ui/GlassCard'
import GlowButton from '../components/ui/GlowButton'
import SoftwareIcon, { preloadSoftwareIcons } from '../components/SoftwareIcon'
import { softwareApi, dialogApi } from '../lib/ipc'
import { useStore } from '../store/useStore'
import './ScanCenter.css'

// 扫描结果单行：显示图标（真实图标或 emoji 回退）
function ScanResultItem({ r, added, checked, onToggle }) {
  return (
    <div className={`scan-item ${added ? 'added' : ''}`}>
      <input
        type="checkbox"
        checked={added || checked}
        disabled={added}
        onChange={() => onToggle(r.path)}
      />
      <SoftwareIcon path={r.path} fallback={r.icon || '📦'} size="md" />
      <div className="scan-item-info">
        <div className="scan-item-name">{r.name}</div>
        <div className="scan-item-path" title={r.path}>{r.path}</div>
      </div>
      {added && <span className="scan-item-badge">已添加</span>}
    </div>
  )
}

// 扫描模式
const MODE_STANDARD = 'standard'
const MODE_DRIVE = 'drive'
const MODE_DIRECTORY = 'directory'

function ScanCenter() {
  const software = useStore((s) => s.software)
  const setSoftware = useStore((s) => s.setSoftware)
  // 扫描模式
  const [mode, setMode] = useState(MODE_STANDARD)
  // 盘符列表与当前选中
  const [drives, setDrives] = useState([])
  const [selectedDrive, setSelectedDrive] = useState('')
  // 目录扫描所选路径
  const [dirPath, setDirPath] = useState('')
  // 深度限制（盘符/目录扫描用）
  const [maxDepth, setMaxDepth] = useState(4)

  // 扫描状态
  const [scanning, setScanning] = useState(false)
  const [hasScanned, setHasScanned] = useState(false)
  // 扫描结果数组 [{name, path, icon}]
  const [results, setResults] = useState([])
  // 选中项：{ [path]: true }
  const [selected, setSelected] = useState({})
  const [adding, setAdding] = useState(false)
  // 操作提示消息
  const [message, setMessage] = useState('')

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
          setSelectedDrive(first)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // 扫描结果变化时批量预加载图标到共享缓存
  useEffect(() => {
    if (!results || results.length === 0) return
    preloadSoftwareIcons(results.map((r) => r.path).filter(Boolean))
  }, [results])

  // 软件库中已有路径集合（小写，用于去重判断）
  const existingPaths = useMemo(() => {
    const set = new Set()
    for (const s of software) {
      if (s.path) set.add(s.path.toLowerCase())
    }
    return set
  }, [software])

  // 可选项目：扫描结果中未存在于软件库的项
  const selectableItems = results.filter(
    (r) => !existingPaths.has((r.path || '').toLowerCase())
  )
  // 全选状态：仅针对可选项目
  const allSelected =
    selectableItems.length > 0 && selectableItems.every((r) => selected[r.path])
  // 当前选中数量
  const selectedCount = Object.keys(selected).filter((k) => selected[k]).length

  // 执行扫描：根据模式调用不同接口
  const handleScan = async () => {
    setScanning(true)
    setHasScanned(false)
    setMessage('')
    setResults([])
    setSelected({})
    try {
      let list
      if (mode === MODE_STANDARD) {
        list = await softwareApi.scan()
      } else if (mode === MODE_DRIVE) {
        if (!selectedDrive) {
          setMessage('请先选择盘符')
          setScanning(false)
          setHasScanned(true)
          return
        }
        list = await softwareApi.scanDrive(selectedDrive, { maxDepth })
      } else {
        // 目录扫描
        if (!dirPath) {
          setMessage('请先选择目录')
          setScanning(false)
          setHasScanned(true)
          return
        }
        list = await softwareApi.scanDirectory(dirPath, { maxDepth })
      }
      if (list && list.error) {
        setMessage('扫描失败：' + list.error)
        setResults([])
      } else {
        setResults(Array.isArray(list) ? list : [])
      }
    } catch (e) {
      setMessage('扫描失败：' + (e.message || '未知错误'))
    } finally {
      setScanning(false)
      setHasScanned(true)
    }
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
    const items = results.filter((r) => selected[r.path])
    if (items.length === 0) return
    setAdding(true)
    try {
      const res = await softwareApi.bulkCreate(items)
      if (res && res.error) {
        setMessage('添加失败：' + res.error)
        return
      }
      // 刷新软件库
      const list = await softwareApi.list()
      setSoftware(list)
      setMessage(`已添加 ${items.length} 个软件`)
      // 清空选中
      setSelected({})
    } catch (e) {
      setMessage('添加失败：' + (e.message || '未知错误'))
    } finally {
      setAdding(false)
    }
  }

  // 模式切换时清空结果与提示
  const switchMode = (next) => {
    if (next === mode) return
    setMode(next)
    setResults([])
    setSelected([])
    setMessage('')
    setHasScanned(false)
  }

  return (
    <div className="scan-page">
      <div className="page-header">
        <h2 className="page-title">🔍 软件扫描中心</h2>
        <GlowButton variant="primary" onClick={handleScan} disabled={scanning}>
          {scanning ? '扫描中...' : '开始扫描'}
        </GlowButton>
      </div>
      <p className="scan-intro">自动发现已安装的应用程序</p>

      {/* 扫描模式切换 */}
      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === MODE_STANDARD ? 'active' : ''}`}
          onClick={() => switchMode(MODE_STANDARD)}
          type="button"
        >
          标准扫描
        </button>
        <button
          className={`mode-tab ${mode === MODE_DRIVE ? 'active' : ''}`}
          onClick={() => switchMode(MODE_DRIVE)}
          type="button"
        >
          盘符扫描
        </button>
        <button
          className={`mode-tab ${mode === MODE_DIRECTORY ? 'active' : ''}`}
          onClick={() => switchMode(MODE_DIRECTORY)}
          type="button"
        >
          目录扫描
        </button>
      </div>

      {/* 模式说明与参数 */}
      <div className="mode-panel">
        {mode === MODE_STANDARD && (
          <div className="mode-desc">
            扫描开始菜单快捷方式与 Program Files，速度快，可发现大多数已安装应用。
          </div>
        )}
        {mode === MODE_DRIVE && (
          <>
            <div className="mode-desc">
              递归扫描所选盘符下所有 .exe 文件，适合 D:/E: 等数据盘上的绿色软件。
            </div>
            <div className="mode-form">
              <div className="form-group">
                <label className="form-label">盘符</label>
                <select
                  className="form-select"
                  value={selectedDrive}
                  onChange={(e) => setSelectedDrive(e.target.value)}
                >
                  {drives.length === 0 && <option value="">未检测到盘符</option>}
                  {drives.map((d) => (
                    <option key={d} value={d}>
                      {d}:\
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">最大深度（{maxDepth < 0 ? '不限' : maxDepth}）</label>
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
                  {maxDepth < 0 ? '不限深度（扫描较慢）' : `仅扫描 ${maxDepth} 层目录`}
                </span>
              </div>
            </div>
          </>
        )}
        {mode === MODE_DIRECTORY && (
          <>
            <div className="mode-desc">
              扫描指定目录及其子目录下的 .exe 文件，可精确控制扫描范围。
            </div>
            <div className="mode-form">
              <div className="form-group full">
                <label className="form-label">目录路径</label>
                <div className="path-row">
                  <input
                    className="form-input"
                    value={dirPath}
                    onChange={(e) => setDirPath(e.target.value)}
                    placeholder="例如：D:\Tools"
                  />
                  <GlowButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handlePickDirectory}
                  >
                    选择目录
                  </GlowButton>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">最大深度（{maxDepth < 0 ? '不限' : maxDepth}）</label>
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
                  {maxDepth < 0 ? '不限深度（扫描较慢）' : `仅扫描 ${maxDepth} 层目录`}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 扫描中状态：旋转图标 + 提示文字 */}
      {scanning && (
        <div className="scanning">
          <span className="scanner-icon">🔍</span>
          <span>正在扫描电脑...</span>
        </div>
      )}

      {/* 操作提示消息 */}
      {message && <div className="scan-message">{message}</div>}

      {/* 扫描结果：全选 + 添加按钮 + 列表 */}
      {results.length > 0 && (
        <>
          <div className="scan-result-header">
            <label className="select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              <span>全选</span>
            </label>
            <div className="result-summary">
              共 {results.length} 个，已选 {selectedCount} 个
            </div>
            <GlowButton
              variant="secondary"
              onClick={handleAddSelected}
              disabled={selectedCount === 0 || adding}
            >
              {adding ? '添加中...' : '添加选中到软件库'}
            </GlowButton>
          </div>
          <div className="scan-list">
            {results.map((r, idx) => {
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
          </div>
        </>
      )}

      {/* 空状态：未扫描或扫描后无结果 */}
      {!scanning && results.length === 0 && !message && (
        <GlassCard hover={false} className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>
            {hasScanned
              ? '未发现任何应用程序'
              : '选择扫描模式与参数，点击上方"开始扫描"按钮'}
          </p>
        </GlassCard>
      )}
    </div>
  )
}

export { ScanCenter }
export default ScanCenter
