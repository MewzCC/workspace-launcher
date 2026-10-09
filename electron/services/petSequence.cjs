const fs = require('fs')
const path = require('path')
const { readImageSize } = require('./imageSize.cjs')

const ACTION_ALIASES = {
  idle: 'idle', blink: 'blink', walk_right: 'walkRight', walkright: 'walkRight',
  walk_left: 'walkLeft', walkleft: 'walkLeft', wave: 'wave', happy: 'wave',
  jump: 'jump', angry: 'failed', failed: 'failed', waiting: 'waiting', sleep: 'sleep',
  working: 'working', review: 'review', drag: 'dragging', dragging: 'dragging',
  touch_head: 'touchHead', sit_down: 'sitDown'
}
const ACTIONS = [...new Set(Object.values(ACTION_ALIASES))]
const IMAGE_RE = /\.(png|webp)$/i
const MAX_BYTES = 128 * 1024 * 1024

function assetPath(root, relative) {
  const name = String(relative || '').replace(/\\/g, '/')
  if (!name || !IMAGE_RE.test(name) || name.includes(':') || name.startsWith('/') || name.split('/').includes('..')) throw new Error(`无效的模型图片路径：${name}`)
  const base = fs.realpathSync(root)
  const file = fs.realpathSync(path.resolve(root, name))
  if (!file.startsWith(`${base}${path.sep}`) || !fs.statSync(file).isFile()) throw new Error(`图片必须位于模型目录内：${name}`)
  if (fs.statSync(file).size > 16 * 1024 * 1024) throw new Error(`单张图片不能超过 16 MB：${name}`)
  return file
}

function validateSequence(raw, root) {
  if (raw?.renderer !== 'sequence' || raw.schemaVersion !== 1) throw new Error('逐帧模型需要 renderer: sequence 和 schemaVersion: 1')
  const animations = {}
  let canvas
  let total = 0
  let count = 0
  for (const [action, value] of Object.entries(raw.animations || {})) {
    if (!ACTIONS.includes(action)) throw new Error(`不支持的动作：${action}`)
    if (!Array.isArray(value.frames) || !value.frames.length || value.frames.length > 120) throw new Error(`${action} 需要 1–120 张 PNG/WebP 帧`)
    const frames = value.frames.map((relative) => {
      const file = assetPath(root, relative)
      total += fs.statSync(file).size
      count += 1
      if (total > MAX_BYTES || count > 600) throw new Error('模型最多 600 帧、总大小 128 MB')
      const size = readImageSize(file)
      if (size.width > 4096 || size.height > 4096 || size.height / size.width < 0.5 || size.height / size.width > 2) throw new Error('画布边长不能超过 4096，宽高比例须在 1:2 到 2:1 之间')
      if (!canvas) canvas = { width: size.width, height: size.height }
      if (canvas.width !== size.width || canvas.height !== size.height) throw new Error(`帧画布不一致：${relative}，请统一所有动作的画布尺寸与脚底位置`)
      return String(relative).replace(/\\/g, '/')
    })
    const fps = Number(value.fps ?? 8)
    if (!Number.isFinite(fps) || fps < 1 || fps > 30) throw new Error(`${action} 的 FPS 须在 1–30 之间`)
    animations[action] = { frames, fps, loop: value.loop !== false }
  }
  if (!animations.idle) throw new Error('模型缺少 idle 待机动作')
  return {
    schemaVersion: 1, renderer: 'sequence', id: raw.id,
    displayName: String(raw.displayName || raw.id || '我的桌宠').trim().slice(0, 80),
    description: String(raw.description || '').slice(0, 240), canvas, animations
  }
}

function sequenceRuntime(manifest, root) {
  const animations = Object.fromEntries(Object.entries(manifest.animations).map(([id, clip]) => [id, {
    id, source: { type: 'sequence', frames: clip.frames.map((name) => {
      const file = assetPath(root, name)
      return `data:image/${path.extname(file).toLowerCase() === '.webp' ? 'webp' : 'png'};base64,${fs.readFileSync(file).toString('base64')}`
    }) }, timing: { mode: 'fps', fps: clip.fps, playback: clip.loop ? 'loop' : 'once' }
  }]))
  return { ...manifest, builtin: false, imported: true, sourceFormat: 'sequence', render: { engine: 'sequence', canvas: manifest.canvas, animations } }
}

module.exports = { ACTION_ALIASES, ACTIONS, IMAGE_RE, MAX_BYTES, assetPath, validateSequence, sequenceRuntime }
