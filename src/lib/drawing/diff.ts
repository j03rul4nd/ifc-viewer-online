// ─── What changed between two sheets ──────────────────────────────────────────
// Compared in model space, segment by segment, so a revision re-exported with its
// polylines broken differently, or in other units, doesn't read as all new.
// Text compares by content and place.

import { entityPolylines, toModel, type Drawing, type Layer, type NewEntity, type Pt } from './types'

export interface SheetDiff { layers: Layer[]; entities: NewEntity[]; added: number; removed: number; same: number }

export const DIFF_LAYERS = { added: 'ADDED', removed: 'REMOVED', same: 'UNCHANGED' } as const

type Source = Pick<Drawing, 'entities' | 'layers' | 'placement'>

function keyed(d: Source, tol: number): Map<string, NewEntity> {
  const on = new Set(d.layers.filter((l) => l.visible).map((l) => l.name))
  const q = (p: Pt) => `${Math.round(p.x / tol)},${Math.round(p.y / tol)}`
  const out = new Map<string, NewEntity>()
  for (const e of d.entities) {
    if (!on.has(e.layer)) continue
    if (e.kind === 'text') {
      const at = toModel(d.placement, e.at)
      out.set(`t|${q(at)}|${e.text}`, { kind: 'text', layer: '', color: null, at, height: e.height * d.placement.scale, rotation: e.rotation + d.placement.rotation, text: e.text, align: e.align })
      continue
    }
    for (const pl of entityPolylines(e)) {
      const pts = pl.points.map((p) => toModel(d.placement, p))
      const n = pts.length
      for (let i = 0; i < (pl.closed ? n : n - 1); i++) {
        const a = pts[i]; const b = pts[(i + 1) % n]
        const ka = q(a); const kb = q(b)
        if (ka === kb) continue
        out.set(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`, { kind: 'line', layer: '', color: null, a, b })
      }
    }
  }
  return out
}

/** `before` → `after`. The result is in model space, so its placement is the identity. */
export function diffSheets(before: Source, after: Source, tolerance = 0.005): SheetDiff {
  const a = keyed(before, tolerance)
  const b = keyed(after, tolerance)
  const entities: NewEntity[] = []
  let added = 0; let removed = 0; let same = 0
  for (const [k, e] of b) {
    if (a.has(k)) { same++; entities.push({ ...e, layer: DIFF_LAYERS.same }) } else { added++; entities.push({ ...e, layer: DIFF_LAYERS.added }) }
  }
  for (const [k, e] of a) if (!b.has(k)) { removed++; entities.push({ ...e, layer: DIFF_LAYERS.removed }) }
  return {
    entities, added, removed, same,
    layers: [
      { name: DIFF_LAYERS.same, color: '#5c6476', visible: true, locked: false },
      { name: DIFF_LAYERS.removed, color: '#ff5a5a', visible: true, locked: false },
      { name: DIFF_LAYERS.added, color: '#4cc38a', visible: true, locked: false },
    ],
  }
}
