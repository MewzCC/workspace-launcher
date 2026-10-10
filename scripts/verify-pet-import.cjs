// Isolated Electron integration test. UI mode requires bundling this file into
// out/main so pet window paths match the production layout (see README).
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { app, nativeImage, BrowserWindow, dialog } = require('electron')
const AdmZip = require('adm-zip')

const root = process.env.LAUNCHPAD_TEST_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-import-test-'))
process.env.PORTABLE_EXECUTABLE_DIR = root
app.setPath('appData', path.join(root, 'appData'))
app.setPath('userData', path.join(root, 'userData'))
const repo = process.env.LAUNCHPAD_TEST_REPO || path.resolve(__dirname, '..')
const ui = process.argv.includes('--ui')
require('../electron/services/petLive2d.cjs') // Register the resource scheme before ready.
let imports, petService, db

function png(file, width = 192, height = 208, color = 0x70) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const bitmap = Buffer.alloc(width * height * 4)
  for (let y = 20; y < height - 20; y++) for (let x = 20; x < width - 20; x++) {
    const i = (y * width + x) * 4
    bitmap[i] = color; bitmap[i + 1] = 150; bitmap[i + 2] = 220; bitmap[i + 3] = 255
  }
  fs.writeFileSync(file, nativeImage.createFromBitmap(bitmap, { width, height }).toPNG())
}

async function waitFor(win, script) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await win.webContents.executeJavaScript(script)) return
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  throw new Error(`UI condition timed out: ${script}\n${await win.webContents.executeJavaScript(`JSON.stringify({url:location.href,status:document.querySelector('.pet-live2d-host')?.outerHTML,error:document.querySelector('.pet-import-error')?.textContent})`)}`)
}

async function refreshPreview(win) {
  if (!process.env.LAUNCHPAD_TEST_HMR_URL) return
  const updates = await win.webContents.executeJavaScript('window.__petImportHmrCount || 0')
  await fetch(process.env.LAUNCHPAD_TEST_HMR_URL, { method: 'POST' })
  await waitFor(win, `(window.__petImportHmrCount || 0) > ${updates}`)
  assert(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.pet-import-preview'))`), 'Fast Refresh retains the preview')
}

async function verifyUI(source) {
  // Integration windows remain hidden during verification.
  BrowserWindow.prototype.show = function () {}
  require('../electron/ipc/handlers.cjs').registerIpcHandlers()
  petService = require('../electron/services/petService.cjs')
  petService.init({})
  const errors = []
  const win = new BrowserWindow({ show: false, width: 1440, height: 1100, webPreferences: { preload: path.join(repo, 'out/preload/index.cjs'), contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) { errors.push(message); console.error('Renderer:', message) } })
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(path.join(repo, 'out/renderer/index.html'))
  win.webContents.send('app:navigate', 'pet-center')
  // The channel is read from preload, not assumed by a real UI user.
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('桌宠工作台'))?.click()`)
  await waitFor(win, `Boolean(document.querySelector('#pet-tab-models'))`)
  await win.webContents.executeJavaScript(`document.querySelector('#pet-tab-models').click()`)
  await waitFor(win, `Boolean(document.querySelector('.pet-dropzone'))`)
  const original = dialog.showOpenDialog
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] })
  try {
    // Use the real file dialog IPC and React click handler.
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b => b.textContent.includes('选择文件夹')).click()`)
    await waitFor(win, `Boolean(document.querySelector('.pet-import-preview'))`)
    // Also exercise native File -> preload webUtils -> importer via Chromium's
    // drag input, rather than a synthetic File without a filesystem path.
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b => b.textContent.includes('取消预览')).click()`)
    await waitFor(win, `document.querySelector('.pet-import-preview') === null`)
    const point = await win.webContents.executeJavaScript(`(() => { document.querySelector('.pet-dropzone').scrollIntoView({block: 'center'}); const r = document.querySelector('.pet-dropzone').getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2} })()`)
    win.webContents.debugger.attach('1.3')
    const data = { items: [], files: [source], dragOperationsMask: 1 }
    for (const type of ['dragEnter', 'dragOver', 'drop']) await win.webContents.debugger.sendCommand('Input.dispatchDragEvent', { type, ...point, data })
    win.webContents.debugger.detach()
    await waitFor(win, `Boolean(document.querySelector('.pet-import-preview'))`)
    assert.strictEqual(await win.webContents.executeJavaScript(`document.querySelectorAll('.pet-import-clips button').length`), 4)
    await waitFor(win, `Array.from(document.querySelectorAll('.pet-import-stage img')).every(img => img.complete && img.naturalWidth > 0)`)
    const before = await win.webContents.executeJavaScript(`document.querySelector('.pet-import-stage img').src`)
    await waitFor(win, `document.querySelector('.pet-import-stage img').src !== ${JSON.stringify(before)}`)
    const after = await win.webContents.executeJavaScript(`document.querySelector('.pet-import-stage img').src`)
    assert.notStrictEqual(before, after, 'Idle animation advances')
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-clips button')).find(b => b.textContent === '拖拽').click()`)
    await waitFor(win, `document.querySelector('.pet-import-stage .pet-sprite--dragging') !== null`)
    const out = path.join(repo, 'output/playwright')
    fs.mkdirSync(out, { recursive: true })
    await win.webContents.executeJavaScript(`document.querySelector('.pet-smart-import').scrollIntoView({block: 'start'})`)
    await new Promise((resolve) => setTimeout(resolve, 250))
    fs.writeFileSync(path.join(out, 'pet-import-preview.png'), (await win.webContents.capturePage()).toPNG())
    assert.strictEqual(db.settingsDao.get('petModelId'), 'custom-pet-2', 'UI preview leaves selection unchanged')
    await refreshPreview(win)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b => b.textContent.includes('使用这个桌宠')).click()`)
    await waitFor(win, `document.querySelector('.pet-import-preview') === null`)
    const selected = db.settingsDao.get('petModelId')
    assert(db.settingsDao.get('petInstanceIds').includes(selected), 'Use enables desktop instance')
    const windows = BrowserWindow.getAllWindows().filter((w) => w !== win)
    assert(windows.length > 0, 'Use creates pet window')
    const pet = windows[0]
    await waitFor(pet, `Boolean(document.querySelector('.pet-renderer__sequence-frame'))`)
    await waitFor(pet, `document.querySelector('.pet-renderer__sequence-frame').naturalWidth > 0`)
    const config = petService.getRuntimeConfig(selected)
    assert.strictEqual(config.settings.dimensions.spriteHeight, Math.round(config.settings.dimensions.spriteWidth * 208 / 192))
    assert.deepStrictEqual(errors, [], 'No frontend error messages')
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(repo, 'models/blue-whale-maid')] })
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b => b.textContent.includes('选择文件夹')).click()`)
    await waitFor(win, `Boolean(document.querySelector('.pet-import-preview .pet-sprite--idle'))`)
    await waitFor(win, `document.querySelector('.pet-import-stage img')?.naturalWidth === 1536`)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-clips button')).find(b => b.textContent === '向右走').click()`)
    await waitFor(win, `document.querySelector('.pet-import-stage .pet-sprite--walkRight') !== null`)
    const atlas = await win.webContents.executeJavaScript(`(() => { const r = document.querySelector('.pet-import-stage .pet-renderer__content').getBoundingClientRect(); const img = document.querySelector('.pet-import-stage img').getBoundingClientRect(); return { frame: r.width, width: img.width, frameTop: r.top, top: img.top, height: r.height } })()`)
    assert(Math.abs(atlas.width - atlas.frame * 8) < 1, 'Legacy atlas keeps 8-column geometry')
    assert(Math.abs(atlas.top - (atlas.frameTop - atlas.height)) < 1, 'Walk right selects atlas row 1')
    fs.cpSync(path.join(repo, 'skills/create-launchpad-pet'), path.join(root, 'skills/create-launchpad-pet'), { recursive: true })
    const originalSave = dialog.showSaveDialog
    try {
      const zipPath = path.join(root, 'exported-skill.zip')
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: zipPath })
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-skill button')).find(b => b.textContent.includes('导出生成')).click()`)
      await waitFor(win, `document.querySelector('.pet-import-skill [role="status"]')?.textContent.includes('已保存')`)
      const archive = new AdmZip(zipPath)
      assert(archive.getEntry('create-launchpad-pet/SKILL.md'))
      assert(archive.getEntry('create-launchpad-pet/scripts/package_custom_pet.py'))
    } finally { dialog.showSaveDialog = originalSave }
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b => b.textContent.includes('取消预览')).click()`)
    const liveFixture = path.join(repo, 'output/live2d-fixture/Haru')
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [liveFixture] })
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b => b.textContent.includes('选择文件夹')).click()`)
    await waitFor(win, `Boolean(document.querySelector('.pet-import-stage .pet-live2d-host'))`)
    await win.webContents.executeJavaScript(`document.querySelector('.pet-import-stage').scrollIntoView({block:'center'})`)
    await waitFor(win, `document.querySelector('.pet-import-stage .pet-live2d-host')?.dataset.status === 'ready' && !Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).disabled`)
    const motionLabel = 'TapBody / 1'
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-clips button')).find(b=>b.textContent===${JSON.stringify(motionLabel)}).click()`)
    const expectedMotion = require('../electron/services/petLive2d.cjs').validate({renderer:'live2d',modelPath:'Haru.model3.json',id:'fixture'},liveFixture).actions.find(a=>a.group==='TapBody'&&a.index===0).id
    await waitFor(win, `document.querySelector('.pet-import-stage .pet-live2d-host').dataset.action === ${JSON.stringify(expectedMotion)}`)
    const motionId = await win.webContents.executeJavaScript(`document.querySelector('.pet-import-stage .pet-live2d-host').dataset.action`)
    await win.webContents.executeJavaScript(`document.querySelector('.pet-import-mappings select[aria-label="招手"]').value=${JSON.stringify(motionId)};document.querySelector('.pet-import-mappings select[aria-label="招手"]').dispatchEvent(new Event('change',{bubbles:true}))`)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-clips button')).find(b=>b.textContent==='F01').click()`)
    await waitFor(win, `document.querySelector('.pet-import-stage .pet-live2d-host').dataset.action.startsWith('expression-')`)
    fs.writeFileSync(path.join(out, 'live2d-import-preview.png'), (await win.webContents.capturePage()).toPNG())
    // Manual engine selection rejects a mismatched package and can recover.
    await win.webContents.executeJavaScript(`(()=>{const select=document.querySelector('.pet-import-engine select');select.value='sprite';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await waitFor(win, `document.querySelector('.pet-import-error')?.textContent.includes('Live2D') && !document.querySelector('.pet-import-preview')`)
    await win.webContents.executeJavaScript(`(()=>{const select=document.querySelector('.pet-import-engine select');select.value='live2d';select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await waitFor(win, `document.querySelector('.pet-import-stage .pet-live2d-host')?.dataset.status === 'ready'`)
    await win.webContents.executeJavaScript(`document.querySelector('.pet-import-stage').scrollIntoView({block:'center'})`)
    await waitFor(win, `!Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).disabled`)
    const chosen = require('../electron/services/petLive2d.cjs').validate({renderer:'live2d',modelPath:'Haru.model3.json',id:'fixture'},liveFixture).actions.find(a=>a.group==='TapBody'&&a.index===0).id
    await win.webContents.executeJavaScript(`for(const label of ['招手','拖拽']){const s=document.querySelector('.pet-import-mappings select[aria-label="'+label+'"]');s.value=${JSON.stringify(chosen)};s.dispatchEvent(new Event('change',{bubbles:true}))}`)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).click()`)
    await waitFor(win, `document.querySelector('.pet-import-preview') === null`)
    const liveId = db.settingsDao.get('petModelId')
    const liveConfig = petService.getRuntimeConfig(liveId)
    assert.strictEqual(liveConfig.model.live2d.mappings.wave, chosen)
    assert.strictEqual(liveConfig.model.live2d.mappings.dragging, chosen)
    assert(liveConfig.model.thumbnailDataUrl)
    let liveWindow
    for (let i=0;i<100&&!liveWindow;i++) { liveWindow=BrowserWindow.getAllWindows().find(w=>w!==win&&w.webContents.getURL().includes(encodeURIComponent(liveId))); if(!liveWindow) await new Promise(r=>setTimeout(r,50)) }
    assert(liveWindow, 'Live2D gets an independent desktop instance')
    await waitFor(liveWindow, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready'`)
    petService.sendPetAction({state:'wave',duration:4000},liveId)
    await waitFor(liveWindow, `document.querySelector('.pet-live2d-host')?.dataset.action === ${JSON.stringify(chosen)}`)
    await win.webContents.executeJavaScript(`(()=>{const s=document.querySelector('.pet-import-engine select');s.value='auto';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    assert.strictEqual(await win.webContents.executeJavaScript(`document.querySelectorAll('.pet-model-cell-thumb canvas').length`), 0, 'Library thumbnails do not allocate WebGL contexts')
    assert.deepStrictEqual(errors, [], 'No frontend errors during Live2D integration')
    assert.strictEqual(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.pet-import-preview'))`), false, 'Changing engine after installation does not reopen an old import')
    const multiple = path.join(root, 'multiple-live2d')
    fs.cpSync(liveFixture,path.join(multiple,'one'),{recursive:true})
    fs.cpSync(liveFixture,path.join(multiple,'two'),{recursive:true})
    dialog.showOpenDialog = async () => ({canceled:false,filePaths:[multiple]})
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b=>b.textContent.includes('选择文件夹')).click()`)
    await waitFor(win, `document.querySelector('.pet-import-model-choice select')?.options.length === 3`)
    assert.strictEqual(await win.webContents.executeJavaScript(`Boolean(document.querySelector('.pet-import-preview'))`),false)
    await win.webContents.executeJavaScript(`(()=>{const s=document.querySelector('.pet-import-model-choice select');s.selectedIndex=2;s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await waitFor(win, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready'`)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('取消预览')).click()`)
    const broken=path.join(root,'broken-live2d')
    fs.cpSync(liveFixture,broken,{recursive:true})
    const settings=JSON.parse(fs.readFileSync(path.join(broken,'Haru.model3.json'),'utf8'))
    const texture=path.join(broken,settings.FileReferences.Textures[0])
    fs.writeFileSync(texture,fs.readFileSync(texture).subarray(0,24))
    dialog.showOpenDialog = async () => ({canceled:false,filePaths:[broken]})
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b=>b.textContent.includes('选择文件夹')).click()`)
    await waitFor(win, `document.querySelector('.pet-live2d-host')?.dataset.status === 'error'`)
    assert(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).disabled`), 'A failed GPU preview cannot be installed')
    assert.strictEqual(db.settingsDao.get('petModelId'),liveId,'A failed preview leaves the selected model intact')
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('取消预览')).click()`)
    const badMotion=path.join(root,'live2d-bad-motion')
    fs.cpSync(liveFixture,badMotion,{recursive:true})
    const badSettings=JSON.parse(fs.readFileSync(path.join(badMotion,'Haru.model3.json'),'utf8'))
    fs.writeFileSync(path.join(badMotion,badSettings.FileReferences.Motions.TapBody[0].File),'null')
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[badMotion]})
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b=>b.textContent.includes('选择文件夹')).click()`)
    await waitFor(win, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready' && !Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).disabled`)
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-clips button')).find(b=>b.textContent==='TapBody / 1').click()`)
    await waitFor(win, `document.querySelector('.pet-import-preview .pet-import-warnings')?.textContent.includes('动作预览失败')`)
    assert.strictEqual(await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).disabled`),false,'Optional motion failure must not disable a successfully rendered model')
    await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).click()`)
    await waitFor(win, `!document.querySelector('.pet-import-preview')`)
    console.log('Optional motion failure keeps Use available and installation succeeds')
    if (process.env.LAUNCHPAD_TEST_LIVE2D_PACKAGE) {
      const packagePath=path.resolve(process.env.LAUNCHPAD_TEST_LIVE2D_PACKAGE)
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[packagePath]})
      await waitFor(win, `!document.querySelector('.pet-dropzone button').disabled`)
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b=>b.textContent.includes('选择素材')).click()`)
      await waitFor(win, `Boolean(document.querySelector('.pet-import-preview'))`)
      await win.webContents.executeJavaScript(`document.querySelector('.pet-import-stage').scrollIntoView({block:'center'})`)
      await waitFor(win, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready' && !Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).disabled`)
      fs.writeFileSync(path.join(out,'user-live2d-preview.png'),(await win.webContents.capturePage()).toPNG())
      await refreshPreview(win)
      await waitFor(win, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready'`)
      await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-import-preview button')).find(b=>b.textContent.includes('使用这个桌宠')).click()`)
      await waitFor(win, `!document.querySelector('.pet-import-preview')`)
      const chosen=db.settingsDao.get('petModelId')
      assert(db.settingsDao.get('petInstanceIds').includes(chosen),'User package activation creates a desktop instance')
      let window
      for(let i=0;i<100&&!window;i++){window=BrowserWindow.getAllWindows().find(w=>w!==win&&w.webContents.getURL().includes(encodeURIComponent(chosen)));if(!window)await new Promise(r=>setTimeout(r,50))}
      assert(window,'User model opens a desktop window')
      await waitFor(window, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready'`)
      console.log('User Live2D ZIP preview and Use button passed:',chosen)
    }
    if (process.env.LAUNCHPAD_TEST_HMR_URL) {
      let pending
      const prepare = imports.prepare
      imports.prepare = (...args) => (pending = prepare(...args))
      try {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [liveFixture] })
        await waitFor(win, `!document.querySelector('.pet-dropzone button').disabled`)
        await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.pet-dropzone button')).find(b=>b.textContent.includes('选择文件夹')).click()`)
        await waitFor(win, `document.querySelector('.pet-live2d-host')?.dataset.status === 'ready'`)
        const resource = JSON.stringify(pending.model.live2d.entryUrl)
        assert.strictEqual(await win.webContents.executeJavaScript(`fetch(${resource}).then(r=>r.status)`), 200)
        await win.webContents.executeJavaScript(`document.querySelector('#pet-tab-settings').click()`)
        await waitFor(win, `!document.querySelector('.pet-import-preview') && fetch(${resource}).then(r=>r.status===404)`)
        assert.throws(() => imports.commit(pending.token, {}, win.webContents.id), /过期/)
        console.log('Fast Refresh keeps previews usable; real unmount cancels the session and revokes resources')
      } finally { imports.prepare = prepare }
    }
    win.destroy()
    console.log('UI native drag/drop, legacy compatibility, Live2D preview, engine/model selection, action mapping, desktop activation, failed-preview gate and skill export passed')
  } finally { dialog.showOpenDialog = original }
}

app.whenReady().then(async () => {
  db = require('../electron/db/index.cjs')
  const models = require('../electron/services/petModelService.cjs')
  imports = require('../electron/services/petImportService.cjs')
  const source = path.join(root, 'source', '我的角色')
  for (const action of ['idle', 'walk_right', 'drag']) {
    png(path.join(source, action, 'frame_2.png'))
    png(path.join(source, action, 'frame_10.png'), 192, 208, 0x30)
  }
  let preview = imports.prepare([source], 1)
  assert.deepStrictEqual(preview.actions, ['dragging', 'idle', 'walkRight'])
  assert(preview.warnings.includes('missingWalk'))
  assert.strictEqual(models.list().length, 1, 'Preview does not install')
  assert.strictEqual(db.settingsDao.get('petModelId'), 'builtin-launchbot')
  assert.throws(() => imports.commit(preview.token, { displayName: '不应写入', scale: 1 }, 2), /过期/)
  const committed = imports.commit(preview.token, { displayName: '我的角色', fps: 10, scale: 1 }, 1)
  assert.strictEqual(committed.id, 'custom-pet')
  assert.strictEqual(models.getRuntimeModel().render.animations.idle.timing.fps, 10)
  assert.throws(() => imports.commit(preview.token, {}, 1), /过期/)
  preview = imports.prepare([source], 1)
  const second = imports.commit(preview.token, { displayName: '副本', scale: 1 }, 1)
  assert.strictEqual(second.id, 'custom-pet-2')
  assert.strictEqual(models.getRuntimeModel('custom-pet').displayName, '我的角色')
  const staticImage = path.join(root, 'static.png')
  png(staticImage, 192, 192)
  preview = imports.prepare([staticImage], 1)
  assert.strictEqual(preview.format, 'image')
  assert(preview.warnings.includes('static'))
  assert.strictEqual(preview.model.render.canvas.height, 192)
  imports.cleanup(preview.token, 1)
  assert.throws(() => imports.commit(preview.token, {}, 1), /过期/)
  const archive = new AdmZip()
  archive.addLocalFolder(source, 'outer/角色')
  const zip = path.join(root, 'frames.zip')
  archive.writeZip(zip)
  preview = imports.prepare([zip], 1)
  assert.strictEqual(preview.actions.length, 3)
  imports.cleanup(preview.token, 1)
  preview = imports.prepare([path.join(source, 'idle/frame_10.png'), path.join(source, 'idle/frame_2.png')], 1)
  const firstUrl = preview.model.render.animations.idle.source.frames[0]
  assert.strictEqual(firstUrl, `data:image/png;base64,${fs.readFileSync(path.join(source, 'idle/frame_2.png')).toString('base64')}`)
  imports.cleanup(preview.token, 1)
  png(path.join(source, 'idle/frame_3.png'), 200, 208)
  assert.throws(() => imports.prepare([source], 1), /画布不一致/)
  fs.unlinkSync(path.join(source, 'idle/frame_3.png'))
  const malicious = new AdmZip()
  malicious.addFile('../escape.png', fs.readFileSync(staticImage))
  // adm-zip sanitizes addFile names, so patch the entry itself for this fixture.
  malicious.getEntries()[0].entryName = '../escape.png'
  malicious.writeZip(path.join(root, 'malicious.zip'))
  assert.throws(() => imports.prepare([path.join(root, 'malicious.zip')], 1), /不安全/)
  const sequence = { schemaVersion: 1, renderer: 'sequence', id: 'unsafe', animations: { idle: { frames: ['../static.png'] } } }
  fs.writeFileSync(path.join(source, 'pet.json'), JSON.stringify(sequence))
  assert.throws(() => imports.prepare([source], 1), /无效/)
  fs.unlinkSync(path.join(source, 'pet.json'))
  const corrupt = path.join(root, 'corrupt.png')
  fs.writeFileSync(corrupt, fs.readFileSync(staticImage).subarray(0, 24))
  assert.throws(() => imports.prepare([corrupt], 1), /无法解码/)
  const legacy = path.join(root, 'legacy')
  png(path.join(legacy, 'spritesheet.png'), 1536, 2288)
  fs.writeFileSync(path.join(legacy, 'pet.json'), JSON.stringify({ id: 'legacy-fixture', displayName: '旧图集', spriteVersionNumber: 2, spritesheetPath: 'spritesheet.png', dragAnimation: { atlasState: 'jump' } }))
  preview = imports.prepare([legacy], 1)
  assert.strictEqual(preview.model.spriteVersionNumber, 2)
  assert.strictEqual(preview.model.dragAnimation.atlasState, 'jump')
  imports.cleanup(preview.token, 1)
  preview = imports.prepare([path.join(legacy, 'spritesheet.png')], 1)
  assert.strictEqual(preview.format, 'codex-atlas')
  imports.cleanup(preview.token, 1)
  preview = imports.prepare([path.join(repo, 'models/blue-whale-maid')], 1)
  assert.strictEqual(preview.model.spriteVersionNumber, 2)
  assert.strictEqual(preview.model.dragAnimation.atlasState, 'jump')
  imports.cleanup(preview.token, 1)
  const svg = path.join(root, 'svg')
  fs.mkdirSync(svg)
  fs.writeFileSync(path.join(svg, 'pet.json'), JSON.stringify({ id: 'svg-fixture', renderer: 'svg', svgParams: { bodyColor: '#6366f1', bodyInnerColor: '#4f46e5', eyeColor: '#0f172a', antennaType: 'orb' } }))
  preview = imports.prepare([svg], 1)
  assert.strictEqual(preview.model.renderer, 'svg')
  imports.cleanup(preview.token, 1)
  console.log('Import isolation, folder/ZIP/image/sequence detection, collisions, frame ordering and invalid asset rejection passed')
  if (ui) await verifyUI(source)
  petService?.destroyPetWindow()
  imports.dispose()
  db.closeDb()
  if (!process.env.LAUNCHPAD_TEST_ROOT) fs.rmSync(root, { recursive: true, force: true })
  app.quit()
}).catch((error) => {
  console.error(error)
  petService?.destroyPetWindow()
  imports?.dispose()
  db?.closeDb()
  if (!process.env.LAUNCHPAD_TEST_ROOT) fs.rmSync(root, { recursive: true, force: true })
  app.exit(1)
})
