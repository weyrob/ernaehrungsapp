// Tagebuch: ein Tag mit Mahlzeiten, Tageszusammenfassung oben.
import { h, clear, toast, formatDateLong, shiftDate } from './dom.js';
import * as repo from '../data/repo.js';
import * as foods from '../data/foods.js';
import { scaleNutrients, sumNutrients, formatNumber } from '../core/nutrients.js';
import { nutrientBar } from './bars.js';
import { openAddFood, openAmountSheet } from './add-food.js';

export function dayTotals(entries) {
  return sumNutrients(entries.map((e) => scaleNutrients(e.per100, e.grams)));
}

export async function renderDiary(root, app) {
  const date = app.date;
  const entries = await repo.entriesForDate(date);
  const { total, missing } = dayTotals(entries);
  const t = app.targets;
  const rerender = () => app.render();

  const today = repo.todayISO();
  const dateLabel = date === today ? 'Heute' : date === shiftDate(today, -1) ? 'Gestern' : formatDateLong(date);

  const nav = h(
    'div',
    { class: 'date-nav' },
    h('button', { class: 'icon', 'aria-label': 'Vortag', onclick: () => app.setDate(shiftDate(date, -1)) }, '‹'),
    h(
      'label',
      { class: 'date-label' },
      h('span', {}, dateLabel),
      h('input', { type: 'date', value: date, onchange: (e) => e.target.value && app.setDate(e.target.value) })
    ),
    h('button', { class: 'icon', 'aria-label': 'Folgetag', onclick: () => app.setDate(shiftDate(date, 1)) }, '›')
  );

  const summary = h(
    'section',
    { class: 'card summary' },
    nutrientBar({ key: 'energy', value: total.energy, target: t.energy, compact: true }),
    nutrientBar({ key: 'protein', value: total.protein, target: t.protein, compact: true }),
    nutrientBar({ key: 'fat', value: total.fat, target: t.fat, compact: true }),
    nutrientBar({ key: 'carbs', value: total.carbs, target: t.carbs, compact: true }),
    nutrientBar({ key: 'fiber', value: total.fiber, target: t.fiber, compact: true }),
    h('button', { class: 'link', onclick: () => app.showTab('targets') }, 'Alle Nährstoffe ansehen ›')
  );

  const meals = repo.MEALS.map((m) => {
    const list = entries.filter((e) => e.meal === m.id);
    const kcal = list.reduce((s, e) => s + ((e.per100.energy ?? 0) * e.grams) / 100, 0);
    return h(
      'section',
      { class: 'card meal' },
      h(
        'header',
        { class: 'meal-head' },
        h('h2', {}, m.label),
        h('span', { class: 'muted' }, list.length ? `${formatNumber(kcal, 0)} kcal` : ''),
        h('button', { class: 'add-btn', 'aria-label': `${m.label} eintragen`, onclick: () => openAddFood({ date, meal: m.id, onChange: rerender }) }, '+')
      ),
      list.map((e) => entryRow(e, app)),
      !list.length && h('button', { class: 'link small', onclick: () => copyFromYesterday(date, m, rerender) }, 'Wie gestern übernehmen')
    );
  });

  clear(root).append(nav, summary, ...meals, h('div', { class: 'fab-space' }));
  if (missing.energy > 0) summary.append(h('p', { class: 'hint' }, 'Einige Einträge haben keine Kalorienangabe.'));
}

function entryRow(e, app) {
  const kcal = ((e.per100.energy ?? 0) * e.grams) / 100;
  return h(
    'button',
    { class: 'entry', onclick: () => editEntry(e, app) },
    h('div', { class: 'entry-main' }, h('div', { class: 'item-title' }, e.name), h('div', { class: 'item-sub' }, e.amountLabel ? `${e.amountLabel} · ${formatNumber(e.grams, 0)} g` : `${formatNumber(e.grams, 0)} g`)),
    h('div', { class: 'entry-kcal' }, `${formatNumber(kcal, 0)} kcal`)
  );
}

async function editEntry(e, app) {
  // Aktuelle Daten des Lebensmittels für Portionen holen; Nährwerte bleiben die des Eintrags
  let food = null;
  try {
    food = await foods.getFood(e.foodId);
  } catch {
    /* Datenbank evtl. offline */
  }
  const f = { id: e.foodId, name: e.name, brand: e.brand, source: e.source, per100: e.per100, portions: food?.portions || [] };
  const own = await repo.getOwnPortions(e.foodId);

  const mealSelect = h(
    'select',
    {},
    repo.MEALS.map((m) => h('option', { value: m.id, selected: m.id === e.meal }, m.label))
  );
  const del = h(
    'button',
    {
      class: 'btn danger wide',
      onclick: async () => {
        await repo.deleteEntry(e.id);
        sheet.close();
        app.render();
        toast(`${e.name} gelöscht`, {
          label: 'Rückgängig',
          run: async () => {
            await repo.updateEntry(e);
            app.render();
          },
        });
      },
    },
    'Eintrag löschen'
  );

  const sheet = openAmountSheet({
    food: f,
    ownPortions: own,
    initialGrams: e.grams,
    initialLabel: e.amountLabel,
    title: 'Eintrag ändern',
    submitLabel: 'Speichern',
    extra: h('div', {}, h('label', { class: 'field' }, h('span', {}, 'Mahlzeit'), mealSelect), del),
    onSubmit: async (grams, label) => {
      await repo.updateEntry({ ...e, grams, amountLabel: label, meal: mealSelect.value });
      app.render();
    },
  });
}

async function copyFromYesterday(date, meal, rerender) {
  const prev = (await repo.entriesForDate(shiftDate(date, -1))).filter((e) => e.meal === meal.id);
  if (!prev.length) return toast(`Gestern gab es kein ${meal.label}.`);
  for (const e of prev) {
    await repo.addEntry({ date, meal: meal.id, food: { id: e.foodId, name: e.name, brand: e.brand, source: e.source, per100: e.per100 }, grams: e.grams, amountLabel: e.amountLabel });
  }
  toast(`${prev.length} ${prev.length === 1 ? 'Eintrag' : 'Einträge'} übernommen`);
  rerender();
}
