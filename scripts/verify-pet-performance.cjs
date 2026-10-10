const assert = require('assert')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { performance } = require('perf_hooks')
const { app } = require('electron')

// Chromium releases its storage handles only after Electron exits on Windows.
// The Node parent owns cleanup so verification never fails on a live LevelDB.
if (!app) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-pet-performance-'))
  const result = require('child_process').spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, LAUNCHPAD_PERFORMANCE_ROOT: root }, timeout: 120000
  })
  if (path.dirname(root).toLowerCase() !== os.tmpdir().toLowerCase() || !path.basename(root).startsWith('launchpad-pet-performance-')) throw new Error('Invalid performance test root')
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
const root = process.env.LAUNCHPAD_PERFORMANCE_ROOT
if (!root) throw new Error('Run this verification with Node so cleanup happens after Electron exits')
process.env.PORTABLE_EXECUTABLE_DIR = root
app.setPath('userData', path.join(root, 'userData'))
app.setPath('appData', path.join(root, 'appData'))
require('../electron/services/petLive2d.cjs')

app.whenReady().then(() => {
  const source = process.env.LAUNCHPAD_TEST_LIVE2D_DIRECTORY || path.resolve(__dirname, '../output/live2d-samples/DeepSeek-Whale-Girl')
  const directory = path.join(root, 'models', 'deepseek-whale-girl')
  fs.cpSync(source, directory, { recursive: true })
  const models = require('../electron/services/petModelService.cjs')
  const service = require('../electron/services/petService.cjs')
  const db = require('../electron/db/index.cjs')
  const id = 'deepseek-whale-girl'
  const route = service.petRoutes.find(route => route.channel === 'pet:getMovementArea')
  db.settingsDao.set('petInstancesInitialized', true)
  db.settingsDao.set('petInstanceIds', [id])
  route.handler(null, id)
  let reads = 0, bytes = 0
  const read = fs.readFileSync
  fs.readFileSync = (file, ...args) => {
    const result = read(file, ...args)
    if (typeof file === 'string' && path.resolve(file).startsWith(directory + path.sep)) { reads++; bytes += Buffer.byteLength(result) }
    return result
  }
  let elapsed
  try {
    const start = performance.now()
    for (let i = 0; i < 50; i++) route.handler(null, id)
    elapsed = performance.now() - start
  } finally { fs.readFileSync = read }
  console.log(JSON.stringify({ operations: 50, milliseconds: Math.round(elapsed), modelFileReads: reads, modelBytesRead: bytes }))
  if (!process.argv.includes('--baseline')) {
    assert.strictEqual(reads, 0, 'Movement must not repeatedly read and validate model assets')
    const before = models.getRuntimeModel(id)
    const manifest = path.join(directory, 'pet.json')
    const raw = JSON.parse(fs.readFileSync(manifest))
    raw.displayName = 'Updated whale'
    fs.writeFileSync(manifest, JSON.stringify(raw))
    assert.strictEqual(models.getRuntimeModel(id).displayName, 'Updated whale', 'Manifest edits invalidate cached models')
    fs.writeFileSync(path.join(directory, raw.modelPath), '{}')
    models.refresh()
    assert.strictEqual(models.getRuntimeModel(id), null, 'Explicit refresh revalidates changed resources')
    assert(before.live2d.entryUrl, 'Cache retains the Live2D engine')
    console.log('Movement asset cache, manifest invalidation and resource refresh passed')
  }
  db.closeDb()
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
