// ─── Demo model categories ────────────────────────────────────────────────────
// Centralised category definitions for the demo gallery. The category *labels*
// are translated through i18n (see the `demoGallery.categories.*` keys in each
// locale's landing.json); this file only owns the canonical id list and the
// visual accent used by the gallery chips/cards.
//
// To add a category: append it to DEMO_CATEGORIES, add an accent in CATEGORY_META,
// and add a label in every locale's landing.json under demoGallery.categories.

export const DEMO_CATEGORIES = [
  // Not a building type — the kind of file. It holds the models we authored
  // ourselves to be read rather than admired, starting with IFC Hello World.
  'Reference',
  'Residential',
  'Commercial',
  'Industrial',
  'MEP',
  'Structural',
  'Infrastructure',
] as const

export type DemoCategory = (typeof DEMO_CATEGORIES)[number]

/** Per-category accent colour (CSS rgb/hex) used for the gallery chip + card tag. */
export const CATEGORY_META: Record<DemoCategory, { accent: string }> = {
  Reference:      { accent: '#94A3B8' },
  Residential:    { accent: '#6FB8D9' },
  Commercial:     { accent: '#5E6AD2' },
  Industrial:     { accent: '#C99A4B' },
  MEP:            { accent: '#3FB68B' },
  Structural:     { accent: '#A78BFA' },
  Infrastructure: { accent: '#D98A6F' },
}

/** i18n key (within the `landing` namespace) for a category's display label. */
export function categoryLabelKey(category: DemoCategory): string {
  return `demoGallery.categories.${category.toLowerCase()}`
}
