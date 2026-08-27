const assert = require('assert')
const { resolveLocal, resolveHybrid, sanitizePresentation } = require('../electron/services/petPresentationService.cjs')

async function main() {
  assert.equal(resolveLocal({ userText: '终于完成了，谢谢！' }).emotion, 'happy')
  const failure = resolveLocal({ event: 'failure' })
  assert.equal(failure.emotion, 'concerned')
  assert.equal(failure.intent, 'error')
  assert.equal(resolveLocal({ event: 'started' }).intent, 'focus.working')
  const fallback = resolveLocal({ assistantText: '普通答复' })
  const sanitized = sanitizePresentation({ emotion: 'malicious', intent: '../../file', intensity: 9, confidence: -2, holdMs: 99999 }, fallback)
  assert.equal(sanitized.emotion, fallback.emotion)
  assert.equal(sanitized.intent, fallback.intent)
  assert.equal(sanitized.intensity, 1)
  assert.equal(sanitized.confidence, 0)
  assert.equal(sanitized.holdMs, 6000)
  const hybrid = await resolveHybrid({ assistantText: '普通答复' }, async () => { throw new Error('分类失败') })
  assert.equal(hybrid.source, 'local')
  console.log('桌宠本地情绪、AI 元数据净化与失败回退验证通过 ✓')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
