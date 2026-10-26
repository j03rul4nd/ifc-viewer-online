// ─── critical-rainfall table: CSV and GeoJSON ────────────────────────────────
// One row per exposed element: its kind, the cumulative rain at which it was
// first reached and by what. GeoJSON carries the element's cell centres as a
// MultiPoint in WGS84 so the table opens straight in QGIS / Google Earth.

import type { CriticalRain, ExposedElement } from '../core/storm'

export interface CriticalRow extends CriticalRain {
  name: string
  kind: ExposedElement['kind']
}

export function criticalRows(elements: ExposedElement[], critical: CriticalRain[]): CriticalRow[] {
  const byId = new Map(critical.map((c) => [c.id, c]))
  return elements
    .map((e) => ({ name: e.name, kind: e.kind, ...(byId.get(e.id) ?? { id: e.id, rainMm: null, cause: null }) }))
    // Most exposed first: lowest critical rain, the never-reached last.
    .sort((a, b) => (a.rainMm ?? Infinity) - (b.rainMm ?? Infinity) || a.name.localeCompare(b.name))
}

const csvCell = (v: string | number | null): string => {
  if (v === null) return ''
  const s = String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function criticalRainCsv(rows: CriticalRow[], headers = ['id', 'name', 'kind', 'critical_rain_mm', 'cause']): string {
  const lines = [headers.join(',')]
  for (const r of rows) lines.push([r.id, r.name, r.kind, r.rainMm === null ? null : Math.round(r.rainMm * 10) / 10, r.cause].map(csvCell).join(','))
  return lines.join('\n') + '\n'
}

export function criticalRainGeoJson(
  rows: CriticalRow[],
  elements: ExposedElement[],
  cellToLatLon: (cell: number) => { lat: number; lon: number },
): string {
  const byId = new Map(elements.map((e) => [e.id, e]))
  return JSON.stringify({
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      properties: { id: r.id, name: r.name, kind: r.kind, critical_rain_mm: r.rainMm, cause: r.cause },
      geometry: {
        type: 'MultiPoint',
        coordinates: (byId.get(r.id)?.cells ?? []).map((c) => {
          const p = cellToLatLon(c)
          return [Math.round(p.lon * 1e7) / 1e7, Math.round(p.lat * 1e7) / 1e7]
        }),
      },
    })),
  })
}
