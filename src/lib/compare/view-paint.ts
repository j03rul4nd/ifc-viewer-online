// ─── compare/view-paint.ts ────────────────────────────────────────────────────
// Lays the five revision colours (05-ux §2) on the fragments models, on top of
// the overlay channel's ghosting, and hides the old revision except what has to
// be seen of it (removed elements, the old position of moved ones). Isolated
// from viewer.ts on purpose: it only uses the public ViewerAPI.

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
}

const mat = (hex: string, opacity: number): FRAGS.MaterialDefinition => ({
  color: new THREE.Color(hex),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity,
  transparent: opacity < 1,
  preserveOriginalMaterial: false,
})

const MATERIALS: Record<RevisionPaintGroup, FRAGS.MaterialDefinition> = {
  added: mat(GROUP_COLOUR.added, 1),
  // Removed: a red ghost of where it was — see-through, so what replaced it shows.
  removed: mat(GROUP_COLOUR.removed, 0.45),
  moved: mat(GROUP_COLOUR.moved, 1),
  movedFrom: mat(GROUP_COLOUR.moved, 0.25),
  reshaped: mat(GROUP_COLOUR.reshaped, 1),
  properties: mat(GROUP_COLOUR.properties, 1),
}

const model = (v: ViewerAPI, id: string): FragModel | null => (v.getFragmentsModel(id) as FragModel | null) ?? null

/** Hide what is not needed of the old revision (A). */
export async function applyRevisionVisibility(v: ViewerAPI, plan: RevisionOverlayPlan): Promise<void> {
  for (const [id, keep] of Object.entries(plan.keepVisibleA)) {
    const m = model(v, id)
    if (!m) continue
    try {
      await m.setVisible(undefined, false)
      if (keep.length) await m.setVisible(keep, true)
    } catch { /* model mid-unload */ }
  }
  try { v.drawingHost().requestRender() } catch { /* viewer re-initialising */ }
}

export async function applyRevisionColours(v: ViewerAPI, plan: RevisionOverlayPlan): Promise<void> {
  for (const [id, groups] of Object.entries(plan.paint)) {
    const m = model(v, id)
    if (!m) continue
    for (const [g, ids] of Object.entries(groups) as Array<[RevisionPaintGroup, number[]]>) {
      if (!ids.length) continue
      try { await m.highlight(ids, MATERIALS[g]) } catch { /* idem */ }
    }
  }
  try { v.drawingHost().requestRender() } catch { /* viewer re-initialising */ }
}

/** Show a whole side as it is (split / curtain / blink show A in full). */
export async function showWholeSide(v: ViewerAPI, modelIds: string[]): Promise<void> {
  for (const id of modelIds) {
    try { await model(v, id)?.resetVisible() } catch { /* idem */ }
  }
  try { v.drawingHost().requestRender() } catch { /* viewer re-initialising */ }
}

export async function clearRevisionPaint(v: ViewerAPI, modelIdsA: string[]): Promise<void> {
  await showWholeSide(v, modelIdsA)
  v.setValidationHighlights([], false)
}
