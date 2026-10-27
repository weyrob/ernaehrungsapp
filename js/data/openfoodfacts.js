// Markenprodukte per Barcode aus Open Food Facts (offene Datenbank, Lizenz ODbL).
// https://world.openfoodfacts.org – Daten werden von Freiwilligen gepflegt,
// daher fehlen bei vielen Produkten Vitamine/Mineralstoffe.

const API = 'https://world.openfoodfacts.org/api/v2/product/';

// Open-Food-Facts-Feld → unser Schlüssel + Umrechnungsfaktor.
// OFF speichert *_100g-Werte in Gramm; wir rechnen in die Einheit unserer Nährstoffliste um.
const MAP = {
  'energy-kcal': ['energy', 1],
  proteins: ['protein', 1],
  fat: ['fat', 1],
  carbohydrates: ['carbs', 1],
  fiber: ['fiber', 1],
  sugars: ['sugar', 1],
  starch: ['starch', 1],
  salt: ['salt', 1],
  'saturated-fat': ['satfat', 1],
  'monounsaturated-fat': ['mufa', 1],
  'polyunsaturated-fat': ['pufa', 1],
  'alpha-linolenic-acid': ['omega3', 1],
  'linoleic-acid': ['omega6', 1],
  cholesterol: ['cholesterol', 1e3],
  'vitamin-a': ['vitA', 1e6],
  'vitamin-d': ['vitD', 1e6],
  'vitamin-e': ['vitE', 1e3],
  'vitamin-k': ['vitK', 1e6],
  'vitamin-b1': ['vitB1', 1e3],
  'vitamin-b2': ['vitB2', 1e3],
  'vitamin-pp': ['niacin', 1e3],
  'pantothenic-acid': ['vitB5', 1e3],
  'vitamin-b6': ['vitB6', 1e3],
  biotin: ['biotin', 1e6],
  'vitamin-b9': ['folate', 1e6],
  folates: ['folate', 1e6],
  'vitamin-b12': ['vitB12', 1e6],
  'vitamin-c': ['vitC', 1e3],
  sodium: ['sodium', 1e3],
  potassium: ['potassium', 1e3],
  calcium: ['calcium', 1e3],
  magnesium: ['magnesium', 1e3],
  phosphorus: ['phosphorus', 1e3],
  chloride: ['chloride', 1e3],
  iron: ['iron', 1e3],
  zinc: ['zinc', 1e3],
  copper: ['copper', 1e3],
  manganese: ['manganese', 1e3],
  iodine: ['iodine', 1e6],
  fluoride: ['fluoride', 1e3],
  selenium: ['selenium', 1e6],
};

export function convertProduct(code, p) {
  const n = p.nutriments || {};
  const per100 = {};
  for (const [offKey, [key, factor]] of Object.entries(MAP)) {
    const v = n[`${offKey}_100g`];
    if (v === undefined || v === '' || v === null) continue;
    const num = Number(v);
    if (!Number.isFinite(num)) continue;
    if (per100[key] === undefined) per100[key] = num * factor;
  }
  // Energie notfalls aus kJ berechnen
  if (per100.energy === undefined && Number.isFinite(Number(n['energy-kj_100g']))) {
    per100.energy = Number(n['energy-kj_100g']) / 4.184;
  }
  // Alkohol steht bei OFF in % vol → grob in Gramm umrechnen (Dichte Ethanol 0,789)
  if (Number.isFinite(Number(n.alcohol_100g))) per100.alcohol = Number(n.alcohol_100g) * 0.789;
  // Salz/Natrium gegenseitig ergänzen
  if (per100.salt === undefined && per100.sodium !== undefined) per100.salt = (per100.sodium * 2.5) / 1000;
  if (per100.sodium === undefined && per100.salt !== undefined) per100.sodium = (per100.salt / 2.5) * 1000;

  const portions = [];
  const sq = Number(p.serving_quantity);
  if (sq > 0) portions.push({ label: p.serving_size ? `1 Portion (${p.serving_size})` : '1 Portion', grams: sq });
  const pq = Number(p.product_quantity);
  if (pq > 0 && pq !== sq && pq <= 2000) portions.push({ label: `ganze Packung (${pq} g)`, grams: pq });

  return {
    id: `off:${code}`,
    source: 'off',
    barcode: code,
    name: p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || `Produkt ${code}`,
    brand: (p.brands || '').split(',')[0].trim() || null,
    per100,
    portions,
    hasNutrition: per100.energy !== undefined,
  };
}

/** Holt ein Produkt. Gibt null zurück, wenn der Barcode unbekannt ist. */
export async function fetchProduct(code) {
  const fields = 'product_name,product_name_de,generic_name,generic_name_de,brands,nutriments,serving_size,serving_quantity,product_quantity';
  const res = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${fields}&lc=de`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts antwortet nicht (Fehler ${res.status}).`);
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;
  return convertProduct(code, json.product);
}
