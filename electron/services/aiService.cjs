const fs = require('fs')
const path = require('path')
const { app, safeStorage } = require('electron')
const { settingsDao, conversationDao, memoryDao, workspaceDao, softwareDao } = require('../db/index.cjs')
const workspaceEngine = require('./workspaceEngine.cjs')
const processManager = require('./processManager.cjs')
const perfMonitor = require('./perfMonitor.cjs')
const { t } = require('../i18n.cjs')

const LEGACY_DEFAULT_PERSONALITY = '你是一只安静、友善的工作陪伴型桌宠。回答简短自然，优先鼓励用户拆分任务、专注工作和适时休息。'
const maintenanceChains = new Map()
let projectDocsCache = null

// 读取项目发布历史（release-history.json 随应用打包在 resources），
// 作为项目背景注入 AI，让回答更了解 LaunchPad 的能力。
function getProjectDocs() {
  if (projectDocsCache !== null) return projectDocsCache
  try {
    const candidates = app.isPackaged
      ? [path.join(process.resourcesPath, 'release-history.json')]
      : [path.join(app.getAppPath(), 'release-history.json')]
    const filePath = candidates.find((item) => fs.existsSync(item))
    if (!filePath) {
      projectDocsCache = ''
      return projectDocsCache
    }
    const list = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const lines = (Array.isArray(list) ? list : []).slice(0, 8).map((item) => {
      const notes = String(item.notes || '')
        .replace(/^#{1,6}\s+.*$/gm, '')
        .replace(/\n+/g, ' ')
        .trim()
      return `- v${item.version}: ${notes.slice(0, 220)}`
    })
    projectDocsCache = lines.join('\n')
    return projectDocsCache
  } catch (_) {
    projectDocsCache = ''
    return projectDocsCache
  }
}

function projectContext() {
  const docs = getProjectDocs()
  if (!docs) return ''
  return `\n\nProject background (LaunchPad is a Windows workspace launcher with a desktop pet assistant). Feature history:\n${docs}\nUse this background to answer questions about the product accurately.`
}

// ===== Function Calling 工具 =====
// 基础工具始终可用；危险工具（结束进程、Shell 执行）仅在用户开启"完全权限"后暴露。
const BASE_TOOL_DEFINITIONS = [
  {
    name: 'list_workspaces',
    description: '列出所有工作空间（名称、图标、ID）。用户想启动、关闭或了解工作空间时先调用。',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'launch_workspace',
    description: '一键启动指定工作空间（按名称或 ID 匹配）。启动所有关联软件。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '工作空间名称或数字 ID' } },
      required: ['name']
    }
  },
  {
    name: 'close_workspace',
    description: '一键关闭指定工作空间：结束其中所有软件进程（按名称或 ID 匹配）。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '工作空间名称或数字 ID' } },
      required: ['name']
    }
  },
  {
    name: 'list_software',
    description: '列出软件库中的软件（名称、路径），最多 50 条。',
    parameters: {
      type: 'object',
      properties: { keyword: { type: 'string', description: '可选，按名称过滤' } },
      required: []
    }
  },
  {
    name: 'get_system_info',
    description: '读取系统当前状态：CPU 使用率、内存使用率、磁盘空间。',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'show_launchpad',
    description: '打开（唤起）LaunchPad 主窗口。',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'open_browser',
    description: '用系统默认浏览器打开网址或搜索关键词。用户要求打开网页、搜索信息、查天气等时调用。传入 url（完整网址）或 query（搜索词）之一。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要打开的完整网址（http/https，与 query 二选一）' },
        query: { type: 'string', description: '搜索关键词，将用 Bing 搜索（与 url 二选一）' }
      },
      required: []
    }
  }
]

const DANGEROUS_TOOL_DEFINITIONS = [
  {
    name: 'terminate_process',
    description: '结束指定进程（按 PID 或进程名，如 chrome.exe）。危险操作，仅在用户明确要求时使用。',
    parameters: {
      type: 'object',
      properties: {
        pid: { type: 'number', description: '进程 PID（与 name 二选一）' },
        name: { type: 'string', description: '进程名，如 chrome.exe（与 pid 二选一）' }
      },
      required: []
    }
  },
  {
    name: 'execute_shell',
    description: '在用户的 Windows 电脑上执行一条 PowerShell 命令并返回输出。危险操作，仅在用户明确要求时使用。也可作为兜底：当其他工具无法完成任务时（如打开网页、搜索），用 start 命令打开浏览器。',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: '要执行的 PowerShell 命令' } },
      required: ['command']
    }
  }
]

function shellPermissionEnabled() {
  return settingsDao.get('aiShellEnabled') === true
}

function getActiveToolDefinitions() {
  return shellPermissionEnabled()
    ? [...BASE_TOOL_DEFINITIONS, ...DANGEROUS_TOOL_DEFINITIONS]
    : BASE_TOOL_DEFINITIONS
}

function parseToolArgs(raw) {
  if (raw == null) return {}
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_) {
    return {}
  }
}

function listWorkspaceSummaries() {
  return workspaceDao.list().map((item) => ({
    id: item.id,
    name: item.name,
    icon: item.icon || '🚀',
    description: item.description || ''
  }))
}

function findWorkspace(nameOrId) {
  const value = String(nameOrId ?? '').trim()
  if (!value) return null
  const byId = workspaceDao.get(Number(value))
  if (byId) return byId
  return listWorkspaceSummaries().find((item) =>
    item.name === value || String(item.name).toLowerCase() === value.toLowerCase()
  ) || null
}

async function executeTool(name, args) {
  switch (name) {
    case 'list_workspaces': {
      const workspaces = listWorkspaceSummaries()
      if (workspaces.length === 0) return t('pet.toolNoWorkspace')
      return JSON.stringify(workspaces.map((item) => ({ id: item.id, name: item.name, icon: item.icon || '🚀' })))
    }
    case 'launch_workspace': {
      const workspace = findWorkspace(args?.name)
      if (!workspace) return t('pet.toolWorkspaceNotFound')
      try {
        await workspaceEngine.launchWorkspace(workspace.id)
        const software = workspaceDao.get(workspace.id)
        return t('pet.toolLaunchOk', { name: workspace.name, count: (software?.software || []).length })
      } catch (error) {
        return t('pet.toolLaunchFailed', { message: error.message })
      }
    }
    case 'close_workspace': {
      const workspace = findWorkspace(args?.name)
      if (!workspace) return t('pet.toolWorkspaceNotFound')
      const software = (workspace.software || []).filter((item) => item.path)
      let killed = 0
      for (const item of software) {
        try {
          const result = await processManager.terminateByExecutablePath(item.path)
          killed += result.killed || 0
        } catch (_) {
          // 单个结束失败不阻断。
        }
      }
      return t('pet.toolCloseOk', { name: workspace.name, count: killed })
    }
    case 'list_software': {
      const keyword = String(args?.keyword || '').trim().toLowerCase()
      const items = softwareDao.list().filter((item) => !keyword || String(item.name).toLowerCase().includes(keyword))
      if (items.length === 0) return t('pet.toolNoSoftware')
      return JSON.stringify(items.slice(0, 50).map((item) => ({ id: item.id, name: item.name, path: item.path })))
    }
    case 'get_system_info': {
      const snapshot = await perfMonitor.getSnapshot()
      const cpu = Number.isFinite(snapshot.cpu?.usage) ? snapshot.cpu.usage : null
      const mem = Number.isFinite(snapshot.memory?.usage) ? snapshot.memory.usage : null
      return JSON.stringify({ cpuPercent: cpu != null ? Math.round(cpu) : null, memoryPercent: mem != null ? Math.round(mem) : null })
    }
    case 'show_launchpad': {
      const { BrowserWindow } = require('electron')
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.getURL && !String(win.getURL()).includes('#/pet')) {
          if (win.isMinimized()) win.restore()
          win.show()
          win.focus()
          return t('pet.toolWindowShown')
        }
      }
      return t('pet.toolWindowMissing')
    }
    case 'open_browser': {
      const { shell } = require('electron')
      const rawUrl = String(args?.url || '').trim()
      const query = String(args?.query || '').trim()
      if (!rawUrl && !query) return t('pet.toolBrowserNeedTarget')
      let target = ''
      if (rawUrl) {
        let parsed
        try { parsed = new URL(rawUrl) } catch (_) { parsed = null }
        if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) return t('pet.toolBrowserInvalidUrl')
        target = rawUrl
      } else {
        target = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
      }
      try {
        await shell.openExternal(target)
        const crashLogger = require('./crashLogger.cjs')
        crashLogger.log('ai-open-browser', { target }, { source: 'ai' })
        return t('pet.toolBrowserOpen', { target })
      } catch (error) {
        return t('pet.toolBrowserFailed', { message: error.message })
      }
    }
    case 'terminate_process': {
      if (!shellPermissionEnabled()) return t('pet.toolPermissionDenied')
      const pid = Number(args?.pid)
      if (Number.isInteger(pid) && pid > 0) {
        try {
          const result = await processManager.terminateProcessTree(pid)
          return t('pet.toolKillOk', { target: result.name || pid, count: 1 })
        } catch (error) {
          return t('pet.toolKillFailed', { message: error.message })
        }
      }
      const name = String(args?.name || '').trim()
      if (!name) return t('pet.toolKillNeedTarget')
      const base = await processManager.getProcessBase()
      const matches = (Array.isArray(base?.value) ? base.value : [])
        .filter((item) => String(item.name || '').toLowerCase() === name.toLowerCase())
      if (matches.length === 0) return t('pet.toolKillNotFound')
      let killed = 0
      for (const item of matches) {
        try {
          await processManager.terminateProcessTree(item.pid)
          killed += 1
        } catch (_) {
          // 单个进程结束失败不阻断。
        }
      }
      return t('pet.toolKillOk', { target: name, count: killed })
    }
    case 'execute_shell': {
      if (!shellPermissionEnabled()) return t('pet.toolPermissionDenied')
      const command = String(args?.command || '').trim()
      if (!command) return t('pet.toolShellEmpty')
      const { execFile } = require('child_process')
      const crashLogger = require('./crashLogger.cjs')
      crashLogger.log('ai-shell-exec', { command }, { source: 'ai' })
      return new Promise((resolve) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', command],
          { windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error && error.killed) {
              resolve(t('pet.toolShellTimeout'))
              return
            }
            const output = String(stdout || '').trim()
            const errorOutput = String(stderr || '').trim()
            if (!output && !errorOutput) {
              resolve(error ? t('pet.toolShellFailed', { message: error.message }) : t('pet.toolShellEmpty'))
              return
            }
            const combined = [output, errorOutput].filter(Boolean).join('\n').slice(0, 2000)
            resolve(error ? t('pet.toolShellFailedWithOutput', { message: error.message, output: combined }) : combined)
          }
        )
      })
    }
    default:
      return t('pet.toolUnknown')
  }
}

// 工具发送格式转换
function toChatTools() {
  return getActiveToolDefinitions().map((tool) => ({ type: 'function', function: tool }))
}
function toResponseTools() {
  return getActiveToolDefinitions().map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters }))
}

function decryptKey(provider = settingsDao.get('aiProvider') || 'openai') {
  const providerKeys = settingsDao.get('aiProviderKeysEncrypted') || {}
  const stored = providerKeys[provider] || (provider === 'openai' ? settingsDao.get('aiApiKeyEncrypted') : '')
  if (!stored) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    return Buffer.from(stored, 'base64').toString('utf8')
  } catch (_) { return '' }
}

function encryptKey(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const buffer = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8')
  return buffer.toString('base64')
}

function getMemoryMode() {
  const mode = settingsDao.get('aiMemoryMode')
  return ['off', 'manual', 'auto'].includes(mode) ? mode : 'manual'
}

function getConfig() {
  const storedPersonality = settingsDao.get('aiPetPersonality')
  const providerKeys = Object.fromEntries(
    ['openai', 'deepseek', 'kimi', 'zhipu', 'custom'].map((provider) => [provider, Boolean(decryptKey(provider))])
  )
  return {
    provider: settingsDao.get('aiProvider') || 'custom',
    apiFormat: settingsDao.get('aiApiFormat') || 'responses',
    baseUrl: settingsDao.get('aiBaseUrl'),
    model: settingsDao.get('aiModel'),
    petName: settingsDao.get('aiPetName'),
    personality: !storedPersonality || storedPersonality === LEGACY_DEFAULT_PERSONALITY
      ? t('pet.defaultPersonality')
      : storedPersonality,
    hasApiKey: Boolean(decryptKey()),
    providerKeys,
    memoryMode: getMemoryMode(),
    shellEnabled: shellPermissionEnabled()
  }
}

function saveConfig(config = {}) {
  if (Object.prototype.hasOwnProperty.call(config, 'provider')) {
    const provider = String(config.provider || '').trim()
    if (!['openai', 'deepseek', 'kimi', 'zhipu', 'custom'].includes(provider)) throw new Error(t('pet.invalidProvider'))
    settingsDao.set('aiProvider', provider)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'apiFormat')) {
    const apiFormat = String(config.apiFormat || '').trim()
    if (!['chat-completions', 'responses'].includes(apiFormat)) throw new Error(t('pet.invalidApiFormat'))
    settingsDao.set('aiApiFormat', apiFormat)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'baseUrl')) {
    const url = new URL(String(config.baseUrl || '').trim())
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error(t('pet.httpsRequired'))
    settingsDao.set('aiBaseUrl', url.toString().replace(/\/$/, ''))
  }
  if (Object.prototype.hasOwnProperty.call(config, 'model')) {
    const model = String(config.model || '').trim()
    if (!model || model.length > 100) throw new Error(t('pet.invalidModel'))
    settingsDao.set('aiModel', model)
  }
  if (Object.prototype.hasOwnProperty.call(config, 'petName')) settingsDao.set('aiPetName', String(config.petName || t('pet.defaultName')).trim().slice(0, 40))
  if (Object.prototype.hasOwnProperty.call(config, 'personality')) settingsDao.set('aiPetPersonality', String(config.personality || '').trim().slice(0, 1200))
  if (Object.prototype.hasOwnProperty.call(config, 'memoryMode')) setMemoryMode(config.memoryMode)
  if (Object.prototype.hasOwnProperty.call(config, 'shellEnabled')) settingsDao.set('aiShellEnabled', config.shellEnabled === true)

  const provider = String(config.provider || settingsDao.get('aiProvider') || 'custom')
  const providerKeys = { ...(settingsDao.get('aiProviderKeysEncrypted') || {}) }
  if (config.clearApiKey) delete providerKeys[provider]
  if (String(config.apiKey || '').trim()) providerKeys[provider] = encryptKey(config.apiKey)
  settingsDao.set('aiProviderKeysEncrypted', providerKeys)
  return getConfig()
}

function setMemoryMode(mode) {
  const value = String(mode || '')
  if (!['off', 'manual', 'auto'].includes(value)) throw new Error('Invalid memory mode')
  settingsDao.set('aiMemoryMode', value)
  return { mode: value }
}

function extractText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim()
  const parts = []
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content.text) parts.push(content.text)
    }
  }
  return parts.join('\n').trim()
}

function extractChatText(payload) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string' && content.trim()) return content.trim()
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('').trim()
  return ''
}

async function requestModel(instructions, input, timeout = 45000, options = {}) {
  const key = decryptKey()
  if (!key) throw new Error(t('pet.keyRequired'))
  const baseUrl = String(settingsDao.get('aiBaseUrl') || '').replace(/\/$/, '')
  const apiFormat = settingsDao.get('aiApiFormat') || 'responses'
  const model = String(settingsDao.get('aiModel') || '').trim()
  const withTools = options.tools === true
  const native = options.native === true
  const normalized = input.map((item) => ({
    role: item?.role === 'assistant' ? 'assistant' : 'user',
    content: String(item?.content || '').slice(0, 12000)
  })).filter((item) => item.content.trim())
  const endpoint = apiFormat === 'responses' ? 'responses' : 'chat/completions'
  const body = apiFormat === 'responses'
    ? {
        model,
        store: false,
        instructions,
        input: native ? input : normalized,
        ...(withTools ? { tools: toResponseTools() } : {})
      }
    : {
        model,
        messages: native
          ? [{ role: 'system', content: instructions }, ...input]
          : [{ role: 'system', content: instructions }, ...normalized],
        stream: false,
        ...(withTools ? { tools: toChatTools(), tool_choice: 'auto' } : {})
      }
  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || t('pet.requestFailed', { status: response.status }))
  const text = apiFormat === 'responses' ? extractText(payload) : extractChatText(payload)
  const rawToolCalls = apiFormat === 'responses'
    ? (payload?.output || []).filter((item) => item?.type === 'function_call')
    : ((payload?.choices?.[0]?.message?.tool_calls) || [])
  const toolCalls = rawToolCalls.map((item) => apiFormat === 'responses'
    ? { id: item.call_id, name: item.name, args: parseToolArgs(item.arguments) }
    : { id: item.id, name: item.function?.name, args: parseToolArgs(item.function?.arguments) })
  if (!text && toolCalls.length === 0) throw new Error(t('pet.emptyResponse'))
  return { text, toolCalls, rawToolCalls }
}

// ===== Function Calling 执行循环 =====
// 最多 maxRounds 轮：每轮把工具调用结果回填消息后继续请求，直到模型给出最终文本。
async function runToolLoop(instructions, history, maxRounds = 3) {
  const apiFormat = settingsDao.get('aiApiFormat') || 'responses'
  const toolLog = []
  const neutral = history.map((item) => ({ role: item.role, content: item.content }))

  if (apiFormat === 'responses') {
    let input = neutral
    for (let round = 0; round < maxRounds; round += 1) {
      const result = await requestModel(instructions, input, 45000, { tools: true, native: true })
      if (result.toolCalls.length === 0) return { text: result.text, toolLog }
      for (const raw of result.rawToolCalls) {
        input.push({ type: 'function_call', call_id: raw.call_id, name: raw.name, arguments: raw.arguments || '{}' })
      }
      for (const call of result.toolCalls) {
        const output = await executeTool(call.name, call.args)
        toolLog.push({ name: call.name, args: call.args, output: String(output).slice(0, 400) })
        input.push({ type: 'function_call_output', call_id: call.id, output: String(output) })
      }
      input.push({ role: 'user', content: t('pet.toolContinueHint') })
    }
  } else {
    let messages = neutral
    for (let round = 0; round < maxRounds; round += 1) {
      const result = await requestModel(instructions, messages, 45000, { tools: true, native: true })
      if (result.toolCalls.length === 0) return { text: result.text, toolLog }
      messages.push({ role: 'assistant', content: result.text || '', tool_calls: result.rawToolCalls })
      for (const call of result.toolCalls) {
        const output = await executeTool(call.name, call.args)
        toolLog.push({ name: call.name, args: call.args, output: String(output).slice(0, 400) })
        messages.push({ role: 'tool', tool_call_id: call.id, content: String(output) })
      }
    }
  }

  // 轮数耗尽仍无最终文本：强制总结
  const final = await requestModel(instructions, neutral, 45000)
  return { text: final.text, toolLog }
}

function getConversation(conversationId) {
  const conversation = conversationId ? conversationDao.setActive(conversationId) : conversationDao.ensureActive()
  return { conversation, messages: conversationDao.listMessages(conversation.id) }
}

function listConversations() { return conversationDao.list() }
function createConversation(title = '') { return getConversation(conversationDao.create(title).id) }
function switchConversation(id) { return getConversation(conversationDao.setActive(id).id) }
function clearConversation(id) {
  const conversation = conversationDao.clear(id || conversationDao.ensureActive().id)
  return { conversation, messages: [] }
}

function memoryContext(memories) {
  if (!memories.length) return ''
  return `\n\nRelevant long-term memories (use only when helpful; do not mention this list unless asked):\n${memories.map((item) => `- [${item.type}] ${item.content}`).join('\n')}`
}

function summaryContext(conversation) {
  return conversation.summary ? `\n\nEarlier conversation summary:\n${conversation.summary}` : ''
}

function titleFromMessage(content) {
  const compact = String(content || '').replace(/\s+/g, ' ').trim()
  return compact.length > 32 ? `${compact.slice(0, 32)}…` : compact
}

async function chat(request = {}) {
  const legacyMessages = Array.isArray(request) ? request : null
  const content = legacyMessages
    ? [...legacyMessages].reverse().find((item) => item?.role === 'user')?.content
    : request.content
  const conversation = request.conversationId
    ? conversationDao.setActive(request.conversationId)
    : conversationDao.ensureActive()
  const userMessage = conversationDao.appendMessage(conversation.id, 'user', content)
  if (!conversation.title) conversationDao.setTitle(conversation.id, titleFromMessage(content))

  const memoryMode = getMemoryMode()
  const memories = memoryMode === 'off' ? [] : memoryDao.search(content, 8)
  const recent = conversationDao.listMessages(conversation.id, 16)
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({ role: item.role, content: item.content }))
  const current = conversationDao.get(conversation.id)
  const petName = settingsDao.get('aiPetName') || t('pet.defaultName')
  const storedPersonality = settingsDao.get('aiPetPersonality')
  const personality = !storedPersonality || storedPersonality === LEGACY_DEFAULT_PERSONALITY
    ? t('pet.defaultPersonality')
    : storedPersonality
  const instructions = `${t('pet.systemInstruction', { name: petName, personality })}\n${t('pet.responseLanguageRule')}${projectContext()}${summaryContext(current)}${memoryContext(memories)}`
  const { text, toolLog } = await runToolLoop(instructions, recent)
  const assistantMessage = conversationDao.appendMessage(conversation.id, 'assistant', text)
  scheduleMaintenance(conversation.id, userMessage, assistantMessage)
  return {
    text,
    toolLog,
    conversation: conversationDao.get(conversation.id),
    userMessage,
    assistantMessage,
    memoriesUsed: memories.map((item) => item.id)
  }
}

function parseJsonArray(text) {
  const source = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    const parsed = JSON.parse(source)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    const match = source.match(/\[[\s\S]*\]/)
    if (!match) return []
    try { return JSON.parse(match[0]) } catch (_) { return [] }
  }
}

function looksSensitiveMemory(content) {
  const value = String(content || '')
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value) ||
    /\b(?:sk|ghp|github_pat|xox[baprs])-?[a-z0-9_\-]{16,}\b/i.test(value) ||
    /\b(?:password|passwd|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i.test(value) ||
    /\bBearer\s+[a-z0-9._\-]{12,}/i.test(value)
}

async function updateConversationSummary(conversationId) {
  const batch = conversationDao.summaryBatch(conversationId)
  if (!batch?.messages?.length) return
  const transcript = batch.messages.map((item) => `${item.role}: ${item.content}`).join('\n')
  const result = await requestModel(
    'Summarize the conversation for future context. Preserve user preferences, decisions, project facts and unresolved tasks. Be concise, factual, and use the same primary language as the conversation.',
    [{ role: 'user', content: `${batch.conversation.summary ? `Previous summary:\n${batch.conversation.summary}\n\n` : ''}New messages:\n${transcript}` }],
    30000
  )
  conversationDao.updateSummary(conversationId, result.text, batch.throughMessageId)
}

async function extractAutomaticMemories(userMessage, assistantMessage) {
  const memoryMode = getMemoryMode()
  if (memoryMode === 'off') return
  const result = await requestModel(
    'Extract only durable, explicitly stated user facts useful in future conversations. Ignore transient requests, secrets, passwords and assistant claims. Return a JSON array only, maximum 3 items. Each item: {"type":"preference|project|person|habit|environment|task","content":"concise fact","confidence":0.0-1.0,"expiresAt":null}. Return [] when nothing should be remembered.',
    [{ role: 'user', content: `User message:\n${userMessage.content}\n\nAssistant reply for context:\n${assistantMessage.content}` }],
    30000
  )
  for (const item of parseJsonArray(result.text).slice(0, 3)) {
    if (!item?.content || !memoryDao.TYPES.includes(item.type) || looksSensitiveMemory(item.content)) continue
    memoryDao.create({
      type: item.type,
      content: item.content,
      confidence: item.confidence,
      sourceMessageId: userMessage.id,
      expiresAt: item.expiresAt,
      confirmed: memoryMode === 'auto'
    })
  }
}

function scheduleMaintenance(conversationId, userMessage, assistantMessage) {
  const previous = maintenanceChains.get(conversationId) || Promise.resolve()
  const next = previous.catch(() => {}).then(async () => {
      await updateConversationSummary(conversationId).catch((error) => console.warn('[ai] summary skipped:', error.message))
      await extractAutomaticMemories(userMessage, assistantMessage).catch((error) => console.warn('[ai] memory extraction skipped:', error.message))
  }).finally(() => {
    if (maintenanceChains.get(conversationId) === next) maintenanceChains.delete(conversationId)
  })
  maintenanceChains.set(conversationId, next)
}

function listMemories(options) { return memoryDao.list(options) }
function createMemory(data) { return memoryDao.create(data) }
function updateMemory(id, data) { return memoryDao.update(id, data) }
function forgetMemory(id) { return memoryDao.archive(id) }
function clearMemories() { return memoryDao.clear() }

module.exports = {
  getConfig, saveConfig, chat,
  getConversation, listConversations, createConversation, switchConversation, clearConversation,
  setMemoryMode, listMemories, createMemory, updateMemory, forgetMemory, clearMemories
}
