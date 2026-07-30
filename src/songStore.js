const DB_NAME = 'songdemo_audio_v1'
const STORE_NAME = 'songs'
const COVER_STORE_NAME = 'covers'
const INSTRUMENTAL_STORE_NAME = 'instrumentals'

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
      if (!request.result.objectStoreNames.contains(COVER_STORE_NAME)) {
        request.result.createObjectStore(COVER_STORE_NAME)
      }
      if (!request.result.objectStoreNames.contains(INSTRUMENTAL_STORE_NAME)) {
        request.result.createObjectStore(INSTRUMENTAL_STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('无法打开本地歌曲存储'))
  })
}

async function runTransaction(storeName, mode, action) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      const request = action(transaction.objectStore(storeName))
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(new Error('本地歌曲存储操作失败'))
    })
  } finally {
    db.close()
  }
}

export function saveSongAudio(demoId, record) {
  return runTransaction(STORE_NAME, 'readwrite', store => store.put(record, demoId))
}

export function loadSongAudio(demoId) {
  return runTransaction(STORE_NAME, 'readonly', store => store.get(demoId))
}

export function saveCoverImage(demoId, record) {
  return runTransaction(COVER_STORE_NAME, 'readwrite', store => store.put(record, demoId))
}

export function loadCoverImage(demoId) {
  return runTransaction(COVER_STORE_NAME, 'readonly', store => store.get(demoId))
}

export function saveInstrumentalAudio(demoId, record) {
  return runTransaction(INSTRUMENTAL_STORE_NAME, 'readwrite', store => store.put(record, demoId))
}

export function loadInstrumentalAudio(demoId) {
  return runTransaction(INSTRUMENTAL_STORE_NAME, 'readonly', store => store.get(demoId))
}
