// Review states of a revision comparison (pending / reviewed / affects site),
// kept in this browser's IndexedDB under hash(A) + hash(B) + GlobalId — so the
// same pair of files dropped again tomorrow opens with the work already done.
// Nothing here leaves the device.
import type { ReviewState } from '../../lib/compare/revision-view'

const DB = 'ifc-revision-review'
const STORE = 'states'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Every state saved for one pair of revisions: GlobalId → state. */
export async function loadReviews(prefix: string): Promise<Map<string, ReviewState>> {
  const out = new Map<string, ReviewState>()
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`))
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return
        out.set(String(cur.key).slice(prefix.length), cur.value as ReviewState)
        cur.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* private mode / blocked storage: states live for this session only */ }
  return out
}

export async function saveReview(key: string, state: ReviewState): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      if (state === 'pending') tx.objectStore(STORE).delete(key)
      else tx.objectStore(STORE).put(state, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* see loadReviews */ }
}
