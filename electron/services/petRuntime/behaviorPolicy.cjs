function chooseBehavior(snapshot, model, settings = {}, now = Date.now(), random = Math.random) {
  if (!snapshot || now < snapshot.context.nextDecisionAt || !['active.idle', 'active.rest.sitting'].includes(snapshot.state)) return null
  const intents = new Set(model?.capabilities?.intents || [])
  const candidates = [
    { intent: 'micro.blink', weight: 1.3, cooldown: 4500 },
    { intent: 'move.walk', weight: settings.roaming === false ? 0 : 0.8 * snapshot.context.energy, cooldown: 9000 },
    { intent: 'rest.sit', weight: 0.45 * (1.2 - snapshot.context.energy), cooldown: 18000 },
    { intent: 'rest.sleep', weight: snapshot.context.energy < 0.3 ? 0.7 : 0, cooldown: 60000 },
    { intent: 'react.happy', weight: 0.2 * snapshot.context.boredom, cooldown: 16000 }
  ].filter((candidate) => candidate.weight > 0 && (intents.has(candidate.intent) || candidate.intent === 'move.walk' && (intents.has('move.walk.left') || intents.has('move.walk.right'))) && Number(snapshot.context.cooldowns[candidate.intent] || 0) <= now)
  if (!candidates.length) return { intent: 'idle', delayMs: 5000 }
  const total = candidates.reduce((sum, item) => sum + item.weight, 0)
  let cursor = random() * total
  const selected = candidates.find((item) => ((cursor -= item.weight) <= 0)) || candidates[candidates.length - 1]
  return { intent: selected.intent, priority: selected.intent === 'micro.blink' ? 10 : 20, cooldownUntil: now + selected.cooldown, delayMs: 2500 + Math.round(random() * 4500) }
}

module.exports = { chooseBehavior }
