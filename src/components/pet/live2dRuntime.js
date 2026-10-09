let runtimePromise

function loadCore() {
  if (window.Live2DCubismCore) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // Relative to index.html, works in electron-vite dev and packaged file://.
    script.src = new URL('live2d/live2dcubismcore.min.js', document.baseURI).href
    const timer = setTimeout(() => finish(new Error('Live2D Core 加载超时')), 15000)
    const finish = (error) => {
      clearTimeout(timer)
      script.onload = script.onerror = null
      if (error) { script.remove(); reject(error) } else resolve()
    }
    script.onload = () => finish(window.Live2DCubismCore ? undefined : new Error('Live2D Core 未初始化'))
    script.onerror = () => finish(new Error('Live2D Core 缺失，请检查安装文件'))
    document.head.appendChild(script)
  })
}

export function loadLive2DRuntime() {
  if (!runtimePromise) runtimePromise = loadCore().then(async () => {
    const [PIXI, engine] = await Promise.all([import('pixi.js'), import('untitled-pixi-live2d-engine/cubism')])
    PIXI.extensions.add(engine.Live2DPlugin)
    engine.configureCubismSDK({ memorySizeMB: 32 })
    return { ...engine, Application: PIXI.Application }
  }).catch((error) => { runtimePromise = null; throw error })
  return runtimePromise
}

// Keep GPU ownership local to one renderer. Even a failed load is destroyed.
export async function createLive2DView({ host, url, width, height, idleGroup, onStatus }) {
  const { Application, Live2DModel } = await loadLive2DRuntime()
  const app = new Application()
  let model, initialized = false, destroyed = false
  let cancelLoad
  const destroy = () => {
    if (destroyed) return
    destroyed = true
    cancelLoad?.()
    if (model?.internalModel) model.destroy({ texture: true, baseTexture: true })
    else if (model) {
      // The library's destroy assumes successful initialization.
      model.emit('destroy')
      model.automator?.destroy()
      model.textures?.forEach((texture) => texture.destroy(true))
    }
    if (initialized) app.destroy(true, { children: false })
  }
  try {
    await app.init({ width, height, preference: 'webgl', backgroundAlpha: 0, antialias: true,
      autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), preserveDrawingBuffer: true })
    initialized = true
    app.ticker.maxFPS = 30
    host.appendChild(app.canvas)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live2D 模型加载超时')), 20000)
      const finish = (error) => { clearTimeout(timer); cancelLoad = null; error ? reject(error) : resolve() }
      cancelLoad = () => finish(new Error('Live2D 加载已取消'))
      model = Live2DModel.fromSync(url, { ticker: app.ticker, autoInteract: false, autoFocus: false,
        motionPreload: 'ALL', idleMotionGroup: idleGroup || '__no_idle__',
        onLoad: () => finish(), onError: finish })
    })
    app.stage.addChild(model)
    const resize = (w, h) => {
      app.renderer.resize(w, h)
      model.scale.set(Math.min(w / model.internalModel.originalWidth, h / model.internalModel.originalHeight) * 0.95)
      model.anchor.set(0.5, 1)
      model.position.set(w / 2, h * 0.98)
      app.render()
    }
    resize(width, height)
    let actionVersion = 0
    const play = async (action) => {
      const version = ++actionVersion
      if (!action || destroyed) return
      if (action.type === 'expression') {
        await model.expression(action.name)
      } else {
        await model.motion(action.group, action.index, 3, { sound: '', loop: action.loop === true })
      }
      if (!destroyed && version === actionVersion) onStatus?.(action.id)
    }
    const focus = (x, y) => { if (!destroyed) model.focus(x, y) }
    const thumbnail = () => { app.render(); return app.canvas.toDataURL('image/png') }
    const pause = (paused) => { if (!destroyed) paused ? app.stop() : app.start() }
    return { app, model, resize, play, focus, thumbnail, pause, destroy }
  } catch (error) { destroy(); throw error }
}


