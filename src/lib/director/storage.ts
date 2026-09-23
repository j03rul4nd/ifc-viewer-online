// ─── Saved recipes — the user's own templates, in this browser ────────────────
// Local only (nothing leaves the device) and sanitised on every read: a
// hand-edited or older entry can never break the director.

import { BUILT_IN_RECIPES, DEFAULT_RECIPE_ID, sanitizeRecipe, type Recipe } from './recipe'

const KEY = 'ifc-director-recipes:v1'
const LAST = 'ifc-director-last:v1'
const MAX_SAVED = 30

export function loadSavedRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.slice(0, MAX_SAVED).map((r, i) => sanitizeRecipe(r, `custom-${i}`))
  } catch {
    return []
  }
}

function write(list: Recipe[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED))) } catch { /* private mode / quota */ }
}

/** Save (or overwrite by id) a custom recipe. Built-ins are saved as a copy. */
export function saveRecipe(recipe: Recipe): Recipe {
  const id = recipe.builtIn || !recipe.id.startsWith('custom-') ? `custom-${Date.now().toString(36)}` : recipe.id
  const saved = sanitizeRecipe({ ...recipe, id }, id)
  const list = loadSavedRecipes().filter((r) => r.id !== id)
  write([saved, ...list])
  return saved
}

export function deleteRecipe(id: string): void {
  write(loadSavedRecipes().filter((r) => r.id !== id))
}

export function allRecipes(): Recipe[] {
  return [...BUILT_IN_RECIPES, ...loadSavedRecipes()]
}

export function lastRecipeId(): string {
  try { return localStorage.getItem(LAST) || DEFAULT_RECIPE_ID } catch { return DEFAULT_RECIPE_ID }
}

export function rememberRecipe(id: string): void {
  try { localStorage.setItem(LAST, id) } catch { /* ignore */ }
}
