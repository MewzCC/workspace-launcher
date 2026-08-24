const assert = require('assert')
const { app } = require('electron')

app.whenReady().then(() => {
  const dbApi = require('../electron/db/index.cjs')
  const dao = dbApi.petStudyDao
  const db = dbApi.getDb()
  const petId = `verify-study-${process.pid}`
  try {
    const created = dao.add({ language: 'en', term: 'Verification', meaning: '验证', source: 'user' }, petId)
    assert(created.itemId > 0)
    assert.strictEqual(dao.stats(petId).total, 1)
    assert.strictEqual(dao.next(petId, 'en', []).term, 'Verification')
    const before = dao.get(created.itemId, petId)
    const reviewed = dao.saveReview(
      { ...before, pet_model_id: petId, item_id: created.itemId },
      { state: 'review', dueAt: Date.now() + 86400000, stability: 2.5, difficulty: 5, scheduledDays: 1 },
      3,
      0
    )
    assert.strictEqual(reviewed.reps, 1)
    assert.strictEqual(reviewed.state, 'review')
    assert.strictEqual(dao.list(petId, 'en', 10).length, 1)
    dao.remove(created.itemId, petId)
    db.prepare('DELETE FROM pet_study_items WHERE id=? AND NOT EXISTS (SELECT 1 FROM pet_study_cards WHERE item_id=?)').run(created.itemId, created.itemId)
    console.log('桌宠学习数据层验证通过 ✓')
  } finally {
    db.prepare('DELETE FROM pet_study_reviews WHERE pet_model_id=?').run(petId)
    db.prepare('DELETE FROM pet_study_cards WHERE pet_model_id=?').run(petId)
    dbApi.closeDb()
    app.quit()
  }
}).catch((error) => { console.error(error); app.exit(1) })
