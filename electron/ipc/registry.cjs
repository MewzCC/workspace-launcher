// IPC 声明式通道注册表（v2）
// 取代「handlers.cjs 上帝处理器 + 各服务内散落的 ipcMain 注册」：
//   - 所有通道以 { channel, schema, kind, handler } 声明定义
//   - registerIpcHandlers() 一次性把定义注册到 ipcMain（幂等，可分段注册）
//   - 调用时先做契约校验（validate.cjs），再进入业务 handler
//   - 错误约定与旧版一致：handle 通道异常统一返回 {error: message}
// 安全约束：
//   1. 每个通道必须声明 schema（校验参数个数与形状，剥离未知字段）
//   2. 校验失败被拒绝的调用会 console.warn 留痕（审计）
//   3. 通道重复注册直接抛错，防止两个模块抢注同一通道
const { ipcMain } = require('electron')
const { isValidator } = require('./validate.cjs')

// channel -> 定义缓存
const channels = new Map()

/**
 * 注册一批通道定义（可在应用生命周期内任意时刻调用，幂等挂载）
 * def: { channel, kind?: 'handle'|'on', schema: [...validators], handler: (event, ...args) => any }
 */
function defineRoutes(definitions) {
  if (!Array.isArray(definitions)) {
    throw new Error('[registry] defineRoutes 需要数组')
  }
  for (const def of definitions) {
    if (!def || typeof def !== 'object') {
      throw new Error('[registry] 通道定义必须是对象')
    }
    const channel = String(def.channel || '')
    if (!channel) throw new Error('[registry] 通道缺少 channel 名称')
    if (channels.has(channel)) {
      throw new Error(`[registry] 通道 ${channel} 重复注册`)
    }
    if (!Array.isArray(def.schema)) {
      throw new Error(`[registry] 通道 ${channel} 缺少 schema（至少为 []）`)
    }
    for (const item of def.schema) {
      if (!isValidator(item)) {
        throw new Error(`[registry] 通道 ${channel} 的 schema 包含非校验器项`)
      }
    }
    const kind = def.kind === 'on' ? 'on' : 'handle'
    if (typeof def.handler !== 'function') {
      throw new Error(`[registry] 通道 ${channel} 缺少 handler`)
    }
    channels.set(channel, { channel, kind, schema: def.schema, handler: def.handler, installed: false })
  }
}

/** 幂等挂载所有已定义通道到 ipcMain；后续新增的定义再次调用即可补挂 */
function installHandlers() {
  for (const def of channels.values()) {
    if (def.installed) continue
    if (def.kind === 'on') {
      ipcMain.on(def.channel, (event, ...rawArgs) => {
        let args
        try {
          args = sanitizeArgs(def, rawArgs)
        } catch (error) {
          console.warn(`[ipc] 通道 ${def.channel} 校验失败，已拒绝:`, error.message)
          return
        }
        try {
          def.handler(event, ...args)
        } catch (error) {
          console.warn(`[ipc] 通道 ${def.channel} 处理器异常:`, error)
        }
      })
    } else {
      ipcMain.handle(def.channel, async (event, ...rawArgs) => {
        let args
        try {
          args = sanitizeArgs(def, rawArgs)
        } catch (error) {
          console.warn(`[ipc] 通道 ${def.channel} 校验失败，已拒绝:`, error.message)
          return { error: error.message }
        }
        try {
          return await def.handler(event, ...args)
        } catch (error) {
          console.error(`[IPC] handler error (${def.channel}):`, error)
          return { error: error && error.message ? error.message : String(error) }
        }
      })
    }
    def.installed = true
  }
}

/**
 * 校验并净化原始参数。
 * 严格规则：额外参数一律拒绝；缺失参数按 schema 的 required 语义处理（optional 放行 undefined）。
 */
function sanitizeArgs(def, rawArgs) {
  const schema = def.schema
  if (rawArgs.length > schema.length) {
    throw new (require('./validate.cjs').ValidationError)(
      `期望 ${schema.length} 个参数，实际收到 ${rawArgs.length} 个`
    )
  }
  const result = new Array(schema.length)
  for (let index = 0; index < schema.length; index += 1) {
    const value = index < rawArgs.length ? rawArgs[index] : undefined
    const pathName = `参数 ${index + 1}`
    result[index] = schema[index](value, pathName)
  }
  return result
}

/** 已注册的全部通道名（测试/清单核对用） */
function getChannelNames() {
  return [...channels.keys()]
}

module.exports = {
  defineRoutes,
  installHandlers,
  sanitizeArgs,
  getChannelNames
}