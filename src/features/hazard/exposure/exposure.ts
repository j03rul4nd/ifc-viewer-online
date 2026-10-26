// ─── study area, exposed elements and curve numbers on the hazard grid ───────
// Turns a KMZ (or OSM, when there is none) into what the engine needs:
//   • a MASK of the study area (cells inside its polygon),
//   • EXPOSED ELEMENTS with the cells each covers, classified as housing /
//     school / health / road / other from folder, name, description and data,
//   • a CURVE NUMBER per cell from OSM land cover and the soil group.
// The grid is any regular grid; `toLocal` places a lat/lon in grid-local
// metres (a along i, b along j), so this stays independent of the viewer.

import type { OsmFeature } from '../../../lib/geo/osm-features'
import type { KmlPlacemark, LatLon } from '../io/kml'
import { curveNumber, type LandCover, type Moisture, type SoilGroup } from '../core/scs-cn'
import type { ExposedElement, ExposedKind } from '../core/storm'

export interface HazardGrid {
  nx: number
  ny: number
  dx: number
  toLocal(lat: number, lon: number): { a: number; b: number }
}

type Local = Array<{ a: number; b: number }>

function pointInRing(a: number, b: number, ring: Local): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i], q = ring[j]
    if ((p.b > b) !== (q.b > b) && a < ((q.a - p.a) * (b - p.b)) / (q.b - p.b) + p.a) inside = !inside
  }
  return inside
}

function polygonCells(g: HazardGrid, outer: LatLon[], holes: LatLon[][] = []): number[] {
  const ring = outer.map((p) => g.toLocal(p.lat, p.lon))
  const hs = holes.map((h) => h.map((p) => g.toLocal(p.lat, p.lon)))
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity
  for (const p of ring) { a0 = Math.min(a0, p.a); a1 = Math.max(a1, p.a); b0 = Math.min(b0, p.b); b1 = Math.max(b1, p.b) }
  const out: number[] = []
  const i0 = Math.max(0, Math.floor(a0 / g.dx)), i1 = Math.min(g.nx - 1, Math.floor(a1 / g.dx))
  const j0 = Math.max(0, Math.floor(b0 / g.dx)), j1 = Math.min(g.ny - 1, Math.floor(b1 / g.dx))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const a = (i + 0.5) * g.dx, b = (j + 0.5) * g.dx
      if (pointInRing(a, b, ring) && !hs.some((h) => pointInRing(a, b, h))) out.push(j * g.nx + i)
    }
  }
  // A footprint smaller than a cell still occupies the cell it sits in.
  if (!out.length && ring.length) {
    const c = ring.reduce((s, p) => ({ a: s.a + p.a / ring.length, b: s.b + p.b / ring.length }), { a: 0, b: 0 })
    const k = cellOf(g, c.a, c.b)
    if (k >= 0) out.push(k)
  }
  return out
}

function cellOf(g: HazardGrid, a: number, b: number): number {
  const i = Math.floor(a / g.dx), j = Math.floor(b / g.dx)
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i
}

/** Cells crossed by a polyline, sampled at a quarter cell. */
function lineCells(g: HazardGrid, line: LatLon[]): number[] {
  const set = new Set<number>()
  const pts = line.map((p) => g.toLocal(p.lat, p.lon))
  for (let k = 0; k + 1 < pts.length; k++) {
    const p = pts[k], q = pts[k + 1]
    const steps = Math.max(1, Math.ceil(Math.hypot(q.a - p.a, q.b - p.b) / (g.dx / 4)))
    for (let s = 0; s <= steps; s++) {
      const c = cellOf(g, p.a + ((q.a - p.a) * s) / steps, p.b + ((q.b - p.b) * s) / steps)
      if (c >= 0) set.add(c)
    }
  }
  return [...set]
}

// Words in the languages the tool ships in (and Quechua/Andean usage: "I.E.",
// "posta", "trocha"). Matched on folder + name + description + data values.
const KIND_WORDS: Array<[ExposedKind, RegExp]> = [
  ['health', /\b(salud|hospital|cl[ií]nica|clinic|posta|health|sant[eé]|sa[uú]de|centro m[eé]dico|puesto de salud|policl[ií]nico|ambulatorio|krankenhaus|ospedale)\b/i],
  ['school', /(\bI\.?\s?E\.?(\s|$|\d)|\b(colegio|escuela|school|[eé]cole|escola|educativ|educaci[oó]n|instituci[oó]n educativa|liceo|jard[ií]n infantil|kinder|PRONOEI|universidad|university|schule|scuola)\b)/i],
  ['road', /\b(v[ií]a|carretera|camino|trocha|road|street|calle|avenida|highway|rue|estrada|pista|jir[oó]n|strasse|strada|puente|bridge)\b/i],
  ['housing', /\b(vivienda|viviendas|casa|house|housing|lote|logement|habitatge|habitaci[oó]n|resid|domicilio|hogar|wohn|abitazion)\b/i],
]

export function classifyPlacemark(p: KmlPlacemark): ExposedKind {
  const text = [...p.folders, p.name, p.description, ...Object.values(p.data)].join(' · ')
  for (const [kind, re] of KIND_WORDS) if (re.test(text)) return kind
  // Unnamed lines are almost always roads / tracks in risk KMZs.
  if (p.geometries.every((g) => g.type === 'line')) return 'road'
  return 'other'
}

const AREA_WORDS = /\b([aá]mbito|[aá]rea de estudio|study area|zona de estudio|l[ií]mite|boundary|per[ií]metro|cuenca|microcuenca|catchment|aoi|zona)\b/i

export interface KmlExposure {
  /** 1 = inside the study area; null when the KMZ has no area polygon. */
  mask: Uint8Array | null
  /** The polygon used as study area, for drawing. */
  area: LatLon[] | null
  elements: ExposedElement[]
}

/**
 * The study area is the polygon whose folder or name says so, else the largest
 * polygon that is not an exposed element. Everything else becomes an element.
 */
export function exposureFromKml(placemarks: KmlPlacemark[], g: HazardGrid): KmlExposure {
  const polys = placemarks.flatMap((p, k) => p.geometries
    .filter((x): x is Extract<typeof x, { type: 'polygon' }> => x.type === 'polygon')
    .map((poly) => ({ k, poly, cells: polygonCells(g, poly.outer, poly.holes) })))
  const named = polys.find((x) => AREA_WORDS.test([...placemarks[x.k].folders, placemarks[x.k].name].join(' ')))
  const largest = polys
    .filter((x) => classifyPlacemark(placemarks[x.k]) === 'other')
    .sort((a, b) => b.cells.length - a.cells.length)[0]
  const areaPick = named ?? (largest && largest.cells.length > 0.2 * g.nx * g.ny ? largest : undefined)

  let mask: Uint8Array | null = null
  if (areaPick) {
    mask = new Uint8Array(g.nx * g.ny)
    for (const c of areaPick.cells) mask[c] = 1
  }

  const elements: ExposedElement[] = []
  placemarks.forEach((p, k) => {
    if (areaPick && areaPick.k === k) return
    const cells = new Set<number>()
    for (const geo of p.geometries) {
      if (geo.type === 'point') {
        const l = g.toLocal(geo.point.lat, geo.point.lon)
        const c = cellOf(g, l.a, l.b)
        if (c >= 0) cells.add(c)
      } else if (geo.type === 'line') {
        for (const c of lineCells(g, geo.line)) cells.add(c)
      } else {
        for (const c of polygonCells(g, geo.outer, geo.holes)) cells.add(c)
      }
    }
    if (!cells.size) return
    elements.push({
      id: `kml-${k}`,
      name: p.name || p.folders[p.folders.length - 1] || `#${k + 1}`,
      kind: classifyPlacemark(p),
      cells: [...cells],
    })
  })
  return { mask, area: areaPick ? areaPick.poly.outer : null, elements }
}

/** OSM fallback: schools, health centres, homes and roads within the grid. */
export function exposureFromOsm(features: OsmFeature[], g: HazardGrid): ExposedElement[] {
  const out: ExposedElement[] = []
  for (const f of features) {
    const label = `${f.label ?? ''} ${f.name ?? ''}`
    let kind: ExposedKind | null = null
    if (f.kind === 'building') {
      kind = /school|kindergarten|college|university/i.test(label) ? 'school'
        : /hospital|clinic|doctor|health/i.test(label) ? 'health'
          : /\b(house|home|apartments?|residential|detached|hut|cabin|farm(house)?|bungalow|terrace)\b/i.test(label) ? 'housing'
            : null
    } else if (f.kind === 'road' && f.name) {
      kind = 'road' // named roads only: every unnamed path would drown the table
    }
    if (!kind) continue
    const cells = f.ring
      ? f.kind === 'road' ? lineCells(g, f.ring) : polygonCells(g, f.ring, f.holes)
      : f.point ? [cellOf(g, g.toLocal(f.point.lat, f.point.lon).a, g.toLocal(f.point.lat, f.point.lon).b)].filter((c) => c >= 0)
        : []
    if (cells.length) out.push({ id: `osm-${f.id}`, name: f.name || f.label || f.id, kind, cells })
  }
  return out
}

/** Land cover of an OSM feature, for the curve number. */
export function osmLandCover(f: OsmFeature): LandCover | null {
  const label = (f.label ?? '').toLowerCase()
  switch (f.kind) {
    case 'green':
      if (/forest|wood/.test(label)) return 'forest'
      if (/scrub|heath|shrub/.test(label)) return 'shrub'
      if (/farm|crop|orchard|vineyard|allotment/.test(label)) return 'crop'
      if (/wetland|marsh/.test(label)) return 'wetland'
      return 'grass'
    case 'sand': case 'rock': return 'bare'
    case 'water': return 'water'
    case 'road': case 'rail': return 'road'
    case 'building': return 'urban'
    default: return null
  }
}

/**
 * Curve number per cell: OSM cover where mapped (later layers override earlier,
 * so roads cross fields), `fallback` elsewhere, NaN outside the mask.
 */
export function curveNumberGrid(
  g: HazardGrid,
  features: OsmFeature[],
  soil: SoilGroup,
  moisture: Moisture = 'II',
  fallback: LandCover = 'shrub',
  mask: Uint8Array | null = null,
): Float32Array {
  const n = g.nx * g.ny
  const cn = new Float32Array(n).fill(curveNumber(fallback, soil, moisture))
  const order: LandCover[] = ['forest', 'shrub', 'grass', 'crop', 'wetland', 'bare', 'urban', 'water', 'road']
  const byCover = new Map<LandCover, OsmFeature[]>()
  for (const f of features) {
    const c = osmLandCover(f)
    if (c) byCover.set(c, [...(byCover.get(c) ?? []), f])
  }
  for (const cover of order) {
    const v = curveNumber(cover, soil, moisture)
    for (const f of byCover.get(cover) ?? []) {
      if (!f.ring) continue
      const cells = f.kind === 'road' || f.kind === 'rail' ? lineCells(g, f.ring) : polygonCells(g, f.ring, f.holes)
      for (const c of cells) cn[c] = v
    }
  }
  if (mask) for (let c = 0; c < n; c++) if (!mask[c]) cn[c] = NaN
  return cn
}
