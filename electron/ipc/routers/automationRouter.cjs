// 自动化域路由：batScript:* + script:*
const { batScriptDao, scriptDao } = require('../../db/index.cjs')
const processManager = require('../../services/processManager.cjs')
const { t } = require('../../i18n.cjs')
const { str, id, num, oneOf, optional, obj, arr } = require('../validate.cjs')

// 非负整数（launch_order / delay_ms）
const indexInt = num({ integer: true, min: 0, max: 604800000 })

// BAT 脚本字段白名单
const batScriptDataSchema = obj({
  name: str({ min: 1, max: 200, trim: true, label: '脚本名称' }),
  description: optional(str({ max: 500 })),
  path: str({ max: 1024, label: '脚本路径' }),
  args: optional(str({ max: 2048 }))
}, { label: '脚本数据' })

const batRelationSchema = obj({
  bat_script_id: id(),
  launch_order: optional(indexInt),
  delay_ms: optional(indexInt)
}, { label: '脚本关联' })

// pre/post 脚本 upsert 白名单
const scriptUpsertSchema = obj({
  workspace_id: id(),
  type: oneOf(['pre', 'post'], { label: '脚本类型' }),
  language: oneOf(['cmd', 'powershell', 'ps'], { label: '脚本语言' }),
  content: optional(str({ max: 20000 })),
  delay_ms: optional(indexInt)
}, { label: '脚本数据' })

const automationRoutes = [
  { channel: 'batScript:list', schema: [], handler: () => batScriptDao.list() },
  {
    channel: 'batScript:listByWorkspace',
    schema: [id()],
    handler: (_e, workspaceId) => batScriptDao.listByWorkspace(workspaceId)
  },
  {
    channel: 'batScript:setWorkspaceScripts',
    schema: [id(), arr(batRelationSchema, { max: 200 })],
    handler: (_e, workspaceId, items) => batScriptDao.setForWorkspace(workspaceId, items)
  },
  { channel: 'batScript:create', schema: [batScriptDataSchema], handler: (_e, data) => batScriptDao.create(data) },
  {
    channel: 'batScript:update',
    schema: [id(), batScriptDataSchema],
    handler: (_e, scriptId, data) => batScriptDao.update(scriptId, data)
  },
  { channel: 'batScript:delete', schema: [id()], handler: (_e, scriptId) => batScriptDao.remove(scriptId) },
  {
    channel: 'batScript:run',
    schema: [id()],
    handler: async (_e, scriptId) => {
      const script = batScriptDao.get(scriptId)
      if (!script) throw new Error(t('errors.scriptNotExist'))
      await processManager.launchBatch(script.path, script.args)
      return { success: true, message: t('engine.batchStarted', { name: script.name }) }
    }
  },
  {
    channel: 'script:listByWorkspace',
    schema: [id()],
    handler: (_e, workspaceId) => scriptDao.listByWorkspace(workspaceId)
  },
  {
    channel: 'script:upsert',
    schema: [scriptUpsertSchema],
    handler: (_e, data) => scriptDao.upsert(data)
  }
]

module.exports = automationRoutes