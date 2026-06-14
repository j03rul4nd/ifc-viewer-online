// ─── Map provider registry ────────────────────────────────────────────────────
// Built-in basemap providers (plan §3.10 + Appendix A) plus ONE user-defined
// custom slot — the vendor-lock-in escape hatch: any keyed/paid provider works
// by embedding the key in the user's own template, stored only locally.
//
// Licensing is encoded as data, not buried in comments:
//   • requiresTermsNotice — user must acknowledge the provider's terms once
//     before first use (geoStore.termsAccepted). Esri imagery is free only for
//     non-revenue use; EOX Sentinel-2 is CC-BY-NC. Neither may be a silent
//     default — satellite ALWAYS goes through the terms sheet (§9.3).
//   • attribution — shown verbatim in the attribution pill (T17). Removing it
//     violates the provider's license; it is not a style choice.
//   • lastReviewed — month the terms were last manually checked. Re-verify at GA.

import { ok, err, type Result } from '../result'
import { createLogger } from '../logger'
import type { MapProvider } from './geo-types'

const log = createLogger('GeoProviders')

export const DEFAULT_PROVIDER_ID = 'osm'

const LS_CUSTOM = 'ifc-geo-custom-provider:v1'

// ── Built-ins (Appendix A, licensing verified 2026-06) ─────────────────────────

export const BUILTIN_PROVIDERS: readonly MapProvider[] = [
  {
    id: 'osm',
    kind: 'streets',
    urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    tileDimension: 256,
    requiresTermsNotice: false,
    homepage: 'https://www.openstreetmap.org/copyright',
    lastReviewed: '2026-06',
  },
  {
    id: 'opentopomap',
    kind: 'topo',
    urlTemplate: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data © OpenStreetMap contributors, SRTM — style © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
    tileDimension: 256,
    requiresTermsNotice: false,
    homepage: 'https://opentopomap.org',
    lastReviewed: '2026-06',
  },
  {
    // Free ONLY for non-revenue apps under the ArcGIS terms — never a silent
    // default; gated behind explicit user acceptance (requiresTermsNotice).
    id: 'esri-imagery',
    kind: 'satellite',
    urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    maxZoom: 19,
    tileDimension: 256,
    requiresTermsNotice: true,
    homepage: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
    lastReviewed: '2026-06',
  },
  {
    // CC-BY-NC — non-commercial use only. Opt-in with terms notice (NC flag).
    id: 'eox-s2',
    kind: 'satellite',
    urlTemplate: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg',
    attribution: 'Sentinel-2 cloudless by EOX IT Services GmbH (CC-BY-NC-SA 4.0, modified Copernicus Sentinel data)',
    maxZoom: 16,
    tileDimension: 256,
    requiresTermsNotice: true,
    homepage: 'https://s2maps.eu',
    lastReviewed: '2026-06',
  },
  {
    // Low-res global fallback (≈250 m) — open NASA imagery, attribution requested.
    id: 'gibs',
    kind: 'satellite',
    urlTemplate: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    attribution: 'Imagery courtesy NASA EOSDIS GIBS',
    maxZoom: 8,
    tileDimension: 256,
    requiresTermsNotice: false,
    homepage: 'https://nasa-gibs.github.io/gibs-api-docs/',
    lastReviewed: '2026-06',
  },
]

// ── Custom slot ─────────────────────────────────────────────────────────────────

const MAX_TEMPLATE_LENGTH = 2048

/**
 * Validate a user-supplied XYZ / WMTS-REST tile template.
 * Accepts any https URL carrying all three {z} {x} {y} placeholders (order-free,
 * which also covers WMTS REST GetTile templates). Returns the trimmed template.
 */
export function validateCustomTemplate(url: string): Result<string> {
  const trimmed = url.trim()
  if (!trimmed) return err(new Error('emptyTemplate'))
  if (trimmed.length > MAX_TEMPLATE_LENGTH) return err(new Error('templateTooLong'))
  if (/\s/.test(trimmed)) return err(new Error('templateWhitespace'))
  if (!/^https:\/\//i.test(trimmed)) return err(new Error('httpsRequired'))
  for (const ph of ['{z}', '{x}', '{y}'] as const) {
    if (!trimmed.includes(ph)) return err(new Error('missingPlaceholders'))
  }
  try { new URL(trimmed.replace(/\{[zxys]\}/g, '0')) } catch { return err(new Error('invalidUrl')) }
  return ok(trimmed)
}

/** Validate + persist the custom provider slot. Returns the resolved provider. */
export function saveCustomProvider(urlTemplate: string, attribution: string): Result<MapProvider> {
  const v = validateCustomTemplate(urlTemplate)
  if (!v.ok) return v
  const provider = customProvider(v.value, attribution.trim())
  try {
    localStorage.setItem(LS_CUSTOM, JSON.stringify({ urlTemplate: v.value, attribution: provider.attribution }))
  } catch (e) {
    log.warn('custom provider persistence failed:', e)
  }
  return ok(provider)
}

export function loadCustomProvider(): MapProvider | null {
  let raw: string | null = null
  try { raw = localStorage.getItem(LS_CUSTOM) } catch { return null }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const { urlTemplate, attribution } = parsed as { urlTemplate?: unknown; attribution?: unknown }
    if (typeof urlTemplate !== 'string') return null
    const v = validateCustomTemplate(urlTemplate)
    if (!v.ok) return null
    return customProvider(v.value, typeof attribution === 'string' ? attribution : '')
  } catch {
    return null // corrupt entry — treat as unset
  }
}

export function clearCustomProvider(): void {
  try { localStorage.removeItem(LS_CUSTOM) } catch { /* ignore */ }
}

function customProvider(urlTemplate: string, attribution: string): MapProvider {
  return {
    id: 'custom',
    kind: 'custom',
    urlTemplate,
    attribution: attribution || 'Custom tile source (user-configured)',
    maxZoom: 19,
    tileDimension: 256,
    requiresTermsNotice: false, // user supplied it — their terms, their call
    homepage: '',
    lastReviewed: '',
  }
}

// ── Resolution ──────────────────────────────────────────────────────────────────

/** Resolve a provider id ('custom' reads the persisted slot). Null when unknown/unset. */
export function resolveProvider(id: string): MapProvider | null {
  if (id === 'custom') return loadCustomProvider()
  return BUILTIN_PROVIDERS.find((p) => p.id === id) ?? null
}

/**
 * Expand a tile template. Only z/x/y (and a fixed subdomain) go into the URL —
 * never user/model data (INV-5).
 */
export function buildTileUrl(provider: MapProvider, z: number, x: number, y: number): string {
  return provider.urlTemplate
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{s}', 'a')
}
