const EMOTIONS = new Set(['neutral', 'happy', 'excited', 'concerned', 'sad', 'angry', 'annoyed', 'shy', 'sleepy', 'focused', 'surprised'])
const INTENTS = new Set(['idle', 'greet', 'focus.working', 'react.happy', 'react.excited', 'react.concerned', 'react.sad', 'react.angry', 'react.annoyed', 'react.shy', 'react.surprised', 'error'])
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback }

function resolveLocal(input = {}) {
  const event = String(input.event || '')
  const text = `${input.userText || ''} ${input.assistantText || ''}`
  if (event === 'failure' || input.toolFailed) return { emotion: 'concerned', intensity: 0.58, intent: 'error', holdMs: 2200, confidence: 0.95, source: 'local' }
  if (event === 'started') return { emotion: 'focused', intensity: 0.55, intent: 'focus.working', holdMs: 6000, confidence: 0.98, source: 'local' }
  if (/终于|完成|成功|太好|谢谢|厉害|开心|恭喜|great|done|success|thank/i.test(text)) return { emotion: 'happy', intensity: 0.8, intent: 'react.happy', holdMs: 2200, confidence: 0.88, source: 'local' }
  if (/生气|讨厌|烦|糟糕|angry|annoy/i.test(text)) return { emotion: 'concerned', intensity: 0.55, intent: 'react.concerned', holdMs: 2200, confidence: 0.68, source: 'local' }
  if (/惊讶|居然|竟然|wow|surpris/i.test(text)) return { emotion: 'surprised', intensity: 0.7, intent: 'react.surprised', holdMs: 1800, confidence: 0.75, source: 'local' }
  return { emotion: 'happy', intensity: 0.45, intent: 'react.happy', holdMs: 1800, confidence: 0.52, source: 'local' }
}

function sanitizePresentation(raw, fallback = resolveLocal()) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return { emotion: EMOTIONS.has(value.emotion) ? value.emotion : fallback.emotion, intensity: clamp(value.intensity, 0, 1, fallback.intensity), intent: INTENTS.has(value.intent) ? value.intent : fallback.intent, holdMs: clamp(value.holdMs, 500, 6000, fallback.holdMs), confidence: clamp(value.confidence, 0, 1, fallback.confidence), source: ['local', 'ai', 'hybrid'].includes(value.source) ? value.source : fallback.source }
}

async function resolveHybrid(input = {}, classify) {
  const local = resolveLocal(input)
  if (typeof classify !== 'function' || local.confidence >= 0.85) return local
  try { return sanitizePresentation({ ...(await classify(input, local)), source: 'hybrid' }, local) } catch (_) { return local }
}

module.exports = { EMOTIONS, INTENTS, resolveLocal, resolveHybrid, sanitizePresentation }
