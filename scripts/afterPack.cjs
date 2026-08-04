const { execFile } = require('child_process')
const fs = require('fs/promises')
const path = require('path')
const { promisify } = require('util')
const { getSignVendorPath } = require('app-builder-lib/out/codeSign/windowsCodeSign')

const execFileAsync = promisify(execFile)

async function findCachedRcedit() {
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder',
    'Cache',
    'winCodeSign'
  )
  try {
    const entries = await fs.readdir(cacheRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(cacheRoot, entry.name, 'rcedit-x64.exe')
      try {
        await fs.access(candidate)
        return candidate
      } catch (_) {
        // Keep looking; cache directory names vary by electron-builder version.
      }
    }
  } catch (_) {
    // electron-builder will download the tool through the normal fallback.
  }
  const vendorPath = await getSignVendorPath()
  return path.join(vendorPath, 'rcedit-x64.exe')
}

/**
 * electron-builder's app-builder rcedit wrapper can stall on some Windows
 * machines. Invoke the bundled native rcedit directly so Explorer, taskbar
 * shortcuts and the unpacked executable consistently receive the app icon.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const rceditPath = await findCachedRcedit()
  const executablePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  )
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')
  const appInfo = context.packager.appInfo

  await execFileAsync(rceditPath, [
    executablePath,
    '--set-version-string', 'FileDescription', appInfo.productName,
    '--set-version-string', 'ProductName', appInfo.productName,
    '--set-version-string', 'InternalName', appInfo.productFilename,
    '--set-version-string', 'OriginalFilename', `${appInfo.productFilename}.exe`,
    '--set-file-version', appInfo.version,
    '--set-product-version', appInfo.version,
    '--set-icon', iconPath
  ], {
    windowsHide: true,
    timeout: 120000
  })
}
