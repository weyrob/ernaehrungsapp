// Portionsangaben → Gramm.
//
// Reihenfolge, in der Portionen für ein Lebensmittel angeboten werden:
//   1. eigene Portionen, die du für dieses Lebensmittel gespeichert hast
//   2. Portionen aus der Quelle (z. B. "1 Riegel = 25 g" von Open Food Facts)
//   3. typische Stückgrößen per Stichwort (z. B. "Apfel" → 1 Stück ≈ 150 g)
//   4. allgemeine Maße (EL, TL, Tasse …)

// Allgemeine Haushaltsmaße (Durchschnittswerte, ungefähr)
export const GENERIC_UNITS = [
  { label: '1 EL', grams: 15 },
  { label: '1 TL', grams: 5 },
  { label: '1 Tasse (200 ml)', grams: 200 },
  { label: '1 Glas (250 ml)', grams: 250 },
  { label: '1 Prise', grams: 0.5 },
];

// Typische Stückgrößen (essbarer Anteil). Stichwort → Portionen.
// Wird nur genutzt, wenn der Lebensmittelname mit dem Stichwort beginnt
// oder es als ganzes Wort enthält.
const KEYWORD_PORTIONS = [
  ['Apfel', [{ label: '1 Stück (mittel)', grams: 150 }]],
  ['Banane', [{ label: '1 Stück (ohne Schale)', grams: 120 }]],
  ['Birne', [{ label: '1 Stück', grams: 160 }]],
  ['Orange', [{ label: '1 Stück (ohne Schale)', grams: 150 }]],
  ['Mandarine', [{ label: '1 Stück', grams: 60 }]],
  ['Kiwi', [{ label: '1 Stück', grams: 70 }]],
  ['Pfirsich', [{ label: '1 Stück', grams: 130 }]],
  ['Erdbeere', [{ label: '1 Handvoll', grams: 80 }]],
  ['Tomate', [{ label: '1 Stück', grams: 80 }]],
  ['Gurke', [{ label: '1 Stück', grams: 400 }]],
  ['Paprika', [{ label: '1 Stück', grams: 160 }]],
  ['Karotte', [{ label: '1 Stück', grams: 70 }]],
  ['Möhre', [{ label: '1 Stück', grams: 70 }]],
  ['Zwiebel', [{ label: '1 Stück', grams: 60 }]],
  ['Knoblauch', [{ label: '1 Zehe', grams: 4 }]],
  ['Kartoffel', [{ label: '1 Stück (mittel)', grams: 100 }]],
  ['Avocado', [{ label: '1 Stück (ohne Kern)', grams: 140 }]],
  ['Hühnerei', [{ label: '1 Ei (M)', grams: 55 }]],
  ['Ei ', [{ label: '1 Ei (M)', grams: 55 }]],
  ['Brötchen', [{ label: '1 Stück', grams: 55 }]],
  ['Brot', [{ label: '1 Scheibe', grams: 45 }]],
  ['Toast', [{ label: '1 Scheibe', grams: 25 }]],
  ['Knäckebrot', [{ label: '1 Scheibe', grams: 10 }]],
  ['Butter', [{ label: '1 Portion (für 1 Scheibe)', grams: 10 }]],
  ['Käse', [{ label: '1 Scheibe', grams: 20 }]],
  ['Joghurt', [{ label: '1 Becher', grams: 150 }]],
  ['Milch', [{ label: '1 Glas', grams: 200 }]],
  ['Haferflocken', [{ label: '1 EL', grams: 10 }]],
  ['Hafer Flocken', [{ label: '1 EL', grams: 10 }]],
  ['Reis', [{ label: '1 Portion roh', grams: 70 }]],
  ['Nudel', [{ label: '1 Portion roh', grams: 100 }]],
  ['Teigwaren', [{ label: '1 Portion roh', grams: 100 }]],
  ['Walnuss', [{ label: '1 Handvoll', grams: 25 }]],
  ['Mandel', [{ label: '1 Handvoll', grams: 25 }]],
  ['Öl', [{ label: '1 EL', grams: 10 }]],
  ['Zucker', [{ label: '1 TL', grams: 4 }, { label: '1 Würfel', grams: 3 }]],
  ['Honig', [{ label: '1 TL', grams: 7 }]],
];

function keywordPortions(name) {
  const lower = ` ${name.toLowerCase()} `;
  const out = [];
  for (const [kw, portions] of KEYWORD_PORTIONS) {
    const k = kw.toLowerCase();
    if (lower.startsWith(` ${k}`) || lower.includes(` ${k.trim()} `) || lower.includes(` ${k.trim()},`)) {
      out.push(...portions);
    }
  }
  return out;
}

/**
 * Alle Portionen für ein Lebensmittel.
 * @param food        Lebensmittel (mit food.portions aus der Quelle, falls vorhanden)
 * @param ownPortions eigene, gespeicherte Portionen für dieses Lebensmittel
 */
export function portionsFor(food, ownPortions = []) {
  const seen = new Set();
  const list = [];
  const add = (p, origin) => {
    const id = `${p.label}|${p.grams}`;
    if (!p.grams || seen.has(id)) return;
    seen.add(id);
    list.push({ ...p, origin });
  };
  ownPortions.forEach((p) => add(p, 'eigen'));
  (food.portions || []).forEach((p) => add(p, 'Quelle'));
  keywordPortions(food.name || '').forEach((p) => add(p, 'typisch'));
  GENERIC_UNITS.forEach((p) => add(p, 'allgemein'));
  return list;
}

/** Liest Angaben wie "30 g", "250ml", "1 Stück (40 g)" und gibt Gramm zurück (oder null). */
export function parseGrams(text) {
  if (!text) return null;
  const m = String(text).replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  return m ? Number(m[1]) : null;
}
