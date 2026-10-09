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
      const {app,BrowserWindow}=require('electron');const assert=require('assert');const path=require('path');const fs=require('fs');
      process.env.PORTABLE_EXECUTABLE_DIR=__dirname;
      app.setPath('appData',path.join(__dirname,'appData'));
      app.setPath('userData',path.join(__dirname,'userData'));
      const imports=require(${JSON.stringify(path.resolve(__dirname, '../electron/services/petImportService.cjs'))});
      const models=require(${JSON.stringify(path.resolve(__dirname, '../electron/services/petModelService.cjs'))});
      app.whenReady().then(async()=>{
        const fixture=${JSON.stringify(fixture.root)};
        assert.throws(()=>imports.prepare([fixture],1,{engine:'sprite'}));
        const preview=imports.prepare([fixture],1);
        assert.strictEqual(preview.model.render.engine,'live2d');
        const url=preview.model.live2d.entryUrl;
        const win=new BrowserWindow({show:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
        await win.loadFile(path.join(__dirname,'index.html'));
        for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript('Boolean(window.verify)'))break;await new Promise(r=>setTimeout(r,50));}
        const result=await win.webContents.executeJavaScript('window.verify('+JSON.stringify(url)+').catch(e=>{throw new Error(e.stack)})');
        assert(result.visible>1000,'Model actually renders visible pixels');assert(result.transparent>1000,'Canvas has transparent background');assert.strictEqual(result.canvases,0);assert(result.texturesDestroyed);
        fs.writeFileSync(${JSON.stringify(path.resolve(__dirname, '../output/live2d-runtime-preview.png'))},Buffer.from(result.thumbnail.split(',')[1],'base64'));
        const chosen=preview.model.live2d.actions.find(a=>a.type==='motion'&&a.group==='TapBody');
        const saved=imports.commit(preview.token,{displayName:'Haru test',mappings:{...preview.model.live2d.mappings,wave:chosen.id},thumbnail:result.thumbnail},1);
        const installed=models.getRuntimeModel(saved.id);
        assert.strictEqual(installed.live2d.mappings.wave,chosen.id);assert(installed.thumbnailDataUrl.startsWith('data:image/png'));
        assert.strictEqual(await win.webContents.executeJavaScript('fetch('+JSON.stringify(url)+').then(r=>r.status)'),404);
        const second=await win.webContents.executeJavaScript('window.verify('+JSON.stringify(installed.live2d.entryUrl)+')');assert(second.visible>1000);assert(second.texturesDestroyed);
        const wrong=new URL(installed.live2d.entryUrl);wrong.pathname='/pet.json';assert.strictEqual(await win.webContents.executeJavaScript('fetch('+JSON.stringify(wrong.href)+').then(r=>r.status)'),404);
        const zip=new (require(${JSON.stringify(require.resolve('adm-zip'))}))();zip.addLocalFolder(fixture,'Haru');const zipPath=path.join(__dirname,'model.zip');zip.writeZip(zipPath);
        const zipped=imports.prepare([zipPath],1,{engine:'live2d'});assert.strictEqual(zipped.model.render.engine,'live2d');imports.cleanup(zipped.token,1);
        const multiple=path.join(__dirname,'multiple');fs.cpSync(fixture,path.join(multiple,'one'),{recursive:true});fs.cpSync(fixture,path.join(multiple,'two'),{recursive:true});
        const choices=imports.prepare([multiple],1);assert.strictEqual(choices.candidates.length,2);assert(choices.selectionRequired);
        const selected=imports.prepare([multiple],1,{engine:'live2d',entry:choices.candidates[1]});assert(selected.token);imports.cleanup(selected.token,1);
        const bad=path.join(multiple,'one','Haru.model3.json');const raw=JSON.parse(fs.readFileSync(bad));raw.FileReferences.Moc='../two/Haru.moc3';fs.writeFileSync(bad,JSON.stringify(raw));assert.throws(()=>imports.prepare([bad],1),/资源路径无效/);
        imports.dispose();require(${JSON.stringify(path.resolve(__dirname, '../electron/db/index.cjs'))}).closeDb();
        console.log('Live2D import, ZIP, explicit engine, model selection, resource isolation, install, real rendering, motions, expression, transparency and GPU disposal passed');win.destroy();app.quit();
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



