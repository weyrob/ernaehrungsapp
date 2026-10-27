// Eigenes Lebensmittel anlegen oder bearbeiten (Werte pro 100 g, wie auf der Verpackung).
import { h, openSheet, toast, confirmDialog } from './dom.js';
import * as foods from '../data/foods.js';
import * as repo from '../data/repo.js';
import { NUTRIENTS, NUTRIENT_GROUPS } from '../core/nutrients.js';

// Diese Felder stehen auf fast jeder Verpackung und werden immer gezeigt
const LABEL_FIELDS = ['energy', 'fat', 'satfat', 'carbs', 'sugar', 'fiber', 'protein', 'salt'];

export function openFoodEditor({ initial = {}, onSaved } = {}) {
  const isEdit = !!initial.id;
  const s = openSheet({ title: isEdit ? 'Lebensmittel bearbeiten' : 'Neues Lebensmittel', full: true });
  const per100 = { ...(initial.per100 || {}) };

  const field = (labelText, input) => h('label', { class: 'field' }, h('span', {}, labelText), input);
  const name = h('input', { type: 'text', value: initial.name || '', placeholder: 'z. B. Müsli Nuss-Mix', required: true });
  const brand = h('input', { type: 'text', value: initial.brand || '', placeholder: 'optional' });
  const barcode = h('input', { type: 'text', inputmode: 'numeric', value: initial.barcode || '', placeholder: 'optional' });

  const inputs = {};
  const numInput = (n) => {
    const el = h('input', {
      type: 'number',
      inputmode: 'decimal',
      step: 'any',
      min: '0',
      value: per100[n.key] != null ? String(Math.round(per100[n.key] * 1000) / 1000) : '',
      placeholder: 'unbekannt',
    });
    inputs[n.key] = el;
    return h('label', { class: 'field inline' }, h('span', {}, `${n.label} (${n.unit})`), el);
  };

  const main = NUTRIENTS.filter((n) => LABEL_FIELDS.includes(n.key));
  const rest = NUTRIENT_GROUPS.map((g) => ({
    g,
    list: NUTRIENTS.filter((n) => n.group === g.id && !LABEL_FIELDS.includes(n.key)),
  })).filter((x) => x.list.length);

  const more = h(
    'details',
    { class: 'more' },
    h('summary', {}, 'Weitere Nährstoffe (Vitamine, Mineralstoffe …)'),
    rest.map(({ g, list }) => [h('h4', {}, g.label), list.map(numInput)])
  );

  // Portionen
  const portions = [...(initial.portions || [])];
  const portionList = h('div', { class: 'portion-list' });
  const renderPortions = () => {
    portionList.replaceChildren(
      ...portions.map((p, i) =>
        h(
          'div',
          { class: 'portion-chip' },
          `${p.label} = ${p.grams} g`,
          h('button', { class: 'link', 'aria-label': 'entfernen', onclick: () => (portions.splice(i, 1), renderPortions()) }, '✕')
        )
      )
    );
  };
  const pLabel = h('input', { type: 'text', placeholder: '1 Riegel' });
  const pGrams = h('input', { type: 'number', inputmode: 'decimal', placeholder: 'g', class: 'qty' });
  const addPortion = h(
    'button',
    {
      class: 'btn',
      onclick: () => {
        const g = Number(String(pGrams.value).replace(',', '.'));
        if (!pLabel.value.trim() || !(g > 0)) return toast('Portion: Name und Gramm angeben.');
        portions.push({ label: pLabel.value.trim(), grams: g });
        pLabel.value = '';
        pGrams.value = '';
        renderPortions();
      },
    },
    'Hinzufügen'
  );
  renderPortions();

  const save = h(
    'button',
    {
      class: 'btn primary wide',
      onclick: async () => {
        if (!name.value.trim()) return toast('Bitte einen Namen eingeben.');
        const values = {};
        for (const [k, el] of Object.entries(inputs)) {
          const v = String(el.value).replace(',', '.').trim();
          if (v !== '' && Number.isFinite(Number(v))) values[k] = Number(v);
        }
        if (values.energy == null) return toast('Bitte mindestens die Kalorien angeben.');
        if (values.sodium == null && values.salt != null) values.sodium = (values.salt / 2.5) * 1000;
        const food = await foods.saveOwnFood({
          ...initial,
          name: name.value.trim(),
          brand: brand.value.trim() || null,
          barcode: barcode.value.trim() || null,
          per100: values,
          portions,
          hasNutrition: true,
        });
        toast('Gespeichert');
        s.close();
        onSaved?.(food);
      },
    },
    'Speichern'
  );

  const del =
    isEdit &&
    h(
      'button',
      {
        class: 'btn danger wide',
        onclick: async () => {
          if (!(await confirmDialog(`„${initial.name}“ löschen? Bereits eingetragene Mahlzeiten bleiben erhalten.`, 'Löschen'))) return;
          await repo.deleteFood(initial.id);
          s.close();
          onSaved?.(null);
        },
      },
      'Löschen'
    );

  s.body.append(
    field('Name', name),
    field('Marke', brand),
    field('Barcode', barcode),
    h('h3', {}, 'Nährwerte pro 100 g'),
    h('p', { class: 'hint' }, 'Wie auf der Verpackung. Leere Felder gelten als „unbekannt“, nicht als 0.'),
    main.map(numInput),
    more,
    h('h3', {}, 'Portionen'),
    portionList,
    h('div', { class: 'portion-form' }, pLabel, pGrams, addPortion),
    save,
    del || null
  );
  setTimeout(() => (initial.name ? inputs.energy : name).focus(), 250);
}
