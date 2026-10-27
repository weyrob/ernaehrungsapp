// Kleine Hülle um IndexedDB (die Datenbank im Browser bzw. später in der iOS-App).
// Alles andere in der App spricht nur über diese Funktionen mit dem Speicher.
// Wenn wir später in der iOS-App einen anderen Speicher wollen, wird nur diese Datei getauscht.

const DB_NAME = 'ernaehrungsapp';
const DB_VERSION = 2;

// Tabellen ("Object Stores")
export const STORES = {
  entries: 'entries', // Tagebuch-Einträge
  foods: 'foods', // eigene Lebensmittel + gespeicherte Barcode-Produkte
  usage: 'usage', // wie oft/zuletzt ein Lebensmittel genutzt wurde
  portions: 'portions', // eigene Portionen je Lebensmittel
  settings: 'settings', // Profil, Ziele usw. (Schlüssel/Wert)
  recipes: 'recipes', // Rezeptbuch
  aliases: 'aliases', // gemerkte Zuordnung Zutatenname → Lebensmittel
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.entries)) {
        const s = db.createObjectStore(STORES.entries, { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains(STORES.foods)) db.createObjectStore(STORES.foods, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.usage)) db.createObjectStore(STORES.usage, { keyPath: 'foodId' });
      if (!db.objectStoreNames.contains(STORES.portions)) db.createObjectStore(STORES.portions, { keyPath: 'foodId' });
      if (!db.objectStoreNames.contains(STORES.settings)) db.createObjectStore(STORES.settings, { keyPath: 'key' });
      // ab Version 2
      if (!db.objectStoreNames.contains(STORES.recipes)) db.createObjectStore(STORES.recipes, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.aliases)) db.createObjectStore(STORES.aliases, { keyPath: 'text' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

export async function get(storeName, key) {
  return done((await store(storeName)).get(key));
}

export async function getAll(storeName) {
  return done((await store(storeName)).getAll());
}

export async function getAllByIndex(storeName, index, value) {
  return done((await store(storeName)).index(index).getAll(value));
}

export async function getRange(storeName, index, from, to) {
  return done((await store(storeName)).index(index).getAll(IDBKeyRange.bound(from, to)));
}

export async function put(storeName, value) {
  return done((await store(storeName, 'readwrite')).put(value));
}

export async function remove(storeName, key) {
  return done((await store(storeName, 'readwrite')).delete(key));
}

/** Ersetzt den Inhalt mehrerer Tabellen in einem Rutsch (für den Import). */
export async function replaceAll(data) {
  const db = await open();
  const names = Object.keys(data).filter((n) => Object.values(STORES).includes(n));
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const s = tx.objectStore(name);
    s.clear();
    for (const row of data[name]) s.put(row);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Bittet den Browser, die Daten nicht automatisch zu löschen (wichtig auf iOS). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* nicht unterstützt */
  }
  return false;
}
