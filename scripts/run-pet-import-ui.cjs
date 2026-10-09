const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawnSync } = require('child_process')
const root = path.resolve(__dirname, '..')
const outfile = path.join(root, 'out/main/verify-pet-import.cjs')
require('esbuild').buildSync({ entryPoints: [path.join(__dirname, 'verify-pet-import.cjs')], outfile, bundle: true, platform: 'node', packages: 'external', format: 'cjs' })
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-import-test-'))
const result = spawnSync(require('electron'), [outfile, '--ui'], { stdio: 'inherit', env: { ...process.env, LAUNCHPAD_TEST_REPO: root, LAUNCHPAD_TEST_ROOT: testRoot } })
// Chromium cache handles are closed after Electron exits. Delete only our own
// freshly-created temporary root, after verifying it is directly under temp.
if (path.dirname(path.resolve(testRoot)).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() || !path.basename(testRoot).startsWith('launchpad-import-test-')) throw new Error('Invalid test cleanup root')
fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
if (result.error) throw result.error
process.exit(result.status ?? 1)
