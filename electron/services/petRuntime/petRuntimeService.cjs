const { petStateDao } = require('../../db/index.cjs')
const { initialSnapshot, transition } = require('./PetBehaviorMachine.cjs')
const { chooseBehavior } = require('./behaviorPolicy.cjs')

const controllers = new Map()
let scheduler = null

function persist(item) {
  clearTimeout(item.persistTimer)
  item.persistTimer = setTimeout(() => {
    const context = item.snapshot.context
    petStateDao.save(item.id, { energy: context.energy, boredom: context.boredom, affection: context.affection, moodValence: context.moodValence, moodArousal: context.moodArousal, lastInteractionAt: context.lastUserInteractionAt })
  }, 1200)
}

function notify(item) {
  item.onChange?.(item.snapshot)
  persist(item)
}

function ensure(id, model, settings = {}, onChange) {
  let item = controllers.get(id)
  if (!item) {
    item = { id, model, settings, onChange, snapshot: initialSnapshot(id, petStateDao.get(id)), lastTickAt: Date.now(), persistTimer: null }
    item.snapshot = transition(item.snapshot, { type: 'BOOT' }, model)
    controllers.set(id, item)
  } else {
    item.settings = settings
    item.onChange = onChange || item.onChange
    if (item.model?.generation !== model?.generation) item.snapshot = transition(item.snapshot, { type: 'MODEL_CHANGED' }, model)
    item.model = model
  }
  return item.snapshot
}

function dispatch(id, event) {
  const item = controllers.get(id)
  if (!item) return null
  const previous = item.snapshot
  item.snapshot = transition(previous, event, item.model)
  if (item.snapshot !== previous) notify(item)
  return item.snapshot
}

function snapshot(id) { return controllers.get(id)?.snapshot || null }

function tick(now = Date.now()) {
  for (const item of controllers.values()) {
    item.snapshot = transition(item.snapshot, { type: 'TICK', previousAt: item.lastTickAt }, item.model, now)
    item.lastTickAt = now
    const decision = chooseBehavior(item.snapshot, item.model, item.settings, now)
    if (!decision) continue
    let intent = decision.intent
    if (intent === 'move.walk') intent = Math.random() < 0.5 ? 'move.walk.left' : 'move.walk.right'
    item.snapshot = transition(item.snapshot, { type: 'PRESENT', intent, priority: decision.priority, source: 'autonomous' }, item.model, now)
    item.snapshot = { ...item.snapshot, context: { ...item.snapshot.context, lastAutonomousActionAt: now, nextDecisionAt: now + decision.delayMs, cooldowns: { ...item.snapshot.context.cooldowns, [decision.intent]: decision.cooldownUntil || now + 5000 } } }
    notify(item)
  }
}

function start() { if (!scheduler) scheduler = setInterval(() => tick(), 750) }
function remove(id) {
  const item = controllers.get(id)
  if (item) {
    clearTimeout(item.persistTimer)
    const context = item.snapshot.context
    petStateDao.save(item.id, { energy: context.energy, boredom: context.boredom, affection: context.affection, moodValence: context.moodValence, moodArousal: context.moodArousal, lastInteractionAt: context.lastUserInteractionAt })
  }
  controllers.delete(id)
}
function stop() { clearInterval(scheduler); scheduler = null; for (const id of [...controllers.keys()]) remove(id) }

module.exports = { ensure, dispatch, snapshot, start, stop, remove, tick }
