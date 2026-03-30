/**
 * db.js — IndexedDB wrapper for Saints & Wisdom
 *
 * Stores: favorites, settings, quote signature cache.
 * Follows a Workbox-inspired pattern (promise-based, versioned).
 */

const DB_NAME    = 'saints-wisdom';
const DB_VERSION = 1;

const STORES = {
  FAVORITES: 'favorites',   // keyed by quote id
  SETTINGS:  'settings',    // keyed by setting name
  CACHE_META:'cache_meta',  // keyed by string key (e.g. 'quote_sig')
};

/** Open (or upgrade) the database */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.FAVORITES)) {
        db.createObjectStore(STORES.FAVORITES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.CACHE_META)) {
        db.createObjectStore(STORES.CACHE_META, { keyPath: 'key' });
      }
    };

    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
    req.onblocked  = () => reject(new Error('IndexedDB blocked'));
  });
}

/** Generic get from an object store */
async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/** Generic put into an object store */
async function dbPut(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Generic delete from an object store */
async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).delete(key);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Get all records from an object store */
async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  });
}

/* ── Favorites API ─────────────────────────────────────────── */

export async function addFavorite(quote) {
  await dbPut(STORES.FAVORITES, { id: quote.id, addedAt: Date.now(), ...quote });
}

export async function removeFavorite(quoteId) {
  await dbDelete(STORES.FAVORITES, quoteId);
}

export async function isFavorite(quoteId) {
  const record = await dbGet(STORES.FAVORITES, quoteId);
  return record !== null;
}

export async function getAllFavorites() {
  return dbGetAll(STORES.FAVORITES);
}

/* ── Settings API ─────────────────────────────────────────── */

export async function getSetting(key, defaultValue = null) {
  const record = await dbGet(STORES.SETTINGS, key);
  return record ? record.value : defaultValue;
}

export async function setSetting(key, value) {
  await dbPut(STORES.SETTINGS, { key, value });
}

/* ── Cache Metadata API ────────────────────────────────────── */

export async function getCacheMeta(key) {
  const record = await dbGet(STORES.CACHE_META, key);
  return record ? record.value : null;
}

export async function setCacheMeta(key, value) {
  await dbPut(STORES.CACHE_META, { key, value });
}
