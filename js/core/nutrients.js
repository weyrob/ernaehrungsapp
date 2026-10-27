// Alle Nährstoffe, die die App kennt.
// Jeder Nährstoff hat einen festen Schlüssel (key). Lebensmittel speichern ihre Werte
// immer "pro 100 g" unter diesen Schlüsseln. Fehlt ein Wert, ist er unbekannt (nicht 0).

export const NUTRIENT_GROUPS = [
  { id: 'energy', label: 'Energie' },
  { id: 'macro', label: 'Makronährstoffe' },
  { id: 'fat', label: 'Fette im Detail' },
  { id: 'carb', label: 'Kohlenhydrate im Detail' },
  { id: 'vitamin', label: 'Vitamine' },
  { id: 'mineral', label: 'Mineralstoffe' },
  { id: 'trace', label: 'Spurenelemente' },
];

// decimals = Nachkommastellen für die Anzeige
export const NUTRIENTS = [
  { key: 'energy', label: 'Energie', unit: 'kcal', group: 'energy', decimals: 0 },

  { key: 'protein', label: 'Eiweiß', unit: 'g', group: 'macro', decimals: 1 },
  { key: 'fat', label: 'Fett', unit: 'g', group: 'macro', decimals: 1 },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g', group: 'macro', decimals: 1 },
  { key: 'fiber', label: 'Ballaststoffe', unit: 'g', group: 'macro', decimals: 1 },
  { key: 'alcohol', label: 'Alkohol', unit: 'g', group: 'macro', decimals: 1 },
  { key: 'water', label: 'Wasser (im Essen)', unit: 'g', group: 'macro', decimals: 0 },

  { key: 'satfat', label: 'Gesättigte Fettsäuren', unit: 'g', group: 'fat', decimals: 1 },
  { key: 'mufa', label: 'Einfach ungesättigte FS', unit: 'g', group: 'fat', decimals: 1 },
  { key: 'pufa', label: 'Mehrfach ungesättigte FS', unit: 'g', group: 'fat', decimals: 1 },
  { key: 'omega3', label: 'Omega-3 (α-Linolensäure)', unit: 'g', group: 'fat', decimals: 2 },
  { key: 'epadha', label: 'EPA + DHA', unit: 'mg', group: 'fat', decimals: 0 },
  { key: 'omega6', label: 'Omega-6 (Linolsäure)', unit: 'g', group: 'fat', decimals: 1 },
  { key: 'cholesterol', label: 'Cholesterin', unit: 'mg', group: 'fat', decimals: 0 },

  { key: 'sugar', label: 'Zucker', unit: 'g', group: 'carb', decimals: 1 },
  { key: 'starch', label: 'Stärke', unit: 'g', group: 'carb', decimals: 1 },
  { key: 'salt', label: 'Salz', unit: 'g', group: 'carb', decimals: 2 },

  { key: 'vitA', label: 'Vitamin A (RAE)', unit: 'µg', group: 'vitamin', decimals: 0 },
  { key: 'vitD', label: 'Vitamin D', unit: 'µg', group: 'vitamin', decimals: 1 },
  { key: 'vitE', label: 'Vitamin E', unit: 'mg', group: 'vitamin', decimals: 1 },
  { key: 'vitK', label: 'Vitamin K', unit: 'µg', group: 'vitamin', decimals: 0 },
  { key: 'vitB1', label: 'Vitamin B1 (Thiamin)', unit: 'mg', group: 'vitamin', decimals: 2 },
  { key: 'vitB2', label: 'Vitamin B2 (Riboflavin)', unit: 'mg', group: 'vitamin', decimals: 2 },
  { key: 'niacin', label: 'Niacin', unit: 'mg', group: 'vitamin', decimals: 1 },
  { key: 'vitB5', label: 'Pantothensäure', unit: 'mg', group: 'vitamin', decimals: 1 },
  { key: 'vitB6', label: 'Vitamin B6', unit: 'mg', group: 'vitamin', decimals: 2 },
  { key: 'biotin', label: 'Biotin', unit: 'µg', group: 'vitamin', decimals: 0 },
  { key: 'folate', label: 'Folat', unit: 'µg', group: 'vitamin', decimals: 0 },
  { key: 'vitB12', label: 'Vitamin B12', unit: 'µg', group: 'vitamin', decimals: 1 },
  { key: 'vitC', label: 'Vitamin C', unit: 'mg', group: 'vitamin', decimals: 0 },

  { key: 'sodium', label: 'Natrium', unit: 'mg', group: 'mineral', decimals: 0 },
  { key: 'potassium', label: 'Kalium', unit: 'mg', group: 'mineral', decimals: 0 },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'mineral', decimals: 0 },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'mineral', decimals: 0 },
  { key: 'phosphorus', label: 'Phosphor', unit: 'mg', group: 'mineral', decimals: 0 },
  { key: 'chloride', label: 'Chlorid', unit: 'mg', group: 'mineral', decimals: 0 },

  { key: 'iron', label: 'Eisen', unit: 'mg', group: 'trace', decimals: 1 },
  { key: 'zinc', label: 'Zink', unit: 'mg', group: 'trace', decimals: 1 },
  { key: 'copper', label: 'Kupfer', unit: 'mg', group: 'trace', decimals: 2 },
  { key: 'manganese', label: 'Mangan', unit: 'mg', group: 'trace', decimals: 2 },
  { key: 'iodine', label: 'Jod', unit: 'µg', group: 'trace', decimals: 0 },
  { key: 'fluoride', label: 'Fluorid', unit: 'mg', group: 'trace', decimals: 2 },
  { key: 'selenium', label: 'Selen', unit: 'µg', group: 'trace', decimals: 0 },
];

export const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

/** Formatiert einen Wert deutsch, z. B. 1234.5 → "1.234,5". */
export function formatNumber(value, decimals = 0) {
  if (value == null || Number.isNaN(value)) return '–';
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatNutrient(key, value) {
  const n = NUTRIENT_BY_KEY[key];
  if (!n) return String(value);
  return `${formatNumber(value, n.decimals)} ${n.unit}`;
}

/**
 * Rechnet "pro 100 g"-Werte auf eine Menge in Gramm um.
 * Unbekannte Werte bleiben unbekannt (undefined).
 */
export function scaleNutrients(per100, grams) {
  const out = {};
  const f = grams / 100;
  for (const [k, v] of Object.entries(per100 || {})) {
    if (typeof v === 'number') out[k] = v * f;
  }
  return out;
}

/**
 * Summiert mehrere Nährwert-Objekte. Zusätzlich wird gezählt, wie viele
 * Einträge zu einem Nährstoff gar keinen Wert hatten (für den Hinweis
 * "Wert unvollständig").
 */
export function sumNutrients(list) {
  const total = {};
  const missing = {};
  for (const n of NUTRIENTS) {
    total[n.key] = 0;
    missing[n.key] = 0;
  }
  for (const item of list) {
    for (const n of NUTRIENTS) {
      const v = item[n.key];
      if (typeof v === 'number') total[n.key] += v;
      else missing[n.key] += 1;
    }
  }
  return { total, missing };
}
