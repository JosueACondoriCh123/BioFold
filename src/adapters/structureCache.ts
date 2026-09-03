/**
 * IndexedDB-backed structure cache for offline resilience and instant re-loading
 * of CIF/PDB files across all catalog entries.
 */

const DB_NAME = "biofold_structures_db";
const STORE_NAME = "cif_cache";
const DB_VERSION = 1;

// In-memory fallback for test runners or environments where IndexedDB is unavailable
const memoryFallback = new Map<string, { data: string; timestamp: number }>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getCachedStructure(id: string): Promise<string | null> {
  const normalizedId = id.trim().toUpperCase();

  try {
    const db = await openDb();
    return await new Promise<string | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(normalizedId);

      request.onsuccess = () => {
        const record = request.result;
        resolve(record ? record.data : null);
      };

      request.onerror = () => {
        resolve(memoryFallback.get(normalizedId)?.data ?? null);
      };
    });
  } catch {
    return memoryFallback.get(normalizedId)?.data ?? null;
  }
}

export async function setCachedStructure(id: string, data: string): Promise<void> {
  const normalizedId = id.trim().toUpperCase();
  const timestamp = Date.now();

  // Always update memory fallback
  memoryFallback.set(normalizedId, { data, timestamp });

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ id: normalizedId, data, timestamp });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Non-fatal if IndexedDB write fails, memory fallback is already populated
  }
}

export async function clearStructureCache(): Promise<void> {
  memoryFallback.clear();

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Non-fatal
  }
}

export async function getCachedStructureIds(): Promise<string[]> {
  try {
    const db = await openDb();
    return await new Promise<string[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const keys = (request.result as string[]) ?? [];
        resolve(Array.from(new Set([...keys, ...memoryFallback.keys()])));
      };

      request.onerror = () => {
        resolve(Array.from(memoryFallback.keys()));
      };
    });
  } catch {
    return Array.from(memoryFallback.keys());
  }
}
