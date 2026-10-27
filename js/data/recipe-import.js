// Rezepte von Websites oder aus eingefügtem Text übernehmen.
//
// Fast alle Rezeptseiten (Chefkoch, Lecker, Kitchen Stories, …) enthalten die Rezeptdaten
// zusätzlich maschinenlesbar im Format schema.org "Recipe" (JSON-LD). Das lesen wir aus.
//
// Eine Web-App darf fremde Seiten aus Sicherheitsgründen nicht direkt laden (CORS).
// Deshalb geht der Abruf über einen kleinen Vermittlungsdienst ("Proxy"):
//   - eigener Cloudflare Worker (empfohlen, Anleitung in tools/recipe-proxy/README.md)
//   - sonst der öffentliche Dienst allorigins.win (sieht nur die Rezept-Adresse)
// In der späteren iOS-App ist kein Proxy mehr nötig (dort gilt CORS nicht).

const PUBLIC_PROXY = 'https://api.allorigins.win/raw?url=';

function proxiedUrl(url, proxy) {
  if (window.Capacitor?.isNativePlatform?.()) return url; // iOS-App: direkt
  if (proxy?.url) {
    const u = new URL(proxy.url);
    u.searchParams.set('url', url);
    if (proxy.key) u.searchParams.set('key', proxy.key);
    return u.toString();
  }
  return PUBLIC_PROXY + encodeURIComponent(url);
}

/** Lädt eine Rezeptseite und gibt das gefundene Rezept zurück. */
export async function importFromUrl(url, proxy) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Bitte eine vollständige Adresse eingeben (mit https://).');
  let res;
  try {
    res = await fetch(proxiedUrl(url, proxy));
  } catch {
    throw new Error('Die Seite konnte nicht geladen werden (Internet oder Vermittlungsdienst nicht erreichbar).');
  }
  if (!res.ok) throw new Error(`Die Seite konnte nicht geladen werden (Fehler ${res.status}).`);
  const html = await res.text();
  const recipe = parseRecipeHtml(html, url);
  if (!recipe) throw new Error('Auf dieser Seite wurden keine Rezeptdaten gefunden. Du kannst den Zutatentext stattdessen einfügen.');
  return recipe;
}

// ---------- schema.org Recipe aus HTML lesen ----------

function asArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function isRecipe(node) {
  return asArray(node?.['@type']).some((t) => String(t).toLowerCase() === 'recipe');
}

function findRecipeNode(data) {
  for (const node of asArray(data)) {
    if (!node || typeof node !== 'object') continue;
    if (isRecipe(node)) return node;
    const inner = findRecipeNode(node['@graph']) || findRecipeNode(node.mainEntity) || findRecipeNode(node.itemListElement);
    if (inner) return inner;
  }
  return null;
}

function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

function cleanText(s) {
  return decodeEntities(String(s ?? ''))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function instructionsToList(ins) {
  const out = [];
  for (const step of asArray(ins)) {
    if (typeof step === 'string') {
      out.push(...step.split(/\n+/).map(cleanText).filter(Boolean));
    } else if (step?.['@type'] === 'HowToSection') {
      if (step.name) out.push(`— ${cleanText(step.name)} —`);
      out.push(...instructionsToList(step.itemListElement));
    } else if (step?.text || step?.name) {
      out.push(cleanText(step.text || step.name));
    }
  }
  return out;
}

/** "4 Portionen", ["4", "4 Stück"], 4 → 4 */
export function parseServings(y) {
  for (const v of asArray(y)) {
    const m = String(v).match(/\d+/);
    if (m) return Number(m[0]);
  }
  return null;
}

function imageUrl(img) {
  const first = asArray(img)[0];
  if (!first) return null;
  return typeof first === 'string' ? first : first.url || null;
}

/** Sucht in HTML nach einem schema.org-Rezept. Gibt null zurück, wenn keins da ist. */
export function parseRecipeHtml(html, sourceUrl = null) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let node = null;
  for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      node = findRecipeNode(JSON.parse(s.textContent));
    } catch {
      // manche Seiten haben fehlerhaftes JSON – nächsten Block versuchen
    }
    if (node) break;
  }
  if (node) {
    return {
      name: cleanText(node.name) || 'Rezept',
      servings: parseServings(node.recipeYield) || 1,
      ingredientLines: asArray(node.recipeIngredient || node.ingredients).map(cleanText).filter(Boolean),
      instructions: instructionsToList(node.recipeInstructions),
      image: imageUrl(node.image),
      sourceUrl: sourceUrl || node.url || null,
    };
  }

  // Fallback: Microdata (itemprop="recipeIngredient")
  const items = [...doc.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]')].map((e) => cleanText(e.textContent));
  if (items.length) {
    return {
      name: cleanText(doc.querySelector('[itemprop="name"]')?.textContent || doc.title) || 'Rezept',
      servings: parseServings(doc.querySelector('[itemprop="recipeYield"]')?.textContent) || 1,
      ingredientLines: items.filter(Boolean),
      instructions: [...doc.querySelectorAll('[itemprop="recipeInstructions"]')].map((e) => cleanText(e.textContent)).filter(Boolean),
      image: null,
      sourceUrl,
    };
  }
  return null;
}

/**
 * Eingefügter Text: Ist es HTML, wird darin gesucht. Sonst gilt:
 * erste Zeile = Name (wenn sie keine Menge enthält), "Für 4 Personen" = Portionen,
 * Zeilen bis zu einer Leerzeile/"Zubereitung" = Zutaten, Rest = Zubereitung.
 */
export function parseRecipeText(text) {
  if (/<html|<script|<div/i.test(text)) {
    const r = parseRecipeHtml(text);
    if (r) return r;
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  let name = 'Neues Rezept';
  let servings = 1;
  const ingredientLines = [];
  const instructions = [];
  let mode = 'ingredients';

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) {
      if (ingredientLines.length) mode = mode === 'ingredients' ? 'maybe-end' : mode;
      continue;
    }
    const servingMatch = l.match(/(?:für|fuer|ergibt)?\s*(\d+)\s*(portion(?:en)?|person(?:en)?|stück|stueck)\b/i);
    if (servingMatch && l.length < 40) {
      servings = Number(servingMatch[1]);
      continue;
    }
    if (/^(zutaten|ingredients)\b:?$/i.test(l)) {
      mode = 'ingredients';
      continue;
    }
    if (/^(zubereitung|anleitung|so geht'?s|instructions)\b/i.test(l)) {
      mode = 'instructions';
      continue;
    }
    if (i === 0 && !/^\d|^[½¼¾]/.test(l) && !ingredientLines.length) {
      name = l;
      continue;
    }
    if (mode === 'maybe-end') mode = l.length > 80 ? 'instructions' : 'ingredients';
    if (mode === 'ingredients' && l.length <= 120) ingredientLines.push(l);
    else instructions.push(l);
  }
  return { name, servings, ingredientLines, instructions, image: null, sourceUrl: null };
}
