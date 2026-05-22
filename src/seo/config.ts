/**
 * Centralized SEO configuration.
 *
 * All page-level metadata lives here. Dynamic updates are applied by `useSeo`.
 * If the app gains additional routes/pages, extend `PageSeoConfig` and add
 * entries to `SEO_PAGES`.
 */

import type { SupportedLocale } from '../i18n/config'

// ── Site-wide constants ───────────────────────────────────────────────────────
export const SITE_URL  = 'https://j03rul4nd.github.io/ifc-viewer-online/'
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

export const LOCALE_META: Record<SupportedLocale, LocaleMeta> = {
  en: {
    title:       'IFC Viewer Online — Free Browser-Based BIM Viewer, Validator & Editor',
    description: 'Free online IFC viewer, validator and non-destructive editor. Open any IFC file directly in your browser — no login, no upload, no plugin. Multi-model, 18 rules, GUID auto-fix, IFC export.',
    ogLocale:    'en_US',
    twitterDescription: 'Browser-only IFC viewer with validation, GUID auto-fix, property editing and IFC/GLB export. No login, no upload. Runs via WebAssembly.',
  },
  es: {
    title:       'IFC Viewer Online — Visor BIM Gratuito, Validador y Editor en el Navegador',
    description: 'Visor, validador y editor IFC gratuito. Abre cualquier archivo IFC en tu navegador — sin login, sin subida, sin plugins. Multi-modelo, 18 reglas, corrección GUID, exportar IFC.',
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
      'A free, browser-only IFC model viewer, validator, and non-destructive editor. Supports IFC2x3, IFC4, and IFC4x3. Runs via WebAssembly — files never leave your machine.',
    applicationCategory: 'AEC / BIM software',
    operatingSystem: 'Any (browser-based: Chrome, Edge, Firefox, Safari)',
    browserRequirements: 'Requires a modern browser with WebGL and WebAssembly support.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Multi-model IFC loading',
      'OPFS geometry cache — 10× faster repeat loads',
      '18 IFC validation rules including GUID format, spatial hierarchy, clash detection',
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
