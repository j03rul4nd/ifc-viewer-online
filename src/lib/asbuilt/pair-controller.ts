/**
 * Point-pair picking for the As-Built check (T-404).
 *
 * start(): the next click picks a point on the IFC model (vertex snap), the one
 * after picks the scan; together they make one pair in the As-Built store, which
 * refits. Esc drops a half-made pair. Listeners exist ONLY between start() and
 * stop(), so outside this mode a cloud never intercepts an IFC click.
 *
 * apply(): composes the fit onto the cloud alignment (applyFitToAlignment),
 * writes it through the point-cloud store (setAlignment, then setOffset — the
 * same manual-offset path that persists per file) and re-projects the pairs'
 * cloud ends so residuals stay meaningful.
 */
import * as THREE from 'three'
import type { ScenePicker } from '../measure/picker'
import { useAsBuiltStore, type PairDraft } from '../../stores/asBuiltStore'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { applyFitToAlignment } from './fit-to-alignment'
import type { FitResult, Vec3 } from './rigid-fit'

export interface PairControllerDeps {
  /** Element receiving the clicks (the viewer canvas). */
  target: HTMLElement
  /** Where Esc is listened for; defaults to window. */
  keyTarget?: EventTarget
  /** Parent for the markers (the scene). */
  scene: THREE.Object3D
  /** World point on the IFC model under the cursor, or null. */
  pickModel: (clientX: number, clientY: number) => Promise<Vec3 | null> | Vec3 | null
  /** World point on the scan under the cursor, or null. */
  pickCloud: (clientX: number, clientY: number) => Vec3 | null
  /** Marker radius in metres. */
  markerRadiusM?: number
}

export interface PairController {
  start(): void
  stop(): void
  /** Apply the current fit to the cloud. */
  apply(): { ok: true } | { ok: false; reason: 'no-fit' | 'no-cloud' | 'tilt-out-of-range' }
  readonly active: boolean
}

const PALETTE = [0xe6194b, 0x3cb44b, 0x4363d8, 0xf58231, 0x911eb4, 0x46f0f0, 0xf032e6, 0xbcf60c]

/** Adapter: model pick through the measure picker with vertex snap only. */
export function modelPickerFrom(picker: ScenePicker): PairControllerDeps['pickModel'] {
  return async (x, y) => {
    const r = await picker.pick(x, y, { snaps: { vertex: true, midpoint: false, edge: false } })
    return r ? [r.point.x, r.point.y, r.point.z] : null
  }
}

/** cloud world -> model world under the fit. */
export function transformPoint(fit: Pick<FitResult, 'rotation' | 'translation'>, p: Vec3): Vec3 {
  const R = fit.rotation, t = fit.translation
  return [0, 1, 2].map((i) => R[i * 3] * p[0] + R[i * 3 + 1] * p[1] + R[i * 3 + 2] * p[2] + t[i]) as Vec3
}

export function createPairController(deps: PairControllerDeps): PairController {
  const store = useAsBuiltStore
  const radius = deps.markerRadiusM ?? 0.05
  const keyTarget = deps.keyTarget ?? window
  const markers: THREE.Mesh[] = []
  let pending: Vec3 | null = null
  let pendingMarker: THREE.Mesh | null = null
  let active = false
  let busy = false

  function makeMarker(p: Vec3, index: number, end: 'model' | 'cloud'): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE[index % PALETTE.length], depthTest: false }),
    )
    m.position.set(p[0], p[1], p[2])
    m.renderOrder = 999
    m.name = `asbuilt-pair-${index + 1}-${end}`
    m.userData.asBuiltPair = { index, end, label: String(index + 1) }
    deps.scene.add(m)
    return m
  }

  function disposeMarker(m: THREE.Mesh): void {
    m.removeFromParent()
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }

  function cancelPending(): void {
    pending = null
    if (pendingMarker) { disposeMarker(pendingMarker); pendingMarker = null }
    if (active) store.getState().setPhase('picking-model')
  }

  async function onClick(e: MouseEvent): Promise<void> {
    if (!active || busy) return
    if (pending === null) {
      busy = true
      try {
        const p = await deps.pickModel(e.clientX, e.clientY)
        if (!p || !active) return
        pending = p
        pendingMarker = makeMarker(p, store.getState().pairs.length, 'model')
        store.getState().setPhase('picking-cloud')
      } finally { busy = false }
      return
    }
    const c = deps.pickCloud(e.clientX, e.clientY)
    if (!c) return
    const index = store.getState().pairs.length
    if (pendingMarker) markers.push(pendingMarker)
    markers.push(makeMarker(c, index, 'cloud'))
    const model = pending
    pending = null
    pendingMarker = null
    store.getState().addPair({ model, cloud: c })
    store.getState().setPhase('picking-model')
  }

  const clickListener = (e: Event) => { void onClick(e as MouseEvent) }
  const keyListener = (e: Event) => { if ((e as KeyboardEvent).key === 'Escape') cancelPending() }

  return {
    get active() { return active },
    start() {
      if (active) return
      active = true
      deps.target.addEventListener('click', clickListener)
      keyTarget.addEventListener('keydown', keyListener)
      store.getState().setPhase('picking-model')
    },
    stop() {
      if (!active) return
      active = false
      deps.target.removeEventListener('click', clickListener)
      keyTarget.removeEventListener('keydown', keyListener)
      pending = null
      if (pendingMarker) { disposeMarker(pendingMarker); pendingMarker = null }
      for (const m of markers.splice(0)) disposeMarker(m)
      store.getState().setPhase('idle')
    },
    apply() {
      const s = store.getState()
      if (!s.fit) return { ok: false, reason: 'no-fit' }
      const cloud = usePointCloudStore.getState().clouds.find((c) => c.id === s.cloudId)
      if (!cloud?.alignment) return { ok: false, reason: 'no-cloud' }
      const r = applyFitToAlignment(cloud.alignment, s.fit)
      if ('error' in r) return { ok: false, reason: r.error }
      const pc = usePointCloudStore.getState()
      pc.setAlignment(cloud.id, r.alignment)
      // setOffset is the persisted manual-offset path (per-file localStorage).
      pc.setOffset(cloud.id, r.alignment.offset)
      const fit = s.fit
      const moved: PairDraft[] = s.pairs.map((p) => (p.cloud ? { ...p, cloud: transformPoint(fit, p.cloud) } : { ...p }))
      for (const m of markers) {
        if (m.userData.asBuiltPair?.end !== 'cloud') continue
        const q = transformPoint(fit, [m.position.x, m.position.y, m.position.z])
        m.position.set(q[0], q[1], q[2])
      }
      s.setPairs(moved)
      return { ok: true }
    },
  }
}
