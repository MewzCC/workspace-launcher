const fs = require('fs')
const path = require('path')
const { protocol, net } = require('electron')
const { pathToFileURL } = require('url')

const SCHEME = 'pet-asset'
const modelAssets = new Map()
let installed = false

function registerPrivileges() {
  protocol.registerSchemesAsPrivileged([{
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true }
  }])
}

function registerModel(model) {
  const declared = new Map()
  for (const asset of model?.assets || []) declared.set(String(asset.relativePath).replace(/\\/g, '/'), path.resolve(asset.filePath))
  modelAssets.set(model.id, { directory: path.resolve(model.directory), declared })
}

function clearModels() { modelAssets.clear() }

function resolveRequest(rawUrl) {
  const url = new URL(rawUrl)
  const modelId = decodeURIComponent(url.hostname)
  const relativePath = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/')
  const item = modelAssets.get(modelId)
  if (!item) throw new Error('未知桌宠模型')
  const filePath = item.declared.get(relativePath)
  if (!filePath) throw new Error('资源未在模型清单中声明')
  const root = item.directory
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error('资源路径超出模型目录')
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error('资源不存在')
  return filePath
}

function install() {
  if (installed) return
  protocol.handle(SCHEME, (request) => {
    try { return net.fetch(pathToFileURL(resolveRequest(request.url)).toString()) } catch (error) {
      return new Response(error.message, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  })
  installed = true
}

module.exports = { SCHEME, registerPrivileges, registerModel, clearModels, resolveRequest, install }
