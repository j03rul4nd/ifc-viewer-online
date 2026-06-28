// ─── model-vocab.ts ───────────────────────────────────────────────────────────
// Main-thread model vocabulary for the EIR editor: which IFC classes are present
// in the loaded scene and how many elements each has. Derived from the per-model
// `categories` (already computed at load time — no worker, no IFC re-parse), so
// the editor can show a live "this rule matches N elements" applicability hint.
// Pure + unit-tested.

interface CategoryLike { id: string; count: number }
interface ModelLike { categories: CategoryLike[] }

/** Engine-equivalent class canonicalisation (matches ids-engine-facets canonClass). */
export function canonClass(s: string): string {
  return s.toUpperCase().replace('STANDARDCASE', '').replace('ELEMENTEDCASE', '')
}

/**
 * Element count per canonical IFC class, summed across every loaded model.
 * STANDARDCASE/ELEMENTEDCASE variants collapse into their base class, mirroring
 * how the IDS engine matches an entity facet.
 */
export function modelClassCounts(models: readonly ModelLike[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of models) {
    for (const c of m.categories) {
      const k = canonClass(c.id)
      out.set(k, (out.get(k) ?? 0) + c.count)
    }
  }
  return out
}

/**
 * How many elements an EIR rule's `entity` matches in the loaded model.
 * Class-level only (predefined-type narrowing isn't known here) — callers should
 * present it as an upper bound when a predefinedType is set. Returns 0 for an
 * empty entity or a class absent from the model.
 */
export function applicabilityCount(counts: Map<string, number>, entity: string): number {
  if (!entity) return 0
  return counts.get(canonClass(entity)) ?? 0
}
