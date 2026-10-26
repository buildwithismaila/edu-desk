// Offline storage on the device (docs/features/10c-offline-attendance.md): a tiny key-value layer over
// IndexedDB, with an in-memory version for tests and browsers without IndexedDB. Keys are prefixed with a scope
// (school host + user id), so each school's and user's data stays apart; clear() wipes everything (logout).

export interface OfflineStorage {
  get: <T>(key: string) => Promise<T | null>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
  keys: (prefix: string) => Promise<string[]>
  clear: () => Promise<void>
}

/** A plain copy (also of Vue's reactive proxies, which structuredClone and IndexedDB refuse); values are JSON. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export function memoryStorage(): OfflineStorage {
  const items = new Map<string, unknown>()
  return {
    get: async <T>(key: string) => (items.has(key) ? plain(items.get(key)) as T : null),
    set: async (key, value) => {
      items.set(key, plain(value))
    },
    delete: async (key) => {
      items.delete(key)
    },
    keys: async prefix => [...items.keys()].filter(k => k.startsWith(prefix)),
    clear: async () => {
      items.clear()
    },
  }
}

const DB_NAME = 'edu-desk-offline'
const STORE = 'kv'

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function indexedDbStorage(factory: IDBFactory = indexedDB): OfflineStorage {
  let opened: Promise<IDBDatabase> | undefined
  const open = () => (opened ??= new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE)
  return {
    get: async <T>(key: string) => ((await request((await store('readonly')).get(key))) ?? null) as T | null,
    set: async (key, value) => {
      await request((await store('readwrite')).put(plain(value), key))
    },
    delete: async (key) => {
      await request((await store('readwrite')).delete(key))
    },
    keys: async prefix => ((await request((await store('readonly')).getAllKeys())) as string[]).filter(k => k.startsWith(prefix)),
    clear: async () => {
      await request((await store('readwrite')).clear())
    },
  }
}

let shared: OfflineStorage | undefined

/** The device's offline storage: IndexedDB in the browser, memory where it isn't available (tests, SSR). */
export function offlineStorage(): OfflineStorage {
  return (shared ??= typeof indexedDB === 'undefined' ? memoryStorage() : indexedDbStorage())
}
