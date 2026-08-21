// AI 域路由：会话 / 记忆 / 配置 / 对话
// 所有入参先过契约校验（validate.cjs），再进入 aiService
const { BrowserWindow } = require('electron')
const aiService = require('../../services/aiService.cjs')
const {
  str, num, id, bool, oneOf, optional, obj, arr, or, ValidationError
} = require('../validate.cjs')

// 广播 AI 会话变更到所有窗口（与旧 handlers.cjs 行为一致）
function broadcastAi(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

// 记忆类型与 aiService/memoryDao 保持一致
const MEMORY_TYPES = ['preference', 'project', 'person', 'habit', 'environment', 'task']
const PROVIDERS = ['openai', 'deepseek', 'kimi', 'zhipu', 'custom']

// ai:saveConfig 允许的字段白名单（未知键一律剥离，防止借道写任意 settings）
const aiConfigSchema = obj({
  provider: optional(oneOf(PROVIDERS)),
  apiFormat: optional(oneOf(['chat-completions', 'responses'])),
  baseUrl: optional(str({ max: 512 })),
  model: optional(str({ max: 100 })),
  petName: optional(str({ max: 40 })),
  personality: optional(str({ max: 1200 })),
  mode: optional(oneOf(['concise', 'focus', 'creative', 'casual'])),
  memoryMode: optional(oneOf(['off', 'manual', 'auto'])),
  shellEnabled: optional(bool()),
  apiKey: optional(str({ max: 512 })),
  clearApiKey: optional(bool())
})

// ai:chat 请求体（兼容旧版数组消息形式）
const chatRequestSchema = obj({
  conversationId: optional(id()),
  content: optional(str({ max: 12000 }))
}, { label: '聊天请求' })
const legacyMessagesSchema = arr(
  obj({ role: oneOf(['user', 'assistant']), content: str({ max: 12000 }) }, { label: '消息' }),
  { max: 64 }
)

// ai:memory:create / update 共用字段
const memoryFields = {
  type: optional(oneOf(MEMORY_TYPES)),
  content: optional(str({ min: 1, max: 2000 })),
  confidence: optional(num({ min: 0, max: 1 })),
  sourceMessageId: optional(id()),
  expiresAt: optional(str({ max: 64 })),
  confirmed: optional(bool()),
  archived: optional(bool())
}
const memoryCreateSchema = obj({
  ...memoryFields,
  content: str({ min: 1, max: 2000, label: '记忆内容' })
}, { label: '记忆数据' })
const memoryUpdateSchema = obj(memoryFields, { label: '记忆数据' })

const aiRoutes = [
  {
    channel: 'ai:getConfig',
    schema: [],
    handler: () => aiService.getConfig()
  },
  {
    channel: 'ai:saveConfig',
    schema: [aiConfigSchema],
    handler: (_event, config) => aiService.saveConfig(config)
  },
  {
    channel: 'ai:chat',
    schema: [or(chatRequestSchema, legacyMessagesSchema)],
    handler: async (event, request) => {
      const sender = event.sender
      const result = await aiService.chat(request, {
        onDelta: (delta) => {
          if (!sender.isDestroyed()) sender.send('ai:chatDelta', { delta })
        },
        onTool: (tool) => {
          if (!sender.isDestroyed()) sender.send('ai:chatTool', tool)
        }
      })
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id })
      return result
    }
  },
  {
    channel: 'ai:conversation:get',
    // 允许不传 ID（走 ensureActive）
    schema: [optional(id())],
    handler: (_event, conversationId) => aiService.getConversation(conversationId)
  },
  {
    channel: 'ai:conversation:list',
    schema: [],
    handler: () => aiService.listConversations()
  },
  {
    channel: 'ai:conversation:create',
    schema: [optional(str({ max: 80 }))],
    handler: (_event, title) => {
      const result = aiService.createConversation(title)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, switched: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:switch',
    schema: [id()],
    handler: (_event, idValue) => {
      const result = aiService.switchConversation(idValue)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, switched: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:clear',
    schema: [id()],
    handler: (_event, idValue) => {
      const result = aiService.clearConversation(idValue)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, cleared: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:rename',
    schema: [id(), str({ min: 1, max: 80, trim: true, label: '会话主题' })],
    handler: (_event, idValue, title) => {
      const result = aiService.renameConversation(idValue, title)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, renamed: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:delete',
    schema: [id()],
    handler: (_event, idValue) => {
      const result = aiService.deleteConversation(idValue)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, deletedId: result.deletedId, switched: true })
      return result
    }
  },
  {
    channel: 'ai:memory:setMode',
    schema: [oneOf(['off', 'manual', 'auto'], { label: '记忆模式' })],
    handler: (_event, mode) => {
      const result = aiService.setMemoryMode(mode)
      broadcastAi('ai:memoryChanged', result)
      return result
    }
  },
  {
    channel: 'ai:memory:list',
    schema: [optional(obj({
      includeArchived: optional(bool()),
      includePending: optional(bool()),
      limit: optional(num({ integer: true, min: 1, max: 500 }))
    }, { label: '查询条件' }))],
    handler: (_event, options) => aiService.listMemories(options)
  },
  {
    channel: 'ai:memory:create',
    schema: [memoryCreateSchema],
    handler: (_event, data) => {
      const result = aiService.createMemory(data)
      broadcastAi('ai:memoryChanged', { id: result.id })
      return result
    }
  },
  {
    channel: 'ai:memory:update',
    schema: [id(), memoryUpdateSchema],
    handler: (_event, memoryId, data) => {
      const result = aiService.updateMemory(memoryId, data)
      broadcastAi('ai:memoryChanged', { id: result.id })
      return result
    }
  },
  {
    channel: 'ai:memory:forget',
    schema: [id()],
    handler: (_event, memoryId) => {
      const result = aiService.forgetMemory(memoryId)
      broadcastAi('ai:memoryChanged', { id: result.id })
      return result
    }
  },
  {
    channel: 'ai:memory:clear',
    schema: [],
    handler: () => {
      const result = aiService.clearMemories()
      broadcastAi('ai:memoryChanged', { cleared: true })
      return result
    }
  }
]

module.exports = aiRoutes
