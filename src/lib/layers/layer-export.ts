// ─── layer-export ─────────────────────────────────────────────────────────────
// Take a layer's data out of the viewer: GeoJSON for GIS tools, CSV for a
// spreadsheet or a report ("the 84 empty stations, right now"). What is
// exported is what the scene shows — the rewound moment while time-travelling,
// and optionally only the features of visible groups. Pure; the panel saves
// the file.

import type { VectorFeature, VectorLayerData } from './geojson'
import type { FlatProp } from '../twin/flatten-props'
import { groupIndexOf, type LayerStyle } from './style-groups'

/** Indices of the features to export: all, or only those of visible groups. */
export function exportIndices(rows: FlatProp[][], style: LayerStyle, onlyVisible: boolean): number[] {
  const out: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (onlyVisible) {
      const g = groupIndexOf(rows[i], style)
      const visible = g < 0 ? style.fallback.visible : style.groups[g].visible
      if (!visible) continue
    }
    out.push(i)
  }
  return out
}

/** Our parsed geometry back to standard GeoJSON (lon, lat[, z]). */
export function geometryToGeoJson(f: VectorFeature): Record<string, unknown> {
  const g = f.geometry
  if (g.type === 'point') return g.coords.length === 1 ? { type: 'Point', coordinates: g.coords[0] } : { type: 'MultiPoint', coordinates: g.coords }
  if (g.type === 'line') return g.parts.length === 1 ? { type: 'LineString', coordinates: g.parts[0] } : { type: 'MultiLineString', coordinates: g.parts }
  return g.polygons.length === 1 ? { type: 'Polygon', coordinates: g.polygons[0] } : { type: 'MultiPolygon', coordinates: g.polygons }
}

export function toGeoJsonFile(data: VectorLayerData, indices: number[], groupNames?: string[]): string {
  const features = indices.map((i) => {
    const f = data.features[i]
    const properties = groupNames ? { ...f.properties, _group: groupNames[i] } : f.properties
    return { type: 'Feature', id: f.id, properties, geometry: geometryToGeoJson(f) }
  })
  return JSON.stringify({ type: 'FeatureCollection', features })
}

/** A representative lon/lat: the point, a line's middle vertex, a ring's average. */
export function representativeLonLat(f: VectorFeature): [number, number] | null {
  const g = f.geometry
  const pts = g.type === 'point' ? g.coords : g.type === 'line' ? g.parts[0] : g.polygons[0]?.[0]
  if (!pts || pts.length === 0) return null
  if (g.type === 'point') return [pts[0][0], pts[0][1]]
  if (g.type === 'line') { const p = pts[Math.floor(pts.length / 2)]; return [p[0], p[1]] }
  const n = pts.length
  return [pts.reduce((a, p) => a + p[0], 0) / n, pts.reduce((a, p) => a + p[1], 0) / n]
}

const cell = (v: string): string => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
/** Cells a spreadsheet would run as a formula are neutralised (CSV injection). */
const safe = (v: string): string => (/^[=+\-@\t\r]/.test(v) && !/^-?\d/.test(v) ? `'${v}` : v)

/**
 * One row per feature: lon, lat, the group it falls in, then every property
 * (nested ones as dotted paths), most common first, up to `maxColumns`.
 */
export function toCsvFile(
  data: VectorLayerData, rows: FlatProp[][], indices: number[], groupNames: string[], maxColumns = 200,
): string {
  const freq = new Map<string, number>()
  for (const i of indices) for (const p of rows[i]) if (!p.joined) freq.set(p.field, (freq.get(p.field) ?? 0) + 1)
  const fields = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, maxColumns).map(([f]) => f)
  const head = ['lon', 'lat', 'group', ...fields]
  const lines = [head.map(cell).join(',')]
  for (const i of indices) {
    const ll = representativeLonLat(data.features[i])
    const byField = new Map<string, string>()
    for (const p of rows[i]) if (!p.joined && !byField.has(p.field)) byField.set(p.field, p.value === null ? '' : p.display)
    const vals = [ll ? ll[0].toFixed(6) : '', ll ? ll[1].toFixed(6) : '', groupNames[i] ?? '', ...fields.map((f) => byField.get(f) ?? '')]
    lines.push(vals.map((v) => cell(safe(v))).join(','))
  }
  // A BOM so Excel opens accents correctly.
  return '﻿' + lines.join('\n') + '\n'
}
