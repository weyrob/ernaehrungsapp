// Balken "zu wenig / im Bereich / zu viel" für einen Nährstoff.
import { h } from './dom.js';
import { NUTRIENT_BY_KEY, formatNumber } from '../core/nutrients.js';
import { evaluate, STATUS_LABEL } from '../core/targets.js';

/**
 * @param key      Nährstoff-Schlüssel
 * @param value    Ist-Wert des Tages
 * @param target   Soll-Wert ({min, max, ul, source}) oder undefined
 * @param missing  Anzahl Einträge ohne Wert für diesen Nährstoff
 * @param compact  kleine Darstellung (für die Übersicht im Tagebuch)
 */
export function nutrientBar({ key, value, target, missing = 0, compact = false, label, noData = false }) {
  const n = NUTRIENT_BY_KEY[key];
  // noData: kein einziger Eintrag hat einen Wert → keine Bewertung möglich
  const status = noData ? 'none' : evaluate(value, target).status;
  const min = target?.min ?? null;
  const upper = target?.max ?? target?.ul ?? null;

  // Skala: bis zur Obergrenze + Luft, oder 1,5 × Mindestwert
  const scaleMax = Math.max(value, upper ? upper * 1.2 : 0, min ? min * 1.5 : 0, 1);
  const pct = (x) => `${Math.min(100, (x / scaleMax) * 100)}%`;

  let refText = '';
  if (min != null && upper != null) refText = `${formatNumber(min, n.decimals)}–${formatNumber(upper, n.decimals)}`;
  else if (min != null) refText = `mind. ${formatNumber(min, n.decimals)}`;
  else if (upper != null) refText = `max. ${formatNumber(upper, n.decimals)}`;

  const track = h(
    'div',
    { class: 'bar-track' },
    min != null && h('div', { class: 'zone zone-low', style: { left: 0, width: pct(min) } }),
    upper != null && h('div', { class: 'zone zone-high', style: { left: pct(upper), right: 0 } }),
    h('div', { class: `bar-fill s-${status}`, style: { width: pct(value) } }),
    min != null && h('div', { class: 'marker', style: { left: pct(min) } }),
    upper != null && h('div', { class: 'marker', style: { left: pct(upper) } })
  );

  const title = target?.source ? `Sollwert: ${target.source}` : '';
  return h(
    'div',
    { class: `nbar${compact ? ' compact' : ''}`, title },
    h(
      'div',
      { class: 'nbar-head' },
      h('span', { class: 'nbar-label' }, label || n.label),
      h(
        'span',
        { class: 'nbar-value' },
        `${formatNumber(value, n.decimals)}${refText ? ` / ${refText}` : ''} ${n.unit}`
      ),
      noData ? h('span', { class: 'pill s-nodata' }, 'keine Daten') : target && h('span', { class: `pill s-${status}` }, STATUS_LABEL[status])
    ),
    target ? track : null,
    missing > 0 &&
      !compact &&
      !noData &&
      h('div', { class: 'nbar-note' }, `${missing} ${missing === 1 ? 'Eintrag' : 'Einträge'} ohne Angabe – Wert evtl. höher`)
  );
}
