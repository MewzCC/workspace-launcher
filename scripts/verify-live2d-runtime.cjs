const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

async function main() {
  const fixture = require('./fetch-live2d-fixture.cjs')
  await fixture.main()
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-live2d-runtime-'))
  try {
    fs.mkdirSync(path.join(directory, 'live2d'))
    fs.copyFileSync(path.resolve(__dirname, '../public/live2d/live2dcubismcore.min.js'), path.join(directory, 'live2d/live2dcubismcore.min.js'))
    require('esbuild').buildSync({ stdin: { contents: `
      import { createLive2DView } from './src/components/pet/live2dRuntime.js';
      window.verify = async (url) => {
        const host = document.querySelector('#host');
        const view = await createLive2DView({host, url, width: 240, height: 300, idleGroup: 'Idle'});
        await view.play({id:'tap',type:'motion',group:'TapBody',index:0});
        await view.play({id:'expression',type:'expression',name:'F01'});
        const gl = view.app.renderer.gl;
        view.app.render();
        const pixels = new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let visible=0,transparent=0;
        for(let i=3;i<pixels.length;i+=4){if(pixels[i])visible++;else transparent++;}
        const thumbnail=view.thumbnail();
        const textures=view.model.textures;
        view.destroy();
        return {visible,transparent,thumbnail,canvases:host.querySelectorAll('canvas').length,texturesDestroyed:textures.every(t=>t.destroyed)};
      };
    `, resolveDir: path.resolve(__dirname, '..') }, outfile: path.join(directory, 'probe.js'), bundle: true, format: 'esm', platform: 'browser' })
    fs.writeFileSync(path.join(directory, 'index.html'), '<div id="host"></div><script type="module" src="./probe.js"></script>')
    // Electron must resolve its built-in module, not npm's executable helper.
    fs.writeFileSync(path.join(directory, 'test.cjs'), `
      const {app,BrowserWindow}=require('electron');const assert=require('assert');const path=require('path');const fs=require('fs');const {pathToFileURL}=require('url');
      app.setPath('userData',path.join(__dirname,'userData'));
      app.whenReady().then(async()=>{
        const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
        await win.loadFile(path.join(__dirname,'index.html'));
        for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('Boolean(window.verify)'))break;await new Promise(r=>setTimeout(r,50));}
        const result=await win.webContents.executeJavaScript('window.verify('+JSON.stringify(pathToFileURL(${JSON.stringify(path.join(fixture.root, 'Haru.model3.json'))}).href)+').catch(e=>{throw new Error(e.stack)})');
        assert(result.visible>1000,'Model actually renders visible pixels');assert(result.transparent>1000,'Canvas has transparent background');assert.strictEqual(result.canvases,0);assert(result.texturesDestroyed);
        fs.writeFileSync(${JSON.stringify(path.resolve(__dirname, '../output/live2d-runtime-preview.png'))},Buffer.from(result.thumbnail.split(',')[1],'base64'));
        console.log('Live2D real model rendering, motions, expression, transparency and GPU disposal passed');win.destroy();app.quit();
      }).catch(e=>{console.error(e);app.exit(1)});
    `)
    const result = spawnSync(require('electron'), [path.join(directory, 'test.cjs')], { stdio: 'inherit', timeout: 90000 })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Live2D runtime test exited ${result.status}`)
  } finally {
    if (path.dirname(directory).toLowerCase() !== os.tmpdir().toLowerCase() || !path.basename(directory).startsWith('launchpad-live2d-runtime-')) throw new Error('Invalid cleanup root')
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })



