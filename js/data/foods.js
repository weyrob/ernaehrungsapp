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
  food._compact = food._search.replace(/ /g, '');
  return food;
}

// Alltagswörter → Begriffe, wie sie im BLS stehen
const SYNONYMS = {
  ei: ['huehnerei'],
  eier: ['huehnerei'],
  haferflocken: ['hafer flocken'],
  muesli: ['muesli'],
  nudel: ['teigwaren'],
  nudeln: ['teigwaren'],
  pasta: ['teigwaren'],
  spaghetti: ['teigwaren'],
  quark: ['speisequark'],
  hackfleisch: ['hackfleisch', 'hack'],
  haehnchenbrust: ['haehnchen brust'],
  putenbrust: ['pute brust'],
  semmel: ['broetchen'],
  wecken: ['broetchen'],
  kartoffeln: ['kartoffel'],
  karotte: ['karotte', 'moehre'],
  moehre: ['moehre', 'karotte'],
  erdapfel: ['kartoffel'],
  paradeiser: ['tomate'],
  topfen: ['speisequark'],
  obers: ['schlagsahne'],
  sahne: ['sahne', 'schlagsahne'],
};

function tokenScore(f, t) {
  if (f._words[0].startsWith(t)) return 30;
  if (f._words.some((w) => w.startsWith(t))) return 15;
  if (t.length >= 2 && f._words.some((w) => w.endsWith(t))) return 12; // z. B. "ei" in "Hühnerei"
  if (f._search.includes(t)) return 5;
  return 0;
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

  const qCompact = q.replace(/ /g, '');
  const scoreFood = (f, requireAll) => {
    let score = 0;
    let matched = 0;
    for (const t of tokens) {
      let best = tokenScore(f, t);
      for (const syn of SYNONYMS[t] || []) best = Math.max(best, syn.split(' ').every((x) => f._words.some((w) => w.startsWith(x))) ? 60 : 0);
      if (best) matched += 1;
      else if (requireAll) return null;
      score += best;
    }
    if (!matched) return null;
    if (f._words[0] === tokens[0]) score += 20;
    return score;
  };

  const collect = (requireAll) => {
    const out = [];
    for (const pool of pools) {
      for (const f of pool) {
        let score = scoreFood(f, requireAll);
        // "haferflocken" findet auch "Hafer Flocken"
        if (score == null && qCompact.length >= 4 && f._compact.includes(qCompact)) score = f._compact.startsWith(qCompact) ? 45 : 25;
        if (score == null) continue;
        if (/\broh\b/.test(f._search)) score += 3; // "roh" ist meist das, was man sucht
        score -= f._search.length / 10; // kürzere Namen sind meist allgemeiner
        if (f.source !== 'bls') score += 10;
        const u = usageById.get(f.id);
        if (u) score += 40 + Math.min(u.count, 20) * 2;
        out.push({ food: f, score });
      }
    }
    return out;
  };

  let results = collect(true);
  // Nichts gefunden, wenn alle Wörter passen müssen? Dann reicht ein Teil der Wörter.
  if (!results.length && tokens.length > 1) results = collect(false);
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
