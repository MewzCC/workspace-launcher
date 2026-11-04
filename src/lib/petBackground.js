let databasePromise

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('launchpad-pet-appearance', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('backgrounds', { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => { databasePromise = null; reject(request.error) }
    })
  }
  return databasePromise
}

async function backgroundTransaction(mode, action) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('backgrounds', mode)
    const request = action(transaction.objectStore('backgrounds'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error || new Error('Background storage aborted'))
  })
}

export const readPetBackground = (id) => backgroundTransaction('readonly', (store) => store.get(id))
export const writePetBackground = (record) => backgroundTransaction('readwrite', (store) => store.put(record))
