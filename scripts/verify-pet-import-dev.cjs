// Exercise real Vite Fast Refresh against isolated Electron storage. Sending a
// watcher event updates only this test server; no source files are modified.
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

async function main() {
  const { createServer } = await import('vite')
  const { default: react } = await import('@vitejs/plugin-react')
  const repo = path.resolve(__dirname, '..')
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-pet-vite-'))
  const importer = path.join(repo, 'src/components/PetImporter.jsx').replace(/\\/g, '/')
  let revision = 0
  let server
  try {
    server = await createServer({
      configFile: false, root: repo, cacheDir: cache,
      server: { host: '127.0.0.1', port: 0 },
      plugins: [react(), {
        name: 'pet-import-refresh-test',
        transform(code, id) {
          if (id === importer) return `${code}\n// test revision ${revision}\nif (import.meta.hot) import.meta.hot.on('vite:afterUpdate', () => { window.__petImportHmrCount = (window.__petImportHmrCount || 0) + 1 })`
        },
        configureServer(current) {
          current.middlewares.use('/__test_refresh', (_request, response) => {
            revision++
            current.watcher.emit('change', importer)
            response.end('ok')
          })
        }
      }]
    })
    await server.listen()
    const url = `http://127.0.0.1:${server.httpServer.address().port}`
    const child = spawn(process.execPath, [path.join(__dirname, 'run-pet-import-ui.cjs')], {
      stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: url, LAUNCHPAD_TEST_HMR_URL: `${url}/__test_refresh` }
    })
    const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    process.exitCode = status ?? 1
  } finally {
    await server?.close()
    if (path.dirname(cache).toLowerCase() !== os.tmpdir().toLowerCase() || !path.basename(cache).startsWith('launchpad-pet-vite-')) throw new Error('Invalid test cache directory')
    fs.rmSync(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
