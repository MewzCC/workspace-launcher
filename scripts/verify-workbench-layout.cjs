// Run after npm run build: electron scripts/verify-workbench-layout.cjs
// Real renderer and IPC with isolated local storage and the built-in pet only.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { app, BrowserWindow, session } = require('electron')
const repo = path.resolve(__dirname, '..')
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-layout-'))
process.env.PORTABLE_EXECUTABLE_DIR = testRoot
app.setPath('appData', path.join(testRoot, 'appData'))
app.setPath('userData', path.join(testRoot, 'userData'))
app.disableHardwareAcceleration()
require('../electron/services/petLive2d.cjs')
setTimeout(() => { console.error('UI verification exceeded 90 seconds'); app.exit(1) }, 90000).unref()
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (request, callback) => callback({ cancel: !process.env.LAUNCHPAD_LAYOUT_RENDERER_URL || new URL(request.url).origin !== new URL(process.env.LAUNCHPAD_LAYOUT_RENDERER_URL).origin }))
  require('../electron/db/index.cjs').settingsDao.set('petEnabled', false)
  require('../electron/ipc/handlers.cjs').registerIpcHandlers()
  require('../electron/services/petService.cjs').init({})
  const win = new BrowserWindow({ show: false, width: 1440, height: 960, webPreferences: {
    preload: path.join(repo, 'out/preload/index.cjs'), contextIsolation: true,
    nodeIntegration: false, offscreen: true, backgroundThrottling: false
  } })
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  const evaluate = (script) => win.webContents.executeJavaScript(script)
  const wait = async (script) => {
    const deadline = Date.now() + 12000
    while (Date.now() < deadline) {
      if (await evaluate(script)) return
      await new Promise((resolve) => setTimeout(resolve, 60))
    }
    throw new Error(`UI timeout: ${script}`)
  }
  const click = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    await new Promise((resolve) => setTimeout(resolve, 280))
  }
  const screenshot = async (name) => {
    const directory = process.env.LAUNCHPAD_LAYOUT_SCREENSHOTS || path.join(testRoot, 'screenshots')
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, `${name}.png`), (await win.webContents.capturePage()).toPNG())
  }
  const noOverflow = async () => {
    await wait(`document.querySelector('.main-view').dataset.transition === 'idle' && document.querySelector('.pet-center-page > [role="tabpanel"]')?.getAttribute('aria-busy') !== 'true'`)
    await evaluate(`Promise.all(document.querySelector('.pet-center-page > [role="tabpanel"]').getAnimations({subtree:true}).filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))`)
    assert(await evaluate(`(() => {
    const page = document.querySelector('.pet-center-page')
    const panel = page.querySelector('[role="tabpanel"]')
    return page.scrollWidth <= page.clientWidth + 2 && panel.scrollWidth <= panel.clientWidth + 2
  })()`), 'Workbench has no horizontal overflow')
  }
  try {
    console.log('Loading isolated renderer')
    if (process.env.LAUNCHPAD_LAYOUT_RENDERER_URL) await win.loadURL(process.env.LAUNCHPAD_LAYOUT_RENDERER_URL)
    else await win.loadFile(path.join(repo, 'out/renderer/index.html'))
    await wait(`Boolean(document.querySelector('.nav-group-trigger'))`)
    console.log('Checking grouped navigation')
    if (process.env.LAUNCHPAD_LAYOUT_RENDERER_URL) {
      const sharedContext = await evaluate(`(async () => {
        const { default: React } = await import('/node_modules/.vite/deps/react.js')
        const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js')
        const { ConfirmDialogProvider } = await import('/src/components/ConfirmDialog.jsx')
        const { useConfirmDialog } = await import('/src/components/ConfirmDialog.jsx?context-regression')
        const host = document.createElement('div')
        document.body.append(host)
        let failure = null
        class Boundary extends React.Component {
          constructor(props) { super(props); this.state = { failed: false } }
          static getDerivedStateFromError() { return { failed: true } }
          componentDidCatch(error) { failure = error.message }
          render() { return this.state.failed ? null : this.props.children }
        }
        function Consumer() { useConfirmDialog(); return React.createElement('span', null, 'context-ok') }
        const probe = ReactDOM.createRoot(host)
        probe.render(React.createElement(Boundary, null, React.createElement(ConfirmDialogProvider, null, React.createElement(Consumer))))
        await new Promise(resolve => setTimeout(resolve, 150))
        const result = { failure, mounted: host.textContent === 'context-ok' }
        probe.unmount(); host.remove()
        return result
      })()`)
      console.log('HMR context probe:', JSON.stringify(sharedContext))
      assert.deepEqual(sharedContext, { failure: null, mounted: true }, 'Confirmation context survives different HMR module versions')
    }
    await wait(`document.querySelector('.main-view').dataset.transition === 'idle'`)
    win.webContents.send('app:navigate', 'software')
    await wait(`document.querySelector('.main-view').dataset.transition === 'exit'`)
    assert.equal(await evaluate(`document.querySelector('.main-view').dataset.view`), 'dashboard', 'Outgoing view stays mounted for fade-out')
    assert(await evaluate(`Boolean(document.querySelector('.view-transition-status[role="status"]'))`), 'Switching indicator is visible')
    await wait(`document.querySelector('.main-view').dataset.transition === 'loading'`)
    await wait(`document.querySelector('.main-view').dataset.view === 'software' && document.querySelector('.main-view').dataset.transition === 'enter'`)
    assert(await evaluate(`(() => {
      const blocks = [...document.querySelector('.page-scene').firstElementChild.children]
      return blocks.some(block => block.getAnimations().some(animation => animation.effect.getKeyframes().some(frame => frame.transform === 'translateY(36px)'))) && blocks.some(block => parseFloat(getComputedStyle(block).animationDelay) > 0)
    })()`), 'Page blocks slide upward with staggered delays')
    await wait(`document.querySelector('.main-view').dataset.transition === 'idle'`)
    win.webContents.send('app:navigate', 'workspaces')
    await wait(`document.querySelector('.main-view').dataset.transition === 'exit'`)
    win.webContents.send('app:navigate', 'automation')
    win.webContents.send('app:navigate', 'dashboard')
    await wait(`document.querySelector('.main-view').dataset.view === 'dashboard' && document.querySelector('.main-view').dataset.transition === 'idle'`)
    assert.equal(await evaluate(`document.querySelectorAll('.page-scene').length`), 1, 'Rapid changes retain only the final page')
    assert.equal(await evaluate(`document.querySelectorAll('.nav-group').length`), 2)
    await click('.nav-group:nth-child(2) .nav-group-trigger')
    assert(await evaluate(`document.querySelector('#nav-group-work').hidden && !document.querySelector('#nav-group-system').hidden`))
    win.webContents.send('app:navigate', 'software')
    await wait(`document.querySelector('[aria-current="page"]')?.textContent.includes('软件库')`)
    assert(await evaluate(`!document.querySelector('#nav-group-work').hidden`), 'External navigation expands its group')
    await click('.sidebar-collapse')
    assert(await evaluate(`document.querySelector('.sidebar--collapsed') && getComputedStyle(document.querySelector('.nav-group-items')).display === 'none'`))
    await click('.nav-group-trigger')
    assert(await evaluate(`document.querySelector('.sidebar--collapsed') && !document.querySelector('#nav-group-work').hidden && getComputedStyle(document.querySelector('#nav-group-work')).display !== 'none'`), 'Rail opens selectable children without expanding the sidebar')
    assert(await evaluate(`(() => { const r=document.querySelector('#nav-group-work').getBoundingClientRect(); return r.left >= document.querySelector('.sidebar').getBoundingClientRect().right && r.right <= innerWidth && r.bottom <= innerHeight })()`), 'Rail flyout stays beside the rail and inside the viewport')
    await screenshot('rail-flyout')
    await click('#nav-group-work .nav-item[aria-label="空间管理"]')
    assert(await evaluate(`document.querySelector('.sidebar--collapsed') && document.querySelector('#nav-group-work').hidden && document.querySelector('[aria-current="page"]').textContent.includes('空间管理')`), 'Selecting a rail child navigates and preserves the rail')
    await click('.nav-group:nth-child(2) .nav-group-trigger')
    await evaluate(`document.querySelector('#nav-group-system .nav-item').focus(); document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))`)
    await wait(`document.querySelector('#nav-group-system').hidden`)
    assert(await evaluate(`document.activeElement.matches('.nav-group:nth-child(2) .nav-group-trigger')`), 'Escape closes the flyout and restores trigger focus')
    await click('.nav-group-trigger')
    await evaluate(`document.querySelector('.main-view').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}))`)
    await click('.main-view')
    assert(await evaluate(`document.querySelector('#nav-group-work').hidden && document.querySelector('.sidebar--collapsed')`), 'Outside click dismisses the flyout')
    await evaluate(`document.querySelector('.nav-group-trigger').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true}))`)
    await wait(`document.activeElement.matches('#nav-group-work button')`)
    await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))`)
    await click('.sidebar-collapse')
    await click('.nav-item[aria-label="桌宠工作台"]')
    await wait(`Boolean(document.querySelector('#pet-tab-companion'))`)
    assert.equal(await evaluate(`document.querySelectorAll('.pet-center-tabs [role="tab"]').length`), 5)
    await noOverflow()
    console.log('Checking companion layout')
    assert(await evaluate(`(() => { const a=document.querySelector('.pet-stage-card').getBoundingClientRect(); const b=document.querySelector('.pet-chat-card').getBoundingClientRect(); return b.x > a.right && b.width > a.width })()`), 'Desktop uses preview and larger chat columns')
    await click('.pet-state-picker summary')
    assert(await evaluate(`document.querySelector('.pet-state-picker').open`))
    await click('.pet-state-picker summary')
    await screenshot('desktop-light')

    await evaluate(`document.querySelector('#pet-tab-models').click()`)
    await wait(`document.querySelector('#pet-panel-companion')?.getAttribute('aria-busy') === 'true'`)
    await wait(`Boolean(document.querySelector('#pet-panel-models'))`)
    assert(await evaluate(`(() => {
      const blocks = [...document.querySelector('#pet-panel-models').querySelectorAll('.pet-inner-switch, .pet-import-card, .pet-model-library')]
      return blocks.some(block => /component-rise|component-slide-left/.test(getComputedStyle(block).animationName))
    })()`), 'Pet tab cards use component entrance motion')
    await wait(`document.querySelector('#pet-panel-models').getAttribute('aria-busy') === 'false'`)
    await click('.pet-inner-switch button:nth-child(2)')
    assert(await evaluate(`document.querySelector('.pet-library-layout').hidden && !document.querySelector('.pet-interaction-console').hidden`))
    await screenshot('models-interaction')
    await click('.pet-inner-switch button:first-child')
    await noOverflow()
    await screenshot('models-library')

    await click('#pet-tab-settings')
    await click('.pet-settings-nav button:nth-child(2)')
    await evaluate(`document.querySelector('[name="petName"]').value = 'Unsaved local draft'`)
    await click('.pet-settings-nav button:nth-child(3)')
    assert(await evaluate(`document.querySelector('.pet-ai-settings').hidden && !document.querySelector('.pet-vision-card').hidden`))
    await click('.pet-settings-nav button:nth-child(2)')
    assert.equal(await evaluate(`document.querySelector('[name="petName"]').value`), 'Unsaved local draft')
    await screenshot('settings-ai')

    await evaluate(`window.api.ai.createMemory({type:'preference', content:'Local layout test memory', confidence:1}, 'builtin-launchbot')`)
    await click('#pet-tab-memory')
    await wait(`Boolean(document.querySelector('.pet-memory-card'))`)
    await evaluate(`document.querySelector('.pet-memory-card__foot button:not(.confirm):not(.danger)').focus()`)
    await click('.pet-memory-card__foot button:not(.confirm):not(.danger)')
    assert(await evaluate(`document.querySelector('.pet-memory-drawer').matches(':modal')`), 'Memory editor opens as a focus-trapping dialog')
    await screenshot('memory-editor')
    await click('.pet-memory-drawer header button')
    await wait(`!document.querySelector('.pet-memory-drawer')`)
    assert(await evaluate(`document.activeElement.matches('.pet-memory-card__foot button:not(.confirm):not(.danger)')`), 'Closing memory editor restores keyboard focus')
    await noOverflow()
    const studyDao = require('../electron/db/index.cjs').petStudyDao
    for (let i = 0; i < 60; i++) studyDao.add({ language: 'en', term: `Layout vocabulary ${i}`, meaning: 'Local pagination fixture', source: 'user' }, 'builtin-launchbot')
    await click('#pet-tab-study')
    await wait(`Boolean(document.querySelector('.pet-study-layout'))`)
    await noOverflow()
    await wait(`document.querySelectorAll('.pet-study-table tbody tr').length === 25`)
    assert(await evaluate(`Boolean(document.querySelector('.pet-study-library .pet-study-table-region > .pet-study-pagination'))`), 'Study footer belongs to the vocabulary table')
    assert.equal(await evaluate(`[...document.querySelector('.pet-study-workspace').querySelectorAll('*')].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2).length`), 1, 'Study has exactly one vertical scroll owner')
    await evaluate(`(() => { const scroll=document.querySelector('.pet-study-scroll'); const table=document.querySelector('.pet-study-table-region'); scroll.scrollTop += table.getBoundingClientRect().top-scroll.getBoundingClientRect().top+300 })()`)
    await wait(`!document.querySelector('.pet-study-back-top').disabled`)
    const studyFooterBefore = await evaluate(`document.querySelector('.pet-study-pagination').getBoundingClientRect().bottom`)
    await evaluate(`document.querySelector('.pet-study-scroll').scrollTop += 400`)
    assert.equal(await evaluate(`document.querySelector('.pet-study-pagination').getBoundingClientRect().bottom`), studyFooterBefore, 'Footer sticks while the single page scrollbar moves through table rows')
    assert(await evaluate(`(() => { const footer=document.querySelector('.pet-study-pagination').getBoundingClientRect(); const table=document.querySelector('.pet-study-table-region').getBoundingClientRect(); const scroll=document.querySelector('.pet-study-scroll').getBoundingClientRect(); return footer.top >= table.top && footer.bottom <= scroll.bottom + 1 })()`), 'Sticky footer stays inside its table and visible scroll area')
    await screenshot('study-fixed-footer')
    await click('.pet-study-back-top')
    await wait(`Math.abs(document.querySelector('.pet-study-table-region').getBoundingClientRect().top-document.querySelector('.pet-study-scroll').getBoundingClientRect().top) < 2`)
    assert(await evaluate(`document.querySelector('.pet-study-scroll').scrollTop > 100`), 'Returning to the first row does not jump to the settings above')
    await click('.pet-study-pagination button[aria-label="下一页"]')
    await wait(`document.querySelector('.pet-study-page-controls').textContent.includes('2 / 3')`)
    await evaluate(`document.querySelector('.pet-study-scroll').scrollTop += 500`)
    await wait(`!document.querySelector('.pet-study-back-top').disabled`)
    await click('.pet-study-back-top')
    await wait(`Math.abs(document.querySelector('.pet-study-table-region').getBoundingClientRect().top-document.querySelector('.pet-study-scroll').getBoundingClientRect().top) < 2`)
    assert(await evaluate(`document.querySelector('.pet-study-page-controls').textContent.includes('2 / 3')`), 'Back-to-top preserves the current table page')
    await screenshot('study')
    await evaluate(`document.querySelector('#pet-tab-study').dispatchEvent(new KeyboardEvent('keydown', {key:'End', bubbles:true}))`)
    await wait(`document.querySelector('#pet-tab-settings').getAttribute('aria-selected') === 'true'`)
    await evaluate(`document.querySelector('#pet-tab-settings').dispatchEvent(new KeyboardEvent('keydown', {key:'Home', bubbles:true}))`)
    await wait(`document.querySelector('#pet-tab-companion').getAttribute('aria-selected') === 'true'`)

    await click('.theme-toggle')
    await screenshot('desktop-dark')
    win.setSize(640, 800)
    await wait(`innerWidth < 760`)
    await new Promise((resolve) => setTimeout(resolve, 350))
    await noOverflow()
    assert(await evaluate(`(() => { const r = document.querySelector('.pet-chat-compose').getBoundingClientRect(); return r.height > 0 && r.bottom <= innerHeight })()`), 'Narrow layout keeps the composer in view')
    await screenshot('narrow-dark')
    await click('.mobile-menu-btn')
    assert(await evaluate(`Boolean(document.querySelector('.sidebar.mobile-open'))`))
    await click('.nav-item[aria-label="桌宠工作台"]')
    assert(await evaluate(`!document.querySelector('.sidebar.mobile-open')`))
    for (const tab of ['study', 'memory', 'models', 'settings']) {
      await click(`#pet-tab-${tab}`)
      await noOverflow()
    }
    for (const [width, height] of [[480,860], [640,500], [1024,600], [900,860], [1280,860], [1800,960]]) {
      win.setSize(width, height)
      await new Promise((resolve) => setTimeout(resolve, 350))
      await click('#pet-tab-companion')
      await noOverflow()
      if (width === 640) await screenshot('short-window')
      assert(await evaluate(`document.querySelector('.pet-chat-messages').clientHeight > 40`), `Chat retains room for messages at ${width}x${height}`)
      assert(await evaluate(`document.querySelector('.pet-chat-compose').getBoundingClientRect().bottom <= document.querySelector('.pet-chat-card').getBoundingClientRect().bottom + 1`), 'Composer fits inside the chat card')
    }
    await click('#pet-tab-settings')
    for (const language of ['en-US', 'ja-JP', 'zh-CN']) {
      await evaluate(`document.querySelector('.language-select-trigger').click()`)
      await click(`.language-option:nth-child(${['zh-CN', 'en-US', 'ja-JP'].indexOf(language) + 1})`)
      await noOverflow()
      assert(await evaluate(`!document.querySelector('.pet-center-page').textContent.includes('petCenter.capabilitiesSection')`))
    }
    win.webContents.send('app:navigate', 'settings')
    await wait(`document.querySelector('.main-view').dataset.view === 'settings' && document.querySelector('.main-view').dataset.transition === 'idle'`)
    const motionToggle = 'input[aria-label="界面动效"]'
    assert(await evaluate(`document.querySelector('input[aria-label="界面动效"]').checked`), 'Interface animations default to enabled')
    await click(motionToggle)
    assert.equal(await evaluate(`localStorage.getItem('lp-animations-enabled')`), 'false')
    win.webContents.send('app:navigate', 'workspaces')
    await wait(`document.querySelector('.main-view').dataset.view === 'workspaces'`)
    assert.equal(await evaluate(`document.querySelector('.main-view').dataset.transition`), 'idle', 'Disabled motion skips switch delays')
    assert(await evaluate(`[...document.querySelector('.page-scene').firstElementChild.children].every(block => getComputedStyle(block).animationName === 'none')`), 'Disabled motion removes component entrance animations')
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload() })
    await wait(`Boolean(document.querySelector('.layout--motion-off'))`)
    win.webContents.send('app:navigate', 'settings')
    await wait(`Boolean(document.querySelector('input[aria-label="界面动效"]'))`)
    assert.equal(await evaluate(`document.querySelector('input[aria-label="界面动效"]').checked`), false, 'Motion preference survives reload')
    await click(motionToggle)
    assert(await evaluate(`!document.querySelector('.layout--motion-off')`))
    win.webContents.send('app:navigate', 'pet-center')
    await wait(`document.querySelector('.main-view').dataset.transition === 'exit'`)
    await wait(`Boolean(document.querySelector('#pet-tab-companion')) && document.querySelector('.main-view').dataset.transition === 'idle'`)
    await win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    assert(await evaluate(`getComputedStyle(document.querySelector('.pet-center-tabs__indicator')).transitionDuration === '0s'`))
    win.webContents.send('app:navigate', 'dashboard')
    await wait(`document.querySelector('.main-view').dataset.view === 'dashboard'`)
    assert.equal(await evaluate(`document.querySelector('.main-view').dataset.transition`), 'idle', 'Reduced motion switches without transition delays')
    win.webContents.debugger.detach()
    assert.deepEqual(errors, [], 'Renderer has no console errors')
    console.log('PASS: page fade/loading/entry, rapid navigation, grouped navigation, rail, external navigation, five tabs, keyboard switching, model sections, unsaved settings, themes, narrow layouts, persistent animation toggle, fixed study pagination, back-to-top and reduced motion')
    console.log('Local screenshots:', process.env.LAUNCHPAD_LAYOUT_SCREENSHOTS || path.join(testRoot, 'screenshots'))
  } finally {
    win.destroy()
    require('../electron/db/index.cjs').closeDb()
  }
}).then(() => app.exit(0)).catch((error) => { console.error(error); app.exit(1) })
