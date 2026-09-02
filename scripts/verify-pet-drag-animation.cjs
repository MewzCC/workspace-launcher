const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-pet-drag-'))
process.env.PORTABLE_EXECUTABLE_DIR = path.resolve(__dirname, '..')

app.whenReady().then(() => {
  app.setPath('userData', path.join(testRoot, 'userData'))
  const modelService = require('../electron/services/petModelService.cjs')
  const lanxi = modelService.getRuntimeModel('blue-whale-maid')
  const klee = modelService.getRuntimeModel('klee-spark-knight')

  assert.strictEqual(lanxi.dragAnimation.atlasState, 'jump')
  assert.deepStrictEqual(lanxi.dragAnimation.durations, [150, 130, 170, 130, 190])
  assert.strictEqual(Boolean(lanxi.dragAnimation.frameDataUrls), false)
  assert.strictEqual(Boolean(klee.dragAnimation), false)
  assert.strictEqual(modelService.list().find((item) => item.id === 'blue-whale-maid').dragAnimation.atlasState, 'jump')
  assert.strictEqual(modelService.refresh().find((item) => item.id === 'blue-whale-maid').dragAnimation.atlasState, 'jump')

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
