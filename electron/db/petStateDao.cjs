const { getDb } = require('./database.cjs')
const DEFAULTS = { energy: 0.8, boredom: 0.2, affection: 0, moodValence: 0, moodArousal: 0.2, lastInteractionAt: null, lastSleepAt: null, lastWakeAt: null }
function clamp(value, min, max, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback }

function get(petId) {
  const row = getDb().prepare('SELECT * FROM pet_runtime_state WHERE pet_id = ?').get(String(petId))
  if (!row) return { ...DEFAULTS }
  return { energy: row.energy, boredom: row.boredom, affection: row.affection, moodValence: row.mood_valence, moodArousal: row.mood_arousal, lastInteractionAt: row.last_interaction_at, lastSleepAt: row.last_sleep_at, lastWakeAt: row.last_wake_at }
}

function save(petId, state = {}) {
  const value = { energy: clamp(state.energy, 0, 1, DEFAULTS.energy), boredom: clamp(state.boredom, 0, 1, DEFAULTS.boredom), affection: clamp(state.affection, 0, 100, DEFAULTS.affection), moodValence: clamp(state.moodValence, -1, 1, DEFAULTS.moodValence), moodArousal: clamp(state.moodArousal, 0, 1, DEFAULTS.moodArousal), lastInteractionAt: Number(state.lastInteractionAt) || null, lastSleepAt: Number(state.lastSleepAt) || null, lastWakeAt: Number(state.lastWakeAt) || null }
  getDb().prepare(`INSERT INTO pet_runtime_state (pet_id, energy, boredom, affection, mood_valence, mood_arousal, last_interaction_at, last_sleep_at, last_wake_at, updated_at) VALUES (@petId, @energy, @boredom, @affection, @moodValence, @moodArousal, @lastInteractionAt, @lastSleepAt, @lastWakeAt, @updatedAt) ON CONFLICT(pet_id) DO UPDATE SET energy = excluded.energy, boredom = excluded.boredom, affection = excluded.affection, mood_valence = excluded.mood_valence, mood_arousal = excluded.mood_arousal, last_interaction_at = excluded.last_interaction_at, last_sleep_at = excluded.last_sleep_at, last_wake_at = excluded.last_wake_at, updated_at = excluded.updated_at`).run({ petId: String(petId), ...value, updatedAt: Date.now() })
  return value
}

module.exports = { get, save, DEFAULTS }
