const fs = require('fs')
const { t } = require('../i18n.cjs')

function readPngSize(buffer) {
  const signature = '89504e470d0a1a0a'
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null
  return { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function readWebpSize(buffer) {
  if (
    buffer.length < 30 ||
    buffer.subarray(0, 4).toString('ascii') !== 'RIFF' ||
    buffer.subarray(8, 12).toString('ascii') !== 'WEBP'
  ) return null

  let offset = 12
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii')
    const length = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (data + length > buffer.length) throw new Error(t('pet.invalidWebpChunk'))

    if (type === 'VP8X' && length >= 10) {
      return {
        format: 'webp',
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3)
      }
    }
    if (type === 'VP8L' && length >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1]
      const b2 = buffer[data + 2]
      const b3 = buffer[data + 3]
      const b4 = buffer[data + 4]
      return {
        format: 'webp',
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6))
      }
    }
    if (
      type === 'VP8 ' && length >= 10 &&
      buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a
    ) {
      return {
        format: 'webp',
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff
      }
    }
    offset = data + length + (length % 2)
  }
  throw new Error(t('pet.unknownWebpSize'))
}

function readImageSize(filePath) {
  const buffer = fs.readFileSync(filePath)
  const result = readPngSize(buffer) || readWebpSize(buffer)
  if (!result || !result.width || !result.height) throw new Error(t('pet.invalidImage'))
  return result
}

module.exports = { readImageSize }
