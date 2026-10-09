// Official Haru sample for local integration tests only. Not distributed as a
// bundled pet. The upstream commit is pinned so tests do not change silently.
const fs = require('fs')
const path = require('path')
const REVISION = 'b1de66b0b1f1cb881d95fb6158622aeb6a2827bd'
const base = `https://raw.githubusercontent.com/Live2D/CubismWebSamples/${REVISION}/Samples/Resources/Haru/`
const root = path.resolve(__dirname, '../output/live2d-fixture/Haru')

async function download(url, file) {
  if (fs.existsSync(file)) return
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`Fixture download failed: ${response.status} ${url}`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()))
}
async function main() {
  await download(`${base}Haru.model3.json`, path.join(root, 'Haru.model3.json'))
  const refs = JSON.parse(fs.readFileSync(path.join(root, 'Haru.model3.json'), 'utf8')).FileReferences
  const files = [refs.Moc, ...refs.Textures, refs.Physics, refs.Pose, refs.DisplayInfo, refs.UserData,
    ...(refs.Expressions || []).map((e) => e.File),
    ...Object.values(refs.Motions || {}).flatMap((group) => group.flatMap((motion) => [motion.File, motion.Sound]))].filter(Boolean)
  for (const file of files) await download(base + file, path.join(root, file))
  await download(`https://raw.githubusercontent.com/Live2D/CubismWebSamples/${REVISION}/LICENSE.md`, path.resolve(root, '../LICENSE.md'))
  console.log(`Live2D fixture ready: ${root} (${REVISION})`)
}
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1 })
module.exports = { main, root, REVISION }

