// Soll-Einordnung: alle Nährstoffe des Tages mit Balken – nichts versteckt.
import { h, clear, formatDateLong, shiftDate } from './dom.js';
import * as repo from '../data/repo.js';
import { NUTRIENTS, NUTRIENT_GROUPS } from '../core/nutrients.js';
import { evaluate } from '../core/targets.js';
import { nutrientBar } from './bars.js';
import { dayTotals } from './diary.js';

export async function renderTargets(root, app) {
  const date = app.date;
  const entries = await repo.entriesForDate(date);
  const { total, missing } = dayTotals(entries);
  const t = app.targets;

  const noData = (key) => entries.length > 0 && missing[key] === entries.length;
  const counts = { low: 0, ok: 0, high: 0 };
  for (const n of NUTRIENTS) {
    if (noData(n.key)) continue;
    const s = evaluate(total[n.key], t[n.key]).status;
    if (s in counts) counts[s] += 1;
  }

  const head = h(
    'div',
    { class: 'date-nav' },
    h('button', { class: 'icon', 'aria-label': 'Vortag', onclick: () => app.setDate(shiftDate(date, -1)) }, '‹'),
    h('div', { class: 'date-label' }, h('span', {}, date === repo.todayISO() ? 'Heute' : formatDateLong(date))),
    h('button', { class: 'icon', 'aria-label': 'Folgetag', onclick: () => app.setDate(shiftDate(date, 1)) }, '›')
  );

  const overview = h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'status-counts' },
      h('span', { class: 'pill s-low' }, `${counts.low} zu wenig`),
      h('span', { class: 'pill s-ok' }, `${counts.ok} im Bereich`),
      h('span', { class: 'pill s-high' }, `${counts.high} zu viel`)
    ),
    h(
      'p',
      { class: 'hint' },
      entries.length
        ? `${entries.length} Einträge. Grundlage: DGE-Referenzwerte für dein Profil und deine eigenen Makro-Ziele. Antippen eines Balkens zeigt die Quelle des Sollwerts.`
        : 'Für diesen Tag ist noch nichts eingetragen.'
    )
  );

  const groups = NUTRIENT_GROUPS.map((g) =>
    h(
      'section',
      { class: 'card' },
      h('h2', {}, g.label),
      NUTRIENTS.filter((n) => n.group === g.id).map((n) => {
        const bar = nutrientBar({ key: n.key, value: total[n.key], target: t[n.key], missing: entries.length ? missing[n.key] : 0, noData: noData(n.key) });
        if (t[n.key]?.source) {
          const src = h('div', { class: 'nbar-source', hidden: true }, `Sollwert: ${t[n.key].source}`);
          bar.append(src);
          bar.addEventListener('click', () => (src.hidden = !src.hidden));
        }
        return bar;
      })
    )
  );

  clear(root).append(head, overview, ...groups);
}
