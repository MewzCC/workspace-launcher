const assert = require('assert')
const { initialSnapshot, transition, PRIORITIES } = require('../electron/services/petRuntime/PetBehaviorMachine.cjs')
const { chooseBehavior } = require('../electron/services/petRuntime/behaviorPolicy.cjs')

function clip(id, playback = 'once', interruptible = true) {
  return { id, source: { type: 'sequence', frames: ['x.png', 'y.png'] }, timing: { mode: 'fps', fps: 8, playback }, semantics: [], interruptible }
}
const model = {
  render: { animations: { idle: clip('idle', 'loop'), walk: clip('walk', 'loop'), sit: clip('sit'), sleep: clip('sleep', 'loop'), happy: clip('happy'), drag: clip('drag', 'loop', false), working: clip('working', 'loop'), error: clip('error') } },
  semantics: { bindings: { idle: ['idle'], 'move.walk.left': ['walk'], 'move.walk.right': ['walk'], 'rest.sit': ['sit'], 'rest.sleep': ['sleep'], 'touch.head': ['happy'], 'react.happy': ['happy'], 'interaction.drag': ['drag'], 'focus.working': ['working'], error: ['error'] } },
  capabilities: { intents: ['idle', 'move.walk.left', 'move.walk.right', 'rest.sit', 'rest.sleep', 'touch.head', 'react.happy', 'interaction.drag', 'focus.working', 'error'] }
}

let state = initialSnapshot('fixture', {}, 1000)
state = transition(state, { type: 'BOOT' }, model, 1000)
assert.equal(state.state, 'active.idle')

state = transition(state, { type: 'PRESENT', intent: 'move.walk.right', priority: PRIORITIES.autonomous, source: 'autonomous' }, model, 1200)
assert.equal(state.state, 'active.locomotion.walk')
state = transition(state, { type: 'POINTER_DOWN' }, model, 1300)
assert.equal(state.state, 'interaction.pressed')
state = transition(state, { type: 'DRAG_THRESHOLD' }, model, 1350)
assert.equal(state.state, 'interaction.dragging')
const dragToken = state.presentation.playbackToken
assert.strictEqual(transition(state, { type: 'PRESENT', intent: 'react.happy', priority: 20 }, model, 1400), state)
state = transition(state, { type: 'POINTER_UP' }, model, 1500)
assert.equal(state.state, 'active.idle')

state = transition(state, { type: 'POINTER_DOWN' }, model, 1600)
state = transition(state, { type: 'CLICK', intent: 'touch.head' }, model, 1650)
assert.equal(state.state, 'active.reaction')
assert.equal(state.context.affection, 1)
const reactionToken = state.presentation.playbackToken
assert.strictEqual(transition(state, { type: 'ANIMATION_COMPLETED', playbackToken: dragToken }, model, 1700), state)
state = transition(state, { type: 'ANIMATION_COMPLETED', playbackToken: reactionToken }, model, 1800)
assert.equal(state.state, 'active.idle')

state = transition(state, { type: 'PRESENT', intent: 'rest.sit', priority: 20 }, model, 2000)
assert.equal(state.state, 'active.rest.sitDown')
state = transition(state, { type: 'ANIMATION_COMPLETED', playbackToken: state.presentation.playbackToken }, model, 2200)
assert.equal(state.state, 'active.rest.sitting')
state = transition(state, { type: 'PRESENT', intent: 'rest.sleep', priority: 20 }, model, 2300)
assert.equal(state.state, 'active.rest.sleep')
state = transition(state, { type: 'POINTER_DOWN' }, model, 2400)
state = transition(state, { type: 'CLICK', intent: 'touch.head' }, model, 2450)
state = transition(state, { type: 'ANIMATION_COMPLETED', playbackToken: state.presentation.playbackToken }, model, 2600)
assert.equal(state.state, 'active.idle')

const fallbackModel = { ...model, semantics: { bindings: { idle: ['idle'] } }, capabilities: { intents: ['idle'] } }
let fallback = transition(initialSnapshot('fallback', {}, 3000), { type: 'BOOT' }, fallbackModel, 3000)
fallback = transition(fallback, { type: 'PRESENT', intent: 'react.happy', priority: 20 }, fallbackModel, 3100)
assert.equal(fallback.presentation.animationId, 'idle')

const ready = { ...state, state: 'active.idle', context: { ...state.context, nextDecisionAt: 0, cooldowns: {} } }
const decision = chooseBehavior(ready, model, { roaming: true }, 5000, () => 0.2)
assert.equal(decision.intent, 'move.walk')
console.log('桌宠 V3 状态机、优先级、完成令牌与集中策略验证通过 ✓')
