// Lebensmittel suchen, scannen und eintragen – der wichtigste, schnellste Weg in der App.
import { h, clear, openSheet, toast } from './dom.js';
import * as repo from '../data/repo.js';
import * as foods from '../data/foods.js';
import { portionsFor } from '../core/portions.js';
import { NUTRIENTS, NUTRIENT_GROUPS, scaleNutrients, formatNumber, formatNutrient } from '../core/nutrients.js';
import { cameraAvailable, scanBarcode } from '../platform/scanner.js';
import { openFoodEditor } from './food-editor.js';

function sourceLabel(food) {
  if (food.source === 'bls') return food.group || 'BLS';
  if (food.source === 'off') return food.brand ? `${food.brand} · Barcode` : 'Barcode-Produkt';
  if (food.source === 'recipe') return 'Rezept';
  return food.brand ? `${food.brand} · eigenes` : 'eigenes Lebensmittel';
}

function kcalPer100(food) {
  const e = food.per100?.energy;
  return e == null ? '' : `${formatNumber(e, 0)} kcal/100 g`;
}

/** "1 × 1 Stück" → "1 Stück", "2 × 1 EL" → "2 EL", sonst "1,5 × 1 Portion (30 g)" */
export function portionLabel(q, label) {
  if (q === 1) return label;
  if (label.startsWith('1 ')) return `${formatNumber(q, 2)} ${label.slice(2)}`;
  return `${formatNumber(q, 2)} × ${label}`;
}

function amountText(grams, label) {
  return label ? `${label}` : `${formatNumber(grams, 0)} g`;
}

/**
 * Öffnet die Suche zum Eintragen.
 * @param opts.date   Tag (YYYY-MM-DD)
 * @param opts.meal   vorgewählte Mahlzeit
 * @param opts.onChange  wird nach jedem Eintrag aufgerufen (Tagebuch neu zeichnen)
 */
export function openAddFood({ date, meal, onChange }) {
  let currentMeal = meal || repo.mealForNow();
  let usage = [];
  const sheet = openSheet({ title: 'Eintragen', full: true });

  const mealSwitch = h(
    'div',
    { class: 'segmented' },
    repo.MEALS.map((m) =>
      h(
        'button',
        {
          class: m.id === currentMeal ? 'active' : '',
          onclick: (e) => {
            currentMeal = m.id;
            mealSwitch.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
          },
        },
        m.label
      )
    )
  );

  const input = h('input', {
    type: 'search',
    class: 'search',
    placeholder: 'Lebensmittel suchen …',
    autocomplete: 'off',
    autocapitalize: 'off',
    enterkeyhint: 'search',
  });
  const list = h('div', { class: 'list' });

  const scanBtn = h('button', { class: 'btn icon-btn', title: 'Barcode scannen', 'aria-label': 'Barcode scannen', onclick: () => openScanner() }, '▥ Scan');
  const newBtn = h(
    'button',
    {
      class: 'btn',
      onclick: () =>
        openFoodEditor({
          initial: { name: input.value.trim() },
          onSaved: (food) => openAmount(food),
        }),
    },
    '+ Neues Lebensmittel'
  );

  sheet.body.append(mealSwitch, h('div', { class: 'search-row' }, input, scanBtn), list, h('div', { class: 'center pad' }, newBtn));

  const added = async (food, grams, amountLabel) => {
    const entry = await repo.addEntry({ date, meal: currentMeal, food, grams, amountLabel });
    onChange?.();
    usage = await repo.getUsage();
    toast(`${food.name} eingetragen`, {
      label: 'Rückgängig',
      run: async () => {
        await repo.deleteEntry(entry.id);
        onChange?.();
      },
    });
  };

  function foodRow(food, u) {
    return h(
      'div',
      { class: 'item' },
      h(
        'button',
        { class: 'item-main', onclick: () => openAmount(food, u) },
        h('div', { class: 'item-title' }, food.name),
        h('div', { class: 'item-sub' }, [sourceLabel(food), kcalPer100(food)].filter(Boolean).join(' · '))
      ),
      u &&
        h(
          'button',
          {
            class: 'quick-add',
            title: `${amountText(u.lastGrams, u.lastAmountLabel)} direkt eintragen`,
            onclick: () => added(food, u.lastGrams, u.lastAmountLabel),
          },
          h('span', { class: 'qa-plus' }, '+'),
          h('span', { class: 'qa-amount' }, amountText(u.lastGrams, u.lastAmountLabel))
        )
    );
  }

  async function showRecent() {
    usage = await repo.getUsage();
    clear(list);
    const ranked = repo.rankUsage(usage).slice(0, 30);
    if (!ranked.length) {
      list.append(
        h(
          'p',
          { class: 'hint' },
          'Tippe oben einen Namen ein, z. B. „Apfel“ oder „Haferflocken“, oder scanne einen Barcode. ',
          'Was du öfter isst, erscheint hier später ganz oben – mit einem Plus zum direkten Eintragen.'
        )
      );
      return;
    }
    list.append(h('h3', { class: 'list-head' }, 'Zuletzt & häufig'));
    for (const u of ranked) {
      // Rezepte können sich geändert haben → aktuelle Werte holen
      if (u.foodId.startsWith('recipe:')) {
        const fresh = await foods.getFood(u.foodId);
        if (!fresh) continue;
        u.food = fresh;
      }
      list.append(foodRow(u.food, u));
    }
  }

  let searchToken = 0;
  async function runSearch() {
    const q = input.value.trim();
    if (!q) return showRecent();
    const token = ++searchToken;
    let results;
    try {
      results = await foods.search(q, { usage });
    } catch (e) {
      results = [];
      console.error(e);
    }
    if (token !== searchToken) return;
    clear(list);
    if (!results.length) {
      list.append(h('p', { class: 'hint' }, `Nichts gefunden für „${q}“. Du kannst es unten als eigenes Lebensmittel anlegen.`));
      return;
    }
    const usageById = new Map(usage.map((u) => [u.foodId, u]));
    for (const f of results) list.append(foodRow(f, usageById.get(f.id)));
  }

  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(runSearch, 120);
  });

  showRecent();
  foods.loadBLS().catch(() => toast('Hinweis: Lebensmittel-Datenbank (BLS) nicht verfügbar.'));
  setTimeout(() => input.focus(), 250);

  // ---------- Barcode ----------
  function openScanner() {
    const s = openSheet({ title: 'Barcode scannen', onClose: () => ctrl.abort() });
    const ctrl = new AbortController();
    const video = h('video', { class: 'scan-video', playsinline: true, muted: true });
    const status = h('p', { class: 'hint center' }, 'Barcode in den Rahmen halten …');
    const manual = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'oder Nummer eintippen', class: 'search' });
    const go = h('button', { class: 'btn primary', onclick: () => handleCode(manual.value.trim()) }, 'Suchen');
    s.body.append(h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-line' })), status, h('div', { class: 'search-row' }, manual, go));

    async function handleCode(code) {
      if (!/^\d{6,14}$/.test(code)) {
        status.textContent = 'Bitte eine gültige Barcode-Nummer eingeben.';
        return;
      }
      ctrl.abort();
      status.textContent = `Suche ${code} …`;
      try {
        const food = await foods.lookupBarcode(code);
        if (!food) {
          s.close();
          toast('Produkt nicht gefunden – bitte selbst anlegen.');
          openFoodEditor({ initial: { barcode: code }, onSaved: (f) => openAmount(f) });
          return;
        }
        s.close();
        if (food.hasNutrition === false) {
          toast('Zu diesem Produkt fehlen Nährwerte – bitte ergänzen.');
          openFoodEditor({ initial: food, onSaved: (f) => openAmount(f) });
          return;
        }
        openAmount(food, usage.find((u) => u.foodId === food.id));
      } catch (e) {
        status.textContent = `Fehler: ${e.message} (Internet nötig für neue Produkte)`;
      }
    }

    if (cameraAvailable()) {
      scanBarcode(video, ctrl.signal)
        .then((code) => code && handleCode(code))
        .catch((e) => {
          status.textContent =
            e.name === 'NotAllowedError'
              ? 'Kein Kamerazugriff erlaubt. Du kannst die Nummer unten eintippen.'
              : `Kamera nicht verfügbar (${e.message}). Nummer unten eintippen.`;
        });
    } else {
      status.textContent = 'Kamera nicht verfügbar. Nummer unten eintippen.';
    }
  }

  // ---------- Menge wählen ----------
  async function openAmount(food, u) {
    const own = await repo.getOwnPortions(food.id);
    openAmountSheet({
      food,
      ownPortions: own,
      initialGrams: u?.lastGrams,
      initialLabel: u?.lastAmountLabel,
      submitLabel: 'Eintragen',
      onSubmit: async (grams, label) => {
        await added(food, grams, label);
        input.value = '';
        showRecent();
        input.focus();
      },
    });
  }
}

/**
 * Blatt zur Mengeneingabe (auch zum Bearbeiten eines Eintrags genutzt).
 * Zeigt sofort, wie viele kcal/Makros die gewählte Menge hat, und auf Wunsch alle Nährstoffe.
 */
export function openAmountSheet({ food, ownPortions = [], initialGrams, initialLabel, submitLabel, onSubmit, extra, title }) {
  const s = openSheet({ title: title || 'Menge' });
  const portions = portionsFor(food, ownPortions);

  // Startwert: letzte Menge, sonst erste passende Portion, sonst 100 g
  let unit = 'g';
  let qty = 100;
  const lastPortion = initialLabel && portions.find((p) => initialLabel === p.label || initialLabel.endsWith(p.label.replace(/^1 /, ' ')) || initialLabel.endsWith(p.label));
  if (lastPortion) {
    unit = portions.indexOf(lastPortion);
    qty = Math.round((initialGrams / lastPortion.grams) * 100) / 100;
  } else if (initialGrams) {
    qty = initialGrams;
  } else {
    // Nur "zählbare" Portionen vorwählen (1 Stück, 1 Scheibe …), sonst Gramm
    const countable = portions.findIndex(
      (p) => p.origin === 'eigen' || p.origin === 'Quelle' || /^1 (Stück|Ei|Scheibe|Zehe|Becher|Würfel)/.test(p.label)
    );
    if (countable >= 0) {
      unit = countable;
      qty = 1;
    }
  }

  const qtyInput = h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: String(qty), class: 'qty' });
  const unitSelect = h(
    'select',
    { class: 'unit' },
    h('option', { value: 'g' }, 'g / ml'),
    portions.map((p, i) => h('option', { value: String(i) }, `${p.label} = ${formatNumber(p.grams, 1)} g`))
  );
  unitSelect.value = String(unit);

  const summary = h('div', { class: 'amount-summary' });
  const details = h('div', { class: 'amount-details', hidden: true });
  const toggle = h(
    'button',
    {
      class: 'link',
      onclick: () => {
        details.hidden = !details.hidden;
        toggle.textContent = details.hidden ? 'Alle Nährwerte anzeigen' : 'Nährwerte ausblenden';
      },
    },
    'Alle Nährwerte anzeigen'
  );

  const grams = () => {
    const q = Number(String(qtyInput.value).replace(',', '.')) || 0;
    return unitSelect.value === 'g' ? q : q * portions[Number(unitSelect.value)].grams;
  };
  const label = () => {
    if (unitSelect.value === 'g') return null;
    const q = Number(String(qtyInput.value).replace(',', '.')) || 0;
    return portionLabel(q, portions[Number(unitSelect.value)].label);
  };

  function update() {
    const g = grams();
    const v = scaleNutrients(food.per100, g);
    clear(summary).append(
      h('div', { class: 'big' }, `${formatNumber(v.energy ?? 0, 0)} kcal`),
      h(
        'div',
        { class: 'macro-line' },
        `${formatNumber(g, 0)} g · E ${formatNumber(v.protein ?? 0, 1)} g · F ${formatNumber(v.fat ?? 0, 1)} g · KH ${formatNumber(v.carbs ?? 0, 1)} g`
      )
    );
    clear(details);
    for (const grp of NUTRIENT_GROUPS) {
      const rows = NUTRIENTS.filter((n) => n.group === grp.id && food.per100[n.key] != null);
      if (!rows.length) continue;
      details.append(
        h('h4', {}, grp.label),
        h(
          'dl',
          { class: 'nutri-table' },
          rows.map((n) => [h('dt', {}, n.label), h('dd', {}, formatNutrient(n.key, v[n.key]))])
        )
      );
    }
    const missingCount = NUTRIENTS.filter((n) => food.per100[n.key] == null).length;
    if (missingCount) details.append(h('p', { class: 'hint' }, `${missingCount} Nährstoffe sind für dieses Lebensmittel nicht bekannt.`));
  }
  qtyInput.addEventListener('input', update);
  unitSelect.addEventListener('change', () => {
    qtyInput.value = unitSelect.value === 'g' ? String(Math.round(grams()) || 100) : '1';
    update();
  });

  // Eigene Portion speichern (z. B. "1 Schüssel = 60 g")
  const pName = h('input', { type: 'text', placeholder: 'Name, z. B. 1 Schüssel' });
  const pGrams = h('input', { type: 'number', inputmode: 'decimal', placeholder: 'Gramm', class: 'qty' });
  const portionForm = h(
    'div',
    { class: 'portion-form', hidden: true },
    pName,
    pGrams,
    h(
      'button',
      {
        class: 'btn',
        onclick: async () => {
          const name = pName.value.trim();
          const g = Number(String(pGrams.value).replace(',', '.'));
          if (!name || !(g > 0)) return toast('Bitte Name und Gramm angeben.');
          await savePortionNow(name, g);
          portionForm.hidden = true;
        },
      },
      'Speichern'
    )
  );
  const savePortion = h(
    'button',
    {
      class: 'link',
      onclick: () => {
        portionForm.hidden = !portionForm.hidden;
        pGrams.value = String(Math.round(grams()));
        if (!portionForm.hidden) pName.focus();
      },
    },
    'Eigene Portion speichern'
  );
  async function savePortionNow(name, g) {
    await repo.saveOwnPortion(food.id, { label: name, grams: g });
    portions.unshift({ label: name, grams: g, origin: 'eigen' });
    // neue Option direkt nach "g / ml" einfügen und die Nummern neu vergeben
    unitSelect.options[0].after(h('option', {}, `${name} = ${formatNumber(g, 1)} g`));
    [...unitSelect.options].slice(1).forEach((o, i) => (o.value = String(i)));
    unitSelect.value = '0';
    qtyInput.value = '1';
    update();
  }

  const submit = h(
    'button',
    {
      class: 'btn primary wide',
      onclick: async () => {
        const g = grams();
        if (!(g > 0)) return toast('Bitte eine Menge eingeben.');
        await onSubmit(Math.round(g * 10) / 10, label());
        s.close();
      },
    },
    submitLabel || 'Übernehmen'
  );

  s.body.append(
    h('div', { class: 'amount-food' }, h('strong', {}, food.name), h('div', { class: 'item-sub' }, sourceLabel(food))),
    h('div', { class: 'amount-row' }, qtyInput, unitSelect),
    summary,
    submit,
    extra || null,
    h('div', { class: 'row-links' }, toggle, savePortion),
    portionForm,
    details
  );
  update();
  setTimeout(() => {
    qtyInput.focus();
    qtyInput.select();
  }, 250);
  return s;
}
