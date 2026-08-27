const fs = require('fs')
const path = require('path')
const { readImageSize } = require('../imageSize.cjs')

const IMAGE_EXTENSIONS = new Set(['.png', '.webp'])
const PLAYBACK_MODES = new Set(['loop', 'once', 'hold'])
const MAX_CLIPS = 300
const MAX_FRAMES = 120
const MAX_ASSETS = 3000
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024

class PetManifestError extends Error {
  constructor(issues) {
    super(issues[0]?.message || '桌宠 V3 清单无效')
    this.name = 'PetManifestError'
    this.issues = issues
  }
}

function issue(code, pathValue, message) {
  return { code, path: pathValue, message }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
}

function safeRelativeAsset(value, fieldPath, issues) {
  const raw = String(value || '').trim().replace(/\\/g, '/')
  const normalized = path.posix.normalize(raw)
  if (!raw || path.posix.isAbsolute(raw) || normalized === '..' || normalized.startsWith('../') || /^[a-z]:/i.test(normalized)) {
    issues.push(issue('ASSET_PATH_TRAVERSAL', fieldPath, `资源路径必须位于模型目录内：${raw || '(空)'}`))
    return null
  }
  if (!IMAGE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) {
    issues.push(issue('ASSET_EXTENSION_UNSUPPORTED', fieldPath, `仅支持 PNG 或 WebP：${raw}`))
    return null
  }
  return normalized
}

function resolveContained(directory, relativePath, fieldPath, issues) {
  const root = path.resolve(directory)
  const filePath = path.resolve(root, ...relativePath.split('/'))
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    issues.push(issue('ASSET_PATH_TRAVERSAL', fieldPath, `资源路径超出模型目录：${relativePath}`))
    return null
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    issues.push(issue('ASSET_NOT_FOUND', fieldPath, `找不到资源：${relativePath}`))
    return null
  }
  return filePath
}

function normalizeTiming(raw, frameCount, fieldPath, issues) {
  const timing = raw && typeof raw === 'object' ? raw : {}
  const playback = String(timing.playback || 'loop')
  if (!PLAYBACK_MODES.has(playback)) issues.push(issue('TIMING_INVALID', `${fieldPath}.playback`, `不支持的播放模式：${playback}`))
  if (Array.isArray(timing.durations)) {
    if (timing.durations.length !== frameCount) {
      issues.push(issue('TIMING_INVALID', `${fieldPath}.durations`, '逐帧时长数量必须与帧数一致'))
    }
    const durations = timing.durations.map((value, index) => {
      const duration = Number(value)
      if (!Number.isFinite(duration) || duration < 30 || duration > 5000) {
        issues.push(issue('TIMING_INVALID', `${fieldPath}.durations[${index}]`, '帧时长必须在 30-5000 毫秒之间'))
      }
      return clampNumber(duration, 30, 5000, 120)
    })
    return { mode: 'durations', durations, playback: PLAYBACK_MODES.has(playback) ? playback : 'loop' }
  }
  const fps = Number(timing.fps)
  if (!Number.isFinite(fps) || fps < 0.2 || fps > 60) {
    issues.push(issue('TIMING_INVALID', `${fieldPath}.fps`, 'FPS 必须在 0.2-60 之间'))
  }
  return { mode: 'fps', fps: clampNumber(fps, 0.2, 60, 8), playback: PLAYBACK_MODES.has(playback) ? playback : 'loop' }
}

function validateV3Manifest(raw, directory) {
  const issues = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PetManifestError([issue('MANIFEST_JSON_INVALID', '', 'pet.json 必须是对象')])
  if (Number(raw.schemaVersion) !== 3) throw new PetManifestError([issue('MANIFEST_SCHEMA_UNSUPPORTED', 'schemaVersion', '仅支持 schemaVersion 3')])
  const id = String(raw.id || '').trim()
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) issues.push(issue('MODEL_ID_INVALID', 'id', '模型 ID 必须为最长 64 位的小写字母、数字、下划线或连字符'))
  const displayName = String(raw.displayName || id).trim().slice(0, 80)
  const description = String(raw.description || '').trim().slice(0, 500)
  const render = raw.render && typeof raw.render === 'object' ? raw.render : {}
  if (render.engine !== 'sprite2d') issues.push(issue('ANIMATION_SOURCE_INVALID', 'render.engine', 'V3 首版仅支持 sprite2d'))
  const rawAnimations = render.animations && typeof render.animations === 'object' && !Array.isArray(render.animations) ? render.animations : {}
  const animationEntries = Object.entries(rawAnimations)
  if (!animationEntries.length || animationEntries.length > MAX_CLIPS) issues.push(issue('ANIMATION_MISSING', 'render.animations', `动画数量必须在 1-${MAX_CLIPS} 之间`))

  const assets = new Map()
  const animations = {}
  let maxWidth = 0
  let maxHeight = 0
  let totalBytes = 0
  for (const [animationId, definition] of animationEntries.slice(0, MAX_CLIPS)) {
    const basePath = `render.animations.${animationId}`
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(animationId) || !definition || typeof definition !== 'object') {
      issues.push(issue('ANIMATION_SOURCE_INVALID', basePath, `动画 ID 或定义无效：${animationId}`))
      continue
    }
    const source = definition.source && typeof definition.source === 'object' ? definition.source : {}
    let normalizedSource
    let frameCount = 0
    if (source.type === 'sequence') {
      const frames = Array.isArray(source.frames) ? source.frames : []
      if (frames.length < 1 || frames.length > MAX_FRAMES) issues.push(issue('ANIMATION_SOURCE_INVALID', `${basePath}.source.frames`, `序列帧数必须在 1-${MAX_FRAMES} 之间`))
      const normalizedFrames = []
      frames.slice(0, MAX_FRAMES).forEach((value, index) => {
        const fieldPath = `${basePath}.source.frames[${index}]`
        const relativePath = safeRelativeAsset(value, fieldPath, issues)
        if (!relativePath) return
        const filePath = resolveContained(directory, relativePath, fieldPath, issues)
        if (!filePath) return
        try {
          const size = readImageSize(filePath)
          if (size.width < 16 || size.width > 4096 || size.height < 16 || size.height > 4096) throw new Error('图片尺寸必须在 16-4096 像素之间')
          maxWidth = Math.max(maxWidth, size.width)
          maxHeight = Math.max(maxHeight, size.height)
          if (!assets.has(relativePath)) {
            const bytes = fs.statSync(filePath).size
            assets.set(relativePath, { relativePath, filePath, ...size, bytes })
            totalBytes += bytes
          }
          normalizedFrames.push(relativePath)
        } catch (error) {
          issues.push(issue('IMAGE_UNREADABLE', fieldPath, `无法读取图片 ${relativePath}：${error.message}`))
        }
      })
      frameCount = normalizedFrames.length
      normalizedSource = { type: 'sequence', frames: normalizedFrames }
    } else if (source.type === 'atlas') {
      const relativePath = safeRelativeAsset(source.asset, `${basePath}.source.asset`, issues)
      const filePath = relativePath && resolveContained(directory, relativePath, `${basePath}.source.asset`, issues)
      const columns = Math.trunc(clampNumber(source.columns, 1, 256, 0))
      const rows = Math.trunc(clampNumber(source.rows, 1, 256, 0))
      const cellWidth = Math.trunc(clampNumber(source.cellWidth, 16, 4096, 0))
      const cellHeight = Math.trunc(clampNumber(source.cellHeight, 16, 4096, 0))
      const row = Math.trunc(clampNumber(source.row, 0, Math.max(0, rows - 1), 0))
      const startColumn = Math.trunc(clampNumber(source.startColumn, 0, Math.max(0, columns - 1), 0))
      frameCount = Math.trunc(clampNumber(source.frameCount, 1, Math.max(1, columns - startColumn), 0))
      if (!columns || !rows || !cellWidth || !cellHeight || !frameCount) issues.push(issue('ANIMATION_SOURCE_INVALID', `${basePath}.source`, '图集布局参数无效'))
      if (filePath) {
        try {
          const size = readImageSize(filePath)
          if (size.width !== columns * cellWidth || size.height !== rows * cellHeight) throw new Error(`图集尺寸应为 ${columns * cellWidth}×${rows * cellHeight}`)
          if (!assets.has(relativePath)) {
            const bytes = fs.statSync(filePath).size
            assets.set(relativePath, { relativePath, filePath, ...size, bytes })
            totalBytes += bytes
          }
          maxWidth = Math.max(maxWidth, cellWidth)
          maxHeight = Math.max(maxHeight, cellHeight)
        } catch (error) {
          issues.push(issue('IMAGE_DIMENSIONS_INVALID', `${basePath}.source.asset`, error.message))
        }
      }
      normalizedSource = { type: 'atlas', asset: relativePath, columns, rows, cellWidth, cellHeight, row, startColumn, frameCount }
    } else {
      issues.push(issue('ANIMATION_SOURCE_INVALID', `${basePath}.source.type`, '动画源必须为 sequence 或 atlas'))
      continue
    }
    const timing = normalizeTiming(definition.timing, frameCount, `${basePath}.timing`, issues)
    const placement = definition.placement && typeof definition.placement === 'object' ? definition.placement : {}
    animations[animationId] = {
      id: animationId,
      source: normalizedSource,
      timing,
      placement: {
        anchorX: 0.5,
        anchorY: 1,
        offsetX: clampNumber(placement.offsetX, -4096, 4096, 0),
        offsetY: clampNumber(placement.offsetY, -4096, 4096, 0),
        scale: clampNumber(placement.scale, 0.1, 4, 1)
      },
      semantics: Array.isArray(definition.semantics) ? definition.semantics.map(String).filter(Boolean).slice(0, 32) : [],
      interruptible: definition.interruptible !== false
    }
  }
  if (assets.size > MAX_ASSETS || totalBytes > MAX_PACKAGE_BYTES) issues.push(issue('ANIMATION_SOURCE_INVALID', 'render.animations', '模型资源数量或总体积超过安全上限'))

  const rawBindings = raw.semantics?.bindings && typeof raw.semantics.bindings === 'object' ? raw.semantics.bindings : {}
  const bindings = {}
  for (const [intent, candidates] of Object.entries(rawBindings)) {
    const values = (Array.isArray(candidates) ? candidates : [candidates]).map(String).filter(Boolean).slice(0, 16)
    const known = values.filter((clipId) => animations[clipId])
    if (known.length !== values.length) issues.push(issue('SEMANTIC_BINDING_UNKNOWN_CLIP', `semantics.bindings.${intent}`, '语义绑定引用了不存在的动画'))
    if (known.length) bindings[String(intent).slice(0, 80)] = known
  }
  for (const clip of Object.values(animations)) {
    for (const intent of clip.semantics) if (!bindings[intent]) bindings[intent] = [clip.id]
  }
  if (!bindings.idle && animations.idle) bindings.idle = ['idle']

  const hitboxes = []
  const rawHitboxes = Array.isArray(raw.interactions?.hitboxes) ? raw.interactions.hitboxes : []
  rawHitboxes.slice(0, 64).forEach((box, index) => {
    const fieldPath = `interactions.hitboxes[${index}]`
    const valid = box && box.shape === 'rect' && [box.x, box.y, box.width, box.height].every((value) => Number.isFinite(Number(value))) && Number(box.x) >= 0 && Number(box.y) >= 0 && Number(box.width) > 0 && Number(box.height) > 0 && Number(box.x) + Number(box.width) <= 1 && Number(box.y) + Number(box.height) <= 1
    if (!valid) issues.push(issue('HITBOX_INVALID', fieldPath, '命中框必须是位于 0..1 画布内的矩形'))
    else hitboxes.push({ id: String(box.id || `hitbox-${index}`).slice(0, 40), shape: 'rect', x: Number(box.x), y: Number(box.y), width: Number(box.width), height: Number(box.height), intent: String(box.intent || 'touch.body').slice(0, 80) })
  })

  const canvas = render.canvas && typeof render.canvas === 'object' ? render.canvas : { mode: 'auto-max' }
  let normalizedCanvas
  if (canvas.mode === 'fixed') {
    const width = Math.trunc(Number(canvas.width))
    const height = Math.trunc(Number(canvas.height))
    if (width < 16 || width > 4096 || height < 16 || height > 4096) issues.push(issue('CANVAS_INVALID', 'render.canvas', '固定画布尺寸必须在 16-4096 像素之间'))
    normalizedCanvas = { width, height, anchorX: 0.5, anchorY: 1 }
  } else if (!canvas.mode || canvas.mode === 'auto-max') {
    normalizedCanvas = { width: maxWidth, height: maxHeight, anchorX: 0.5, anchorY: 1 }
  } else {
    issues.push(issue('CANVAS_INVALID', 'render.canvas.mode', '画布模式必须为 auto-max 或 fixed'))
    normalizedCanvas = { width: maxWidth, height: maxHeight, anchorX: 0.5, anchorY: 1 }
  }

  if (issues.length) throw new PetManifestError(issues)
  return {
    id,
    displayName,
    description,
    schemaVersion: 3,
    sourceFormat: Object.values(animations).some((clip) => clip.source.type === 'sequence') ? 'pet-v3-sequence' : 'pet-v3-atlas',
    render: { engine: 'sprite2d', canvas: normalizedCanvas, animations },
    semantics: { bindings },
    interactions: { hitboxes },
    behavior: { traits: {
      activity: clampNumber(raw.behavior?.traits?.activity, 0.25, 2, 1),
      sociability: clampNumber(raw.behavior?.traits?.sociability, 0.25, 2, 1),
      playfulness: clampNumber(raw.behavior?.traits?.playfulness, 0.25, 2, 1),
      sleepiness: clampNumber(raw.behavior?.traits?.sleepiness, 0.25, 2, 1)
    } },
    presentation: {
      defaultEmotion: String(raw.presentation?.defaultEmotion || 'neutral'),
      defaultIntent: String(raw.presentation?.defaultIntent || 'idle')
    },
    assets: [...assets.values()]
  }
}

module.exports = { validateV3Manifest, PetManifestError, IMAGE_EXTENSIONS, safeRelativeAsset }
