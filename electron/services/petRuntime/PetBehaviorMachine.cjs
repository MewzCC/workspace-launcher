const { resolveAnimation } = require('./animationResolver.cjs')

const PRIORITIES = { drag: 100, touch: 90, ai: 80, study: 75, social: 70, error: 65, command: 50, autonomous: 20, micro: 10 }
const TRANSIENT_STATES = new Set(['interaction.pressed', 'interaction.dragging', 'active.rest.sitDown', 'active.reaction', 'error'])

function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))) }

function initialSnapshot(petId, persisted = {}, now = Date.now()) {
  return {
    petId,
    generation: 1,
    state: 'boot',
    stableState: 'active.idle',
    stateEnteredAt: now,
    presentation: { intent: 'idle', emotion: 'neutral', intensity: 0.2, animationId: 'idle', playbackToken: 0, priority: 0, interruptible: true },
    context: {
      energy: clamp(persisted.energy ?? 0.8, 0, 1),
      boredom: clamp(persisted.boredom ?? 0.2, 0, 1),
      affection: clamp(persisted.affection ?? 0, 0, 100),
      moodValence: clamp(persisted.moodValence ?? 0, -1, 1),
      moodArousal: clamp(persisted.moodArousal ?? 0.2, 0, 1),
      emotion: { id: 'neutral', intensity: 0, expiresAt: 0 },
      lastUserInteractionAt: Number(persisted.lastInteractionAt) || now,
      lastAutonomousActionAt: 0,
      nextDecisionAt: now + 3000,
      recentIntents: [],
      cooldowns: {}
    },
    motion: { active: false, facing: 'right' },
    resumeState: 'active.idle'
  }
}

function stateForIntent(intent) {
  if (intent === 'interaction.drag') return 'interaction.dragging'
  if (intent.startsWith('move.walk')) return 'active.locomotion.walk'
  if (intent === 'rest.sit') return 'active.rest.sitDown'
  if (intent === 'rest.sleep') return 'active.rest.sleep'
  if (intent === 'focus.working') return 'active.focus'
  if (intent === 'error') return 'error'
  if (intent === 'idle') return 'active.idle'
  return 'active.reaction'
}

function present(snapshot, model, request, now) {
  const priority = clamp(request.priority ?? PRIORITIES.command, 0, 100)
  if (snapshot.state === 'interaction.dragging' && priority < PRIORITIES.drag) return snapshot
  if (priority < snapshot.presentation.priority && snapshot.presentation.interruptible === false) return snapshot
  if (request.expiresAt && request.expiresAt < now) return snapshot
  const resolved = resolveAnimation(model, request)
  if (!resolved) return snapshot
  const nextState = stateForIntent(request.intent || 'idle')
  const stableState = TRANSIENT_STATES.has(nextState) ? snapshot.stableState : nextState
  return {
    ...snapshot,
    state: nextState,
    stableState,
    stateEnteredAt: now,
    resumeState: request.resumePolicy === 'previous' ? snapshot.stableState : 'active.idle',
    presentation: { intent: request.intent || 'idle', emotion: request.emotion || 'neutral', intensity: clamp(request.intensity ?? 0.5, 0, 1), animationId: resolved.animationId, playbackToken: snapshot.presentation.playbackToken + 1, priority, interruptible: resolved.clip.interruptible !== false, source: request.source || 'system', resolvedIntent: resolved.resolvedIntent },
    context: { ...snapshot.context, recentIntents: [request.intent || 'idle', ...snapshot.context.recentIntents.filter((item) => item !== request.intent)].slice(0, 12) }
  }
}

function completeTransient(snapshot, model, now) {
  const base = { ...snapshot, state: snapshot.resumeState || 'active.idle', presentation: { ...snapshot.presentation, priority: 0, interruptible: true } }
  const next = present(base, model, { intent: snapshot.resumeState === 'active.rest.sleep' ? 'rest.sleep' : 'idle', priority: 0, source: 'system' }, now)
  return snapshot.resumeState === 'active.rest.sitting' ? { ...next, state: 'active.rest.sitting', stableState: 'active.rest.sitting' } : next
}

function transition(snapshot, event, model, now = Date.now()) {
  if (!event || typeof event.type !== 'string') return snapshot
  if (event.type === 'BOOT') return present({ ...snapshot, state: 'active.idle', stableState: 'active.idle' }, model, { intent: 'idle', priority: 0, source: 'system' }, now)
  if (event.type === 'MODEL_CHANGED') return present({ ...snapshot, generation: snapshot.generation + 1, state: 'active.idle', stableState: 'active.idle' }, model, { intent: 'idle', priority: 0, source: 'system' }, now)
  if (event.type === 'PRESENT') return present(snapshot, model, event, now)
  if (event.type === 'POINTER_DOWN') return { ...snapshot, state: 'interaction.pressed', stateEnteredAt: now, resumeState: snapshot.stableState, presentation: { ...snapshot.presentation, priority: PRIORITIES.touch }, context: { ...snapshot.context, lastUserInteractionAt: now } }
  if (event.type === 'DRAG_THRESHOLD' && snapshot.state === 'interaction.pressed') return present(snapshot, model, { intent: 'interaction.drag', priority: PRIORITIES.drag, source: 'user' }, now)
  if (event.type === 'POINTER_UP' && snapshot.state === 'interaction.dragging') return completeTransient({ ...snapshot, resumeState: 'active.idle', motion: { ...snapshot.motion, active: false } }, model, now)
  if (event.type === 'CLICK' && snapshot.state === 'interaction.pressed') {
    const context = { ...snapshot.context, affection: clamp(snapshot.context.affection + 1, 0, 100), boredom: clamp(snapshot.context.boredom - 0.08, 0, 1), lastUserInteractionAt: now, emotion: { id: 'happy', intensity: 0.65, expiresAt: now + 3000 } }
    return present({ ...snapshot, context }, model, { intent: event.intent || 'touch.head', emotion: 'happy', intensity: 0.7, priority: PRIORITIES.touch, source: 'user' }, now)
  }
  if (event.type === 'DOUBLE_CLICK') return completeTransient({ ...snapshot, resumeState: 'active.idle' }, model, now)
  if (event.type === 'ANIMATION_COMPLETED') {
    if (Number(event.playbackToken) !== snapshot.presentation.playbackToken) return snapshot
    if (snapshot.state === 'active.rest.sitDown') {
      const next = present({ ...snapshot, presentation: { ...snapshot.presentation, priority: 0 } }, model, { intent: 'idle', priority: 0, source: 'system' }, now)
      return { ...next, state: 'active.rest.sitting', stableState: 'active.rest.sitting' }
    }
    if (TRANSIENT_STATES.has(snapshot.state)) return completeTransient(snapshot, model, now)
  }
  if (event.type === 'MOTION_COMPLETED' && snapshot.state === 'active.locomotion.walk') return present({ ...snapshot, motion: { ...snapshot.motion, active: false } }, model, { intent: 'idle', priority: 0, source: 'system' }, now)
  if (event.type === 'TICK') {
    const elapsedHours = clamp((now - (event.previousAt || now)) / 3600000, 0, 1)
    const sleeping = snapshot.state === 'active.rest.sleep'
    return { ...snapshot, context: { ...snapshot.context, energy: clamp(snapshot.context.energy + (sleeping ? 0.12 : -0.025) * elapsedHours, 0, 1), boredom: clamp(snapshot.context.boredom + (sleeping ? -0.02 : 0.04) * elapsedHours, 0, 1) } }
  }
  return snapshot
}

module.exports = { PRIORITIES, TRANSIENT_STATES, initialSnapshot, transition, present }
