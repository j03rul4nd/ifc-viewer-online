// ─── bcf-measure ──────────────────────────────────────────────────────────────
// Measurements inside a BCF issue. BCF has no element for a measurement, but
// every viewpoint can carry <Lines>, and every BCF tool draws them: that is how
// a dimension reaches Revit, Navisworks or BIMcollab. The value travels as
// text in the issue, because a line has a length but not a name, a unit or a
// requirement.
//
// Inside the app the measurements themselves ride along too (`toSaved`), so
// opening the viewpoint here brings back the whole item, not just its lines.
//
// Pure: items in, lines and text out. Scene axes throughout — the BCF writer
// converts to IFC axes, exactly as it does for the camera.

import type { BcfLine } from '../../types'
import { formatItemValue } from './measure-math'
import { toSaved, type SavedMeasurement } from './measure-file'
import type { MeasureItem, MeasureSettings, Vec3 } from './measure-types'

const seg = (a: Vec3, b: Vec3): BcfLine => ({ start: { ...a }, end: { ...b } })

/** The segments that draw one measurement. Points have none. */
export function measureLines(item: MeasureItem): BcfLine[] {
  const p = item.points
  switch (item.kind) {
    case 'distance':
      return p.length >= 2 ? [seg(p[0], p[1])] : []
    case 'path':
      return p.slice(1).map((q, i) => seg(p[i], q))
    case 'area':
      // Closed: the last edge goes back to the first vertex.
      return p.length >= 3 ? p.map((q, i) => seg(q, p[(i + 1) % p.length])) : []
    case 'angle':
      // Two arms from the vertex, which is the middle point.
      return p.length >= 3 ? [seg(p[1], p[0]), seg(p[1], p[2])] : []
    case 'point':
      return []
  }
}

export interface MeasureAnnotations {
  lines: BcfLine[]
  /** One line of text per measurement, "Name: value" (+ requirement verdict when set). */
  notes: string[]
  measurements: SavedMeasurement[]
}

/**
 * What a viewpoint should carry for the measurements on screen. Hidden ones
 * stay out: the issue shows what the person was looking at.
 */
export function measureAnnotations(
  items: readonly MeasureItem[],
  settings: MeasureSettings,
  nameOf: (item: MeasureItem) => string,
): MeasureAnnotations {
  const shown = items.filter((i) => i.visible)
  return {
    lines: shown.flatMap(measureLines),
    notes: shown.map((i) => `${nameOf(i)}: ${formatItemValue(i, settings)}${i.note ? ` — ${i.note}` : ''}`),
    measurements: shown.map(toSaved),
  }
}

/**
 * Measurements to restore from a viewpoint: the app's own when it wrote them,
 * else one distance per line another tool drew.
 */
export function measurementsFromViewpoint(vp: { lines?: BcfLine[]; measurements?: SavedMeasurement[] }): SavedMeasurement[] {
  if (vp.measurements && vp.measurements.length > 0) return vp.measurements
  return (vp.lines ?? []).map((l) => ({
    kind: 'distance' as const,
    name: null,
    visible: true,
    points: [{ ...l.start }, { ...l.end }],
  }))
}
