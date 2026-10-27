// Die Nährwert-Datenbank: ein Modul, das alle Lebensmittel-Quellen zusammenführt.
//   - BLS (Bundeslebensmittelschlüssel): Grundlebensmittel mit vielen Mikronährstoffen
//   - eigene Lebensmittel (selbst angelegt)
//   - Markenprodukte per Barcode (Open Food Facts), einmal geladen → lokal gespeichert
//
// Die Oberfläche fragt nur über die Funktionen hier an (search, getFood, lookupBarcode …)
// und weiß nicht, woher die Daten kommen.
import * as repo from './repo.js';
import { fetchProduct } from './openfoodfacts.js';

export const SOURCES = {
  bls: 'BLS 4.0',
  own: 'Eigenes Lebensmittel',
  off: 'Open Food Facts',
};

let bls = null; // { meta, foods: Map(id → food), list: [...] }
let blsPromise = null;

/** Normalisiert Text für die Suche: klein, Umlaute ausgeschrieben, nur Buchstaben/Ziffern. */
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function prepare(food) {
  food._search = normalize(`${food.name} ${food.brand || ''}`);
  food._words = food._search.split(' ');
  return food;
}

/** Lädt die BLS-Daten (einmalig, ca. 1–2 MB; danach aus dem Offline-Speicher). */
export function loadBLS() {
  if (blsPromise) return blsPromise;
  blsPromise = (async () => {
    const res = await fetch('data/bls.json');
    if (!res.ok) throw new Error('BLS-Daten konnten nicht geladen werden.');
    const json = await res.json();
    const keys = json.nutrients;
    const list = json.foods.map((row) => {
      const [code, name, group, ...values] = row;
      const per100 = {};
      keys.forEach((k, i) => {
        if (values[i] !== null && values[i] !== undefined) per100[k] = values[i];
      });
      return prepare({ id: `bls:${code}`, source: 'bls', code, name, group, per100, portions: [] });
    });
    bls = { meta: json.meta, list, byId: new Map(list.map((f) => [f.id, f])) };
    return bls;
  })().catch((e) => {
    blsPromise = null;
    throw e;
  });
  return blsPromise;
}

export function blsMeta() {
  return bls?.meta || null;
}

async function storedFoods() {
  return (await repo.getStoredFoods()).map(prepare);
}

/** Holt ein einzelnes Lebensmittel anhand seiner ID ("bls:…", "own:…", "off:…"). */
export async function getFood(id) {
  if (id.startsWith('bls:')) {
    const b = await loadBLS();
    return b.byId.get(id) || null;
  }
  const f = await repo.getStoredFood(id);
  return f ? prepare(f) : null;
}

/**
 * Sucht Lebensmittel. Alle Suchwörter müssen vorkommen (als Wortanfang oder Teil eines Wortes).
 * Häufig genutzte Lebensmittel und Treffer am Namensanfang stehen oben.
 */
export async function search(query, { limit = 50, usage = [] } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const usageById = new Map(usage.map((u) => [u.foodId, u]));
  const pools = [await storedFoods()];
  try {
    pools.push((await loadBLS()).list);
  } catch (e) {
    console.warn(e);
  }

  const results = [];
  for (const pool of pools) {
    for (const f of pool) {
      let score = 0;
      let ok = true;
      for (const t of tokens) {
        if (f._words[0].startsWith(t)) score += 30;
        else if (f._words.some((w) => w.startsWith(t))) score += 15;
        else if (f._search.includes(t)) score += 5;
        else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (f._words[0] === tokens[0]) score += 20;
      if (/\broh\b/.test(f._search)) score += 3; // "roh" ist meist das, was man sucht
      score -= f._search.length / 10; // kürzere Namen sind meist allgemeiner
      if (f.source !== 'bls') score += 10;
      const u = usageById.get(f.id);
      if (u) score += 40 + Math.min(u.count, 20) * 2;
      results.push({ food: f, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((r) => r.food);
}

/** Barcode → Produkt: zuerst lokal, sonst bei Open Food Facts nachschlagen und speichern. */
export async function lookupBarcode(code) {
  const id = `off:${code}`;
  const local = await repo.getStoredFood(id);
  if (local) return local;
  const own = (await repo.getStoredFoods()).find((f) => f.barcode === code);
  if (own) return own;
  const product = await fetchProduct(code);
  if (product) await repo.saveFood(product);
  return product;
}

/** Legt ein eigenes Lebensmittel an oder aktualisiert es. */
export async function saveOwnFood(food) {
  const f = { ...food, id: food.id || `own:${repo.uid()}`, source: food.source || 'own' };
  await repo.saveFood(f);
  return f;
}
