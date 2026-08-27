function withCapabilities(model) {
  return {
    ...model,
    capabilities: {
      animations: Object.keys(model.render?.animations || {}),
      intents: Object.keys(model.semantics?.bindings || {}),
      lookDirections: model.capabilities?.lookDirections || []
    }
  }
}

function toAssetUrl(modelId, relativePath, generation = 1) {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
  return `pet-asset://${encodeURIComponent(modelId)}/${encodedPath}?v=${generation}`
}

function prepareRuntimeModel(model, generation = 1) {
  const animations = {}
  for (const [id, clip] of Object.entries(model.render?.animations || {})) {
    const source = clip.source?.type === 'sequence'
      ? { ...clip.source, frames: clip.source.frames.map((relativePath) => toAssetUrl(model.id, relativePath, generation)) }
      : clip.source?.type === 'atlas'
        ? { ...clip.source, asset: toAssetUrl(model.id, clip.source.asset, generation) }
        : clip.source
    animations[id] = { ...clip, source }
  }
  const { directory, assets, ...safeModel } = withCapabilities(model)
  return { ...safeModel, generation, render: { ...model.render, animations } }
}

module.exports = { withCapabilities, prepareRuntimeModel, toAssetUrl }
