const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { validateV3Manifest, PetManifestError } = require('../electron/services/petRuntime/petManifestV3.cjs')
const { normalizeLegacyAtlas, normalizeSvg } = require('../electron/services/petRuntime/legacyPetAdapter.cjs')
const { resolveAnimation } = require('../electron/services/petRuntime/animationResolver.cjs')

function fakePng(width, height) {
  const buffer = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(buffer)
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

function expectIssue(fn, code) {
  assert.throws(fn, (error) => error instanceof PetManifestError && error.issues.some((item) => item.code === code))
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-pet-v3-'))
try {
  fs.mkdirSync(path.join(temporary, 'animations', 'idle'), { recursive: true })
  fs.writeFileSync(path.join(temporary, 'animations', 'idle', '001.png'), fakePng(321, 456))
  fs.writeFileSync(path.join(temporary, 'animations', 'idle', '002.png'), fakePng(300, 400))
  const sequence = {
    schemaVersion: 3,
    id: 'fixture-sequence',
    displayName: '序列帧样例',
    render: { engine: 'sprite2d', canvas: { mode: 'auto-max' }, animations: { idle: { source: { type: 'sequence', frames: ['animations/idle/001.png', 'animations/idle/002.png'] }, timing: { fps: 8, playback: 'loop' }, semantics: ['idle'] } } },
    semantics: { bindings: { idle: ['idle'] } },
    interactions: { hitboxes: [{ id: 'head', shape: 'rect', x: 0.2, y: 0, width: 0.6, height: 0.4, intent: 'touch.head' }] }
  }
  const normalized = validateV3Manifest(sequence, temporary)
  assert.equal(normalized.render.canvas.width, 321)
  assert.equal(normalized.render.canvas.height, 456)
  assert.equal(normalized.assets.length, 2)
  assert.equal(resolveAnimation(normalized, { intent: 'idle' }).animationId, 'idle')

  fs.writeFileSync(path.join(temporary, 'atlas.png'), fakePng(64, 64))
  const atlas = structuredClone(sequence)
  atlas.id = 'fixture-atlas'
  atlas.render.canvas = { mode: 'fixed', width: 32, height: 32 }
  atlas.render.animations.idle.source = { type: 'atlas', asset: 'atlas.png', columns: 2, rows: 2, cellWidth: 32, cellHeight: 32, row: 0, startColumn: 0, frameCount: 2 }
  assert.equal(validateV3Manifest(atlas, temporary).sourceFormat, 'pet-v3-atlas')

  const traversal = structuredClone(sequence)
  traversal.render.animations.idle.source.frames[0] = '../outside.png'
  expectIssue(() => validateV3Manifest(traversal, temporary), 'ASSET_PATH_TRAVERSAL')
  const missing = structuredClone(sequence)
  missing.render.animations.idle.source.frames[0] = 'animations/idle/missing.png'
  expectIssue(() => validateV3Manifest(missing, temporary), 'ASSET_NOT_FOUND')
  const badTiming = structuredClone(sequence)
  badTiming.render.animations.idle.timing = { fps: 0, playback: 'loop' }
  expectIssue(() => validateV3Manifest(badTiming, temporary), 'TIMING_INVALID')
  const badHitbox = structuredClone(sequence)
  badHitbox.interactions.hitboxes[0].width = 2
  expectIssue(() => validateV3Manifest(badHitbox, temporary), 'HITBOX_INVALID')

  const v1 = normalizeLegacyAtlas({ id: 'v1', displayName: 'V1', description: '', spriteVersionNumber: 1, spritesheetPath: 'spritesheet.webp' }, temporary)
  const v2 = normalizeLegacyAtlas({ id: 'v2', displayName: 'V2', description: '', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.webp' }, temporary)
  assert.equal(v1.sourceFormat, 'codex-v1-atlas')
  assert.equal(v2.capabilities.lookDirections.length, 16)
  assert.equal(normalizeSvg({ id: 'svg', displayName: 'SVG', description: '', svgParams: {} }, temporary).sourceFormat, 'legacy-svg')

  const production = validateV3Manifest(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'models', 'blue-whale-maid', 'pet.json'), 'utf8')), path.join(__dirname, '..', 'models', 'blue-whale-maid'))
  assert.equal(production.assets.length, 70)
  assert.deepEqual(production.render.canvas, { width: 475, height: 734, anchorX: 0.5, anchorY: 1 })
  assert.equal(production.render.animations.idle.timing.fps, 4)
  assert.equal(production.render.animations.happy.timing.fps, 5)
  assert.equal(production.render.animations.sleep.timing.fps, 3)
  assert.ok(production.render.animations.walk_right.timing.fps <= 6)
  assert.ok(production.render.animations.drag.timing.fps <= 6)
  console.log('桌宠 V3 清单、旧格式适配和澜汐 70 帧资源验证通过 ✓')
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
