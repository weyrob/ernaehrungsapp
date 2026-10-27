// Einstellungen: Profil, Makro-Ziele, eigene Lebensmittel, Datensicherung, Quellen.
import { h, clear, toast, confirmDialog } from './dom.js';
import * as repo from '../data/repo.js';
import * as foods from '../data/foods.js';
import * as backup from '../data/backup.js';
import { PAL_OPTIONS, suggestMacroGoals, ageFromBirthYear } from '../core/targets.js';
import { openFoodEditor } from './food-editor.js';
import { saveFile, pickFile } from '../platform/files.js';

const MACRO_FIELDS = [
  { key: 'energy', label: 'Kalorien', unit: 'kcal' },
  { key: 'protein', label: 'Eiweiß', unit: 'g' },
  { key: 'fat', label: 'Fett', unit: 'g' },
  { key: 'carbs', label: 'Kohlenhydrate', unit: 'g' },
  { key: 'fiber', label: 'Ballaststoffe', unit: 'g' },
  { key: 'sugar', label: 'Zucker', unit: 'g' },
  { key: 'satfat', label: 'Gesättigte Fettsäuren', unit: 'g' },
  { key: 'salt', label: 'Salz', unit: 'g' },
];

const num = (el) => {
  const v = String(el.value).replace(',', '.').trim();
  return v === '' ? null : Number(v);
};

export async function renderSettings(root, app) {
  const settings = structuredClone(app.settings);
  const p = settings.profile;

  // ---- Profil ----
  const sex = h('select', {}, h('option', { value: 'm' }, 'männlich'), h('option', { value: 'f' }, 'weiblich'));
  sex.value = p.sex;
  const birthYear = h('input', { type: 'number', inputmode: 'numeric', value: p.birthYear });
  const weight = h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: p.weightKg });
  const height = h('input', { type: 'number', inputmode: 'numeric', value: p.heightCm });
  const pal = h('select', {}, PAL_OPTIONS.map((o) => h('option', { value: String(o.value) }, o.label)));
  pal.value = String(p.pal);
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);

  const readProfile = () => ({
    sex: sex.value,
    birthYear: num(birthYear) || p.birthYear,
    weightKg: num(weight) || p.weightKg,
    heightCm: num(height) || p.heightCm,
    pal: Number(pal.value),
  });

  // ---- Makro-Ziele ----
  const macroInputs = {};
  const macroRows = MACRO_FIELDS.map((f) => {
    const g = settings.macros?.[f.key] || {};
    const min = h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: g.min ?? '', placeholder: '–' });
    const max = h('input', { type: 'number', inputmode: 'decimal', step: 'any', value: g.max ?? '', placeholder: '–' });
    macroInputs[f.key] = { min, max };
    return h('div', { class: 'macro-row' }, h('span', {}, `${f.label} (${f.unit})`), min, max);
  });

  const fillSuggestion = () => {
    const s = suggestMacroGoals(readProfile());
    for (const f of MACRO_FIELDS) {
      macroInputs[f.key].min.value = s[f.key]?.min ?? '';
      macroInputs[f.key].max.value = s[f.key]?.max ?? '';
    }
    toast('Vorschlag eingesetzt – mit „Speichern“ übernehmen.');
  };

  const save = async () => {
    const profile = readProfile();
    const macros = {};
    for (const f of MACRO_FIELDS) {
      const min = num(macroInputs[f.key].min);
      const max = num(macroInputs[f.key].max);
      if (min != null || max != null) macros[f.key] = { min, max };
    }
    await app.saveSettings({ profile, macros });
    toast('Gespeichert');
  };

  // ---- Eigene Lebensmittel ----
  const stored = (await repo.getStoredFoods()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const foodList = h(
    'div',
    { class: 'list' },
    stored.length
      ? stored.map((f) =>
          h(
            'button',
            { class: 'item-main', onclick: () => openFoodEditor({ initial: f, onSaved: () => app.render() }) },
            h('div', { class: 'item-title' }, f.name),
            h('div', { class: 'item-sub' }, [f.brand, f.source === 'off' ? 'Barcode-Produkt' : 'eigenes', f.barcode].filter(Boolean).join(' · '))
          )
        )
      : h('p', { class: 'hint' }, 'Noch keine eigenen oder gescannten Lebensmittel.')
  );

  // ---- Daten ----
  const persisted = (await navigator.storage?.persisted?.()) ?? false;
  const exportBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        const data = await backup.createBackup();
        await saveFile(backup.backupFileName(), JSON.stringify(data, null, 1), 'application/json');
      },
    },
    'Backup exportieren (JSON)'
  );
  const importBtn = h(
    'button',
    {
      class: 'btn',
      onclick: async () => {
        try {
          const text = await pickFile('.json,application/json');
          if (!text) return;
          const json = JSON.parse(text);
          const info = backup.inspectBackup(json);
          const range = info.firstDate ? ` (${info.firstDate} bis ${info.lastDate})` : '';
          const ok = await confirmDialog(
            `Backup vom ${new Date(info.exportedAt).toLocaleString('de-DE')} mit ${info.entries} Einträgen${range} und ${info.foods} eigenen Lebensmitteln einspielen? Alle aktuellen Daten in der App werden dabei ersetzt.`,
            'Einspielen'
          );
          if (!ok) return;
          await backup.restoreBackup(json);
          await app.reloadSettings();
          toast('Backup eingespielt');
        } catch (e) {
          toast(`Import fehlgeschlagen: ${e.message}`);
        }
      },
    },
    'Backup importieren'
  );

  const meta = foods.blsMeta();

  clear(root).append(
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Profil'),
      h('p', { class: 'hint' }, 'Daraus ergeben sich die DGE-Referenzwerte (Alter, Geschlecht) und der Kalorien-Vorschlag.'),
      field('Geschlecht', sex),
      field(`Geburtsjahr (Alter: ${ageFromBirthYear(p.birthYear)})`, birthYear),
      field('Gewicht (kg)', weight),
      field('Größe (cm)', height),
      field('Aktivität', pal)
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Eigene Ziele'),
      h('p', { class: 'hint' }, 'Unter „mindestens“ gilt als zu wenig, über „höchstens“ als zu viel. Leer lassen = keine Grenze.'),
      h('div', { class: 'macro-row head' }, h('span', {}, ''), h('span', {}, 'mindestens'), h('span', {}, 'höchstens')),
      macroRows,
      h('button', { class: 'link', onclick: fillSuggestion }, 'Vorschlag aus Profil berechnen (DGE)')
    ),
    h('div', { class: 'pad' }, h('button', { class: 'btn primary wide', onclick: save }, 'Profil & Ziele speichern')),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Eigene & gescannte Lebensmittel'),
      foodList,
      h('button', { class: 'btn', onclick: () => openFoodEditor({ onSaved: () => app.render() }) }, '+ Neues Lebensmittel')
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Datensicherung'),
      h(
        'p',
        { class: 'hint' },
        'Alle Daten liegen nur auf diesem Gerät. Exportiere regelmäßig ein Backup (z. B. in die Dateien-App oder iCloud Drive). ',
        'Mit derselben Datei ziehst du später auch in die iOS-App um.'
      ),
      h('p', { class: 'hint' }, persisted ? '✓ Der Browser hat zugesagt, die Daten dauerhaft zu behalten.' : 'Hinweis: Der Browser hat dauerhaften Speicher nicht bestätigt. Am iPhone hilft „Zum Home-Bildschirm“ – trotzdem Backups machen.'),
      h('div', { class: 'row-buttons' }, exportBtn, importBtn)
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Quellen & Lizenzen'),
      h(
        'ul',
        { class: 'sources' },
        h(
          'li',
          {},
          'Grundlebensmittel: Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. ',
          h('a', { href: 'https://doi.org/10.25826/Data20251217-134202-0', target: '_blank', rel: 'noopener' }, 'DOI'),
          ', Lizenz ',
          h('a', { href: 'https://creativecommons.org/licenses/by/4.0/deed.de', target: '_blank', rel: 'noopener' }, 'CC BY 4.0'),
          '. Umgerechnet auf die Nährstoffliste dieser App.',
          meta ? ` (${meta.count} Lebensmittel)` : ''
        ),
        h(
          'li',
          {},
          'Markenprodukte: ',
          h('a', { href: 'https://world.openfoodfacts.org', target: '_blank', rel: 'noopener' }, 'Open Food Facts'),
          ', Datenbank unter ',
          h('a', { href: 'https://opendatacommons.org/licenses/odbl/1-0/', target: '_blank', rel: 'noopener' }, 'ODbL')
        ),
        h('li', {}, 'Sollwerte: DGE/ÖGE-Referenzwerte für die Nährstoffzufuhr (3. Auflage 2025), Höchstmengen nach EFSA.'),
        h('li', {}, 'Barcode-Erkennung: zxing-wasm (MIT-Lizenz).')
      ),
      h('p', { class: 'hint' }, `App-Version ${app.version}`)
    )
  );
}
