// 软件库域路由：software:*（CRUD / 扫描 / 图标 / 验证启动）
const { app, shell } = require('electron')
const { softwareDao } = require('../../db/index.cjs')
const softwareScanner = require('../../services/softwareScanner.cjs')
const processManager = require('../../services/processManager.cjs')
const { t } = require('../../i18n.cjs')
const { str, id, num, bool, oneOf, optional, obj, arr, or, path } = require('../validate.cjs')

// 图标缓存：filePath(小写) -> dataURL（进程内缓存，与旧 handlers.cjs 一致）
const iconCache = new Map()
// 进行中的扫描任务（支持取消）
let activeSoftwareScan = null

async function runSoftwareScan(task) {
  if (activeSoftwareScan) activeSoftwareScan.controller.abort()
  const controller = new AbortController()
  const token = Symbol('software-scan')
  activeSoftwareScan = { controller, token }
  try {
    return await task(controller.signal)
  } catch (error) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      return { cancelled: true }
    }
    throw error
  } finally {
    if (activeSoftwareScan?.token === token) activeSoftwareScan = null
  }
}

// 软件字段（创建/更新/批量共用的白名单）
const softwareDataSchema = obj({
  name: str({ min: 1, max: 200, trim: true, label: '软件名称' }),
  description: optional(str({ max: 500 })),
  path: path({ max: 1024, label: '可执行文件路径' }),
  args: optional(or(str({ max: 2048 }), arr(str({ max: 512 }), { max: 64, label: '参数数组' }))),
  icon: optional(str({ max: 64 })),
  icon_mode: optional(oneOf(['auto', 'custom']))
}, { label: '软件数据' })

// 扫描选项：maxDepth 限制
const scanOptionsSchema = optional(obj({
  maxDepth: optional(num({ integer: true, min: 1, max: 12 }))
}, { label: '扫描选项' }))

async function extractIcon(filePath, cacheKey) {
  const icon = await app.getFileIcon(filePath, { size: 'normal' })
  const dataUrl = icon.toDataURL()
  iconCache.set(cacheKey, dataUrl)
  return dataUrl
}

const softwareRoutes = [
  { channel: 'software:list', schema: [], handler: () => softwareDao.list() },
  { channel: 'software:get', schema: [id()], handler: (_e, softwareId) => softwareDao.get(softwareId) },
  { channel: 'software:create', schema: [softwareDataSchema], handler: (_e, data) => softwareDao.create(data) },
  {
    channel: 'software:update',
    schema: [id(), softwareDataSchema],
    handler: (_e, softwareId, data) => softwareDao.update(softwareId, data)
  },
  { channel: 'software:delete', schema: [id()], handler: (_e, softwareId) => softwareDao.remove(softwareId) },
  {
    channel: 'software:testLaunch',
    schema: [id()],
    handler: async (_e, softwareId) => {
      const software = softwareDao.get(softwareId)
      if (!software) return { success: false, message: t('errors.softwareNotExist') }
      try {
        await processManager.launchExe(software.path, software.args)
        return { success: true, message: t('engine.launchSuccess', { name: software.name }) }
      } catch (err) {
        return { success: false, message: err.message }
      }
    }
  },
  {
    channel: 'software:getProcessStatuses',
    schema: [arr(str({ max: 1024 }), { max: 500 })],
    handler: (_e, exePaths) => processManager.getExecutableStatuses(exePaths)
  },
  { channel: 'software:scan', schema: [], handler: () => runSoftwareScan((signal) => softwareScanner.scanAll(null, { signal })) },
  {
    channel: 'software:cancelScan',
    schema: [],
    handler: () => {
      if (!activeSoftwareScan) return { success: true, active: false }
      activeSoftwareScan.controller.abort()
      return { success: true, active: true }
    }
  },
  {
    channel: 'software:searchInstalled',
    schema: [optional(str({ max: 200 }))],
    handler: (_e, query) => softwareScanner.searchInstalledApplications(query)
  },
  {
    channel: 'software:bulkCreate',
    schema: [arr(softwareDataSchema, { max: 200 })],
    handler: (_e, items) => softwareDao.bulkCreate(items)
  },
  {
    channel: 'software:createValidated',
    schema: [softwareDataSchema],
    handler: async (_e, data) => {
      const launch = await processManager.launchExe(data.path, data.args)
      const software = softwareDao.create(data)
      return { success: true, software, launch }
    }
  },
  {
    channel: 'software:updateValidated',
    schema: [id(), softwareDataSchema],
    handler: async (_e, softwareId, data) => {
      const launch = await processManager.launchExe(data.path, data.args)
      const software = softwareDao.update(softwareId, data)
      return { success: true, software, launch }
    }
  },
  {
    channel: 'software:bulkCreateValidated',
    schema: [arr(softwareDataSchema, { max: 20 })],
    handler: async (_e, items) => {
      if (!Array.isArray(items) || items.length === 0) {
        return { success: true, created: [], failed: [] }
      }
      const created = []
      const failed = []
      for (const item of items) {
        try {
          await processManager.launchExe(item.path, item.args)
          created.push(softwareDao.create(item))
        } catch (err) {
          failed.push({ name: item.name || item.path, path: item.path, error: err.message })
        }
      }
      return { success: true, created, failed }
    }
  },
  { channel: 'software:getDrives', schema: [], handler: () => softwareScanner.getAvailableDrives() },
  {
    channel: 'software:scanDrive',
    schema: [str({ min: 1, max: 1, pattern: /^[a-zA-Z]$/, label: '盘符' }), scanOptionsSchema],
    handler: (_e, driveLetter, options) =>
      runSoftwareScan((signal) => softwareScanner.scanDrive(driveLetter, null, { ...(options || {}), signal }))
  },
  {
    channel: 'software:scanDirectory',
    schema: [path({ max: 1024, label: '目录路径' }), scanOptionsSchema],
    handler: (_e, dirPath, options) =>
      runSoftwareScan((signal) => softwareScanner.scanExeFiles(dirPath, null, { ...(options || {}), signal }))
  },
  {
    channel: 'software:getIcon',
    schema: [optional(path({ max: 1024, label: '文件路径' }))],
    handler: async (_e, filePath) => {
      if (!filePath) return null
      const cacheKey = filePath.toLowerCase()
      if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)
      try {
        return await extractIcon(filePath, cacheKey)
      } catch (_) {
        return null
      }
    }
  },
  {
    channel: 'software:getIcons',
    schema: [arr(path({ max: 1024, label: '文件路径' }), { max: 500 })],
    handler: async (_e, filePaths) => {
      if (!Array.isArray(filePaths) || filePaths.length === 0) return {}
      const result = {}
      await Promise.all(
        filePaths.map(async (fp) => {
          if (!fp) return
          const key = fp.toLowerCase()
          if (iconCache.has(key)) {
            result[fp] = iconCache.get(key)
            return
          }
          try {
            result[fp] = await extractIcon(fp, key)
          } catch (_) {
            // 失败的项不包含在结果中，前端回退到 emoji
          }
        })
      )
      return result
    }
  }
]

module.exports = softwareRoutes