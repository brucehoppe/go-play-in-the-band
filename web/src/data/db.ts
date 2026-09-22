/** One IndexedDB database for everything the app keeps between visits. Every call fails soft. */
const DB = "gpitb";
const VERSION = 2;
export const STORES = ["takes", "loops", "songs"] as const;
export type Store = (typeof STORES)[number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(store: Store, key: string, value: unknown): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function dbGet(store: Store, key: string): Promise<unknown> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function dbDelete(store: Store, key: string): Promise<boolean> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/** Every key and value in a store. */
export async function dbAll(store: Store): Promise<{ key: string; value: unknown }[]> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const out: { key: string; value: unknown }[] = [];
      const req = db.transaction(store).objectStore(store).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        if (typeof c.key === "string") out.push({ key: c.key, value: c.value });
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return [];
  }
}
