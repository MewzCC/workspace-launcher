const FALLBACKS = {
  'react.happy': ['react.happy', 'greet', 'react.excited', 'idle'],
  'react.excited': ['react.excited', 'react.happy', 'greet', 'idle'],
  'react.angry': ['react.angry', 'error', 'study.review', 'idle'],
  'react.annoyed': ['react.angry', 'error', 'idle'],
  'react.concerned': ['react.concerned', 'error', 'study.review', 'idle'],
  'react.sad': ['react.concerned', 'error', 'idle'],
  'react.shy': ['react.shy', 'react.happy', 'idle'],
  'react.surprised': ['react.excited', 'react.happy', 'idle'],
  'touch.head': ['touch.head', 'react.happy', 'greet', 'idle'],
  'rest.sit': ['rest.sit', 'idle'],
  'rest.sleep': ['rest.sleep', 'rest.sit', 'idle'],
  'focus.working': ['focus.working', 'rest.sit', 'idle'],
  'move.walk': ['move.walk.right', 'move.walk.left', 'idle'],
  'interaction.drag': ['interaction.drag', 'idle'],
  error: ['error', 'react.concerned', 'idle'],
  greet: ['greet', 'react.happy', 'idle']
}

function resolveAnimation(model, request = {}) {
  const animations = model?.render?.animations || {}
  const bindings = model?.semantics?.bindings || {}
  const intent = String(request.intent || 'idle')
  const facingIntent = intent === 'move.walk' && request.facing ? `move.walk.${request.facing}` : intent
  const candidates = [...new Set([facingIntent, ...(FALLBACKS[facingIntent] || FALLBACKS[intent] || [intent, 'idle'])])]
  for (const semantic of candidates) {
    for (const animationId of bindings[semantic] || []) {
      if (animations[animationId]) return { animationId, clip: animations[animationId], resolvedIntent: semantic, fallback: semantic !== intent }
    }
    if (animations[semantic]) return { animationId: semantic, clip: animations[semantic], resolvedIntent: semantic, fallback: semantic !== intent }
  }
  const first = animations.idle || Object.values(animations)[0]
  return first ? { animationId: first.id, clip: first, resolvedIntent: 'idle', fallback: true } : null
}

module.exports = { resolveAnimation, FALLBACKS }
