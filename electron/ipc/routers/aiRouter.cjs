// AI 域路由：会话 / 记忆 / 配置 / 对话
// 所有入参先过契约校验（validate.cjs），再进入 aiService
const { BrowserWindow, desktopCapturer, screen } = require('electron')
const aiService = require('../../services/aiService.cjs')
const { t } = require('../../i18n.cjs')
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
const petIdSchema = optional(str({ max: 200 }))

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
  visionEnabled: optional(bool()),
  apiKey: optional(str({ max: 512 })),
  clearApiKey: optional(bool())
})

// ai:chat 请求体（兼容旧版数组消息形式）
const chatRequestSchema = obj({
  conversationId: optional(id()),
  petModelId: petIdSchema,
  content: optional(str({ max: 12000 })),
  // 多模态图片以 data URL 数组传入，由 aiService 再做格式与体积收敛
  images: optional(arr(str({ max: 4 * 1024 * 1024, label: '图片' }), { max: 4, label: '图片列表' }))
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
    schema: [petIdSchema],
    handler: (_event, petModelId) => aiService.getConfig(petModelId)
  },
  {
    channel: 'ai:saveConfig',
    schema: [aiConfigSchema, petIdSchema],
    handler: (_event, config, petModelId) => aiService.saveConfig(config, petModelId)
  },
  {
    // 用一张内置测试图验证连接与多模态能力，帮助用户快速判断自定义模型是否支持识图
    channel: 'ai:detectModel',
    schema: [petIdSchema],
    handler: (_event, petModelId) => aiService.detectModel(petModelId)
  },
  {
    // 用当前 API Key 拉取可用模型列表；未保存的 Key 与地址也可直接传入
    channel: 'ai:listModels',
    schema: [obj({
      provider: optional(oneOf(PROVIDERS)),
      baseUrl: optional(str({ max: 512 })),
      apiKey: optional(str({ max: 512 }))
    }, { label: '模型列表请求' })],
    handler: (_event, request) => aiService.listProviderModels(request)
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
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, petModelId: result.conversation.pet_model_id })
      return result
    }
  },
  {
    // 捕获主显示器画面并转成 JPEG data URL；截图期间临时隐藏桌宠窗口，
    // 避免透明浮层遮挡用户想询问的内容。
    channel: 'ai:captureScreen',
    schema: [],
    handler: async () => {
      const petWindows = BrowserWindow.getAllWindows().filter((win) =>
        !win.isDestroyed() && win.isVisible() && String(win.getURL()).includes('#/pet')
      )
      for (const win of petWindows) win.hide()
      if (petWindows.length > 0) await new Promise((resolve) => setTimeout(resolve, 160))
      try {
        const display = screen.getPrimaryDisplay()
        const targetWidth = Math.min(1440, display.size.width)
        const targetHeight = Math.round(display.size.height * targetWidth / display.size.width)
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.round(targetWidth * display.scaleFactor),
            height: Math.round(targetHeight * display.scaleFactor)
          }
        })
        const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0]
        if (!source || source.thumbnail.isEmpty()) throw new Error(t('pet.screenshotFailed'))
        const jpeg = source.thumbnail.toJPEG(86)
        const size = source.thumbnail.getSize()
        return {
          dataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
          width: size.width,
          height: size.height
        }
      } finally {
        for (const win of petWindows) if (!win.isDestroyed()) win.showInactive()
      }
    }
  },
  {
    channel: 'ai:conversation:get',
    // 允许不传 ID（走 ensureActive）
    schema: [optional(id()), petIdSchema],
    handler: (_event, conversationId, petModelId) => aiService.getConversation(conversationId, petModelId)
  },
  {
    channel: 'ai:conversation:list',
    schema: [petIdSchema],
    handler: (_event, petModelId) => aiService.listConversations(petModelId)
  },
  {
    channel: 'ai:conversation:create',
    schema: [optional(str({ max: 80 })), petIdSchema],
    handler: (_event, title, petModelId) => {
      const result = aiService.createConversation(title, petModelId)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, petModelId: result.conversation.pet_model_id, switched: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:switch',
    schema: [id(), petIdSchema],
    handler: (_event, idValue, petModelId) => {
      const result = aiService.switchConversation(idValue, petModelId)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, petModelId: result.conversation.pet_model_id, switched: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:clear',
    schema: [id(), petIdSchema],
    handler: (_event, idValue, petModelId) => {
      const result = aiService.clearConversation(idValue, petModelId)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, petModelId: result.conversation.pet_model_id, cleared: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:rename',
    schema: [id(), str({ min: 1, max: 80, trim: true, label: '会话主题' }), petIdSchema],
    handler: (_event, idValue, title, petModelId) => {
      const result = aiService.renameConversation(idValue, title, petModelId)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, petModelId: result.conversation.pet_model_id, renamed: true })
      return result
    }
  },
  {
    channel: 'ai:conversation:delete',
    schema: [id(), petIdSchema],
    handler: (_event, idValue, petModelId) => {
      const result = aiService.deleteConversation(idValue, petModelId)
      broadcastAi('ai:conversationChanged', { conversationId: result.conversation.id, petModelId: result.conversation.pet_model_id, deletedId: result.deletedId, switched: true })
      return result
    }
  },
  {
    channel: 'ai:memory:setMode',
    schema: [oneOf(['off', 'manual', 'auto'], { label: '记忆模式' }), petIdSchema],
    handler: (_event, mode, petModelId) => {
      const result = aiService.setMemoryMode(mode, petModelId)
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
    }, { label: '查询条件' })), petIdSchema],
    handler: (_event, options, petModelId) => aiService.listMemories(options, petModelId)
  },
  {
    channel: 'ai:memory:create',
    schema: [memoryCreateSchema, petIdSchema],
    handler: (_event, data, petModelId) => {
      const result = aiService.createMemory(data, petModelId)
      broadcastAi('ai:memoryChanged', { id: result.id })
      return result
    }
  },
  {
    channel: 'ai:memory:update',
    schema: [id(), memoryUpdateSchema, petIdSchema],
    handler: (_event, memoryId, data, petModelId) => {
      const result = aiService.updateMemory(memoryId, data, petModelId)
      broadcastAi('ai:memoryChanged', { id: result.id })
      return result
    }
  },
  {
    channel: 'ai:memory:forget',
    schema: [id(), petIdSchema],
    handler: (_event, memoryId, petModelId) => {
      const result = aiService.forgetMemory(memoryId, petModelId)
      broadcastAi('ai:memoryChanged', { id: result.id })
      return result
    }
  },
  {
    channel: 'ai:memory:clear',
    schema: [petIdSchema],
    handler: (_event, petModelId) => {
      const result = aiService.clearMemories(petModelId)
      broadcastAi('ai:memoryChanged', { cleared: true })
      return result
    }
  }
]

module.exports = aiRoutes
