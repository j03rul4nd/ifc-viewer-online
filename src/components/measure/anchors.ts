// ─── anchors ──────────────────────────────────────────────────────────────────
// What each end of a measurement stands on, in words: the model's file, an OSM
// building by name (with its mapped height), or the ground. One formatter for
// the row and the export so they never disagree.

import type { TFunction } from 'i18next'

type T = TFunction<'measurement'>
import type { Anchor, GeoPoint, MeasureItem, MeasureSettings } from '../../lib/measure/measure-types'
import { formatLength, formatNumber } from '../../lib/measure/measure-math'

/** "BCN-…-S-0001.ifc" → "S-0001": the discipline code is what people tell models apart by. */
export function shortModelName(file: string): string {
  const bare = file.replace(/\.(ifc|ifczip|ifcxml|frag)$/i, '')
  const parts = bare.split('-')
  return parts.length > 3 ? parts.slice(-2).join('-') : bare
}

export function anchorText(a: Anchor | null | undefined, t: T, s: MeasureSettings): string {
  if (!a) return '—'
  if (a.model) return shortModelName(a.model)
  const m = a.map
  if (!m) return '—'
  if (m.kind === 'terrain') return t('anchor.terrain')
  const who = m.name ?? m.label ?? t('anchor.building')
  const h = m.heightM !== undefined
    ? ` · ${m.heightBasis === 'guess' ? '≈ ' : ''}${formatLength(m.heightM, { ...s, precision: 0 })}`
    : ''
  return `OSM: ${who}${h}`
}

/** "S-0001 → OSM: Torre Mapfre · 154 m", or null when nothing is known. */
export function anchorsLine(item: MeasureItem, t: T, s: MeasureSettings): string | null {
  const a = item.anchors
  if (!a || !a.some(Boolean)) return null
  if (a.length === 1) return anchorText(a[0], t, s)
  const first = a[0], last = a[a.length - 1]
  // Same thing at both ends (two points on one wall): say it once.
  const ta = anchorText(first, t, s), tb = anchorText(last, t, s)
  return ta === tb ? ta : `${ta} → ${tb}`
}

/** Different models (or a model and the map) at the two ends: a coordination measurement. */
/**
 * What a measurement's two ends stand on, when they differ: two IFC models,
 * a model and the map (an OSM building or the relief), or two map features.
 * Null when both ends are on the same thing — the common case, no tag.
 */
export type CrossKind = 'models' | 'modelMap' | 'map'

export function crossKind(item: MeasureItem): CrossKind | null {
  const a = item.anchors
  if (!a || a.length < 2 || !a[0] || !a[a.length - 1]) return null
  const first = a[0]!, last = a[a.length - 1]!
  const k = (x: Anchor) => x.model ?? (x.map?.kind === 'building' ? `osm:${x.map.id}` : x.map?.kind ?? '')
  if (k(first) === k(last)) return null
  const onModel = (x: Anchor) => !!x.model
  if (onModel(first) && onModel(last)) return 'models'
  if (onModel(first) || onModel(last)) return 'modelMap'
  return 'map'
}

export function formatLatLon(g: GeoPoint, locale: string): string {
  const f = (v: number, pos: string, neg: string) => `${formatNumber(Math.abs(v), 6, locale, false)}° ${v >= 0 ? pos : neg}`
  return `${f(g.lat, 'N', 'S')}, ${f(g.lon, 'E', 'W')}`
}
