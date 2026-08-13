// 诊断报告服务
// 汇总应用版本、系统信息、更新状态（含错误码）与最近崩溃日志，
// 生成可供用户粘贴到 GitHub Issue 的文本报告。
const os = require('os')
const { app } = require('electron')
const crashLogger = require('./crashLogger.cjs')
const updateService = require('./updateService.cjs')
const storageService = require('./storageService.cjs')

function getSystemInfo() {
  return {
    appVersion: (() => {
      try { return app.getVersion() } catch (_) { return '0.0.0' }
    })(),
    platform: process.platform,
    release: os.release(),
    arch: os.arch(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    packaged: Boolean(app.isPackaged),
    portable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE || process.env.PORTABLE_EXECUTABLE_DIR)
  }
}

function getReport() {
  const update = updateService.getStatus()
  let dataDirectory = ''
  try {
    dataDirectory = storageService.getInfo().directory
  } catch (_) {
    // 数据目录信息失败不影响报告。
  }

  return {
    system: getSystemInfo(),
    dataDirectory,
    update: {
      state: update.state,
      currentVersion: update.currentVersion,
      version: update.version || '',
      error: update.error || '',
      checkedAt: update.checkedAt || null
    },
    recentErrors: crashLogger.getRecentErrors(20),
    generatedAt: new Date().toISOString()
  }
}

function buildReportText() {
  const report = getReport()
  const lines = []
  lines.push('LaunchPad 诊断报告')
  lines.push('==================')
  lines.push(`生成时间: ${report.generatedAt}`)
  lines.push(`应用版本: ${report.system.appVersion}`)
  lines.push(`系统: ${report.system.platform} ${report.system.release} (${report.system.arch})`)
  lines.push(`Electron: ${report.system.electron} / Chromium ${report.system.chrome} / Node ${report.system.node}`)
  lines.push(`打包版: ${report.system.packaged ? '是' : '否（开发模式）'}`)
  lines.push(`便携版: ${report.system.portable ? '是' : '否'}`)
  lines.push(`数据目录: ${report.dataDirectory || '未知'}`)
  lines.push('')
  lines.push('更新状态')
  lines.push('--------')
  lines.push(`状态: ${report.update.state}`)
  lines.push(`当前版本: ${report.update.currentVersion}`)
  lines.push(`目标版本: ${report.update.version || '-'}`)
  lines.push(`错误: ${report.update.error || '无'}`)
  lines.push(`最后检查: ${report.update.checkedAt ? new Date(report.update.checkedAt).toISOString() : '未检查'}`)
  lines.push('')
  lines.push('最近错误日志')
  lines.push('------------')
  if (report.recentErrors.length === 0) {
    lines.push('（无）')
  } else {
    for (const item of report.recentErrors) {
      const detail = item.details
      const message = detail && typeof detail === 'object' ? (detail.message || detail.reason || JSON.stringify(detail)) : String(detail || '')
      const code = detail && typeof detail === 'object' && detail.code ? ` [${detail.code}]` : ''
      lines.push(`- ${item.timestamp} [${item.event}]${code} ${String(message).slice(0, 300)}`)
    }
  }
  return lines.join('\n')
}

module.exports = { getReport, buildReportText }
