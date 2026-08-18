// 日志域路由：logs:*
const { logDao } = require('../../db/index.cjs')
const { id, num, optional } = require('../validate.cjs')

const limitInt = num({ integer: true, min: 1, max: 1000 })

const logsRoutes = [
  {
    channel: 'logs:list',
    schema: [optional(id()), optional(limitInt)],
    handler: (_e, workspaceId, limit) => {
      if (workspaceId) return logDao.listByWorkspace(workspaceId, limit)
      return logDao.listRecent(limit)
    }
  },
  {
    channel: 'logs:listAll',
    schema: [optional(limitInt)],
    handler: (_e, limit) => logDao.listAll(limit)
  }
]

module.exports = logsRoutes