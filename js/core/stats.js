// Auswertungen über mehrere Tage: Tageswerte, Durchschnitte, Hauptlieferanten.
import { NUTRIENTS, scaleNutrients } from './nutrients.js';

function isoDate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Alle Tage von `from` bis `to` (jeweils YYYY-MM-DD, einschließlich). */
export function dateRange(from, to) {
  const out = [];
  const d = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (d <= end) {
    out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function daysBefore(to, n) {
  const d = new Date(`${to}T12:00:00`);
  d.setDate(d.getDate() - (n - 1));
  return isoDate(d);
}

/**
 * Summen je Tag.
 * Ergebnis: Map(date → { total, missing, count })
 *   missing[k] = Einträge ohne Wert für k, count = Anzahl Einträge
 */
export function dailyTotals(entries) {
  const days = new Map();
  for (const e of entries) {
    let d = days.get(e.date);
    if (!d) {
      d = { total: {}, missing: {}, count: 0 };
      for (const n of NUTRIENTS) {
        d.total[n.key] = 0;
        d.missing[n.key] = 0;
      }
      days.set(e.date, d);
    }
    d.count += 1;
    const v = scaleNutrients(e.per100, e.grams);
    for (const n of NUTRIENTS) {
      if (typeof v[n.key] === 'number') d.total[n.key] += v[n.key];
      else d.missing[n.key] += 1;
    }
  }
  return days;
}

/**
 * Durchschnitt pro Tag über die Tage mit Einträgen.
 * noData[k] = true, wenn kein einziger Eintrag im Zeitraum einen Wert für k hatte.
 */
export function averages(days) {
  const avg = {};
  const noData = {};
  const missing = {};
  const list = [...days.values()];
  for (const n of NUTRIENTS) {
    const sum = list.reduce((s, d) => s + d.total[n.key], 0);
    avg[n.key] = list.length ? sum / list.length : 0;
    const miss = list.reduce((s, d) => s + d.missing[n.key], 0);
    const count = list.reduce((s, d) => s + d.count, 0);
    missing[n.key] = miss;
    noData[n.key] = count > 0 && miss === count;
  }
  return { avg, noData, missing, dayCount: list.length };
}

/**
 * Fasst Tage zu Wochen oder Monaten zusammen (Durchschnitt pro erfasstem Tag).
 * Ergebnis: [{ key, label, from, to, value, days }]
 */
export function bucketize(dates, days, nutrientKey, unit) {
  const buckets = new Map();
  for (const date of dates) {
    const d = new Date(`${date}T12:00:00`);
    let key;
    let label;
    if (unit === 'day') {
      key = date;
      label = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    } else if (unit === 'week') {
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      key = isoDate(monday);
      label = `ab ${monday.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}`;
    } else {
      key = date.slice(0, 7);
      label = d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
    }
    let b = buckets.get(key);
    if (!b) {
      b = { key, label, from: date, to: date, sum: 0, days: 0 };
      buckets.set(key, b);
    }
    b.to = date;
    const day = days.get(date);
    if (day) {
      b.sum += day.total[nutrientKey];
      b.days += 1;
    }
  }
  return [...buckets.values()].map((b) => ({ ...b, value: b.days ? b.sum / b.days : null }));
}

/** Welche Lebensmittel liefern im Zeitraum am meisten von einem Nährstoff? */
export function topContributors(entries, nutrientKey, limit = 10) {
  const byFood = new Map();
  let total = 0;
  for (const e of entries) {
    const v = e.per100?.[nutrientKey];
    if (typeof v !== 'number') continue;
    const amount = (v * e.grams) / 100;
    total += amount;
    const id = e.foodId || e.name;
    const f = byFood.get(id) || { name: e.name, amount: 0, times: 0 };
    f.amount += amount;
    f.times += 1;
    byFood.set(id, f);
  }
  const list = [...byFood.values()].sort((a, b) => b.amount - a.amount);
  return { total, list: list.slice(0, limit).map((f) => ({ ...f, share: total ? f.amount / total : 0 })) };
}

/** Anteil der Energie aus Eiweiß, Fett, Kohlenhydraten, Alkohol (Atwater-Faktoren). */
export function energySplit(avg) {
  const parts = {
    protein: (avg.protein || 0) * 4,
    fat: (avg.fat || 0) * 9,
    carbs: (avg.carbs || 0) * 4,
    alcohol: (avg.alcohol || 0) * 7,
  };
  const sum = Object.values(parts).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sum ? v / sum : 0]));
}

/** Tageswerte als CSV (Semikolon, deutsches Komma – öffnet direkt in Excel/Numbers). */
export function toCSV(dates, days) {
  const head = ['Datum', 'Einträge', ...NUTRIENTS.map((n) => `${n.label} (${n.unit})`)];
  const rows = [head];
  for (const date of dates) {
    const d = days.get(date);
    if (!d) continue;
    rows.push([date, d.count, ...NUTRIENTS.map((n) => (d.missing[n.key] === d.count ? '' : d.total[n.key].toFixed(n.decimals + 1).replace('.', ',')))]);
  }
  return '﻿' + rows.map((r) => r.map((c) => (/[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(';')).join('\n');
}
