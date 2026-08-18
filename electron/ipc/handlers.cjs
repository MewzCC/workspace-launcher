// IPC 处理器注册模块（v2：声明式契约 + 按域路由）
// 旧版 550 行「上帝处理器」已拆分为 routers/ 下按域组织的路由模块。
// 每个通道以 { channel, schema, kind, handler } 声明注册到 registry.cjs：
//   - schema 为入参契约（validate.cjs），先校验净化再进入业务逻辑，未知字段剥离
//   - 异常统一由 registry 包装为 {error: message}，与旧版渲染层约定完全一致
// 桌宠域（pet:*）由 petService.cjs 自行注册同样格式的通道定义（其处理器依赖
// petService 内部窗口状态，留在域模块内注册可避免导出 15+ 个内部函数）。
const { defineRoutes, installHandlers } = require('./registry.cjs')

const aiRoutes = require('./routers/aiRouter.cjs')
const workspaceRoutes = require('./routers/workspaceRouter.cjs')
const softwareRoutes = require('./routers/softwareRouter.cjs')
const processRoutes = require('./routers/processRouter.cjs')
const automationRoutes = require('./routers/automationRouter.cjs')
const logsRoutes = require('./routers/logsRouter.cjs')
const updateRoutes = require('./routers/updateRouter.cjs')
const storageRoutes = require('./routers/storageRouter.cjs')
const diagnosticsRoutes = require('./routers/diagnosticsRouter.cjs')
const dialogRoutes = require('./routers/dialogRouter.cjs')
const systemRoutes = require('./routers/systemRouter.cjs')

// 在 app ready 时调用一次：定义全部通道并挂载到 ipcMain
function registerIpcHandlers() {
  defineRoutes([
    ...aiRoutes,
    ...workspaceRoutes,
    ...softwareRoutes,
    ...processRoutes,
    ...automationRoutes,
    ...logsRoutes,
    ...updateRoutes,
    ...storageRoutes,
    ...diagnosticsRoutes,
    ...dialogRoutes,
    ...systemRoutes
  ])
  installHandlers()
}

module.exports = { registerIpcHandlers }