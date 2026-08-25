const GAP = 6

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function calculateBubbleBounds(pet, bubble, workArea) {
  const width = bubble.width
  const height = bubble.height
  const right = workArea.x + workArea.width
  const bottom = workArea.y + workArea.height
  const petCenterX = pet.x + pet.width / 2
  const petCenterY = pet.y + pet.height / 2
  const definitions = [
    { placement: 'top', x: petCenterX - width / 2, y: pet.y - height - GAP, fits: pet.y - height - GAP >= workArea.y, axis: 'x' },
    { placement: 'bottom', x: petCenterX - width / 2, y: pet.y + pet.height + GAP, fits: pet.y + pet.height + GAP + height <= bottom, axis: 'x' },
    { placement: 'left', x: pet.x - width - GAP, y: petCenterY - height / 2, fits: pet.x - width - GAP >= workArea.x, axis: 'y' },
    { placement: 'right', x: pet.x + pet.width + GAP, y: petCenterY - height / 2, fits: pet.x + pet.width + GAP + width <= right, axis: 'y' }
  ]

  const candidates = definitions.map((candidate, priority) => {
    const x = clamp(Math.round(candidate.x), workArea.x, right - width)
    const y = clamp(Math.round(candidate.y), workArea.y, bottom - height)
    const center = candidate.axis === 'x' ? x + width / 2 : y + height / 2
    const petCenter = candidate.axis === 'x' ? petCenterX : petCenterY
    return { ...candidate, x, y, priority, alignmentError: Math.abs(center - petCenter) }
  })
  const fitting = candidates.filter((candidate) => candidate.fits)
  const pool = fitting.length ? fitting : candidates
  pool.sort((a, b) => a.alignmentError - b.alignmentError || a.priority - b.priority)
  const best = pool[0]
  return { x: best.x, y: best.y, width, height, placement: best.placement }
}

module.exports = { calculateBubbleBounds }
