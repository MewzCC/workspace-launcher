const assert = require('assert')
const { app } = require('electron')

app.whenReady().then(() => {
  const dbApi = require('../electron/db/index.cjs')
  const dao = dbApi.petStudyDao
  const db = dbApi.getDb()
  const petId = `verify-study-${process.pid}`
  const itemIds = []
  try {
    const created = dao.add({ language: 'en', term: `Verification ${process.pid}`, meaning: '验证关键词', exampleTranslation: '这是中文例句翻译', source: 'user' }, petId)
    itemIds.push(created.itemId)
    const wildcard = dao.add({ language: 'en', term: `100%_ready_${process.pid}`, meaning: '通配符字面值', source: 'user' }, petId)
    const paged = dao.add({ language: 'en', term: `Pagination ${process.pid}`, meaning: '分页检查', source: 'user' }, petId)
    const japanese = dao.add({ language: 'ja', term: `検索${process.pid}`, meaning: '日语检索', source: 'user' }, petId)
    itemIds.push(wildcard.itemId, paged.itemId, japanese.itemId)
    assert(created.itemId > 0)
    assert.strictEqual(dao.stats(petId).total, 3)
    assert(dao.next(petId, 'en', []).term.includes(String(process.pid)))
    assert.strictEqual(dao.search(petId, { language: 'en', query: '验证' }).total, 1)
    assert.strictEqual(dao.search(petId, { language: 'en', query: '中文例句' }).items[0].id, created.itemId)
    assert.strictEqual(dao.search(petId, { language: 'ja', query: '検索' }).items[0].id, japanese.itemId)
    assert.strictEqual(dao.search(petId, { language: 'en', query: '%_' }).total, 1)
    const firstPage = dao.search(petId, { language: 'en', limit: 1, offset: 0 })
    const secondPage = dao.search(petId, { language: 'en', limit: 1, offset: 1 })
    assert.strictEqual(firstPage.total, 3)
    assert.strictEqual(firstPage.items.length, 1)
    assert.strictEqual(secondPage.items.length, 1)
    assert.notStrictEqual(firstPage.items[0].id, secondPage.items[0].id)
    const before = dao.get(created.itemId, petId)
    const reviewed = dao.saveReview(
      { ...before, pet_model_id: petId, item_id: created.itemId },
      { state: 'mastered', dueAt: Date.now() + 36500 * 86400000, stability: 2.5, difficulty: 5, scheduledDays: 36500 },
      3,
      0
    )
    assert.strictEqual(reviewed.reps, 1)
    assert.strictEqual(reviewed.state, 'mastered')
    const nextAfterMastered = dao.next(petId, 'en', [wildcard.itemId, paged.itemId])
    assert.notStrictEqual(nextAfterMastered?.itemId, created.itemId, '已掌握词条不应再次进入记忆循环')
    assert.strictEqual(dao.list(petId, 'en', 10).length, 3)
    dao.remove(created.itemId, petId)
    console.log('桌宠学习数据层验证通过 ✓')
  } finally {
    db.prepare('DELETE FROM pet_study_reviews WHERE pet_model_id=?').run(petId)
    db.prepare('DELETE FROM pet_study_cards WHERE pet_model_id=?').run(petId)
    for (const itemId of itemIds) {
      db.prepare('DELETE FROM pet_study_items WHERE id=? AND NOT EXISTS (SELECT 1 FROM pet_study_cards WHERE item_id=?)').run(itemId, itemId)
    }
    dbApi.closeDb()
    app.quit()
  }
}).catch((error) => { console.error(error); app.exit(1) })
