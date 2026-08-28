const fs = require('fs')
const path = require('path')
const { app, nativeImage } = require('electron')
const { validateV3Manifest, PetManifestError } = require('../electron/services/petRuntime/petManifestV3.cjs')

const CELL_WIDTH = 192
const CELL_HEIGHT = 208
const COLUMNS = 8
const ROWS = 22
const EXPECTED_SIZE = { width: CELL_WIDTH * COLUMNS, height: CELL_HEIGHT * ROWS }

const STATES = [
  ['idle', 0, 6, 'loop'],
  ['running-right', 1, 10, 'loop'],
  ['running-left', 2, 10, 'loop'],
  ['waving', 3, 8, 'once'],
  ['jumping', 4, 10, 'once'],
  ['failed', 5, 6, 'once'],
  ['waiting', 6, 5, 'loop'],
  ['running', 7, 8, 'loop'],
  ['review', 8, 6, 'loop'],
  ['look-row-9', 9, 8, 'loop'],
  ['look-row-10', 10, 8, 'loop'],
  ['picked-up', 11, 8, 'once'],
  ['dragging-left', 12, 10, 'loop'],
  ['dragging-right', 13, 10, 'loop'],
  ['drag-hold', 14, 6, 'loop'],
  ['falling', 15, 10, 'once'],
  ['landing', 16, 10, 'once'],
  ['sleep', 17, 4, 'loop'],
  ['wake-up', 18, 8, 'once'],
  ['happy', 19, 8, 'once'],
  ['angry', 20, 8, 'once'],
  ['sad', 21, 6, 'once']
]

const REQUIRED_BINDINGS = {
  idle: 'idle',
  'move.walk.right': 'running-right',
  'move.walk.left': 'running-left',
  greet: 'waving',
  'touch.head': 'waving',
  'react.excited': 'jumping',
  error: 'failed',
  'rest.sit': 'waiting',
  'wait.user': 'waiting',
  'focus.working': 'running',
  'study.review': 'review',
  'emotion.focused': 'review',
  'emotion.curious': 'look-row-9',
  'interaction.lift': 'picked-up',
  'interaction.drag.left': 'dragging-left',
  'interaction.drag.right': 'dragging-right',
  'interaction.drag': 'drag-hold',
  'interaction.release': 'falling',
  'interaction.land': 'landing',
  'rest.sleep': 'sleep',
  'emotion.sleepy': 'sleep',
  'rest.wake': 'wake-up',
  'react.happy': 'happy',
  'emotion.happy': 'happy',
  'react.angry': 'angry',
  'react.annoyed': 'angry',
  'emotion.angry': 'angry',
  'react.sad': 'sad',
  'react.concerned': 'sad',
  'emotion.sad': 'sad'
}

function issue(code, pathValue, message) { return { code, path: pathValue, message } }

function manifestPathFromArgument(value) {
  if (!value) throw new Error('usage: npm run verify:pet-package -- <model-directory-or-pet.json>')
  const target = path.resolve(value)
  if (!fs.existsSync(target)) throw new Error(`path does not exist: ${target}`)
  const manifestPath = fs.statSync(target).isDirectory() ? path.join(target, 'pet.json') : target
  if (path.basename(manifestPath).toLowerCase() !== 'pet.json' || !fs.existsSync(manifestPath)) throw new Error('target must be a model directory or pet.json')
  return manifestPath
}

function inspectAtlas(filePath) {
  const image = nativeImage.createFromBuffer(fs.readFileSync(filePath))
  if (image.isEmpty()) return { pixelInspection: 'not-available-for-this-format', emptyCells: [], edgeCells: [] }
  const size = image.getSize()
  if (size.width !== EXPECTED_SIZE.width || size.height !== EXPECTED_SIZE.height) {
    throw new Error(`atlas must be ${EXPECTED_SIZE.width}x${EXPECTED_SIZE.height}; received ${size.width}x${size.height}`)
  }
  const bitmap = image.toBitmap()
  const rowStride = bitmap.length / size.height
  if (!Number.isInteger(rowStride) || rowStride < size.width * 4) throw new Error('unexpected decoded bitmap layout')
  const emptyCells = []
  const edgeCells = []
  let visiblePixels = 0
  let transparentPixels = 0
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      let visible = 0
      let touchesEdge = false
      for (let y = 0; y < CELL_HEIGHT; y += 1) {
        const sourceY = row * CELL_HEIGHT + y
        for (let x = 0; x < CELL_WIDTH; x += 1) {
          const sourceX = column * CELL_WIDTH + x
          const alpha = bitmap[sourceY * rowStride + sourceX * 4 + 3]
          if (alpha > 16) {
            visible += 1
            visiblePixels += 1
            if (x === 0 || y === 0 || x === CELL_WIDTH - 1 || y === CELL_HEIGHT - 1) touchesEdge = true
          } else if (alpha === 0) transparentPixels += 1
        }
      }
      if (!visible) emptyCells.push([row, column])
      if (touchesEdge) edgeCells.push([row, column])
    }
  }
  return { pixelInspection: 'complete', size, emptyCells, edgeCells, visiblePixels, transparentPixels }
}

function verify(manifestPath) {
  const directory = path.dirname(manifestPath)
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const issues = []
  const standard = raw.modelStandard || {}
  if (standard.name !== 'workspace-launcher-pet' || Number(standard.version) !== 1 || standard.profile !== 'full-state-22') {
    issues.push(issue('MODEL_STANDARD_INVALID', 'modelStandard', 'expected workspace-launcher-pet/full-state-22@1'))
  }

  let model
  try { model = validateV3Manifest(raw, directory) } catch (error) {
    if (error instanceof PetManifestError) issues.push(...error.issues)
    else issues.push(issue('MANIFEST_INVALID', 'pet.json', error.message))
  }

  const animations = raw.render?.animations || {}
  if (Object.keys(animations).length !== STATES.length) issues.push(issue('STATE_SET_INVALID', 'render.animations', 'full-state-22 requires exactly 22 animations'))
  let atlasAsset = null
  for (const [id, row, fps, playback] of STATES) {
    const clip = animations[id]
    const base = `render.animations.${id}`
    if (!clip) { issues.push(issue('STATE_MISSING', base, `missing required state ${id}`)); continue }
    const source = clip.source || {}
    if (source.type !== 'atlas' || source.columns !== COLUMNS || source.rows !== ROWS || source.cellWidth !== CELL_WIDTH || source.cellHeight !== CELL_HEIGHT || source.row !== row || source.startColumn !== 0 || source.frameCount !== 8) {
      issues.push(issue('STATE_LAYOUT_INVALID', `${base}.source`, `${id} must use row ${row} of the 8x22 atlas`))
    }
    if (!atlasAsset) atlasAsset = source.asset
    else if (source.asset !== atlasAsset) issues.push(issue('ATLAS_ASSET_MISMATCH', `${base}.source.asset`, 'all full-state clips must share one atlas'))
    if (Number(clip.timing?.fps) !== fps || clip.timing?.playback !== playback) issues.push(issue('STATE_TIMING_INVALID', `${base}.timing`, `${id} must use ${fps} fps and ${playback}`))
  }

  const bindings = raw.semantics?.bindings || {}
  for (const [intent, animationId] of Object.entries(REQUIRED_BINDINGS)) {
    const candidates = Array.isArray(bindings[intent]) ? bindings[intent] : [bindings[intent]].filter(Boolean)
    if (!candidates.includes(animationId)) issues.push(issue('ADAPTER_BINDING_MISSING', `semantics.bindings.${intent}`, `must include ${animationId}`))
  }

  let atlas = null
  if (atlasAsset && !issues.some((item) => ['ASSET_PATH_TRAVERSAL', 'ASSET_NOT_FOUND', 'IMAGE_DIMENSIONS_INVALID'].includes(item.code))) {
    try {
      atlas = inspectAtlas(path.resolve(directory, ...String(atlasAsset).replace(/\\/g, '/').split('/')))
      if (atlas.pixelInspection === 'complete') {
        if (atlas.emptyCells.length) issues.push(issue('ATLAS_EMPTY_CELL', atlasAsset, `empty cells: ${JSON.stringify(atlas.emptyCells)}`))
        if (atlas.edgeCells.length) issues.push(issue('ATLAS_EDGE_TOUCH', atlasAsset, `alpha touches cell edges: ${JSON.stringify(atlas.edgeCells)}`))
        if (!atlas.transparentPixels) issues.push(issue('ATLAS_ALPHA_MISSING', atlasAsset, 'atlas has no transparent pixels'))
      }
    } catch (error) { issues.push(issue('ATLAS_DECODE_FAILED', atlasAsset, error.message)) }
  }

  return {
    ok: issues.length === 0,
    standard: 'workspace-launcher-pet/full-state-22@1',
    manifest: manifestPath,
    id: raw.id,
    animations: Object.keys(animations).length,
    intents: Object.keys(model?.semantics?.bindings || {}).length,
    atlas,
    issues
  }
}

app.whenReady().then(() => {
  try {
    const result = verify(manifestPathFromArgument(process.argv[2]))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exit(result.ok ? 0 : 1)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message }, null, 2)}\n`)
    process.exit(1)
  }
})
