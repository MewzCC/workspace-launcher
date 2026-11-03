// 聊天图片工具：把本地图片压缩成适合模型识别的 JPEG data URL，
// 并统一处理粘贴、拖放和文件选择。压缩在主进程之外完成，
// 避免把大图原样写进会话数据库或请求体。
export const MAX_CHAT_IMAGES = 4

const MAX_DIMENSION = 1400
const JPEG_QUALITY = 0.86
const MAX_SOURCE_BYTES = 20 * 1024 * 1024

export async function fileToChatImage(file) {
  if (!file || !String(file.type || '').startsWith('image/')) return null
  if (file.size > MAX_SOURCE_BYTES) throw new Error('图片过大，请选择 20MB 以内的图片。')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法处理这张图片。')
    context.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    bitmap.close?.()
  }
}

// 从粘贴事件中提取图片文件；没有图片时返回空数组，保留普通文本粘贴行为。
export function clipboardImageFiles(event) {
  const items = event?.clipboardData?.items
  if (!items) return []
  const files = []
  for (const item of items) {
    if (item.kind === 'file' && String(item.type || '').startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

export function collectFilesFromList(fileList, limit = MAX_CHAT_IMAGES) {
  return Array.from(fileList || []).filter((file) => String(file.type || '').startsWith('image/')).slice(0, limit)
}
