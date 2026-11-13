// ─── compare/capture-change.ts ────────────────────────────────────────────────
// One picture per change, for the revision report and the BCF topics: isolate
// the element, frame it, select it (the selection highlight is the "cloud"),
// let the renderer settle, take the snapshot the screenshot button takes, and
// remember the camera so the BCF viewpoint opens on the same view.
//
// Library code only: it talks to the viewer through the few methods it needs
// (a subset of ViewerAPI) and to the loaded models through a resolver the
// caller builds — it never imports a component.

import type { CameraViewpoint, Vec3Like } from '../../types'
import type { RevisionChange, RevisionDiff } from './revision-types'

/** The subset of ViewerAPI (lib/viewer.ts) a capture needs. */
export interface ChangeCaptureViewer {
  isolateElements(targets: Array<{ expressId: number; modelId?: string | null }>, enabled: boolean): void
  frameElement?(expressId: number, modelId?: string, opts?: { fill?: number; animate?: boolean }): Promise<boolean>
  selectElement?(expressId: number, modelId?: string): void
  clearSelection?(): void
  getCameraViewpoint(): CameraViewpoint | null
  setCameraLookAt(position: Vec3Like, target: Vec3Like, animate?: boolean): void
  takeSnapshot(scale?: number, options?: { annotations?: boolean }): string
}

export interface ElementRef { expressId: number; modelId: string }
/** GlobalId → the loaded element to show, or null when its model is not loaded. */
export type ChangeResolver = (globalId: string) => ElementRef | null

export interface ChangeCapture {
  globalId: string
  /** PNG data URL (what takeSnapshot returns). */
  snapshot: string
  /** Camera of the picture, in scene axes (BCF export converts it). */
  camera: CameraViewpoint | null
}

export interface CaptureOptions {
  /** Ms to wait after framing so the renderer draws the new view. Default 400. */
  settleMs?: number
  /** Snapshot scale passed to takeSnapshot. Default 0.6. */
  scale?: number
  /** Injectable wait (tests). */
  wait?: (ms: number) => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Resolver from the diff: a removed element is looked up on the A side
 * (baseExpressId / baseFile), everything else on B. `modelIdFor` maps a file
 * name and side to the id of the loaded model (null when not loaded).
 */
export function resolverFromDiff(
  diff: RevisionDiff,
  modelIdFor: (fileName: string, side: 'base' | 'head') => string | null,
): ChangeResolver {
  const byGid = new Map<string, RevisionChange>()
  for (const c of diff.changes) {
    byGid.set(c.globalId, c)
    for (const g of [...c.match.headGlobalIds, ...c.match.baseGlobalIds]) if (!byGid.has(g)) byGid.set(g, c)
  }
  return (gid) => {
    const c = byGid.get(gid)
    if (!c) return null
    const base = c.kind === 'removed'
    const file = base ? c.baseFile : c.headFile
    const id = base ? c.baseExpressId : c.headExpressId
    if (!file || id == null) return null
    const modelId = modelIdFor(file, base ? 'base' : 'head')
    return modelId ? { expressId: id, modelId } : null
  }
}

/**
 * `captureChange(globalId)` and a batch helper that puts the camera, the
 * isolation and the selection back as they were.
 */
export function createChangeCapturer(viewer: ChangeCaptureViewer, resolve: ChangeResolver, opts: CaptureOptions = {}) {
  const settle = opts.settleMs ?? 400
  const scale = opts.scale ?? 0.6
  const wait = opts.wait ?? sleep

  async function captureChange(globalId: string): Promise<ChangeCapture | null> {
    const ref = resolve(globalId)
    if (!ref) return null
    try {
      viewer.isolateElements([ref], true)
      if (viewer.frameElement) await viewer.frameElement(ref.expressId, ref.modelId, { fill: 0.6, animate: false })
      viewer.selectElement?.(ref.expressId, ref.modelId)
      await wait(settle)
      const snapshot = viewer.takeSnapshot(scale, { annotations: false })
      // A 0×0 canvas gives 'data:,' — not a picture.
      if (!snapshot.startsWith('data:image/')) return null
      return { globalId, snapshot, camera: viewer.getCameraViewpoint() }
    } catch {
      return null
    }
  }

  async function captureAll(
    globalIds: readonly string[],
    onProgress?: (done: number, total: number) => void,
  ): Promise<Record<string, ChangeCapture>> {
    const cam = viewer.getCameraViewpoint()
    const out: Record<string, ChangeCapture> = {}
    try {
      for (const [i, gid] of globalIds.entries()) {
        const c = await captureChange(gid)
        if (c) out[gid] = c
        onProgress?.(i + 1, globalIds.length)
      }
    } finally {
      try {
        viewer.clearSelection?.()
        viewer.isolateElements([], false)
        if (cam) viewer.setCameraLookAt(cam.position, cam.target, false)
      } catch { /* the viewer went away: nothing to restore */ }
    }
    return out
  }

  return { captureChange, captureAll }
}

/** Snapshot data URLs keyed by GlobalId, the shape revisionToPdf takes. */
export function captureImages(caps: Readonly<Record<string, ChangeCapture>>): Record<string, string> {
  return Object.fromEntries(Object.entries(caps).map(([g, c]) => [g, c.snapshot]))
}
