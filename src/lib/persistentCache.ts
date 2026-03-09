/**
 * Persistent Cache — IndexedDB-backed build cache for warm builds across sessions.
 * 
 * Stores:
 * - Task output cache (keyed by prompt+context hash)
 * - Validated file hashes
 * 
 * Falls back gracefully to in-memory-only if IndexedDB is unavailable.
 */

const DB_NAME = "phoneix-build-cache";
const DB_VERSION = 1;
const STORE_TASKS = "task-outputs";
const STORE_VALIDATIONS = "validated-files";
const MAX_ENTRIES = 200;
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ─── IndexedDB helpers ────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          db.createObjectStore(STORE_TASKS, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(STORE_VALIDATIONS)) {
          db.createObjectStore(STORE_VALIDATIONS, { keyPath: "key" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn("[PersistentCache] IndexedDB unavailable:", request.error);
        reject(request.error);
      };
    } catch (err) {
      console.warn("[PersistentCache] IndexedDB not supported");
      reject(err);
    }
  });

  return dbPromise;
}

async function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbPut(storeName: string, key: string, value: any): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put({ key, value, timestamp: Date.now() });
  } catch {
    // Silent fail — in-memory cache still works
  }
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
  } catch {
    // Silent
  }
}

async function idbClear(storeName: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
  } catch {
    // Silent
  }
}

async function idbEvictOldEntries(storeName: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const all = await new Promise<any[]>((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });

    const now = Date.now();
    const expired = all.filter(entry => now - (entry.timestamp || 0) > TTL_MS);
    for (const entry of expired) {
      store.delete(entry.key);
    }

    // If still over limit, remove oldest
    const remaining = all.length - expired.length;
    if (remaining > MAX_ENTRIES) {
      const sorted = all
        .filter(e => !expired.includes(e))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const toRemove = sorted.slice(0, remaining - MAX_ENTRIES);
      for (const entry of toRemove) {
        store.delete(entry.key);
      }
    }
  } catch {
    // Silent
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export interface PersistedTaskOutput {
  files: Record<string, string>;
  deps: Record<string, string>;
  chatText: string;
}

/**
 * Get a cached task output from IndexedDB.
 */
export async function getPersistedTaskOutput(key: string): Promise<PersistedTaskOutput | null> {
  const entry = await idbGet<{ data: PersistedTaskOutput; timestamp: number }>(STORE_TASKS, key);
  if (!entry) return null;
  if (Date.now() - (entry as any).timestamp > TTL_MS) {
    await idbDelete(STORE_TASKS, key);
    return null;
  }
  // entry is actually the value directly since we stored { key, value, timestamp }
  return entry as unknown as PersistedTaskOutput;
}

/**
 * Persist a task output to IndexedDB.
 */
export async function persistTaskOutput(key: string, output: PersistedTaskOutput): Promise<void> {
  await idbPut(STORE_TASKS, key, output);
  // Periodic eviction (non-blocking)
  idbEvictOldEntries(STORE_TASKS).catch(() => {});
}

/**
 * Check if a file hash is in the persistent validation cache.
 */
export async function getPersistedValidation(filePath: string): Promise<string | null> {
  return idbGet<string>(STORE_VALIDATIONS, filePath);
}

/**
 * Persist a validated file hash.
 */
export async function persistValidation(filePath: string, contentHash: string): Promise<void> {
  await idbPut(STORE_VALIDATIONS, filePath, contentHash);
}

/**
 * Clear all persistent caches.
 */
export async function clearPersistentCache(): Promise<void> {
  await Promise.all([
    idbClear(STORE_TASKS),
    idbClear(STORE_VALIDATIONS),
  ]);
  console.log("[PersistentCache] All caches cleared");
}

/**
 * Get cache stats for observability.
 */
export async function getCacheStats(): Promise<{
  taskOutputCount: number;
  validationCount: number;
}> {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_TASKS, STORE_VALIDATIONS], "readonly");

    const taskCount = await new Promise<number>((resolve) => {
      const request = tx.objectStore(STORE_TASKS).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });

    const valCount = await new Promise<number>((resolve) => {
      const request = tx.objectStore(STORE_VALIDATIONS).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });

    return { taskOutputCount: taskCount, validationCount: valCount };
  } catch {
    return { taskOutputCount: 0, validationCount: 0 };
  }
}
