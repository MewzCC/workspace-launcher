const path = require('path')

const LEGACY_ROWS = [
  ['idle', 0, 6, [280, 110, 110, 140, 140, 320], ['idle']],
  ['walkRight', 1, 8, null, ['move.walk.right']],
  ['walkLeft', 2, 8, null, ['move.walk.left']],
  ['wave', 3, 4, null, ['greet', 'react.happy']],
  ['jump', 4, 5, null, ['react.excited']],
  ['failed', 5, 8, null, ['error', 'react.concerned', 'react.angry']],
  ['waiting', 6, 6, null, ['rest.sit', 'react.shy']],
  ['working', 7, 6, null, ['focus.working']],
  ['review', 8, 6, null, ['study.review', 'react.concerned']]
]

function atlasClip(asset, rows, id, row, frameCount, durations, semantics) {
  return {
    id,
    source: { type: 'atlas', asset, columns: 8, rows, cellWidth: 192, cellHeight: 208, row, startColumn: 0, frameCount },
    timing: durations ? { mode: 'durations', durations, playback: id === 'idle' || id.startsWith('walk') ? 'loop' : 'once' } : { mode: 'fps', fps: 7, playback: id.startsWith('walk') ? 'loop' : 'once' },
    placement: { anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0, scale: 1 },
    semantics,
    interruptible: true
  }
}

function normalizeLegacyAtlas(manifest, directory) {
  const version = manifest.spriteVersionNumber == null ? 1 : Number(manifest.spriteVersionNumber)
  const rows = version === 1 ? 9 : 11
  const asset = String(manifest.spritesheetPath)
  const animations = {}
  const bindings = {}
  for (const [id, row, frames, durations, semantics] of LEGACY_ROWS) {
    animations[id] = atlasClip(asset, rows, id, row, frames, durations, semantics)
    for (const intent of semantics) bindings[intent] = [...(bindings[intent] || []), id]
  }
  if (manifest.dragAnimation?.atlasState && animations[manifest.dragAnimation.atlasState]) {
    bindings['interaction.drag'] = [manifest.dragAnimation.atlasState]
  } else if (manifest.dragAnimation?.frames?.length) {
    animations.dragging = {
      id: 'dragging',
      source: { type: 'sequence', frames: manifest.dragAnimation.frames },
      timing: { mode: 'durations', durations: manifest.dragAnimation.durations, playback: 'loop' },
      placement: { anchorX: 0.5, anchorY: 1, offsetX: 0, offsetY: 0, scale: 1 },
      semantics: ['interaction.drag'],
      interruptible: false
    }
    bindings['interaction.drag'] = ['dragging']
  } else {
    bindings['interaction.drag'] = ['jump']
  }
  const lookDirections = []
  if (version === 2) {
    for (let index = 0; index < 16; index += 1) {
      const degrees = index * 22.5
      const id = `look.${String(degrees).padStart(3, '0')}`
      const row = index < 8 ? 9 : 10
      const column = index % 8
      animations[id] = atlasClip(asset, rows, id, row, 1, [180], [`look.${degrees}`])
      animations[id].source.startColumn = column
      lookDirections.push({ degrees, animationId: id })
    }
  }
  return {
    id: manifest.id,
    displayName: manifest.displayName,
    description: manifest.description,
    schemaVersion: 3,
    sourceFormat: `codex-v${version}-atlas`,
    render: { engine: 'sprite2d', canvas: { width: 192, height: 208, anchorX: 0.5, anchorY: 1 }, animations },
    semantics: { bindings },
    interactions: { hitboxes: [] },
    behavior: { traits: { activity: 1, sociability: 1, playfulness: 1, sleepiness: 1 } },
    presentation: { defaultEmotion: 'neutral', defaultIntent: 'idle' },
    capabilities: { animations: Object.keys(animations), intents: Object.keys(bindings), lookDirections },
    directory,
    assets: [{ relativePath: asset, filePath: path.join(directory, asset) }, ...(manifest.dragAnimation?.frames || []).map((relativePath) => ({ relativePath, filePath: path.join(directory, ...relativePath.split('/')) }))]
  }
}

function normalizeSvg(manifest, directory) {
  return {
    id: manifest.id,
    displayName: manifest.displayName,
    description: manifest.description,
    schemaVersion: 3,
    sourceFormat: 'legacy-svg',
    render: { engine: 'svg', canvas: { width: 80, height: 112, anchorX: 0.5, anchorY: 1 }, animations: { idle: { id: 'idle', source: { type: 'svg-state', state: 'idle' }, timing: { mode: 'fps', fps: 1, playback: 'loop' }, semantics: ['idle'], interruptible: true } }, svgParams: manifest.svgParams },
    semantics: { bindings: { idle: ['idle'], greet: ['idle'], 'react.happy': ['idle'], 'focus.working': ['idle'], error: ['idle'], 'interaction.drag': ['idle'] } },
    interactions: { hitboxes: [] },
    behavior: { traits: { activity: 1, sociability: 1, playfulness: 1, sleepiness: 1 } },
    presentation: { defaultEmotion: 'neutral', defaultIntent: 'idle' },
    capabilities: { animations: ['idle'], intents: ['idle', 'greet', 'react.happy', 'focus.working', 'error', 'interaction.drag'], lookDirections: [] },
    directory,
    assets: []
  }
}

module.exports = { normalizeLegacyAtlas, normalizeSvg, LEGACY_ROWS }
