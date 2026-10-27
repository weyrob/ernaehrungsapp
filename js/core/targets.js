// Soll-Werte: DGE-Referenzwerte (Erwachsene) + eigene Makro-Ziele.
//
// Quelle der Mikronährstoff-Werte: DGE/ÖGE, Referenzwerte für die Nährstoffzufuhr
// (Stand 3. Auflage 2025, inkl. Jod/Vitamin E 2025, Eisen/Phosphor/Fluorid 2024).
// "Zu viel"-Grenzen (ul) sind die tolerierbaren Höchstmengen (EFSA), nur dort gesetzt,
// wo man sie mit normalem Essen überhaupt erreichen kann.
//
// Ein Ziel hat die Form { min?, max?, ul?, source }:
//   min  → darunter "zu wenig"
//   max  → darüber "zu viel" (z. B. Salz, eigene Makro-Obergrenze)
//   ul   → darüber "zu viel" (Höchstmenge bei Mikronährstoffen)

export const SEX = { m: 'männlich', f: 'weiblich' };

export const PAL_OPTIONS = [
  { value: 1.2, label: 'fast nur sitzend/liegend (1,2)' },
  { value: 1.4, label: 'Bürojob, wenig Bewegung (1,4)' },
  { value: 1.6, label: 'Bürojob + regelmäßig Sport (1,6)' },
  { value: 1.8, label: 'viel auf den Beinen (1,8)' },
  { value: 2.0, label: 'körperlich schwer / sehr viel Sport (2,0)' },
];

// Altersgruppen der DGE: 19–<25, 25–<51, 51–<65, ab 65
function ageGroup(age) {
  if (age < 25) return 0;
  if (age < 51) return 1;
  if (age < 65) return 2;
  return 3;
}

// [19–24, 25–50, 51–64, 65+] je Geschlecht. Ein einzelner Wert gilt für alle.
const DGE = {
  vitA: { m: [850, 850, 850, 800], f: 700, ul: null }, // µg RAE
  vitD: { m: 20, f: 20, ul: 100 }, // µg (ohne Eigensynthese)
  vitE: { m: 8, f: 8 }, // mg (2025: 8 mg für alle Erwachsenen)
  vitK: { m: [70, 70, 80, 80], f: [60, 60, 65, 65] },
  vitB1: { m: [1.3, 1.2, 1.2, 1.1], f: 1.0 },
  vitB2: { m: [1.4, 1.4, 1.3, 1.3], f: [1.1, 1.1, 1.0, 1.0] },
  niacin: { m: [16, 15, 15, 14], f: [13, 12, 11, 11] },
  vitB5: { m: 5, f: 5 },
  vitB6: { m: 1.6, f: 1.4, ul: 12 },
  biotin: { m: 40, f: 40 },
  folate: { m: 300, f: 300 },
  vitB12: { m: 4.0, f: 4.0 },
  vitC: { m: 110, f: 95 },
  sodium: { m: 1500, f: 1500 },
  potassium: { m: 4000, f: 4000 },
  chloride: { m: 2300, f: 2300 },
  calcium: { m: 1000, f: 1000, ul: 2500 },
  magnesium: { m: 350, f: 300 },
  phosphorus: { m: 550, f: 550 },
  iron: { m: 11, f: [16, 16, 14, 14] },
  zinc: { m: 14, f: 8, ul: 25 }, // mittlere Phytatzufuhr
  copper: { m: 1.0, f: 1.0, ul: 5 }, // Schätzwert 1,0–1,5 mg
  manganese: { m: 2.0, f: 2.0 }, // Schätzwert 2,0–5,0 mg
  iodine: { m: 150, f: 150, ul: 600 },
  fluoride: { m: 3.5, f: 2.9, ul: 7 }, // Richtwert Gesamtzufuhr
  selenium: { m: 70, f: 60, ul: 255 },
};

function pick(v, sex, group) {
  const x = v[sex];
  return Array.isArray(x) ? x[group] : x;
}

export function ageFromBirthYear(birthYear) {
  return new Date().getFullYear() - Number(birthYear);
}

/** Grundumsatz nach Mifflin-St Jeor (kcal/Tag). */
export function basalMetabolicRate({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'f' ? base - 161 : base + 5;
}

/** Vorschlag für Energie- und Makro-Ziele aus dem Profil (DGE-Richtwerte). */
export function suggestMacroGoals(profile) {
  const age = ageFromBirthYear(profile.birthYear);
  const kcal = Math.round((basalMetabolicRate({ ...profile, age }) * profile.pal) / 10) * 10;
  const proteinPerKg = age >= 65 ? 1.0 : 0.8;
  const r = (x) => Math.round(x);
  return {
    energy: { min: r(kcal * 0.9), max: r(kcal * 1.1) },
    protein: { min: r(profile.weightKg * proteinPerKg), max: null },
    fat: { min: r((kcal * 0.25) / 9), max: r((kcal * 0.35) / 9) },
    carbs: { min: r((kcal * 0.5) / 4), max: null },
    fiber: { min: 30, max: null },
  };
}

/**
 * Baut alle Soll-Werte für eine Person.
 * settings = { profile: {sex, birthYear, weightKg, heightCm, pal}, macros: {energy:{min,max}, ...} }
 */
export function buildTargets(settings) {
  const { profile, macros } = settings;
  const sex = profile.sex === 'f' ? 'f' : 'm';
  const group = ageGroup(ageFromBirthYear(profile.birthYear));
  const targets = {};

  for (const [key, v] of Object.entries(DGE)) {
    targets[key] = { min: pick(v, sex, group), ul: v.ul ?? null, source: 'DGE' };
  }

  // Eigene Makro-Ziele (frei einstellbar)
  for (const [key, g] of Object.entries(macros || {})) {
    if (!g) continue;
    const min = g.min ?? null;
    const max = g.max ?? null;
    if (min == null && max == null) continue;
    targets[key] = { min, max, source: 'eigenes Ziel' };
  }

  // Obergrenzen, die sich an der Energie orientieren (DGE-Orientierungswerte)
  const kcal = macros?.energy?.max ?? macros?.energy?.min;
  if (kcal) {
    const mid = macros.energy.min && macros.energy.max ? (macros.energy.min + macros.energy.max) / 2 : kcal;
    if (!targets.satfat) targets.satfat = { max: Math.round((mid * 0.1) / 9), source: 'DGE: max. 10 % der Energie' };
    if (!targets.sugar)
      targets.sugar = {
        max: Math.round((mid * 0.1) / 4),
        source: 'DGE: freier Zucker max. 10 % der Energie (hier Gesamtzucker inkl. Obst/Milch)',
      };
    if (!targets.omega3) targets.omega3 = { min: Math.round(((mid * 0.005) / 9) * 10) / 10, source: 'DGE: 0,5 % der Energie' };
    if (!targets.omega6) targets.omega6 = { min: Math.round((mid * 0.025) / 9), source: 'DGE: 2,5 % der Energie' };
  }
  if (!targets.salt) targets.salt = { max: 6, source: 'DGE: max. 6 g' };

  return targets;
}

/**
 * Ordnet einen Ist-Wert ein.
 * Ergebnis: { status: 'low' | 'ok' | 'high' | 'none', fraction, refValue }
 *   fraction = Anteil am Bezugswert (für die Balkenlänge)
 */
export function evaluate(value, target) {
  if (!target) return { status: 'none', fraction: 0, refValue: null };
  const { min, max, ul } = target;
  const upper = max ?? ul ?? null;
  let status = 'ok';
  if (min != null && value < min) status = 'low';
  if (upper != null && value > upper) status = 'high';
  const ref = min ?? max ?? ul;
  return { status, fraction: ref ? value / ref : 0, refValue: ref };
}

export const STATUS_LABEL = {
  low: 'zu wenig',
  ok: 'im Bereich',
  high: 'zu viel',
  none: 'kein Sollwert',
};
