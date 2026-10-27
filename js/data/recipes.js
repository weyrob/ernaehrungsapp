// Rezeptbuch: Zutatenzeilen automatisch mit der Nährwert-Datenbank verknüpfen.
import * as repo from './repo.js';
import * as foods from './foods.js';
import { parseIngredientLine, gramsFor } from '../core/ingredients.js';
import { portionsFor } from '../core/portions.js';

function snapshot(food) {
  return { id: food.id, name: food.name, source: food.source, per100: food.per100 };
}

/**
 * Wandelt eine Zutatenzeile in eine Rezept-Zutat um:
 * findet das passende Lebensmittel (gemerkte Zuordnung → Suche) und rechnet in Gramm um.
 * Ergebnis: { text, food, grams, how, auto }   auto = automatisch zugeordnet (bitte prüfen)
 */
export async function matchIngredient(line) {
  const parsed = parseIngredientLine(line);
  let food = null;
  let auto = true;

  const aliasId = (await repo.getAlias(parsed.searchName)) || (await repo.getAlias(parsed.name));
  if (aliasId) {
    food = await foods.getFood(aliasId);
    if (food) auto = false;
  }
  if (!food && parsed.searchName) {
    // Rezepte nicht als Zutat vorschlagen (sonst findet "Tomatensoße" das eigene Rezept)
    const results = await foods.search(parsed.searchName, { limit: 5, includeRecipes: false, ingredient: true });
    food = results[0] || null;
  }

  const ownPortions = food ? await repo.getOwnPortions(food.id) : [];
  const { grams, how } = gramsFor(parsed, food?.name || parsed.name, food ? portionsFor(food, ownPortions) : []);
  return {
    text: parsed.text,
    searchName: parsed.searchName,
    food: food ? snapshot(food) : null,
    grams: grams != null ? Math.round(grams * 10) / 10 : 0,
    how: grams != null ? how : how || 'Menge fehlt',
    auto: !!food && auto,
    needsGrams: grams == null,
    noQuantity: parsed.quantity == null && !parsed.unit && !parsed.explicitGrams,
  };
}

export async function matchIngredients(lines) {
  const out = [];
  for (const l of lines) out.push(await matchIngredient(l));
  return out;
}

/** Merkt sich die Korrektur für künftige Importe. */
export async function rememberMatch(ingredient, food) {
  if (ingredient.searchName) await repo.saveAlias(ingredient.searchName, food.id);
}

export { snapshot as foodSnapshot };
