/** Recorded takes, kept in IndexedDB so they survive a reload. Every call fails soft. */
const DB = "gpitb";
const STORE = "takes";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTake(key: string, samples: Float32Array): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(samples, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Returns the stored take, or null if missing or not a Float32Array. */
export async function loadTake(key: string): Promise<Float32Array | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result instanceof Float32Array ? req.result : null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Every stored take for a song, in order. Stops at the first gap. */
export async function loadTakes(song: string): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  for (let i = 1; i <= 32; i++) {
    const t = await loadTake(`take:${song}:${i}`);
    if (!t) break;
    out.push(t);
  }
  return out;
}
