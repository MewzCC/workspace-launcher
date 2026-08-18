// 进程与性能域路由：process:* + perf:*
const processManager = require('../../services/processManager.cjs')
const perfMonitor = require('../../services/perfMonitor.cjs')
const { str, id, num, bool, optional, obj } = require('../validate.cjs')

const processListOptionsSchema = optional(obj({
  page: optional(num({ integer: true, min: 1 })),
  pageSize: optional(num({ integer: true, min: 1, max: 100 })),
  query: optional(str({ max: 200 })),
  portOnly: optional(bool()),
  force: optional(bool())
}, { label: '进程查询条件' }))

const processRoutes = [
  {
    channel: 'process:list',
    schema: [processListOptionsSchema],
    handler: (_e, options) => processManager.listProcessPage(options)
  },
  {
    channel: 'process:terminate',
    schema: [id()],
    handler: (_e, pid) => processManager.terminateProcessTree(pid)
  },
  {
    channel: 'perf:snapshot',
    schema: [],
    handler: () => perfMonitor.getSnapshot()
  },
  {
    channel: 'perf:topProcesses',
    schema: [],
    handler: () => perfMonitor.getTopProcesses()
  }
]

module.exports = processRoutes