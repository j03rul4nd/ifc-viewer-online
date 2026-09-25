// ─── picker ───────────────────────────────────────────────────────────────────
// "What is under the cursor, and what should it lock onto?" — for every tool
// that places points on the model: measurements and face-aligned sections.
//
// TWO THINGS THE OLD TOOLS GOT WRONG, and the reason this is its own module:
//
//   1. THEY PICKED THROUGH SECTIONS. The GPU picker behind @thatopen's
//      measurement tools ignores clipping planes (its override materials never
//      set `clipping`), and fragments' own raycast only honours planes it is
//      handed — which nothing handed it. So with a cut in place, a click on the
//      exposed interior measured the wall that had been cut away in front of it.
//      Here every hit is tested against the renderer's planes, and when planes
//      are active the ray keeps going until it reaches geometry you can see.
//
//   2. THEY SNAPPED IN WORLD UNITS. @thatopen's resolver accepts a vertex within
//      one METRE of the cursor. Zoomed in on a door frame that is the whole
//      frame, so you could not place a point anywhere but a corner; zoomed out
//      on a campus it is less than a pixel, so it never snapped at all. Snapping
//      is a screen gesture — "near my cursor" means pixels — so the resolver's
//      radius is set from the pixel size at the hit, every pick, and every
//      candidate is checked on screen before it wins.
//
// Priority is the conventional CAD one: vertex, then edge midpoint, then edge,
// then the face itself. Each tier has its own pixel radius, largest first, so a
// corner is easy to hit without making edges sticky.

import * as THREE from 'three'
import type * as FRAGS from '@thatopen/fragments'
import * as OBC from '@thatopen/components'
import type { SnapKind, SnapSettings } from './measure-types'
import { withTimeout } from './async'

/** Pixel radii for each snap tier. */
export const SNAP_PX = { vertex: 14, midpoint: 12, edge: 9 } as const

export interface PickResult {
  /** Where the point goes: the snapped position. */
  point: THREE.Vector3
  /** Where the ray actually met the surface. */
  surfacePoint: THREE.Vector3
  /** World-space surface normal, turned to face the camera. */
  normal: THREE.Vector3 | null
  kind: SnapKind
  /** The edge snapped to (for highlighting), when kind is edge/midpoint. */
  edge: [THREE.Vector3, THREE.Vector3] | null
  /** The planar face under the cursor as a world-space outline, when known. */
  face: THREE.Vector3[] | null
  /** App model id of the IFC model hit, when it was one. */
  modelId: string | null
  localId: number | null
  /** Distance from the camera. */
  depth: number
}

export interface PickOptions {
  /** Which snap tiers to try. null = surface only (faces, clouds, meshes). */
  snaps: SnapSettings | null
  /** Resolve the outline of the face under the cursor (face area, face section). */
  wantFace?: boolean
}

export interface ScenePickerDeps {
  canvas: HTMLCanvasElement
  getCamera(): THREE.Camera
  /** Loaded, VISIBLE IFC models, keyed by app model id. */
  getModels(): Iterable<[string, FRAGS.FragmentsModel]>
  /** Other raycast targets — imported meshes and point cloud roots. */
  getExtraTargets(): THREE.Object3D[]
  /** Planes currently clipping the scene (kept side = positive distance). */
  getClippingPlanes(): readonly THREE.Plane[]
  /** @thatopen's snap resolver, or null when unavailable. */
  getSnapResolver(): OBC.SnapResolver | null
}

export interface ScenePicker {
  pick(clientX: number, clientY: number, options: PickOptions): Promise<PickResult | null>
  /** World size of one screen pixel at `point`. */
  worldPerPixel(point: THREE.Vector3): number
  /** Client (viewport) pixels of a world point; null when behind the camera. */
  project(point: THREE.Vector3): { x: number; y: number } | null
}

interface RawHit {
  point: THREE.Vector3
  normal: THREE.Vector3 | null
  depth: number
  modelId: string | null
  fragModel: FRAGS.FragmentsModel | null
  localId: number | null
  itemId: number | null
  intersection: THREE.Intersection | null
}

const CLIP_EPS = 1e-4

// A pick that has not answered in time is a miss (see async.ts).
export const PICK_TIMEOUT_MS = 1500
export const SNAP_TIMEOUT_MS = 800

export function createScenePicker(deps: ScenePickerDeps): ScenePicker {
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  function rect(): DOMRect { return deps.canvas.getBoundingClientRect() }

  function isVisibleToCut(point: THREE.Vector3, planes: readonly THREE.Plane[]): boolean {
    for (const plane of planes) if (plane.distanceToPoint(point) < -CLIP_EPS) return false
    return true
  }

  function worldPerPixel(point: THREE.Vector3): number {
    const camera = deps.getCamera()
    const h = Math.max(1, rect().height)
    const persp = camera as THREE.PerspectiveCamera
    if (persp.isPerspectiveCamera) {
      const d = camera.position.distanceTo(point)
      return (2 * d * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2)) / h
    }
    const ortho = camera as THREE.OrthographicCamera
    return (ortho.top - ortho.bottom) / (ortho.zoom || 1) / h
  }

  const projected = new THREE.Vector3()
  function project(point: THREE.Vector3): { x: number; y: number } | null {
    const camera = deps.getCamera()
    projected.copy(point).project(camera)
    if (!Number.isFinite(projected.x) || projected.z > 1 || projected.z < -1) return null
    const r = rect()
    return {
      x: r.left + ((projected.x + 1) / 2) * r.width,
      y: r.top + ((1 - projected.y) / 2) * r.height,
    }
  }

  function screenDistance(point: THREE.Vector3, clientX: number, clientY: number): number {
    const p = project(point)
    return p ? Math.hypot(p.x - clientX, p.y - clientY) : Infinity
  }

  function faceCamera(normal: THREE.Vector3 | null, point: THREE.Vector3): THREE.Vector3 | null {
    if (!normal || normal.lengthSq() < 1e-12) return null
    const n = normal.clone().normalize()
    const camera = deps.getCamera()
    const toCamera = (camera as THREE.OrthographicCamera).isOrthographicCamera
      ? camera.getWorldDirection(new THREE.Vector3()).negate()
      : camera.position.clone().sub(point)
    if (n.dot(toCamera) < 0) n.negate()
    return n
  }

  /** Nearest visible hit on the IFC models. */
  async function hitModels(clientX: number, clientY: number, planes: readonly THREE.Plane[]): Promise<RawHit | null> {
    const camera = deps.getCamera() as THREE.PerspectiveCamera | THREE.OrthographicCamera
    const mouse = new THREE.Vector2(clientX, clientY)
    const models = [...deps.getModels()]
    const hits = await Promise.all(models.map(async ([modelId, model]) => {
      try {
        const data = { camera, mouse, dom: deps.canvas }
        // With a cut in place the FIRST hit may be geometry the cut removed, so
        // ask for all of them and keep the nearest one that is still drawn.
        const list = planes.length > 0
          ? await withTimeout(model.raycastAll(data), PICK_TIMEOUT_MS, null)
          : [await withTimeout(model.raycast(data), PICK_TIMEOUT_MS, null)]
        let best: RawHit | null = null
        for (const r of list ?? []) {
          if (!r?.point) continue
          if (!isVisibleToCut(r.point, planes)) continue
          const depth = camera.position.distanceTo(r.point)
          if (!best || depth < best.depth) {
            best = {
              point: r.point.clone(),
              normal: r.normal ? r.normal.clone() : null,
              depth, modelId, fragModel: model,
              localId: r.localId ?? null,
              itemId: r.itemId ?? null,
              intersection: null,
            }
          }
        }
        return best
      } catch {
        return null // a model that cannot be picked simply does not win
      }
    }))
    let best: RawHit | null = null
    for (const h of hits) if (h && (!best || h.depth < best.depth)) best = h
    return best
  }

  function isShown(object: THREE.Object3D): boolean {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false
    return true
  }

  /** Nearest visible hit on imported meshes and point clouds. */
  function hitExtras(clientX: number, clientY: number, planes: readonly THREE.Plane[]): RawHit | null {
    const targets = deps.getExtraTargets()
    if (targets.length === 0) return null
    const r = rect()
    if (r.width === 0 || r.height === 0) return null
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    const camera = deps.getCamera()
    raycaster.setFromCamera(ndc, camera)
    let hits: THREE.Intersection[] = []
    try { hits = raycaster.intersectObjects(targets, true) } catch { return null }
    for (const hit of hits) {
      if (!isShown(hit.object) || !isVisibleToCut(hit.point, planes)) continue
      let normal: THREE.Vector3 | null = null
      if (hit.face) normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      return {
        point: hit.point.clone(), normal,
        depth: camera.position.distanceTo(hit.point),
        modelId: null, fragModel: null, localId: null, itemId: null,
        intersection: hit,
      }
    }
    return null
  }

  /** Vertex snap on an imported mesh: triangle corners only (see below). */
  function snapMeshVertex(hit: RawHit, clientX: number, clientY: number): THREE.Vector3 | null {
    // Edges are deliberately NOT offered on meshes: a triangle soup has no idea
    // which of its edges are real and which are the diagonal that split a quad,
    // and snapping to the diagonal of a wall is worse than not snapping.
    const i = hit.intersection
    const mesh = i?.object as THREE.Mesh | undefined
    const pos = mesh?.geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined
    if (!i?.face || !mesh || !pos) return null
    let best: THREE.Vector3 | null = null
    let bestPx: number = SNAP_PX.vertex
    for (const idx of [i.face.a, i.face.b, i.face.c]) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(mesh.matrixWorld)
      const px = screenDistance(v, clientX, clientY)
      if (px <= bestPx) { bestPx = px; best = v }
    }
    return best
  }

  async function pick(clientX: number, clientY: number, options: PickOptions): Promise<PickResult | null> {
    const camera = deps.getCamera()
    camera.updateMatrixWorld()
    const planes = deps.getClippingPlanes()

    const [modelHit, extraHit] = await Promise.all([
      hitModels(clientX, clientY, planes),
      Promise.resolve(hitExtras(clientX, clientY, planes)),
    ])
    const hit = modelHit && extraHit
      ? (modelHit.depth <= extraHit.depth ? modelHit : extraHit)
      : (modelHit ?? extraHit)
    if (!hit) return null

    const result: PickResult = {
      point: hit.point.clone(),
      surfacePoint: hit.point.clone(),
      normal: hit.normal,
      kind: hit.fragModel ? 'face' : (hit.intersection?.face ? 'surface' : 'cloud'),
      edge: null,
      face: null,
      modelId: hit.modelId,
      localId: hit.localId,
      depth: hit.depth,
    }

    // ── Imported mesh / point cloud ───────────────────────────────────────────
    if (!hit.fragModel) {
      if (options.snaps?.vertex && result.kind === 'surface') {
        const v = snapMeshVertex(hit, clientX, clientY)
        if (v) { result.point = v; result.kind = 'vertex' }
      }
      result.normal = faceCamera(result.normal, result.surfacePoint)
      return result
    }

    // ── IFC model: resolve against the item's exact (non-tessellated) shell ──
    const resolver = deps.getSnapResolver()
    const itemId = hit.itemId
    if (resolver && itemId !== null) {
      const wpp = worldPerPixel(hit.point)
      const fragId = hit.fragModel.modelId
      let faceData: { points: Float32Array; normal: THREE.Vector3 | null } | null = null
      const noteFace = (r: { facePoints?: Float32Array; normal?: THREE.Vector3 } | null): void => {
        if (!faceData && r?.facePoints && r.facePoints.length >= 9) {
          faceData = { points: r.facePoints, normal: r.normal ?? null }
        }
      }
      try {
        const snaps = options.snaps
        if (snaps?.vertex) {
          // The resolver measures in world units; a sphere a little larger than
          // the pixel radius catches every candidate, and the screen test
          // below decides.
          resolver.maxDistance = wpp * SNAP_PX.vertex * 1.5
          const r = await withTimeout(resolver.resolve(hit.point, fragId, itemId, [OBC.SnapClass.POINT]), SNAP_TIMEOUT_MS, null)
          noteFace(r)
          if (r && r.snappingClass === OBC.SnapClass.POINT
            && screenDistance(r.point, clientX, clientY) <= SNAP_PX.vertex) {
            result.point = r.point.clone()
            result.kind = 'vertex'
          }
        }
        if (result.kind === 'face' && (snaps?.edge || snaps?.midpoint)) {
          resolver.maxDistance = wpp * SNAP_PX.midpoint * 1.5
          const r = await withTimeout(resolver.resolve(hit.point, fragId, itemId, [OBC.SnapClass.LINE]), SNAP_TIMEOUT_MS, null)
          noteFace(r)
          if (r && r.snappingClass === OBC.SnapClass.LINE && r.snappedEdgeP1 && r.snappedEdgeP2) {
            const a = r.snappedEdgeP1.clone()
            const b = r.snappedEdgeP2.clone()
            const mid = a.clone().add(b).multiplyScalar(0.5)
            if (snaps.midpoint && screenDistance(mid, clientX, clientY) <= SNAP_PX.midpoint) {
              result.point = mid
              result.kind = 'midpoint'
              result.edge = [a, b]
            } else if (snaps.edge && screenDistance(r.point, clientX, clientY) <= SNAP_PX.edge) {
              result.point = r.point.clone()
              result.kind = 'edge'
              result.edge = [a, b]
            }
          }
        }
        if (!faceData && (options.wantFace || result.kind === 'face')) {
          resolver.maxDistance = Math.max(wpp * 4, 1e-3)
          const r = await withTimeout(resolver.resolve(hit.point, fragId, itemId, [OBC.SnapClass.FACE]), SNAP_TIMEOUT_MS, null)
          noteFace(r)
          // The face plane is exact where the pick depth is not: put a face
          // point ON the face, so a slab thickness measured face to face is the
          // slab, not the slab plus depth-buffer noise.
          if (r && r.snappingClass === OBC.SnapClass.FACE && result.kind === 'face') {
            if (r.point.distanceTo(hit.point) <= wpp * 4) result.point = r.point.clone()
          }
        }
      } catch {
        // No snap data (non-shell geometry, disposed model): the surface point
        // is still a correct pick, just not a locked one.
      }
      const face = faceData as { points: Float32Array; normal: THREE.Vector3 | null } | null
      if (face) {
        const outline: THREE.Vector3[] = []
        for (let i = 0; i + 2 < face.points.length; i += 3) {
          outline.push(new THREE.Vector3(face.points[i], face.points[i + 1], face.points[i + 2]))
        }
        result.face = outline
        if (face.normal) result.normal = face.normal.clone()
      }
    }
    result.normal = faceCamera(result.normal, result.surfacePoint)
    return result
  }

  return { pick, worldPerPixel, project }
}
