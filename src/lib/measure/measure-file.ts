// ─── measure-file ─────────────────────────────────────────────────────────────
// Measurements as a file: save the list (with its requirements, heights and
// notes) and open it again — tomorrow, or on a colleague's machine with the
// same models. Pure: JSON in, validated items out.
//
// WHAT IS STORED. Points in scene coordinates (three axes, metres), which is
// what the scene is built from; the models the measurements were taken on, by
// file name, so opening the file over different models can warn instead of
// silently drawing dimensions in the air. Values are NOT trusted from the file:
// the system recomputes them from the points, so an edited file cannot claim a
// corridor is wider than its own two points say.
//
// THE SAME FORMAT keeps the last session in localStorage, keyed by the set of
// models loaded, so a reload offers the measurements back.

import type { Anchor, GeoPoint, MeasureItem, MeasureKind, Requirement, Vec3 } from './measure-types'

export const MEASURE_FILE_FORMAT = 'ifcviewer-measurements'
export const MEASURE_FILE_VERSION = 1

/** What survives a save: geometry and annotations, no ids, no derived values. */
export interface SavedMeasurement {
  kind: MeasureKind
  name: string | null
  visible: boolean
  points: Vec3[]
  perpendicular?: boolean
  source?: 'elements' | 'headroom'
  clash?: boolean
  approximate?: boolean
  areaSource?: 'polygon' | 'face'
  /** Point items: the coordinates shown (in the model's own frame), kept as measured. */
  coords?: Vec3
  frame?: 'model' | 'scene'
  requirement?: Requirement | null
  extrusion?: number | null
  note?: string | null
  anchors?: (Anchor | null)[]
  geo?: GeoPoint | null
}

export interface MeasureFile {
  format: typeof MEASURE_FILE_FORMAT
  version: number
  savedAt: string
  /** File names of the models loaded when the measurements were taken. */
  models: string[]
  measurements: SavedMeasurement[]
}

const POINTS_OF: Record<MeasureKind, [number, number]> = {
  distance: [2, 2], path: [2, 10_000], area: [3, 10_000], angle: [3, 3], point: [1, 1],
}

/** A stable key for a set of models: same files in any order, same key. */
export function modelSetKey(fileNames: readonly string[]): string {
  return [...new Set(fileNames.map((f) => f.trim().toLowerCase()).filter(Boolean))].sort().join('|')
}

export function toSaved(item: MeasureItem): SavedMeasurement {
  const s: SavedMeasurement = {
    kind: item.kind, name: item.name, visible: item.visible,
    points: item.points.map((p) => ({ x: p.x, y: p.y, z: p.z })),
  }
  if (item.requirement) s.requirement = item.requirement
  if (item.note) s.note = item.note
  if (item.anchors?.some(Boolean)) s.anchors = item.anchors
  switch (item.kind) {
    case 'distance':
      if (item.perpendicular) s.perpendicular = true
      if (item.source) s.source = item.source
      if (item.clash) s.clash = true
      if (item.approximate) s.approximate = true
      break
    case 'area':
      s.areaSource = item.source
      if (item.extrusion) s.extrusion = item.extrusion
      break
    case 'point':
      s.coords = { ...item.coords }
      s.frame = item.frame
      if (item.geo) s.geo = item.geo
      break
  }
  return s
}

export function serializeMeasurements(items: readonly MeasureItem[], models: readonly string[], now = new Date()): string {
  const file: MeasureFile = {
    format: MEASURE_FILE_FORMAT,
    version: MEASURE_FILE_VERSION,
    savedAt: now.toISOString(),
    models: [...models],
    measurements: items.map(toSaved),
  }
  return JSON.stringify(file, null, 2)
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const vec = (v: unknown): Vec3 | null => {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  return isNum(o.x) && isNum(o.y) && isNum(o.z) ? { x: o.x, y: o.y, z: o.z } : null
}

function requirement(v: unknown): Requirement | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.op !== 'min' && o.op !== 'max' && o.op !== 'range') return null
  if (o.target !== 'value' && o.target !== 'slope' && o.target !== 'height' && o.target !== 'volume') return null
  const num = (x: unknown) => (isNum(x) ? x : null)
  return { op: o.op, target: o.target, min: num(o.min), max: num(o.max) }
}

function anchor(v: unknown): Anchor | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.model === 'string' && o.model) return { model: o.model.slice(0, 200) }
  const m = o.map as Record<string, unknown> | undefined
  if (m?.kind === 'terrain') return { map: { kind: 'terrain' } }
  if (m?.kind === 'building') {
    const str = (x: unknown) => (typeof x === 'string' ? x.slice(0, 120) : undefined)
    return { map: {
      kind: 'building', id: str(m.id) ?? null, name: str(m.name), label: str(m.label),
      heightM: isNum(m.heightM) ? m.heightM : undefined,
      heightBasis: m.heightBasis === 'height' || m.heightBasis === 'levels' || m.heightBasis === 'guess' ? m.heightBasis : undefined,
    } }
  }
  return null
}

const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export type ParseResult =
  | { ok: true; file: MeasureFile; skipped: number }
  | { ok: false; error: 'not-json' | 'not-measurements' | 'newer-version' }

/**
 * Read a file. Bad entries are skipped and counted rather than failing the
 * whole file: nine good dimensions are worth opening with one broken one.
 */
export function parseMeasurements(raw: string): ParseResult {
  let data: unknown
  try { data = JSON.parse(raw) } catch { return { ok: false, error: 'not-json' } }
  if (!data || typeof data !== 'object') return { ok: false, error: 'not-measurements' }
  const o = data as Record<string, unknown>
  if (o.format !== MEASURE_FILE_FORMAT || !Array.isArray(o.measurements)) return { ok: false, error: 'not-measurements' }
  if (isNum(o.version) && o.version > MEASURE_FILE_VERSION) return { ok: false, error: 'newer-version' }

  const out: SavedMeasurement[] = []
  let skipped = 0
  for (const raw of o.measurements as unknown[]) {
    const m = raw as Record<string, unknown> | null
    const kind = m?.kind
    if (!m || (kind !== 'distance' && kind !== 'path' && kind !== 'area' && kind !== 'angle' && kind !== 'point')) { skipped++; continue }
    const pts = Array.isArray(m.points) ? (m.points as unknown[]).map(vec) : []
    const [lo, hi] = POINTS_OF[kind]
    if (pts.some((p) => !p) || pts.length < lo || pts.length > hi) { skipped++; continue }
    const s: SavedMeasurement = {
      kind, name: text(m.name, 60), visible: m.visible !== false, points: pts as Vec3[],
      requirement: requirement(m.requirement), note: text(m.note, 120),
    }
    if (kind === 'distance') {
      if (m.perpendicular === true) s.perpendicular = true
      if (m.source === 'elements' || m.source === 'headroom') s.source = m.source
      if (m.clash === true) s.clash = true
      if (m.approximate === true) s.approximate = true
    }
    if (kind === 'area') {
      s.areaSource = m.areaSource === 'face' ? 'face' : 'polygon'
      s.extrusion = isNum(m.extrusion) && m.extrusion !== 0 ? m.extrusion : null
    }
    if (kind === 'point') {
      s.coords = vec(m.coords) ?? undefined
      s.frame = m.frame === 'model' ? 'model' : 'scene'
      const g = m.geo as Record<string, unknown> | undefined
      if (g && isNum(g.lat) && isNum(g.lon) && Math.abs(g.lat) <= 90 && Math.abs(g.lon) <= 180) {
        s.geo = { lat: g.lat, lon: g.lon, elevationM: isNum(g.elevationM) ? g.elevationM : null }
      }
    }
    if (Array.isArray(m.anchors)) {
      const list = (m.anchors as unknown[]).slice(0, pts.length).map(anchor)
      if (list.some(Boolean)) s.anchors = list
    }
    out.push(s)
  }
  const models = Array.isArray(o.models) ? (o.models as unknown[]).filter((x): x is string => typeof x === 'string') : []
  return {
    ok: true, skipped,
    file: {
      format: MEASURE_FILE_FORMAT, version: MEASURE_FILE_VERSION,
      savedAt: typeof o.savedAt === 'string' ? o.savedAt : '', models, measurements: out,
    },
  }
}

/** Models in the file that are not loaded now — the panel warns about them. */
export function missingModels(fileModels: readonly string[], loaded: readonly string[]): string[] {
  const have = new Set(loaded.map((f) => f.trim().toLowerCase()))
  return fileModels.filter((f) => !have.has(f.trim().toLowerCase()))
}
