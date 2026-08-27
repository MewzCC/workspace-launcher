const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-pet-drag-'))
process.env.PORTABLE_EXECUTABLE_DIR = path.resolve(__dirname, '..')

app.whenReady().then(() => {
  // 同时隔离 appData，避免存储迁移把真实数据库复制进测试目录并污染用户配置。
  app.setPath('appData', path.join(testRoot, 'appData'))
  app.setPath('userData', path.join(testRoot, 'userData'))
  const modelService = require('../electron/services/petModelService.cjs')
  const lanxi = modelService.getRuntimeModel('blue-whale-maid')
  const klee = modelService.getRuntimeModel('klee-spark-knight')

  const lanxiDrag = lanxi.render.animations.drag
  assert.strictEqual(lanxi.sourceFormat, 'pet-v3-sequence')
  assert.strictEqual(lanxiDrag.source.type, 'sequence')
  assert.strictEqual(lanxiDrag.source.frames.length, 4)
  assert.strictEqual(lanxiDrag.timing.playback, 'loop')
  assert.ok(lanxiDrag.source.frames.every((value) => value.startsWith('pet-asset://blue-whale-maid/')))
  assert.ok(lanxiDrag.source.frames.every((value) => !value.startsWith('data:')))
  assert.deepStrictEqual(lanxi.semantics.bindings['interaction.drag'], ['drag'])
  assert.deepStrictEqual(klee.semantics.bindings['interaction.drag'], ['jump'])
  assert.strictEqual(modelService.list().find((item) => item.id === 'blue-whale-maid').render.animations.drag.source.frames.length, 4)
  assert.strictEqual(modelService.refresh().find((item) => item.id === 'blue-whale-maid').render.animations.drag.source.frames.length, 4)

  const profileService = require('../electron/services/petProfileService.cjs')
  assert.strictEqual(profileService.ensure('blue-whale-maid').scale, 1)
  const maximumScale = profileService.update('blue-whale-maid', { scale: 9, opacity: 0.2 })
  assert.strictEqual(maximumScale.scale, 5)
  assert.strictEqual(maximumScale.opacity, 0.55)
  const customScale = profileService.update('blue-whale-maid', { scale: 3.75, opacity: 0.8 })
  assert.strictEqual(customScale.scale, 3.75)
  assert.strictEqual(customScale.opacity, 0.8)

  const { calculateBubbleBounds } = require('../electron/services/petOverlayPlacement.cjs')
  const area = { x: 0, y: 0, width: 1707, height: 1067 }
  const bubble = { width: 348, height: 150 }
  assert.deepStrictEqual(calculateBubbleBounds({ x: 700, y: 500, width: 114, height: 125 }, bubble, area),
    { x: 583, y: 344, width: 348, height: 150, placement: 'top' })
  const topRight = calculateBubbleBounds({ x: 1592, y: 0, width: 114, height: 125 }, bubble, area)
  assert.strictEqual(topRight.placement, 'left')
  assert.strictEqual(topRight.x + topRight.width + 6, 1592)
  const rightEdge = calculateBubbleBounds({ x: 1592, y: 450, width: 114, height: 125 }, bubble, area)
  assert.strictEqual(rightEdge.placement, 'left')
  const bottomLeft = calculateBubbleBounds({ x: 0, y: 942, width: 114, height: 125 }, bubble, area)
  assert.strictEqual(bottomLeft.placement, 'right')

  require('../electron/db/index.cjs').closeDb()
  fs.rmSync(testRoot, { recursive: true, force: true })
  console.log('澜汐拖拽动画模型验证通过 ✓')
  app.quit()
}).catch((error) => {
  console.error(error)
  try { fs.rmSync(testRoot, { recursive: true, force: true }) } catch (_) {}
  app.exit(1)
})
