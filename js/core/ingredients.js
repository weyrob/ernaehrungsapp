// Zutatenzeilen verstehen: "200 g Mehl", "2 EL Olivenöl", "1/2 Bund Petersilie, gehackt", "3 Eier".
// Ergebnis: Menge, Einheit, Name – und, wenn möglich, die Menge in Gramm.

const de = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 1 });

const FRACTIONS = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125, '⅕': 0.2 };

// Einheit → Normalform + Gramm je Einheit (null = hängt vom Lebensmittel ab)
// Flüssigkeiten: 1 ml ≈ 1 g (bei Öl etwas weniger, für unseren Zweck genau genug)
const UNITS = [
  [['kg', 'kilogramm'], 'kg', 1000],
  [['g', 'gr', 'gramm'], 'g', 1],
  [['mg', 'milligramm'], 'mg', 0.001],
  [['l', 'liter'], 'l', 1000],
  [['dl'], 'dl', 100],
  [['cl'], 'cl', 10],
  [['ml', 'milliliter'], 'ml', 1],
  [['el', 'essloffel', 'essloeffel', 'esslöffel', 'eßlöffel', 'tbsp', 'tbs'], 'EL', null],
  [['tl', 'teeloffel', 'teeloeffel', 'teelöffel', 'tsp'], 'TL', null],
  [['msp', 'messerspitze', 'messerspitzen'], 'Msp', 0.3],
  [['prise', 'prisen'], 'Prise', 0.5],
  [['tasse', 'tassen', 'cup', 'cups'], 'Tasse', 200],
  [['glas', 'gläser', 'glaeser'], 'Glas', 250],
  [['becher'], 'Becher', 200],
  [['dose', 'dosen'], 'Dose', 400],
  [['bund', 'bd'], 'Bund', 30],
  [['handvoll', 'hand voll'], 'Handvoll', 30],
  [['zehe', 'zehen'], 'Zehe', 4],
  [['scheibe', 'scheiben'], 'Scheibe', null],
  [['stück', 'stueck', 'stk', 'st'], 'Stück', null],
  [['packung', 'packungen', 'pck', 'pkg', 'päckchen', 'paeckchen', 'pk'], 'Packung', null],
  [['würfel', 'wuerfel'], 'Würfel', null],
  [['blatt', 'blätter', 'blaetter'], 'Blatt', null],
  [['zweig', 'zweige', 'stiel', 'stiele'], 'Zweig', 1],
  [['spritzer', 'schuss'], 'Spritzer', 5],
];

// Löffelgewichte je Lebensmittelart (Gramm für 1 EL; 1 TL = 1/3 davon)
const SPOON_GRAMS = [
  [/mehl|stärke|staerke|kakao|puderzucker|paniermehl|semmelbrösel|haferflocken|grieß|griess/i, 10],
  [/zucker|salz/i, 15],
  [/öl|oel|essig|wasser|milch|sahne|soße|sosse|sauce|sirup|saft|wein/i, 12],
  [/butter|margarine|honig|senf|marmelade|konfitüre|joghurt|quark|schmand|creme|mus|mark|pesto|ketchup/i, 15],
];

const FILLER_WORDS = 'frisch|frische|frischer|gehackt|gehackte|fein|feine|grob|grobe|klein|kleine|kleiner|groß|große|großer|mittelgroß|mittelgroße|gewürfelt|gewürfelte|gerieben|geriebene|zimmerwarm|weich|weiche|kalt|kalte|tk|tiefgekühlt|bio|optional|etwa|ca|circa|evtl|nach|belieben|geschmack|zum|zur|für|braten|anbraten|frittieren|bestreuen|garnieren|abgezogen|geschält|geschälte|entsteint|in|scheiben|würfel|ringe|streifen|und|oder|gestrichen|gehäuft|n\\.?\\s?b';
// Wörter, die bei der Suche stören ("Zwiebel, fein gehackt" → "Zwiebel")
const FILLER = new RegExp(`(?<![\\wäöüß])(?:${FILLER_WORDS})\\.?(?![\\wäöüß])`, 'gi');

function parseNumber(str) {
  let s = str.trim();
  for (const [ch, v] of Object.entries(FRACTIONS)) {
    if (s.includes(ch)) {
      const before = s.replace(ch, '').trim();
      return (before ? Number(before.replace(',', '.')) : 0) + v;
    }
  }
  if (/^\d+\s+\d+\/\d+$/.test(s)) {
    const [whole, frac] = s.split(/\s+/);
    const [a, b] = frac.split('/');
    return Number(whole) + Number(a) / Number(b);
  }
  if (/^\d+\/\d+$/.test(s)) {
    const [a, b] = s.split('/');
    return Number(a) / Number(b);
  }
  return Number(s.replace(',', '.'));
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½⅓⅔¼¾⅛⅕]?|[½⅓⅔¼¾⅛⅕])`;

function findUnit(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  for (const [aliases, unit, grams] of UNITS) if (aliases.includes(w)) return { unit, gramsPerUnit: grams };
  return null;
}

/**
 * Zerlegt eine Zutatenzeile.
 * @returns {{ text, quantity, unit, gramsPerUnit, name, searchName, explicitGrams }}
 */
export function parseIngredientLine(line) {
  const text = String(line).replace(/\s+/g, ' ').trim();
  let rest = text.replace(/^[-•*·–]\s*/, '');
  let quantity = null;

  // Menge, auch Bereiche wie "2-3" (→ Mittelwert)
  const m = rest.match(new RegExp(`^(${NUM})(?:\\s*(?:-|–|bis)\\s*(${NUM}))?\\s*`));
  if (m) {
    const a = parseNumber(m[1]);
    const b = m[2] ? parseNumber(m[2]) : null;
    quantity = b ? (a + b) / 2 : a;
    rest = rest.slice(m[0].length);
  }

  // Einheit (auch direkt an der Zahl: "200g")
  let unit = null;
  let gramsPerUnit = null;
  const um = rest.match(/^([A-Za-zÄÖÜäöüß.]+)\s*/);
  if (um) {
    const u = findUnit(um[1]);
    if (u) {
      ({ unit, gramsPerUnit } = u);
      rest = rest.slice(um[0].length);
    }
  }

  // Gramm-Angabe in Klammern, z. B. "1 Dose Tomaten (400 g)" oder "Tomaten, à 400 g"
  let explicitGrams = null;
  const gm = rest.match(/(\d+(?:[.,]\d+)?)\s*(g|ml|kg)\b/i);
  if (gm && unit !== 'g' && unit !== 'kg' && unit !== 'ml') {
    explicitGrams = Number(gm[1].replace(',', '.')) * (gm[2].toLowerCase() === 'kg' ? 1000 : 1);
  }

  const name = rest
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^(von|vom|an)\s+/i, '')
    .trim()
    .replace(/[,;:]$/, '');
  // Für die Suche: nur der Kern ("Zwiebel, fein gehackt" → "Zwiebel")
  const searchName = name
    .split(/[,;(]/)[0]
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { text, quantity, unit, gramsPerUnit, name, searchName: searchName || name, explicitGrams };
}

/** Gramm für 1 EL dieses Lebensmittels (grobe Schätzung). */
export function spoonGrams(foodName, unit) {
  let el = 15;
  for (const [re, g] of SPOON_GRAMS) {
    if (re.test(foodName)) {
      el = g;
      break;
    }
  }
  return unit === 'TL' ? Math.round((el / 3) * 10) / 10 : el;
}

/**
 * Rechnet eine erkannte Zeile in Gramm um. Für "Stück" o. Ä. werden die Portionen
 * des verknüpften Lebensmittels genutzt (z. B. 1 Ei ≈ 55 g).
 * @param parsed   Ergebnis von parseIngredientLine
 * @param portions Portionen des Lebensmittels (aus portionsFor)
 * @returns {{ grams: number|null, how: string }}  grams = null → bitte manuell angeben
 */
export function gramsFor(parsed, foodName = '', portions = []) {
  const q = parsed.quantity ?? (parsed.unit ? 1 : null);
  if (parsed.explicitGrams && (parsed.unit === 'Dose' || parsed.unit === 'Packung' || parsed.unit === 'Becher' || parsed.unit === 'Glas' || !parsed.unit)) {
    return { grams: parsed.explicitGrams * (q ?? 1), how: 'Angabe im Rezept' };
  }
  if (q == null) return { grams: null, how: 'ohne Mengenangabe' };
  if (parsed.unit === 'EL' || parsed.unit === 'TL') {
    return { grams: q * spoonGrams(foodName || parsed.name, parsed.unit), how: `1 ${parsed.unit} ≈ ${de(spoonGrams(foodName || parsed.name, parsed.unit))} g` };
  }
  if (parsed.gramsPerUnit) return { grams: q * parsed.gramsPerUnit, how: ['g', 'kg', 'mg'].includes(parsed.unit) ? '' : `1 ${parsed.unit} ≈ ${de(parsed.gramsPerUnit)} g` };

  // Stück, Scheibe, ohne Einheit ("3 Eier"): passende Portion des Lebensmittels suchen
  const wanted = parsed.unit === 'Scheibe' ? /scheibe/i : parsed.unit === 'Zehe' ? /zehe/i : /stück|ei\b|zehe|scheibe|becher/i;
  const p = portions.find((x) => x.origin !== 'allgemein' && wanted.test(x.label)) || portions.find((x) => x.origin !== 'allgemein' && /^1 /.test(x.label));
  if (p) return { grams: q * p.grams, how: `${p.label} ≈ ${de(p.grams)} g` };
  return { grams: null, how: 'Gewicht pro Stück unbekannt' };
}
