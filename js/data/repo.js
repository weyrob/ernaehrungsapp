// Fachliche Speicher-Funktionen: Tagebuch, Einstellungen, eigene Lebensmittel, Nutzung.
import * as db from './db.js';
import { suggestMacroGoals } from '../core/targets.js';

export function uid() {
  return (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`).toString();
}

export function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// ---------- Einstellungen ----------

const DEFAULT_PROFILE = { sex: 'm', birthYear: 1985, weightKg: 75, heightCm: 178, pal: 1.4 };

export async function getSettings() {
  const row = await db.get(db.STORES.settings, 'main');
  if (row) return row.value;
  return { profile: DEFAULT_PROFILE, macros: suggestMacroGoals(DEFAULT_PROFILE), isDefault: true };
}

export async function saveSettings(value) {
  const { isDefault, ...clean } = value;
  await db.put(db.STORES.settings, { key: 'main', value: clean });
}

// ---------- Tagebuch ----------

export const MEALS = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittagessen' },
  { id: 'dinner', label: 'Abendessen' },
  { id: 'snack', label: 'Snacks' },
];

/** Schlägt eine Mahlzeit passend zur Uhrzeit vor. */
export function mealForNow(d = new Date()) {
  const h = d.getHours();
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h >= 17 && h < 21.5) return 'dinner';
  return 'snack';
}

export async function entriesForDate(date) {
  const list = await db.getAllByIndex(db.STORES.entries, 'date', date);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function entriesBetween(from, to) {
  return db.getRange(db.STORES.entries, 'date', from, to);
}

/**
 * Speichert einen Eintrag. Die Nährwerte pro 100 g werden mitgespeichert,
 * damit ein Eintrag auch dann stimmt, wenn sich das Lebensmittel später ändert.
 */
export async function addEntry({ date, meal, food, grams, amountLabel }) {
  const entry = {
    id: uid(),
    date,
    meal,
    foodId: food.id,
    name: food.name,
    brand: food.brand || null,
    source: food.source,
    grams,
    amountLabel: amountLabel || null,
    per100: food.per100,
    createdAt: Date.now(),
  };
  await db.put(db.STORES.entries, entry);
  await touchUsage(food, grams, amountLabel);
  return entry;
}

export async function updateEntry(entry) {
  await db.put(db.STORES.entries, entry);
}

export async function deleteEntry(id) {
  await db.remove(db.STORES.entries, id);
}

// ---------- Nutzung (für "zuletzt / häufig") ----------

async function touchUsage(food, grams, amountLabel) {
  const old = (await db.get(db.STORES.usage, food.id)) || { foodId: food.id, count: 0 };
  await db.put(db.STORES.usage, {
    ...old,
    count: old.count + 1,
    lastUsed: Date.now(),
    lastGrams: grams,
    lastAmountLabel: amountLabel || null,
    // kleine Kopie, damit "Zuletzt" auch ohne geladene Datenbank sofort angezeigt werden kann
    food: { id: food.id, name: food.name, brand: food.brand || null, source: food.source, per100: food.per100, portions: food.portions || [] },
  });
}

export async function getUsage() {
  return db.getAll(db.STORES.usage);
}

/**
 * Sortiert Lebensmittel für die Schnellauswahl: kürzlich und häufig genutzt oben.
 * Punkte = Häufigkeit, die mit der Zeit langsam an Gewicht verliert.
 */
export function rankUsage(usage, now = Date.now()) {
  const day = 86400000;
  return [...usage]
    .map((u) => ({ ...u, score: u.count / (1 + (now - u.lastUsed) / (7 * day)) + (now - u.lastUsed < day ? 5 : 0) }))
    .sort((a, b) => b.score - a.score);
}

// ---------- Eigene Portionen ----------

export async function getOwnPortions(foodId) {
  return (await db.get(db.STORES.portions, foodId))?.list || [];
}

export async function saveOwnPortion(foodId, portion) {
  const list = await getOwnPortions(foodId);
  list.unshift(portion);
  await db.put(db.STORES.portions, { foodId, list: list.slice(0, 10) });
}

// ---------- Eigene / gespeicherte Lebensmittel ----------

export async function getStoredFoods() {
  return db.getAll(db.STORES.foods);
}

export async function getStoredFood(id) {
  return db.get(db.STORES.foods, id);
}

export async function saveFood(food) {
  await db.put(db.STORES.foods, { ...food, updatedAt: Date.now() });
}

export async function deleteFood(id) {
  await db.remove(db.STORES.foods, id);
}

// ---------- Rezepte ----------

export async function getRecipes() {
  return db.getAll(db.STORES.recipes);
}

export async function getRecipe(id) {
  return db.get(db.STORES.recipes, id);
}

export async function saveRecipe(recipe) {
  const r = { ...recipe, id: recipe.id || `recipe:${uid()}`, createdAt: recipe.createdAt || Date.now(), updatedAt: Date.now() };
  await db.put(db.STORES.recipes, r);
  return r;
}

export async function deleteRecipe(id) {
  await db.remove(db.STORES.recipes, id);
}

// ---------- Gemerkte Zutaten-Zuordnungen ----------
// Wenn du bei einer Zutat das Lebensmittel korrigierst, merkt sich die App das
// für den nächsten Import ("Zwiebel" → "Zwiebel roh").

export async function getAlias(text) {
  return (await db.get(db.STORES.aliases, text.toLowerCase().trim()))?.foodId || null;
}

export async function saveAlias(text, foodId) {
  await db.put(db.STORES.aliases, { text: text.toLowerCase().trim(), foodId });
}
