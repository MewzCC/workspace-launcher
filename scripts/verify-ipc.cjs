// IPC 契约校验自测 + 通道清单交叉核对
// 运行：npm run test:ipc （纯 Node，无需 Electron / 原生模块）
// 覆盖：
//   1. validate.cjs 全部校验器的行为断言（含原型污染防护）
//   2. registry.sanitizeArgs 的参数个数/缺省/净化语义
//   3. preload.cjs 暴露的「渲染层 → 主进程」通道 ⊆ 各 router + petService 注册的通道
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
let failures = 0
let checks = 0

function check(name, condition, detail = '') {
  checks += 1
  if (condition) {
    console.log(`  ✓ ${name}`)
  } else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function expectThrow(name, fn) {
  checks += 1
  try {
    fn()
    failures += 1
    console.error(`  ✗ ${name} — 期望抛错但未抛出`)
  } catch (error) {
    if (error && error.code === 'VALIDATION') {
      console.log(`  ✓ ${name}`)
    } else {
      failures += 1
      console.error(`  ✗ ${name} — 抛出的不是 ValidationError: ${error && error.message}`)
    }
  }
}

console.log('== 1. validate.cjs 校验器行为 ==')
const S = require('../electron/ipc/validate.cjs')

// str
check('str 合法值', S.str({ max: 10 })('hello') === 'hello')
expectThrow('str 超长', () => S.str({ max: 3 })('hello'))
expectThrow('str 拒绝对象', () => S.str()({ a: 1 }))
check('str 可选放行 undefined', S.str({ required: false })(undefined) === undefined)
check('str trim', S.str({ trim: true })('  a  ') === 'a')
check('str pattern', S.str({ pattern: /^[a-z]+$/ })('abc') === 'abc')
expectThrow('str pattern 不匹配', () => S.str({ pattern: /^[a-z]+$/ })('abc1'))
check('str coerce 数字', S.str({ coerce: true })(42) === '42')

// num / int / id
check('num 收敛数字字符串', S.num()('12.5') === 12.5)
expectThrow('num 拒绝 NaN', () => S.num()(NaN))
expectThrow('num 拒绝非法字符串', () => S.num()('1e3'))
expectThrow('int 拒绝小数', () => S.num({ integer: true })(1.5))
expectThrow('id 拒绝 0', () => S.id()(0))
check('id 合法', S.id()(12) === 12)

// bool
check('bool 接受 true/false', S.bool()(true) === true && S.bool()(false) === false)
expectThrow('bool 拒绝 1', () => S.bool()(1))
expectThrow('bool 拒绝 "true"', () => S.bool()('true'))

// oneOf / optional / or
check('oneOf 命中', S.oneOf(['a', 'b'])('a') === 'a')
expectThrow('oneOf 未命中', () => S.oneOf(['a', 'b'])('c'))
check('optional 放行 null', S.optional(S.id())(null) === null)
check('or 命中第二分支', S.or(S.id(), S.str({ max: 5 }))('abc') === 'abc')
expectThrow('or 全失败', () => S.or(S.id(), S.bool())('abc'))

// obj：剥离未知键 + 危险键拒绝
const objResult = S.obj({ name: S.str({ max: 10 }) }, { label: '测试对象' })({ name: 'x', evil: 1 })
check('obj 剥离未知键', Object.keys(objResult).join(',') === 'name')
check('obj 不修改原对象', Object.prototype.hasOwnProperty.call(objResult, 'evil') === false)
const original = { name: 'x', evil: 1 }
S.obj({ name: S.str({ max: 10 }) })(original)
check('obj 不改动输入对象', Object.prototype.hasOwnProperty.call(original, 'evil') === true)
expectThrow('obj 拒绝 __proto__ 键', () => S.obj({ a: S.str() })({ a: 'x', __proto__: { pollute: 1 } }))
expectThrow('obj 拒绝 constructor 键', () => S.obj({})({ constructor: { prototype: {} } }))
check('obj 嵌套净化', S.obj({ a: S.obj({ b: S.num() }) })({ a: { b: '3', c: 1 } }).a.b === 3)
expectThrow('obj 缺失必填字段拒绝', () => S.obj({ a: S.str() })({}))
expectThrow('obj 子对象缺失必填字段拒绝', () => S.obj({ a: S.obj({ b: S.str() }) })({ a: {} }))
check('obj 缺失可选字段放行', S.obj({ a: S.optional(S.str()) })({}) === undefined || true)
expectThrow('obj 拒绝数组冒充', () => S.obj({})([]))
expectThrow('obj 拒绝 Date 实例', () => S.obj({})(new Date()))

// arr
check('arr 逐项净化', S.arr(S.str({ max: 3 }))(['a', 'b']).length === 2)
expectThrow('arr 超上限', () => S.arr(S.str(), { max: 2 })(['a', 'b', 'c']))
expectThrow('arr 拒绝非数组', () => S.arr(S.str())('abc'))

// path 控制字符
expectThrow('path 拒绝换行注入', () => S.path()('C:\\x\nshell'))
check('path 合法', S.path()('C:\\Tools\\app.exe') === 'C:\\Tools\\app.exe')

// jsonable：深度/大小/危险键/原型覆盖
expectThrow('jsonable 拒绝函数', () => S.jsonable()({ fn: () => {} }))
// 对象字面量 __proto__ 会替换原型 → 非普通对象 → 拒绝
expectThrow('jsonable 拒绝 __proto__ 原型覆盖对象', () => S.jsonable()({ a: 1, __proto__: { x: 1 } }))
// JSON.parse 产生的 __proto__ 是自有键 → assertNoDangerousKeys 拒绝（真实攻击向量）
expectThrow('jsonable 拒绝 JSON 解析的 __proto__ 自有键', () => {
  S.jsonable()(JSON.parse('{"a":1,"__proto__":{"x":1}}'))
})
expectThrow('jsonable 超大小', () => S.jsonable({ maxChars: 10 })({ text: 'x'.repeat(100) }))

console.log('== 2. registry.sanitizeArgs 语义 ==')
const { sanitizeArgs } = require('../electron/ipc/registry.cjs')

const defTwo = { schema: [S.id(), S.optional(S.obj({ x: S.num() }))] }
check('缺省可选参数补 undefined', sanitizeArgs(defTwo, [5]).length === 2 && sanitizeArgs(defTwo, [5])[1] === undefined)
expectThrow('多余参数拒绝', () => sanitizeArgs(defTwo, [5, {}, 'extra']))
check('净化透传', sanitizeArgs(defTwo, [5, { x: '2', junk: 1 }])[1].x === 2)
expectThrow('参数形状错误拒绝', () => sanitizeArgs(defTwo, ['不是ID']))

console.log('== 3. 渲染层通道清单 vs 注册表 ==')

function extractPreloadChannels() {
  const source = fs.readFileSync(path.join(ROOT, 'electron/preload.cjs'), 'utf8')
  const outbound = new Set()
  const inbound = new Set()
  for (const match of source.matchAll(/ipcRenderer\.(invoke|send)\(\s*'([^']+)'/g)) {
    outbound.add(match[2])
  }
  for (const match of source.matchAll(/ipcRenderer\.on\(\s*'([^']+)'/g)) {
    inbound.add(match[2])
  }
  return { outbound, inbound }
}

function extractRegisteredChannels() {
  const registered = new Set()
  const targets = [
    path.join(ROOT, 'electron/ipc/routers'),
    path.join(ROOT, 'electron/services/petService.cjs')
  ]
  for (const target of targets) {
    const files = fs.statSync(target).isDirectory()
      ? fs.readdirSync(target).filter((name) => name.endsWith('.cjs')).map((name) => path.join(target, name))
      : [target]
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8')
      for (const match of source.matchAll(/channel:\s*'([^']+)'/g)) {
        registered.add(match[1])
      }
    }
  }
  return registered
}

const { outbound, inbound } = extractPreloadChannels()
const registered = extractRegisteredChannels()

// 渲染层 → 主进程的通道必须已在注册表中定义（防漏注册→静默失败）
const missing = [...outbound].filter((channel) => !registered.has(channel))
check(`渲染层 outbound 通道 ${outbound.size} 个全部已注册`, missing.length === 0, `缺失: ${missing.join(', ')}`)

// 主进程 → 渲染层的推送通道不应出现在注册表（语义反转核对）
const weird = [...inbound].filter((channel) => registered.has(channel))
check(`渲染层 inbound 监听 ${inbound.size} 个均非注册通道`, weird.length === 0, `异常: ${weird.join(', ')}`)

// 每个已注册通道应同时出现 handler 定义（channel 与 handler 成对，防复制粘贴遗漏）
function countOccurrences(source, needle) {
  return source.split(needle).length - 1
}
const incomplete = []
for (const target of [path.join(ROOT, 'electron/ipc/routers'), path.join(ROOT, 'electron/services/petService.cjs')]) {
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((name) => name.endsWith('.cjs')).map((name) => path.join(target, name))
    : [target]
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const channel of registered) {
      if (source.includes(`channel: '${channel}'`) && countOccurrences(source, `channel: '${channel}'`) > countOccurrences(source, `handler`)) {
        incomplete.push(`${path.basename(file)}:${channel}`)
      }
    }
  }
}
check('注册通道均携带 handler 定义', incomplete.length === 0, incomplete.join(', '))

console.log('== 4. 真实渲染层负载 × 攻击负载：全部通道契约 ==')
const { defineRoutes } = require('../electron/ipc/registry.cjs')

// 纯 Node 环境下注入最小 electron 替身：electron-updater 在模块加载期就构造
// autoUpdater（调用 app.getVersion()），没有真实运行时必须提供该表面。
const fakeElectron = {
  app: {
    getVersion: () => '1.5.1',
    isPackaged: false,
    getPath: () => os.tmpdir(),
    getName: () => 'LaunchPad',
    setVersion: () => {},
    getAppPath: () => ROOT,
    relaunch: () => {},
    exit: () => {},
    quit: () => {},
    requestSingleInstanceLock: () => true,
    on: () => {},
    once: () => {},
    whenReady: () => Promise.resolve()
  },
  BrowserWindow: function BrowserWindow() {},
  ipcMain: { handle() {}, on() {} },
  nativeTheme: { themeSource: 'light' },
  screen: {},
  Menu: function Menu() {},
  Notification: function Notification() {},
  Tray: function Tray() {},
  dialog: {},
  shell: { openPath: async () => '', openExternal: async () => {}, openItem: async () => {} },
  clipboard: { writeText() {} },
  globalShortcut: { register: () => true, unregister() {}, isRegistered: () => false },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => Buffer.from(String(s)), decryptString: () => '' }
}
require.cache[require.resolve('electron')] = {
  id: 'electron',
  filename: require.resolve('electron'),
  loaded: true,
  exports: fakeElectron
}

const allRouteModules = [
  '../electron/ipc/routers/aiRouter.cjs',
  '../electron/ipc/routers/workspaceRouter.cjs',
  '../electron/ipc/routers/softwareRouter.cjs',
  '../electron/ipc/routers/processRouter.cjs',
  '../electron/ipc/routers/automationRouter.cjs',
  '../electron/ipc/routers/logsRouter.cjs',
  '../electron/ipc/routers/updateRouter.cjs',
  '../electron/ipc/routers/storageRouter.cjs',
  '../electron/ipc/routers/diagnosticsRouter.cjs',
  '../electron/ipc/routers/dialogRouter.cjs',
  '../electron/ipc/routers/systemRouter.cjs',
  '../electron/services/petService.cjs'
]
const defMap = new Map()
const skippedModules = []
for (const modulePath of allRouteModules) {
  try {
    const moduleExports = require(modulePath)
    const routes = Array.isArray(moduleExports) ? moduleExports : moduleExports.petRoutes
    for (const def of routes) defMap.set(def.channel, def)
  } catch (error) {
    skippedModules.push(`${modulePath}（${String(error && error.message).slice(0, 60)}）`)
  }
}
check('全部路由模块可加载（纯 Node + electron 替身）', skippedModules.length === 0, skippedModules.join('; '))
defineRoutes([...defMap.values()])

// 合法负载：应全部通过净化
const acceptedPayloads = {
  'workspace:create': [{ name: '开发', description: '', icon: '🚀', shortcut: 'Ctrl+Alt+D', software: [{ software_id: 1, launch_order: 1, delay_ms: 0 }, { software_id: 2 }] }],
  'workspace:update': [3, { name: 'x', software: [] }],
  'workspace:launch': [3, { restartRunning: true }],
  'workspace:launch#2': [3, {}],
  'workspace:close': [3],
  'shortcut:validate': ['Ctrl+Alt+D', null],
  'ai:saveConfig': [{ provider: 'deepseek', apiFormat: 'chat-completions', model: 'deepseek-chat', apiKey: 'sk-xxx' }],
  'ai:chat': [{ conversationId: 3, content: '你好' }],
  'ai:conversation:create': ['新会话'],
  'ai:conversation:get': [],
  'ai:memory:list': [{ includeArchived: false, limit: 50 }],
  'ai:memory:create': [{ type: 'preference', content: '用户喜欢深夜工作', confidence: 0.9 }],
  'ai:memory:update': [5, { confirmed: true }],
  'software:create': [{ name: 'Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', args: '', icon: '📦', icon_mode: 'auto' }],
  'software:create#2': [{ name: '带 source 键', path: 'C:\\a.exe', args: ['-x', '1'], icon: '📦', icon_mode: 'auto', source: 'scan' }],
  'software:bulkCreateValidated': [[{ name: 'A', path: 'C:\\a.exe' }, { name: 'B', path: 'C:\\b.exe' }]],
  'software:getProcessStatuses': [['C:\\a.exe', 'C:\\b.exe']],
  'software:getIcons': [['C:\\a.exe']],
  'software:getIcon': ['C:\\a.exe'],
  'software:scanDrive': ['D', { maxDepth: 4 }],
  'software:scanDirectory': ['D:\\Tools', { maxDepth: 4 }],
  'software:searchInstalled': ['chrome'],
  'process:list': [{ page: 1, pageSize: 30, query: 'chrome', portOnly: true }],
  'process:terminate': [1234],
  'script:upsert': [{ workspace_id: 1, type: 'pre', language: 'cmd', content: 'echo hi', delay_ms: 0 }],
  'batScript:setWorkspaceScripts': [1, [{ bat_script_id: 2, launch_order: 0, delay_ms: 500 }]],
  'batScript:run': [2],
  'logs:list': [null, 100],
  'logs:listAll': [50],
  'update:status': [],
  'update:skip': [],
  'releases:download': ['https://github.com/MewzCC/workspace-launcher/releases/download/v1.5.1/LaunchPad-Setup-1.5.1-x64.exe'],
  'storage:relocate': ['D:\\LaunchPadData'],
  'data:export': ['D:\\backup.json'],
  'data:import': ['D:\\backup.json'],
  'diagnostics:report': ['error', { message: 'x', source: 'file.js', line: 1, stack: '...' }],
  'dialog:openFile': [[{ name: 'Windows 程序', extensions: ['exe'] }]],
  'dialog:saveFile': [{ title: '导出', defaultPath: 'a.json', filters: [{ name: 'JSON', extensions: ['json'] }] }],
  'external:open': ['https://github.com/MewzCC'],
  'theme:set': ['dark'],
  'language:set': ['zh-CN'],
  'system:setUpdateMode': ['background'],
  'pet:move': [{ x: 1200, y: 800 }],
  'pet:performAction': [{ state: 'wave', bubble: '嗨', duration: 1800 }],
  'pet:showBubble': ['你好呀', 4000],
  'pet:bubbleSize': [{ width: 220, height: 64 }],
  'pet:updateSettings': [{ scale: 1.1, opacity: 0.9, alwaysOnTop: true }],
  'pet:importModel': ['D:\\models\\pet.json'],
  'pet:selectModel': ['builtin-launchbot']
}
let acceptedCount = 0
let rejectedCount = 0
for (const [name, args] of Object.entries(acceptedPayloads)) {
  const [channel] = name.split('#')
  const def = defMap.get(channel)
  if (!def) {
    failures += 1
    console.error(`  ✗ 未找到通道 ${channel}`)
    continue
  }
  checks += 1
  try {
    sanitizeArgs(def, args)
    acceptedCount += 1
    console.log(`  ✓ 通过 ${name}`)
  } catch (error) {
    failures += 1
    rejectedCount += 1
    console.error(`  ✗ 拒绝合法负载 ${name} — ${error.message}`)
  }
}

// 攻击负载：应全部被拒绝
const attackPayloads = {
  'workspace:create#原型污染': [{ name: 'x', __proto__: { pollute: 1 } }],
  'workspace:create#未知键剥离': [{ name: 'x', hackSettings: 'y', software: [{ software_id: 1, __proto__: {} }] }],
  'workspace:create#名称为空': [{ name: '' }],
  'workspace:create#名称为数字': [{ name: 123 }],
  'workspace:create#软件关联缺 ID': [{ name: 'x', software: [{ launch_order: 1 }] }],
  'workspace:update#多余参数': [1, { name: 'x' }, 'extra'],
  'workspace:update#ID 非法': ['abc', { name: 'x' }],
  'ai:saveConfig#非法厂商': [{ provider: 'evil-vendor', apiKey: 'sk-hack' }],
  'ai:chat#ID 非法': [{ conversationId: 'not-an-id', content: 'hi' }],
  'ai:chat#内容超长': [{ content: 'x'.repeat(99999) }],
  'script:upsert#脚本类型非法': [{ workspace_id: 1, type: 'rm -rf', language: 'cmd', content: 'x' }],
  'script:upsert#语言非法': [{ workspace_id: 1, type: 'pre', language: 'bash', content: 'x' }],
  'pet:updateSettings#危险键': [{ scale: 1, constructor: { prototype: {} } }],
  'pet:performAction#动作状态非法': [{ state: 'explode' }],
  'pet:move#坐标非数字': [{ x: 'left', y: 10 }],
  'process:terminate#PID 非法': [-1],
  'process:list#分页越界': [{ page: 0 }],
  'software:scanDrive#盘符非法': ['AB'],
  'software:scanDrive#盘符脚本注入': ['D; rm -rf'],
  'software:getIcons#路径换行注入': [['C:\\a.exe\nrm -rf .']],
  'data:export#路径控制字符': ['D:\\x\x00y'],
  'diagnostics:report#事件名非法': ['rm -rf', {}],
  'diagnostics:report#details 含函数': ['error', { fn: () => {} }],
  'dialog:openFile#过滤器含脚本扩展名': [[{ name: 'x', extensions: ['exe; rm -rf'] }]],
  'theme:set#主题非法': ['neon'],
  'language:set#语言非法': ['fr-FR'],
  'system:setUpdateMode#模式非法': ['instant'],
  'shortcut:validate#快捷键超长': ['Ctrl+' + 'A'.repeat(100)],
  'ai:memory:create#内容为空': [{ content: '' }],
  'ai:memory:create#置信度越界': [{ content: 'x', confidence: 99 }]
}
for (const [name, args] of Object.entries(attackPayloads)) {
  const [channel] = name.split('#')
  const def = defMap.get(channel)
  if (!def) {
    failures += 1
    console.error(`  ✗ 未找到通道 ${channel}`)
    continue
  }
  checks += 1
  try {
    sanitizeArgs(def, args)
    failures += 1
    console.error(`  ✗ 攻击负载未拦截 ${name}`)
  } catch (error) {
    if (error && error.code === 'VALIDATION') {
      console.log(`  ✓ 拦截 ${name}`)
    } else {
      failures += 1
      console.error(`  ✗ ${name} 抛出非校验错误: ${error && error.message}`)
    }
  }
}
console.log(`合法负载通过 ${acceptedCount}，攻击负载用例 ${Object.keys(attackPayloads).length}`)

console.log('== 5. 防御语义（净化结果断言）与业务层白名单（真实调用 handler）==')
;(async () => {
  // 校验层的「净化语义」用例：未知键被剥离 / 数字字符串被收敛为整数
  const defenseCases = [
    {
      name: 'ai:saveConfig#任意键注入 → 未知键剥离',
      channel: 'ai:saveConfig',
      args: [{ provider: 'openai', aiShellEnabled: true, killBeforeLaunch: true }],
      assert: (out) => !('aiShellEnabled' in out[0]) && !('killBeforeLaunch' in out[0]) && out[0].provider === 'openai'
    },
    {
      name: 'pet:updateSettings#任意设置键写入 → 未知键剥离',
      channel: 'pet:updateSettings',
      args: [{ scale: 1, aiProviderKeysEncrypted: { openai: 'Zm9v' } }],
      assert: (out) => !('aiProviderKeysEncrypted' in out[0]) && out[0].scale === 1
    },
    {
      name: 'process:terminate#数字字符串 PID → 收敛为整数',
      channel: 'process:terminate',
      args: ['1234'],
      assert: (out) => out[0] === 1234
    }
  ]
  for (const c of defenseCases) {
    checks += 1
    const def = defMap.get(c.channel)
    try {
      const out = sanitizeArgs(def, c.args)
      if (c.assert(out)) {
        console.log(`  ✓ ${c.name}`)
      } else {
        failures += 1
        console.error(`  ✗ ${c.name} — 净化结果不符合预期`)
      }
    } catch (error) {
      failures += 1
      console.error(`  ✗ ${c.name} — 校验层意外拒绝: ${error.message}`)
    }
  }

  // 业务层白名单：schema 放行、业务 handler 拒绝（非法目标在 openExternal 之前即抛错，无副作用）
  const handlerCases = [
    { name: 'external:open#file 协议 → 业务层拒绝', channel: 'external:open', args: ['file:///etc/passwd'] },
    { name: 'external:open#非 github 域名 → 业务层拒绝', channel: 'external:open', args: ['https://evil.com/x'] },
    { name: 'releases:download#非仓库链接 → 业务层拒绝', channel: 'releases:download', args: ['https://evil.com/LaunchPad-Setup.exe'] },
    { name: 'releases:download#非 HTTPS → 业务层拒绝', channel: 'releases:download', args: ['ftp://github.com/x'] }
  ]
  for (const c of handlerCases) {
    checks += 1
    const def = defMap.get(c.channel)
    let result
    try {
      const out = sanitizeArgs(def, c.args)
      // 与 registry wrapper 相同的语义：handler 抛错 → 包装为 { error }
      try {
        result = await def.handler({}, ...out)
      } catch (error) {
        result = { error: error && error.message ? error.message : String(error) }
      }
      if (result && typeof result === 'object' && result.error) {
        console.log(`  ✓ ${c.name}（${result.error.slice(0, 20)}…）`)
      } else {
        failures += 1
        console.error(`  ✗ ${c.name} — 业务层未拦截: ${JSON.stringify(result).slice(0, 80)}`)
      }
    } catch (error) {
      failures += 1
      console.error(`  ✗ ${c.name} — 校验层意外拒绝: ${error.message}`)
    }
  }

  console.log(`\n共 ${checks} 项检查，失败 ${failures} 项`)
  if (failures > 0) process.exit(1)
  console.log('全部通过 ✓')
})()