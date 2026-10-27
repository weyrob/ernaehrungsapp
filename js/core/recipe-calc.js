// Nährwerte eines Rezepts berechnen.
import { scaleNutrients, sumNutrients } from './nutrients.js';

/**
 * Rezept-Struktur:
 * { id, name, servings, cookedWeight?, sourceUrl?, image?, instructions: [..],
 *   ingredients: [{ text, food: {id,name,source,per100} | null, grams, how }] }
 */

/** Summe aller Zutaten (absolute Werte für das ganze Rezept). */
export function recipeTotals(recipe) {
  const used = (recipe.ingredients || []).filter((i) => i.food && i.grams > 0);
  const { total, missing } = sumNutrients(used.map((i) => scaleNutrients(i.food.per100, i.grams)));
  const rawWeight = used.reduce((s, i) => s + i.grams, 0);
  return { total, missing, rawWeight, usedCount: used.length };
}

/** Gesamtgewicht: gewogenes Gewicht nach dem Kochen, sonst Summe der Zutaten. */
export function recipeWeight(recipe) {
  return recipe.cookedWeight > 0 ? recipe.cookedWeight : recipeTotals(recipe).rawWeight;
}

/** Werte pro Portion. */
export function perServing(recipe) {
  const { total } = recipeTotals(recipe);
  const n = recipe.servings > 0 ? recipe.servings : 1;
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v / n]));
}

/**
 * Macht aus einem Rezept ein "Lebensmittel", damit es wie jedes andere
 * gesucht und ins Tagebuch eingetragen werden kann (Werte pro 100 g + Portion).
 */
export function recipeToFood(recipe) {
  const { total, missing, usedCount } = recipeTotals(recipe);
  const weight = recipeWeight(recipe);
  const per100 = {};
  if (weight > 0) {
    for (const [k, v] of Object.entries(total)) {
      // Nur Nährstoffe, die bei mindestens einer Zutat bekannt sind
      if (missing[k] < usedCount) per100[k] = (v / weight) * 100;
    }
  }
  const servings = recipe.servings > 0 ? recipe.servings : 1;
  return {
    id: recipe.id,
    source: 'recipe',
    name: recipe.name,
    brand: null,
    per100,
    portions: weight > 0 ? [{ label: '1 Portion', grams: Math.round((weight / servings) * 10) / 10 }] : [],
    hasNutrition: weight > 0,
  };
}
