const PET_BUBBLE_MIN_DURATION = 2800
const PET_BUBBLE_MAX_DURATION = 30000

function readableBubbleText(text) {
  return String(text || '')
    .replace(/```[^\n]*\n?/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/gi, ' link ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s+/gm, '')
    .replace(/[\*_~]/g, '')
    .trim()
}

function calculatePetBubbleDuration(text, requestedMinimum) {
  const content = readableBubbleText(text)
  if (!content) return PET_BUBBLE_MIN_DURATION

  const cjkCount = (content.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []).length
  const withoutCjk = content.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
  const wordCount = (withoutCjk.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length
  const emojiAndSymbolCount = (content.match(/[\p{Extended_Pictographic}\p{Symbol}]/gu) || []).length
  const sentencePauseCount = (content.match(/[。！？.!?]/g) || []).length
  const phrasePauseCount = (content.match(/[，、；：,;:]/g) || []).length
  const lineBreakCount = (content.match(/\n/g) || []).length

  const readingDuration = 1400 +
    cjkCount * 165 +
    wordCount * 260 +
    emojiAndSymbolCount * 110 +
    sentencePauseCount * 180 +
    phrasePauseCount * 75 +
    lineBreakCount * 140
  const minimum = Number.isFinite(Number(requestedMinimum))
    ? Math.max(0, Number(requestedMinimum))
    : 0

  return Math.round(Math.min(
    PET_BUBBLE_MAX_DURATION,
    Math.max(PET_BUBBLE_MIN_DURATION, readingDuration, minimum)
  ))
}

module.exports = {
  PET_BUBBLE_MIN_DURATION,
  PET_BUBBLE_MAX_DURATION,
  calculatePetBubbleDuration
}
