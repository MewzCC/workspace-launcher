// 诊断域路由：diagnostics:*（含渲染层错误上报的 on 通道）
const { clipboard, shell } = require('electron')
const diagnosticService = require('../../services/diagnosticService.cjs')
const crashLogger = require('../../services/crashLogger.cjs')
const { str, jsonable } = require('../validate.cjs')

// 渲染层错误上报：事件名收窄为安全字符合集，details 限制为 JSON 安全值
const reportEventSchema = str({ min: 1, max: 64, pattern: /^[a-zA-Z0-9_-]+$/ })

const diagnosticsRoutes = [
  { channel: 'diagnostics:getReport', schema: [], handler: () => diagnosticService.getReport() },
  {
    channel: 'diagnostics:copyReport',
    schema: [],
    handler: () => {
      clipboard.writeText(diagnosticService.buildReportText())
      return { success: true }
    }
  },
  {
    channel: 'diagnostics:openLogs',
    schema: [],
    handler: async () => {
      const logDir = crashLogger.getLogDir()
      const error = await shell.openPath(logDir)
      if (error) throw new Error(error)
      return { success: true, path: logDir }
    }
  },
  {
    channel: 'diagnostics:report',
    kind: 'on',
    schema: [reportEventSchema, jsonable({ maxChars: 12000 })],
    handler: (_event, eventName, details) => {
      crashLogger.log(`renderer-${eventName}`, details, { source: 'renderer' })
    }
  }
]

module.exports = diagnosticsRoutes