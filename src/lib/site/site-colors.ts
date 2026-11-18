// ─── Site colouring (units / progress) ────────────────────────────────────────
// One shared channel for every "colour the model by …" toggle of the site
// panels. Colour goes through the fragments model's own setColor; clearing goes
// through ViewerAPI.restoreDefaultColors, which puts the category palette back
// (a bare resetColor would leave the elements without it). Only one site mode
// paints at a time: starting one clears the other and tells its panel.

import * as THREE from 'three'
import type { ViewerAPI } from '../viewer'

export type SiteColorMode = 'units' | 'progress'
/** modelId → hex colour → express IDs. */
export type ColorBatches = Map<string, Map<string, number[]>>

interface ColorableModel { setColor(ids: number[] | undefined, color: THREE.Color): Promise<unknown> }
export type SiteColorViewer = Pick<ViewerAPI, 'getFragmentsModel' | 'restoreDefaultColors'>

let active: SiteColorMode | null = null
let painted: Map<string, number[]> = new Map()
let paintedOn: SiteColorViewer | null = null
let queue: Promise<void> = Promise.resolve()
const listeners = new Set<(mode: SiteColorMode | null) => void>()

export function activeSiteColorMode(): SiteColorMode | null { return active }

/** Called with the new mode whenever it changes; returns the unsubscribe. */
export function onSiteColorModeChange(fn: (mode: SiteColorMode | null) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function setActive(mode: SiteColorMode | null): void {
  if (active === mode) return
  active = mode
  for (const fn of listeners) fn(mode)
}

async function restore(): Promise<void> {
  const v = paintedOn
  const prev = painted
  painted = new Map(); paintedOn = null
  if (!v) return
  for (const [modelId, ids] of prev) {
    try { await v.restoreDefaultColors(modelId, ids) } catch { /* model gone */ }
  }
}

function serial(job: () => Promise<void>): Promise<void> {
  queue = queue.then(job, job)
  return queue
}

/** Paints `batches` as `mode`, replacing whatever site colouring was on. */
export function paintSiteColors(viewer: SiteColorViewer, mode: SiteColorMode, batches: ColorBatches): Promise<void> {
  setActive(mode)
  return serial(async () => {
    await restore()
    if (active !== mode) return
    paintedOn = viewer
    for (const [modelId, byColor] of batches) {
      const m = viewer.getFragmentsModel(modelId) as Partial<ColorableModel> | null
      if (!m || typeof m.setColor !== 'function') continue
      const ids: number[] = []
      for (const [hex, list] of byColor) {
        if (!list.length) continue
        try { await m.setColor(list, new THREE.Color(hex)); ids.push(...list) } catch { /* model gone */ }
      }
      painted.set(modelId, ids)
    }
  })
}

/** Restores the default colours if `mode` (or any mode, when omitted) is the one painting. */
export function clearSiteColors(mode?: SiteColorMode): Promise<void> {
  if (mode && active !== mode) return queue
  setActive(null)
  return serial(restore)
}

/** Groups (modelId, colour, ids) entries. Pure. */
export function toBatches(items: Iterable<{ modelId: string; color: string; ids: readonly number[] }>): ColorBatches {
  const out: ColorBatches = new Map()
  for (const it of items) {
    const byColor = out.get(it.modelId) ?? new Map<string, number[]>()
    out.set(it.modelId, byColor)
    const list = byColor.get(it.color) ?? []
    for (const id of it.ids) list.push(id)
    byColor.set(it.color, list)
  }
  return out
}

/** Test hook. */
export function __resetSiteColors(): void {
  active = null; painted = new Map(); paintedOn = null; queue = Promise.resolve(); listeners.clear()
}
