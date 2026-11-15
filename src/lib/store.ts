// Tiny IndexedDB wrapper for saved designs (survives reloads, stays on this device).
export interface SavedDesign {
  id: string
  name: string
  formatId: string
  w: number
  h: number
  json: string
  thumb: string
  updated: number
}

const DB = 'formatter', STORE = 'designs', EVT = 'formatter:designs'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

export async function listDesigns(): Promise<SavedDesign[]> {
  try { return (await tx<SavedDesign[]>('readonly', (s) => s.getAll())).sort((a, b) => b.updated - a.updated) } catch { return [] }
}
export async function getDesign(id: string) { return tx<SavedDesign | undefined>('readonly', (s) => s.get(id)) }
export async function putDesign(d: SavedDesign) { await tx('readwrite', (s) => s.put(d)); window.dispatchEvent(new Event(EVT)) }
export async function deleteDesign(id: string) { await tx('readwrite', (s) => s.delete(id)); window.dispatchEvent(new Event(EVT)) }
export const onDesignsChange = (fn: () => void) => { window.addEventListener(EVT, fn); return () => window.removeEventListener(EVT, fn) }

/** blob: URLs die on reload — inline them as data URLs before saving. */
export async function inlineBlobUrls(json: string): Promise<string> {
  const urls = [...new Set(json.match(/blob:[^"\\]+/g) ?? [])]
  for (const u of urls) {
    try {
      const blob = await (await fetch(u)).blob()
      const data = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.readAsDataURL(blob) })
      json = json.split(u).join(data)
    } catch { /* already revoked */ }
  }
  return json
}
