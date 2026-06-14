/**
 * Centralized SEO configuration.
 *
 * All page-level metadata lives here. Dynamic updates are applied by `useSeo`.
 * If the app gains additional routes/pages, extend `PageSeoConfig` and add
 * entries to `SEO_PAGES`.
 */

// ── Site-wide constants ───────────────────────────────────────────────────────
// Origin (with trailing slash) where the app is served. Environment-driven so the
// same build serves both hosts: GitHub Pages falls back to the project URL, while
// Vercel / a custom domain sets VITE_SITE_URL (see vercel.json).
export const SITE_URL  = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://www.ifcvieweronline.eu/'
export const SITE_NAME = 'IFC Viewer Online'

// ── Per-locale meta ───────────────────────────────────────────────────────────
export interface LocaleMeta {
  /** Browser tab / <title> */
  title: string
  /** <meta name="description"> and og:description */
  description: string
  /** BCP-47 locale string used in og:locale (e.g. 'en_US') */
  ogLocale: string
  /** Twitter card description (shorter; falls back to description if absent) */
  twitterDescription?: string
}

/**
 * Per-locale SEO metadata.
 * Keys are BCP-47 language codes.  When a new locale is added to the registry,
 * add an entry here; otherwise the app falls back to 'en'.
 */
export const LOCALE_META: Record<string, LocaleMeta> = {
  en: {
    title:       'IFC Viewer Online — Free Browser-Based BIM Viewer, Validator & Editor',
    description: 'Free online IFC viewer, validator and non-destructive editor. Open any IFC file directly in your browser — no login, no upload, no plugin. Health Score 0–100 in 30 seconds. 38 rules, GUID auto-fix, IFC export.',
    ogLocale:    'en_US',
    twitterDescription: 'Browser-only IFC viewer with validation, GUID auto-fix, property editing and IFC/GLB export. No login, no upload. Runs via WebAssembly.',
  },
  es: {
    title:       'IFC Viewer Online — Visor BIM Gratuito, Validador y Editor en el Navegador',
    description: 'Visor, validador y editor IFC gratuito. Abre cualquier archivo IFC en tu navegador — sin login, sin subida, sin plugins. Health Score 0–100 en 30 segundos. 38 reglas, corrección GUID, exportar IFC.',
    ogLocale:    'es_ES',
    twitterDescription: 'Visor IFC en el navegador con validación, corrección GUID, edición de propiedades y exportación IFC/GLB. Sin login, sin subida. Funciona con WebAssembly.',
  },
}

// ── OG image ─────────────────────────────────────────────────────────────────
/** Absolute URL to the social sharing image (1200×630 recommended). */
export const OG_IMAGE_URL = `${SITE_URL}og-image.png`

// ── Structured data helpers ───────────────────────────────────────────────────
/** Returns the WebApplication JSON-LD object as a plain JS value. */
export function buildWebAppJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: SITE_URL,
    description:
      'A free, browser-only IFC model viewer, validator, and non-destructive editor. Get a Health Score 0–100 in 30 seconds. 38 validation rules. Supports IFC2x3, IFC4, IFC4x1, IFC4x3. Runs via WebAssembly — files never leave your machine.',
    applicationCategory: 'AEC / BIM software',
    operatingSystem: 'Any (browser-based: Chrome, Edge, Firefox, Safari)',
    browserRequirements: 'Requires a modern browser with WebGL and WebAssembly support.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Multi-model IFC loading',
      'OPFS geometry cache — 10× faster repeat loads',
      '38 IFC validation rules — GUID format, spatial hierarchy, clash detection, coordinate offset, proxy overuse, and more',
      'Batch GUID auto-fix',
      'Non-destructive property editing (Name, LongName, Description, Pset values)',
      'Undo/redo command history',
      'IFC export with applied diffs',
      'GLB export',
      'Quantity takeoff (IfcElementQuantity)',
      'Spatial hierarchy tree with virtualised rendering',
      'Camera presets (ISO, Top, Front, Left, Right)',
      'Model transform controls',
      'Validation error 3D highlights',
      'No server, no login, no upload',
    ],
    author: { '@type': 'Person', name: 'Joel Benitez', url: 'https://github.com/j03rul4nd' },
    softwareVersion: '0.1.0',
    license: 'https://opensource.org/licenses/MIT',
    codeRepository: 'https://github.com/j03rul4nd/ifc-viewer-online',
    keywords: 'IFC, BIM, viewer, validator, WebAssembly, three.js, web-ifc, BuildingSMART, IFC4, IFC2x3',
  }
}
