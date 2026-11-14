// ─── compare/view-paint.ts ────────────────────────────────────────────────────
// Paints a revision comparison straight on the fragments models (05-ux §2):
//   unchanged — light clay, OPAQUE: a translucent ghost over a whole 67 MB
//               model halves the frame rate (verification #3: 23 FPS);
//   changed   — the kind colour, opaque; the selected change brighter and the
//               other changes slightly see-through so the selected one stands out;
//   A (old)   — in Changes mode only removed elements (red ghost where they
//               were) and the old position of moved ones (blue ghost) are shown.
// It does NOT use the shared overlay channel: that controller repaints on its
// own schedule and overwrote these colours (verification #1). Isolated from
// viewer.ts on purpose: it only uses the public ViewerAPI.

import * as THREE from 'three'
import * as FRAGS from '@thatopen/fragments'
import type { ViewerAPI } from '../viewer'
import type { RevisionOverlayPlan, RevisionPaintGroup } from './overlay'
import { GROUP_COLOUR } from './revision-view'

interface FragModel {
  highlight(ids: number[] | undefined, m: FRAGS.MaterialDefinition): Promise<void>
  resetHighlight(ids?: number[]): Promise<void>
  setVisible(ids: number[] | undefined, visible: boolean): Promise<void>
  resetVisible(): Promise<void>
  getItemsIdsWithGeometry(): Promise<number[]>
}

// The viewer paints its category palette with setColor(), which fragments
// stores as an EXPLICIT colour; a later highlight without `_explicitProps`
// keeps that colour (getNewHighFromPast). So every definition here names the
// properties it sets, or the change colours never show (verification #1).
const EXPLICIT = ['color', 'opacity', 'transparent', 'depthTest', 'renderedFaces']
const mat = (hex: string, opacity: number): FRAGS.MaterialDefinition => ({
  color: new THREE.Color(hex),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity,
  transparent: opacity < 1,
  depthTest: true,
  preserveOriginalMaterial: true,
  _explicitProps: EXPLICIT,
} as FRAGS.MaterialDefinition)

// theme-allow-color: neutral clay for unchanged context in the 3D view
const CLAY = mat('#C9CDD3', 1)

const SOLID: Record<RevisionPaintGroup, FRAGS.MaterialDefinition> = {
  added: mat(GROUP_COLOUR.added, 1),
  removed: mat(GROUP_COLOUR.removed, 0.55),
  moved: mat(GROUP_COLOUR.moved, 1),
  movedFrom: mat(GROUP_COLOUR.moved, 0.3),
  reshaped: mat(GROUP_COLOUR.reshaped, 1),
  properties: mat(GROUP_COLOUR.properties, 1),
}
/** Changes other than the selected one, when something is selected. */
const SOFT: Record<RevisionPaintGroup, FRAGS.MaterialDefinition> = {
  added: mat(GROUP_COLOUR.added, 0.6),
  removed: mat(GROUP_COLOUR.removed, 0.35),
  moved: mat(GROUP_COLOUR.moved, 0.6),
  movedFrom: mat(GROUP_COLOUR.moved, 0.2),
  reshaped: mat(GROUP_COLOUR.reshaped, 0.6),
  properties: mat(GROUP_COLOUR.properties, 0.6),
}

/**
 * The change on screen: drawn through whatever is in front (x-ray) in the
 * transparent pass, so a column behind the facade or a wall drawn exactly over
 * another one is still seen, and it stands out from the other changes.
 */
const XRAY: Record<RevisionPaintGroup, FRAGS.MaterialDefinition> = Object.fromEntries(
  (Object.entries(SOLID) as Array<[RevisionPaintGroup, FRAGS.MaterialDefinition]>).map(([g, m]) => [g, { ...m, opacity: 0.92, transparent: true, depthTest: false } as FRAGS.MaterialDefinition]),
) as Record<RevisionPaintGroup, FRAGS.MaterialDefinition>

const model = (v: ViewerAPI, id: string): FragModel | null => (v.getFragmentsModel(id) as FragModel | null) ?? null
const allIds = new WeakMap<object, Promise<number[]>>()
function idsOf(m: FragModel): Promise<number[]> {
  let p = allIds.get(m)
  if (!p) { p = m.getItemsIdsWithGeometry().catch(() => []); allIds.set(m, p) }
  return p
}

/**
 * Make fragments apply the new highlights now. Fragments only pushes material
 * changes on a forced core.update(), which the public API runs when the camera
 * is set without animation — so, if the camera is still, set it to exactly
 * where it is. While it moves (a framing in flight) every frame updates anyway.
 * Without this the colours stayed invisible until the next camera move
 * (verification #1).
 */
async function flush(v: ViewerAPI): Promise<void> {
  try {
    const a = v.getCameraViewpoint()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    const b = v.getCameraViewpoint()
    if (!a || !b) return
    const still = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z) < 1e-6
      && Math.hypot(a.target.x - b.target.x, a.target.y - b.target.y, a.target.z - b.target.z) < 1e-6
    if (still) v.setCameraLookAt(b.position, b.target, false)
    v.drawingHost().requestRender()
  } catch { /* viewer re-initialising */ }
}
const render = (v: ViewerAPI): void => { void flush(v) }

export interface PaintTarget {
  /** Element on screen, highlighted brighter than the rest. */
  selected?: { modelId: string; expressId: number } | null
  /** 'changes' hides A except removed / moved-from; the others show A whole. */
  mode: 'changes' | 'curtain' | 'blink'
}

/**
 * Paint everything in one pass per model: clay base, kind colours, selection.
 * Returns once every highlight call has been handed to fragments.
 */
export async function paintRevision(
  v: ViewerAPI, plan: RevisionOverlayPlan, idsA: string[], idsB: string[], target: PaintTarget,
): Promise<void> {
  const sel = target.selected ?? null
  const paintModel = async (id: string, isA: boolean): Promise<void> => {
    const m = model(v, id)
    if (!m) return
    try {
      const all = await idsOf(m)
      if (isA && target.mode === 'changes') {
        const keep = plan.keepVisibleA[id] ?? []
        await m.setVisible(undefined, false)
        if (keep.length) await m.setVisible(keep, true)
      } else if (isA) {
        await m.resetVisible()
      }
      const groups = plan.paint[id] ?? {}
      // A highlight does not replace one already on an item: paint each item
      // once — clay only on what did not change — after clearing the last pass.
      const changed = new Set(Object.values(groups).flat())
      await m.resetHighlight()
      const base = changed.size ? all.filter((x) => !changed.has(x)) : all
      if (base.length) await m.highlight(base, CLAY)
      for (const [g, list] of Object.entries(groups) as Array<[RevisionPaintGroup, number[]]>) {
        if (!list.length) continue
        const others = sel && sel.modelId === id ? list.filter((x) => x !== sel.expressId) : list
        if (others.length) await m.highlight(others, sel ? SOFT[g] : SOLID[g])
        if (sel && sel.modelId === id && others.length !== list.length) await m.highlight([sel.expressId], XRAY[g])
      }
    } catch { /* model mid-unload */ }
  }
  await Promise.all([...idsA.map((id) => paintModel(id, true)), ...idsB.map((id) => paintModel(id, false))])
  render(v)
}

/** Give the models back their own look (category palette) and visibility. */
export async function clearRevisionPaint(v: ViewerAPI, modelIds: string[]): Promise<void> {
  for (const id of modelIds) {
    const m = model(v, id)
    if (!m) continue
    try { await m.resetHighlight(); await m.resetVisible() } catch { /* idem */ }
  }
  // resetHighlight also drops the palette; this puts exactly the palette back.
  try { await v.setPresentationLook(null) } catch { /* viewer gone */ }
  render(v)
}
