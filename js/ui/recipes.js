// Rezeptbuch: Liste, Ansicht, Bearbeiten, Import.
import { h, clear, openSheet, toast, confirmDialog } from './dom.js';
import * as repo from '../data/repo.js';
import * as foods from '../data/foods.js';
import { matchIngredients, rememberMatch, foodSnapshot } from '../data/recipes.js';
import { importFromUrl, parseRecipeText } from '../data/recipe-import.js';
import { recipeTotals, recipeToFood, perServing, recipeWeight } from '../core/recipe-calc.js';
import { NUTRIENTS, NUTRIENT_GROUPS, formatNumber, formatNutrient } from '../core/nutrients.js';
import { openAmountSheet } from './add-food.js';

const fmtG = (g) => `${formatNumber(g, g < 10 ? 1 : 0)} g`;

// ---------- Liste ----------

export async function renderRecipes(root, app) {
  const recipes = (await repo.getRecipes()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const filter = h('input', { type: 'search', class: 'search', placeholder: 'Rezepte durchsuchen …' });
  const list = h('div', { class: 'list' });

  const draw = () => {
    const q = foods.normalize(filter.value);
    const shown = recipes.filter((r) => !q || foods.normalize(r.name).includes(q));
    clear(list);
    if (!recipes.length) {
      list.append(
        h(
          'p',
          { class: 'hint' },
          'Noch keine Rezepte. Importiere eins von einer Website (z. B. Chefkoch) oder lege es selbst an. ',
          'Die Nährwerte pro Portion rechnet die App aus den Zutaten aus.'
        )
      );
      return;
    }
    for (const r of shown) {
      const ps = perServing(r);
      list.append(
        h(
          'button',
          { class: 'item-main', onclick: () => openRecipe(r.id, app) },
          h('div', { class: 'item-title' }, r.name),
          h('div', { class: 'item-sub' }, `${r.servings} ${r.servings === 1 ? 'Portion' : 'Portionen'} · ${formatNumber(ps.energy || 0, 0)} kcal pro Portion`)
        )
      );
    }
    if (!shown.length) list.append(h('p', { class: 'hint' }, 'Kein Rezept passt zur Suche.'));
  };
  filter.addEventListener('input', draw);
  draw();

  clear(root).append(
    h(
      'div',
      { class: 'row-buttons' },
      h('button', { class: 'btn primary', onclick: () => openImport(app) }, '↓ Importieren'),
      h('button', { class: 'btn', onclick: () => openEditor({ draft: emptyRecipe(), app }) }, '+ Neues Rezept')
    ),
    h('section', { class: 'card' }, recipes.length > 5 ? filter : null, list),
    h('div', { class: 'fab-space' })
  );
}

function emptyRecipe() {
  return { name: '', servings: 2, cookedWeight: null, ingredients: [], instructions: [], sourceUrl: null, image: null };
}

// ---------- Import ----------

function openImport(app) {
  const s = openSheet({ title: 'Rezept importieren', full: true });
  const url = h('input', { type: 'url', class: 'search', placeholder: 'https://www.chefkoch.de/rezepte/…', autocapitalize: 'off', inputmode: 'url' });
  const status = h('p', { class: 'hint' });
  const text = h('textarea', {
    rows: 10,
    placeholder: 'Spaghetti Bolognese\nFür 4 Portionen\n500 g Spaghetti\n400 g Hackfleisch\n1 Zwiebel\n2 EL Olivenöl\n…\n\nZubereitung\n…',
  });

  const finish = async (parsed) => {
    status.textContent = `${parsed.ingredientLines.length} Zutaten gefunden – ordne sie der Nährwert-Datenbank zu …`;
    const ingredients = await matchIngredients(parsed.ingredientLines);
    s.close();
    openEditor({
      draft: { ...emptyRecipe(), name: parsed.name, servings: parsed.servings, instructions: parsed.instructions, sourceUrl: parsed.sourceUrl, image: parsed.image, ingredients },
      app,
      isImport: true,
    });
  };

  const fromUrl = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        status.textContent = 'Lade Seite …';
        try {
          const settings = await repo.getSettings();
          const parsed = await importFromUrl(url.value.trim(), settings.recipeProxy);
          if (!parsed.ingredientLines.length) throw new Error('Rezept gefunden, aber ohne Zutatenliste.');
          await finish(parsed);
        } catch (e) {
          status.textContent = e.message;
        }
      },
    },
    'Laden'
  );

  const fromText = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        const parsed = parseRecipeText(text.value);
        if (!parsed.ingredientLines.length) return toast('Keine Zutaten erkannt – eine Zutat pro Zeile, bitte.');
        await finish(parsed);
      },
    },
    'Text übernehmen'
  );

  // Link aus der Zwischenablage vorschlagen (falls erlaubt)
  navigator.clipboard
    ?.readText?.()
    .then((t) => {
      if (/^https?:\/\/\S+$/.test(t?.trim()) && !url.value) url.value = t.trim();
    })
    .catch(() => {});

  s.body.append(
    h('h3', {}, 'Von einer Website'),
    h('p', { class: 'hint' }, 'Adresse der Rezeptseite einfügen. Funktioniert mit den meisten großen Rezeptseiten.'),
    h('div', { class: 'search-row' }, url, fromUrl),
    status,
    h('h3', {}, 'Oder Text einfügen'),
    h('p', { class: 'hint' }, 'Zutaten untereinander, eine pro Zeile. Erste Zeile = Name. „Für 4 Portionen“ wird erkannt, alles nach „Zubereitung“ wird zur Anleitung.'),
    text,
    h('div', { class: 'pad' }, fromText)
  );
  setTimeout(() => url.focus(), 250);
}

// ---------- Lebensmittel für eine Zutat auswählen ----------

function openFoodPicker({ query, onPick }) {
  const s = openSheet({ title: 'Lebensmittel wählen' });
  const input = h('input', { type: 'search', class: 'search', value: query || '', placeholder: 'Suchen …', autocomplete: 'off' });
  const list = h('div', { class: 'list' });
  let token = 0;
  const run = async () => {
    const my = ++token;
    const res = input.value.trim() ? await foods.search(input.value, { limit: 40, includeRecipes: false }) : [];
    if (my !== token) return;
    clear(list);
    for (const f of res) {
      list.append(
        h(
          'button',
          {
            class: 'item-main',
            onclick: () => {
              s.close();
              onPick(f);
            },
          },
          h('div', { class: 'item-title' }, f.name),
          h('div', { class: 'item-sub' }, [f.source === 'bls' ? f.group : f.brand || 'eigenes', f.per100.energy != null ? `${formatNumber(f.per100.energy, 0)} kcal/100 g` : ''].filter(Boolean).join(' · '))
        )
      );
    }
    if (input.value.trim() && !res.length) list.append(h('p', { class: 'hint' }, 'Nichts gefunden. Eigene Lebensmittel legst du unter Einstellungen an.'));
  };
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(run, 120);
  });
  s.body.append(input, list);
  run();
  setTimeout(() => input.focus(), 250);
}

// ---------- Bearbeiten ----------

function openEditor({ draft, app, isImport = false }) {
  const r = structuredClone(draft);
  const s = openSheet({ title: r.id ? 'Rezept bearbeiten' : isImport ? 'Import prüfen' : 'Neues Rezept', full: true });

  const name = h('input', { type: 'text', value: r.name, placeholder: 'Name des Rezepts' });
  const servings = h('input', { type: 'number', inputmode: 'numeric', min: '1', value: String(r.servings || 1), class: 'qty' });
  const cooked = h('input', { type: 'number', inputmode: 'decimal', value: r.cookedWeight || '', placeholder: 'optional', class: 'qty' });
  const summary = h('div', { class: 'amount-summary' });
  const ingList = h('div', { class: 'ing-list' });
  const instructions = h('textarea', { rows: 8, placeholder: 'Zubereitung (optional)' });
  instructions.value = (r.instructions || []).join('\n');

  const updateSummary = () => {
    r.servings = Math.max(1, Number(servings.value) || 1);
    r.cookedWeight = Number(String(cooked.value).replace(',', '.')) || null;
    const ps = perServing(r);
    const { rawWeight } = recipeTotals(r);
    // Zutaten ohne Mengenangabe ("Salz und Pfeffer") zählen bewusst nicht mit
    const open = r.ingredients.filter((i) => !i.noQuantity && (!i.food || !(i.grams > 0))).length;
    clear(summary).append(
      ...[
      h('div', { class: 'big' }, `${formatNumber(ps.energy || 0, 0)} kcal`),
      h('div', { class: 'macro-line' }, `pro Portion · E ${formatNumber(ps.protein || 0, 1)} g · F ${formatNumber(ps.fat || 0, 1)} g · KH ${formatNumber(ps.carbs || 0, 1)} g`),
      h('div', { class: 'macro-line' }, `Zutaten zusammen ${fmtG(rawWeight)}${r.cookedWeight ? `, gekocht ${fmtG(r.cookedWeight)}` : ''} · 1 Portion ≈ ${fmtG(recipeWeight(r) / r.servings)}`),
      open ? h('p', { class: 'warn' }, `${open} ${open === 1 ? 'Zutat zählt' : 'Zutaten zählen'} noch nicht mit (Lebensmittel oder Menge fehlt).`) : null,
      ].filter(Boolean)
    );
  };

  const drawIngredients = () => {
    clear(ingList);
    r.ingredients.forEach((ing, idx) => {
      const grams = h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: ing.grams || '', placeholder: 'g', class: 'qty small' });
      grams.addEventListener('input', () => {
        ing.grams = Number(String(grams.value).replace(',', '.')) || 0;
        ing.needsGrams = !(ing.grams > 0);
        ing.noQuantity = false;
        ing.how = '';
        updateSummary();
      });
      const state = ing.noQuantity && !(ing.grams > 0) ? 'skip' : !ing.food ? 'missing' : !(ing.grams > 0) ? 'nograms' : ing.auto ? 'auto' : 'ok';
      const note = {
        skip: 'ohne Mengenangabe – zählt nicht mit (bei Bedarf Gramm eintragen)',
        missing: 'nicht zugeordnet – zählt nicht mit',
        nograms: ing.how ? `${ing.how} – bitte Gramm eintragen` : 'bitte Gramm eintragen',
        auto: `automatisch zugeordnet${ing.how ? ` · ${ing.how}` : ''}`,
        ok: ing.how || '',
      }[state];
      ingList.append(
        h(
          'div',
          { class: `ing-row ing-${state}` },
          h(
            'div',
            { class: 'ing-main' },
            h('div', { class: 'ing-text' }, ing.text),
            h(
              'button',
              {
                class: 'ing-food',
                onclick: () =>
                  openFoodPicker({
                    query: ing.searchName || ing.text,
                    onPick: async (f) => {
                      ing.food = foodSnapshot(f);
                      ing.auto = false;
                      await rememberMatch(ing, f);
                      drawIngredients();
                      updateSummary();
                    },
                  }),
              },
              ing.food ? `→ ${ing.food.name}` : '→ Lebensmittel wählen'
            ),
            note && h('div', { class: 'ing-note' }, note)
          ),
          grams,
          h(
            'button',
            {
              class: 'link',
              'aria-label': 'Zutat entfernen',
              onclick: () => {
                r.ingredients.splice(idx, 1);
                drawIngredients();
                updateSummary();
              },
            },
            '✕'
          )
        )
      );
    });
  };

  // Zutaten hinzufügen (eine oder mehrere Zeilen)
  const addText = h('textarea', { rows: 2, placeholder: 'z. B. 200 g Mehl (mehrere Zeilen möglich)' });
  const addBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        const lines = addText.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return;
        addBtn.disabled = true;
        r.ingredients.push(...(await matchIngredients(lines)));
        addBtn.disabled = false;
        addText.value = '';
        drawIngredients();
        updateSummary();
      },
    },
    'Zutat hinzufügen'
  );

  servings.addEventListener('input', updateSummary);
  cooked.addEventListener('input', updateSummary);

  const save = h(
    'button',
    {
      class: 'btn primary wide',
      onclick: async () => {
        r.name = name.value.trim();
        if (!r.name) return toast('Bitte einen Namen eingeben.');
        if (!r.ingredients.length) return toast('Das Rezept hat noch keine Zutaten.');
        r.instructions = instructions.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        updateSummary();
        // Alle Zuordnungen gelten ab jetzt als geprüft
        r.ingredients.forEach((i) => (i.auto = false));
        const saved = await repo.saveRecipe(r);
        s.close();
        toast('Rezept gespeichert');
        await app.render();
        openRecipe(saved.id, app);
      },
    },
    'Rezept speichern'
  );

  const autoCount = r.ingredients.filter((i) => i.auto).length;
  s.body.append(
    isImport &&
      h(
        'p',
        { class: 'hint' },
        `Bitte kurz prüfen: ${autoCount} von ${r.ingredients.length} Zutaten wurden automatisch zugeordnet. `,
        'Tippe auf „→ …“, um das passende Lebensmittel zu wählen – die App merkt sich deine Wahl für künftige Rezepte.'
      ),
    h('label', { class: 'field' }, h('span', {}, 'Name'), name),
    h(
      'div',
      { class: 'two-fields' },
      h('label', { class: 'field' }, h('span', {}, 'Portionen'), servings),
      h('label', { class: 'field' }, h('span', {}, 'Gewicht gekocht (g)'), cooked)
    ),
    h('p', { class: 'hint small' }, 'Gewicht gekocht: nur nötig, wenn du später in Gramm statt in Portionen einträgst (z. B. ganzen Topf wiegen).'),
    summary,
    h('h3', {}, 'Zutaten'),
    ingList,
    addText,
    h('div', { class: 'pad' }, addBtn),
    h('h3', {}, 'Zubereitung'),
    instructions,
    r.sourceUrl && h('p', { class: 'hint' }, 'Quelle: ', h('a', { href: r.sourceUrl, target: '_blank', rel: 'noopener' }, new URL(r.sourceUrl).hostname)),
    save
  );
  drawIngredients();
  updateSummary();
  if (!r.name) setTimeout(() => name.focus(), 250);
}

// ---------- Ansicht ----------

async function openRecipe(id, app) {
  const r = await repo.getRecipe(id);
  if (!r) return;
  const s = openSheet({ title: 'Rezept', full: true });
  const food = recipeToFood(r);
  const ps = perServing(r);
  const { missing, usedCount } = recipeTotals(r);
  const t = app.targets;

  // Portionen umrechnen (nur Anzeige der Zutatenmengen)
  const factorInput = h('input', { type: 'number', inputmode: 'numeric', min: '1', value: String(r.servings), class: 'qty small' });
  const ingList = h('ul', { class: 'ing-view' });
  const drawIng = () => {
    const f = (Number(factorInput.value) || r.servings) / r.servings;
    clear(ingList).append(
      ...r.ingredients.map((i) =>
        h(
          'li',
          {},
          h('span', { class: 'ing-amount' }, i.grams > 0 ? fmtG(i.grams * f) : '–'),
          h('span', {}, i.food ? i.food.name : i.text, i.food && i.text && foods.normalize(i.text) !== foods.normalize(i.food.name) ? h('span', { class: 'muted small' }, ` (${i.text})`) : null)
        )
      )
    );
  };
  factorInput.addEventListener('input', drawIng);
  drawIng();

  const mealSelect = h('select', {}, repo.MEALS.map((m) => h('option', { value: m.id, selected: m.id === repo.mealForNow() }, m.label)));
  const toDiary = h(
    'button',
    {
      class: 'btn primary wide',
      onclick: () =>
        openAmountSheet({
          food,
          title: 'Ins Tagebuch',
          submitLabel: 'Eintragen',
          extra: h('label', { class: 'field' }, h('span', {}, 'Mahlzeit'), mealSelect),
          onSubmit: async (grams, label) => {
            await repo.addEntry({ date: app.date, meal: mealSelect.value, food, grams, amountLabel: label });
            toast(`${r.name} eingetragen`);
            app.render();
          },
        }),
    },
    'Ins Tagebuch eintragen'
  );

  // Pro Portion: Wert + Anteil am Tagesziel (keine Bewertung, eine Portion ist ja nur ein Teil des Tages)
  const share = (k) => {
    const ref = t[k] ? (t[k].min != null && t[k].max != null ? (t[k].min + t[k].max) / 2 : t[k].min ?? t[k].max) : null;
    return ref ? `${formatNumber(((ps[k] || 0) / ref) * 100, 0)} %` : '';
  };
  const macroBars = h(
    'dl',
    { class: 'nutri-table macro-table' },
    ['energy', 'protein', 'fat', 'carbs', 'fiber', 'sugar', 'salt'].map((k) => [
      h('dt', {}, NUTRIENTS.find((n) => n.key === k).label),
      h('dd', {}, formatNutrient(k, ps[k] || 0), h('span', { class: 'muted small share' }, share(k))),
    ])
  );
  const details = h('div', { class: 'amount-details', hidden: true });
  for (const g of NUTRIENT_GROUPS) {
    const rows = NUTRIENTS.filter((n) => n.group === g.id && missing[n.key] < usedCount);
    if (!rows.length) continue;
    details.append(h('h4', {}, g.label), h('dl', { class: 'nutri-table' }, rows.map((n) => [h('dt', {}, n.label), h('dd', {}, formatNutrient(n.key, ps[n.key] || 0))])));
  }
  const toggle = h(
    'button',
    {
      class: 'link',
      onclick: () => {
        details.hidden = !details.hidden;
        toggle.textContent = details.hidden ? 'Alle Nährwerte pro Portion' : 'Nährwerte ausblenden';
      },
    },
    'Alle Nährwerte pro Portion'
  );

  s.body.append(
    h('h2', { class: 'recipe-title' }, r.name),
    r.image ? h('img', { class: 'recipe-img', src: r.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
    h('section', { class: 'card inset' }, h('div', { class: 'muted small' }, `Pro Portion (${fmtG(food.portions[0]?.grams || 0)}) · Anteil an deinem Tagesziel`), macroBars, toggle, details),
    toDiary,
    h('h3', {}, 'Zutaten für ', factorInput, ' Portionen'),
    ingList,
    r.instructions?.length ? [h('h3', {}, 'Zubereitung'), h('ol', { class: 'steps' }, r.instructions.map((x) => h('li', {}, x)))] : null,
    r.sourceUrl && h('p', { class: 'hint' }, 'Quelle: ', h('a', { href: r.sourceUrl, target: '_blank', rel: 'noopener' }, new URL(r.sourceUrl).hostname)),
    h(
      'div',
      { class: 'row-buttons' },
      h(
        'button',
        {
          class: 'btn',
          onclick: () => {
            s.close();
            openEditor({ draft: r, app });
          },
        },
        'Bearbeiten'
      ),
      h(
        'button',
        {
          class: 'btn danger',
          onclick: async () => {
            if (!(await confirmDialog(`„${r.name}“ löschen? Bereits eingetragene Mahlzeiten bleiben erhalten.`, 'Löschen'))) return;
            await repo.deleteRecipe(r.id);
            s.close();
            app.render();
          },
        },
        'Löschen'
      )
    )
  );
}
