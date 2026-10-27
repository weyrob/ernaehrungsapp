// Statistik: Durchschnitte, Verlauf, Übersichtstabelle, Hauptlieferanten, Makro-Verteilung.
// Alle Werte offen sichtbar, keine Wertungen außer "zu wenig / im Bereich / zu viel".
import { h, clear, toast } from './dom.js';
import * as repo from '../data/repo.js';
import { NUTRIENTS, NUTRIENT_GROUPS, NUTRIENT_BY_KEY, formatNumber } from '../core/nutrients.js';
import { evaluate, STATUS_LABEL } from '../core/targets.js';
import { dateRange, daysBefore, dailyTotals, averages, bucketize, topContributors, energySplit, toCSV } from '../core/stats.js';
import { nutrientBar } from './bars.js';
import { saveFile } from '../platform/files.js';

const SVG = 'http://www.w3.org/2000/svg';
const PERIODS = [
  { days: 7, label: '7 Tage', unit: 'day' },
  { days: 30, label: '30 Tage', unit: 'day' },
  { days: 91, label: '3 Monate', unit: 'week' },
  { days: 365, label: '12 Monate', unit: 'month' },
];
const UNIT_NAME = { day: 'Tag', week: 'Woche (Ø pro Tag)', month: 'Monat (Ø pro Tag)' };

// Zustand der Ansicht (bleibt beim Tab-Wechsel erhalten)
const view = { period: 1, chartKey: 'energy', topKey: 'protein', group: 'macro' };

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  children.forEach((c) => c && el.append(c));
  return el;
}

function nutrientSelect(value, onChange, onlyKeys) {
  const sel = h(
    'select',
    { class: 'compact-select' },
    NUTRIENT_GROUPS.map((g) =>
      h(
        'optgroup',
        { label: g.label },
        NUTRIENTS.filter((n) => n.group === g.id && (!onlyKeys || onlyKeys.includes(n.key))).map((n) => h('option', { value: n.key }, n.label))
      )
    )
  );
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

/** Säulendiagramm für einen Nährstoff mit Sollbereich im Hintergrund. */
function trendChart(buckets, key, target, width) {
  const n = NUTRIENT_BY_KEY[key];
  const H = 180;
  const padL = 44;
  const padB = 22;
  const padT = 8;
  const W = Math.max(260, width);
  const plotW = W - padL - 4;
  const plotH = H - padB - padT;
  const values = buckets.map((b) => b.value ?? 0);
  const min = target?.min ?? null;
  const upper = target?.max ?? target?.ul ?? null;
  const top = Math.max(...values, upper && upper < Math.max(...values, min || 0) * 3 ? upper : 0, min ? min * 1.2 : 0, 1) * 1.08;
  const y = (v) => padT + plotH - (v / top) * plotH;
  const slot = plotW / buckets.length;
  const barW = Math.min(24, Math.max(2, slot - 2));

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Verlauf ${n.label}` });

  // Sollbereich
  if (min != null && upper != null && upper <= top) svg.append(s('rect', { x: padL, y: y(upper), width: plotW, height: y(min) - y(upper), class: 'target-band' }));
  else if (min != null) svg.append(s('rect', { x: padL, y: padT, width: plotW, height: y(min) - padT, class: 'target-band' }));
  else if (upper != null && upper <= top) svg.append(s('rect', { x: padL, y: y(upper), width: plotW, height: padT + plotH - y(upper), class: 'target-band' }));

  // Hilfslinien + Achsenbeschriftung
  for (const f of [0, 0.5, 1]) {
    const v = (top / 1.08) * f;
    svg.append(s('line', { x1: padL, x2: W - 4, y1: y(v), y2: y(v), class: 'grid' }));
    const t = s('text', { x: padL - 6, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' });
    t.textContent = formatNumber(v, v < 10 ? 1 : 0);
    svg.append(t);
  }
  for (const v of [min, upper]) {
    if (v != null && v <= top) svg.append(s('line', { x1: padL, x2: W - 4, y1: y(v), y2: y(v), class: 'target-line' }));
  }

  const readout = h('div', { class: 'readout' }, 'Antippen für Details');
  const marks = [];
  buckets.forEach((b, i) => {
    const x = padL + i * slot + (slot - barW) / 2;
    const v = b.value;
    const st = v == null ? 'none' : evaluate(v, target).status;
    if (v != null && v > 0) {
      const yy = y(v);
      const hgt = padT + plotH - yy;
      const r = Math.min(4, barW / 2, hgt);
      // oben abgerundet, unten gerade
      const d = `M${x},${padT + plotH} V${yy + r} Q${x},${yy} ${x + r},${yy} H${x + barW - r} Q${x + barW},${yy} ${x + barW},${yy + r} V${padT + plotH} Z`;
      const bar = s('path', { d, class: `bar s-${st}` });
      marks.push(bar);
      svg.append(bar);
    }
    // großzügige Trefferfläche
    const hit = s('rect', { x: padL + i * slot, y: padT, width: slot, height: plotH, class: 'hit' });
    const show = () => {
      marks.forEach((m) => m.classList.remove('active'));
      svg.querySelectorAll('.hit.active').forEach((m) => m.classList.remove('active'));
      hit.classList.add('active');
      const when = b.from === b.to ? new Date(`${b.from}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) : b.label;
      readout.textContent =
        v == null
          ? `${when}: nichts eingetragen`
          : `${when}: ${formatNumber(v, n.decimals)} ${n.unit}${b.days > 1 ? ` (Ø aus ${b.days} Tagen)` : ''}${target ? ` · ${STATUS_LABEL[st]}` : ''}`;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('click', show);
    svg.append(hit);
  });

  // x-Beschriftung: höchstens ~6 Labels
  const every = Math.ceil(buckets.length / 6);
  buckets.forEach((b, i) => {
    if (i % every !== 0 && i !== buckets.length - 1) return;
    if (i !== buckets.length - 1 && buckets.length - 1 - i < every) return;
    const t = s('text', { x: padL + i * slot + slot / 2, y: H - 6, class: 'axis', 'text-anchor': 'middle' });
    t.textContent = b.label;
    svg.append(t);
  });

  return h('div', { class: 'chart-wrap' }, readout, svg);
}

/** Übersicht: Nährstoffe × Tage/Wochen/Monate, eingefärbt nach Status. */
function heatGrid(dates, days, unit, targets, noData) {
  const keys = NUTRIENTS.filter((n) => targets[n.key] && !noData[n.key]).map((n) => n.key);
  const cols = bucketize(dates, days, 'energy', unit);
  const readout = h('div', { class: 'readout' }, 'Antippen für Details');
  const table = h('div', { class: 'heat', style: { gridTemplateColumns: `minmax(92px, 1.4fr) repeat(${cols.length}, minmax(6px, 1fr))` } });
  for (const key of keys) {
    const n = NUTRIENT_BY_KEY[key];
    const series = bucketize(dates, days, key, unit);
    table.append(h('div', { class: 'heat-label' }, n.label));
    series.forEach((b) => {
      const st = b.value == null ? 'empty' : evaluate(b.value, targets[key]).status;
      table.append(
        h('button', {
          class: `heat-cell s-${st}`,
          'aria-label': `${n.label} ${b.label}`,
          onclick: () => {
            readout.textContent = b.value == null ? `${n.label}, ${b.label}: nichts eingetragen` : `${n.label}, ${b.label}: ${formatNumber(b.value, n.decimals)} ${n.unit} · ${STATUS_LABEL[st]}`;
          },
        })
      );
    });
  }
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'legend' },
      h('span', { class: 'chip s-low' }, 'zu wenig'),
      h('span', { class: 'chip s-ok' }, 'im Bereich'),
      h('span', { class: 'chip s-high' }, 'zu viel'),
      h('span', { class: 'chip s-empty' }, 'nichts eingetragen')
    ),
    readout,
    h('div', { class: 'heat-scroll' }, table)
  );
}

export async function renderStats(root, app) {
  const period = PERIODS[view.period];
  const to = repo.todayISO();
  const from = daysBefore(to, period.days);
  const dates = dateRange(from, to);
  const entries = await repo.entriesBetween(from, to);
  const days = dailyTotals(entries);
  const { avg, noData, dayCount } = averages(days);
  const t = app.targets;
  const width = (root.clientWidth || 360) - 28;
  const rerender = () => renderStats(root, app);

  const periodSwitch = h(
    'div',
    { class: 'segmented' },
    PERIODS.map((p, i) =>
      h(
        'button',
        {
          class: i === view.period ? 'active' : '',
          onclick: () => {
            view.period = i;
            rerender();
          },
        },
        p.label
      )
    )
  );

  if (!dayCount) {
    clear(root).append(periodSwitch, h('section', { class: 'card' }, h('p', { class: 'hint' }, 'In diesem Zeitraum ist noch nichts eingetragen.')));
    return;
  }

  // --- Durchschnitt ---
  const groupSwitch = h(
    'select',
    { class: 'compact-select' },
    NUTRIENT_GROUPS.map((g) => h('option', { value: g.id }, g.label))
  );
  groupSwitch.value = view.group;
  groupSwitch.addEventListener('change', () => {
    view.group = groupSwitch.value;
    rerender();
  });
  const avgCard = h(
    'section',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Durchschnitt pro Tag'), groupSwitch),
    h('p', { class: 'hint small' }, `Aus ${dayCount} ${dayCount === 1 ? 'Tag' : 'Tagen'} mit Einträgen (Tage ohne Einträge zählen nicht mit).`),
    NUTRIENTS.filter((n) => n.group === view.group).map((n) => nutrientBar({ key: n.key, value: avg[n.key], target: t[n.key], noData: noData[n.key] }))
  );

  // --- Verlauf ---
  const buckets = bucketize(dates, days, view.chartKey, period.unit);
  const trendCard = h(
    'section',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Verlauf'), nutrientSelect(view.chartKey, (k) => ((view.chartKey = k), rerender()))),
    h('p', { class: 'hint small' }, `Je ${UNIT_NAME[period.unit]}. Grüner Hintergrund = Sollbereich.`),
    trendChart(buckets, view.chartKey, t[view.chartKey], width),
    h(
      'div',
      { class: 'legend' },
      h('span', { class: 'chip s-low' }, 'zu wenig'),
      h('span', { class: 'chip s-ok' }, 'im Bereich'),
      h('span', { class: 'chip s-high' }, 'zu viel')
    )
  );

  // --- Übersichtstabelle ---
  const gridCard = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Übersicht aller Nährstoffe'),
    h('p', { class: 'hint small' }, `Jede Spalte ist ein${period.unit === 'day' ? ' Tag' : period.unit === 'week' ? 'e Woche' : ' Monat'}. So siehst du, was dauerhaft fehlt.`),
    heatGrid(dates, days, period.unit, t, noData)
  );

  // --- Makro-Verteilung ---
  const split = energySplit(avg);
  const parts = [
    ['protein', 'Eiweiß', 'm-1'],
    ['fat', 'Fett', 'm-2'],
    ['carbs', 'Kohlenhydrate', 'm-3'],
    ['alcohol', 'Alkohol', 'm-4'],
  ].filter(([k]) => split[k] > 0.001);
  const macroCard = h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Energie-Verteilung'),
    h('p', { class: 'hint small' }, 'Anteil an den Kalorien im Durchschnitt. DGE-Orientierung: Fett 30–35 %, Kohlenhydrate über 50 %, Eiweiß etwa 15 %.'),
    h(
      'div',
      { class: 'stack', role: 'img', 'aria-label': parts.map(([, l]) => `${l} ${formatNumber(split[parts.find((p) => p[1] === l)[0]] * 100, 0)} %`).join(', ') },
      parts.map(([k, , cls]) => h('div', { class: `stack-seg ${cls}`, style: { width: `${split[k] * 100}%` } }))
    ),
    h(
      'div',
      { class: 'legend' },
      parts.map(([k, label, cls]) => h('span', { class: 'legend-item' }, h('span', { class: `dot ${cls}` }), `${label} ${formatNumber(split[k] * 100, 0)} %`))
    )
  );

  // --- Hauptlieferanten ---
  const top = topContributors(entries, view.topKey);
  const tn = NUTRIENT_BY_KEY[view.topKey];
  const topCard = h(
    'section',
    { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Hauptlieferanten'), nutrientSelect(view.topKey, (k) => ((view.topKey = k), rerender()))),
    top.list.length
      ? h(
          'div',
          { class: 'top-list' },
          top.list.map((f) =>
            h(
              'div',
              { class: 'top-row' },
              h('div', { class: 'top-name' }, f.name, h('span', { class: 'muted small' }, ` · ${f.times}×`)),
              h('div', { class: 'top-bar' }, h('div', { class: 'top-fill', style: { width: `${f.share * 100}%` } })),
              h('div', { class: 'top-val' }, `${formatNumber(f.amount / dayCount, tn.decimals)} ${tn.unit}/Tag · ${formatNumber(f.share * 100, 0)} %`)
            )
          )
        )
      : h('p', { class: 'hint' }, 'Keine Werte für diesen Nährstoff im Zeitraum.')
  );

  const csvBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        await saveFile(`ernaehrung-${from}-bis-${to}.csv`, toCSV(dates, days), 'text/csv');
        toast('CSV erstellt');
      },
    },
    'Tageswerte als CSV exportieren'
  );

  clear(root).append(periodSwitch, avgCard, trendCard, gridCard, macroCard, topCard, h('div', { class: 'pad center' }, csvBtn), h('div', { class: 'fab-space' }));
}
