// ─── point-cloud-system ───────────────────────────────────────────────────────
// Point cloud lifecycle owner — the third sibling of geo-system.ts and
// solar-system.ts. This module owns EVERY Three.js resource point clouds touch
// (root groups, geometries, the shared material, the LOD loop); pointCloudStore
// owns the product state; the viewer carries only a lazy getPointClouds() hook.
//
// Loaded via dynamic import — never import it statically from entry-path code.
//
// Invariants:
//   INV-P1 — the IFC model is never moved, scaled or re-parented. The cloud is
//            transformed into the model's frame (pc-align), matching the map's
//            INV-2 rule. Nothing downstream of the IFC can be invalidated by
//            loading a scan.
//   INV-P2 — ONE Object3D per chunk, never per point. Enforced by construction
//            here and asserted by point-cloud-system.test.ts.
//   INV-P3 — every buffer this module uploads is disposed in remove()/dispose().
//            Point clouds are the largest GPU allocation the app can make; a
//            leak here is measured in hundreds of megabytes.

import * as THREE from 'three'
import { createPointCloudMaterial, type PointCloudMaterial } from './pc-material'
import { effectiveTransform } from './pc-align'
import { allocateBudget, type ChunkView } from './pc-lod'
import {
  selectNodes, planResidency,
  type OctreeNode, type OctreeRoot, type NodeBounds,
} from './pc-octree'
import { raySphereDistance, pickInPositions, pickThresholdAt } from './pc-pick'
import { createLogger } from '../logger'
import {
  BYTES_PER_POINT, DEFAULT_DISPLAY, MAX_POINTS_DEFAULT, RENDER_BUDGET_DEFAULT,
  type DynamicFrameUpdate, type DynamicPointFrame, type PointChunk,
  type PointCloudAlignment, type PointCloudDisplay,
} from './pc-types'

const log = createLogger('PointCloud')

/** How often the LOD pass may run, ms. 12 Hz is invisible and nearly free. */
const LOD_INTERVAL_MS = 80
/**
 * On-screen point spacing to refine towards, in pixels. Below ~2 px a scan reads
 * as a continuous surface; above ~6 px it reads as confetti.
 */
const TARGET_SPACING_PX = 3
/** Don't re-run node selection more than this often — it fetches from disk. */
const STREAM_INTERVAL_MS = 400
/**
 * How long a node that has left the selection is held before being dropped.
 * Without it, nudging the camera across a node boundary re-reads and
 * re-decompresses the same node forever.
 */
const NODE_GRACE_MS = 4_000
/** Held nodes may push resident points this far past the budget, and no further. */
const NODE_OVERSHOOT = 1.6
/** Camera movement below this (metres) does not justify a re-allocation. */
const LOD_CAMERA_EPSILON = 0.05
/** Keep interaction fluid, then restore full detail as soon as the camera rests. */
const INTERACTION_BUDGET_FACTOR = 0.45

// ── Context provided by viewer.ts ──────────────────────────────────────────────

export interface PointCloudContext {
  scene: THREE.Scene
  getActiveCamera(): THREE.Camera
  renderer: THREE.WebGLRenderer
  /** World-space bounds of the active IFC model (viewer.getModelBounds shape). */
  getActiveModelBounds(): {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
  /** Frame a world-space box. Reuses the viewer's own camera framing. */
  frameBox(min: THREE.Vector3, max: THREE.Vector3): void
  /**
   * Offer an object to the app's shared raycaster, so measurement tools can hit
   * a scan. Optional: without it clouds stay inspect-only, which is what every
   * test context and any embedder without a world gets.
   */
  registerRaycastTarget?(object: THREE.Object3D): void
  unregisterRaycastTarget?(object: THREE.Object3D): void
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** What a click on the cloud reports back. */
export interface PickedPoint {
  cloudId: string
  /** World (scene) position of the picked point, metres. */
  position: THREE.Vector3
  /** The point in the FILE's own coordinates — what a surveyor would quote. */
  sourcePosition: { x: number; y: number; z: number }
  /** ASPRS classification code, when the file carried one. */
  classification: number | null
  /** 0-255, when the file carried intensity. */
  intensity: number | null
  /** Distance from the camera, scene metres. */
  distance: number
}

export interface CloudStats {
  /** Points resident in GPU buffers. */
  pointCount: number
  /** Points the last LOD pass decided to draw. */
  drawnCount: number
  chunkCount: number
  gpuBytes: number
}

export interface PointCloudSystemAPI {
  /**
   * Create an (empty) cloud root. Chunks stream in afterwards.
   * `sourceOrigin` is SourceFrame.origin — without it a pick can still report a
   * scene position, but not the coordinates written in the file.
   */
  create(
    cloudId: string, alignment: PointCloudAlignment,
    sourceOrigin?: { x: number; y: number; z: number },
  ): void
  /** Upload one chunk. Safe to call before or after the cloud is visible. */
  addChunk(cloudId: string, chunk: PointChunk): void
  /**
   * Attach one fixed-capacity, DynamicDrawUsage buffer to an empty cloud.
   * Temporal frames mutate this buffer in place; no geometry is created in the
   * playback loop.
   */
  addDynamicBuffer(cloudId: string, capacity: number): void
  /** Copy one temporal frame into its cloud's reusable dynamic buffer. */
  updateDynamicFrame(cloudId: string, frame: DynamicPointFrame): DynamicFrameUpdate | null
  /** Re-apply an alignment (manual nudges call this on every slider move). */
  setAlignment(cloudId: string, alignment: PointCloudAlignment): void
  setVisible(cloudId: string, visible: boolean): void
  /** Display settings are global — one material, every cloud. */
  setDisplay(display: PointCloudDisplay): void
  /** Points drawn per frame at density 1. */
  setRenderBudget(budget: number): void
  /** Temporarily lower draw pressure while the camera is moving. */
  setInteractionActive(active: boolean): void
  /** World-space bounds of one cloud, or of all of them when id is omitted. */
  getBounds(cloudId?: string): { min: THREE.Vector3; max: THREE.Vector3 } | null
  /** Frame a cloud (or every cloud) with the viewer's own camera framing. */
  frame(cloudId?: string): void
  /** Frame the IFC model and every cloud together. */
  frameWithModel(): void
  getStats(cloudId?: string): CloudStats
  /**
   * Put a cloud under view-dependent streaming: the LOD pass will decide which
   * octree nodes should be resident and call `onRequest` with the difference.
   * Only COPC has an index to stream from; every other format stays one-shot.
   */
  enableStreaming(cloudId: string, opts: StreamingSource): void
  /** Drop one streamed node's GPU resources (eviction). */
  removeNode(cloudId: string, nodeId: string): void
  /** Dispose one cloud's GPU resources and drop it from the scene. */
  remove(cloudId: string): void
  /**
   * Nearest visible point under a screen position, or null.
   *
   * Deliberately NOT wired into the model raycaster: a cloud must never
   * intercept an IFC click. This is an explicit call, made only when something
   * has asked to inspect the scan.
   */
  pickPoint(clientX: number, clientY: number, tolerancePx?: number): PickedPoint | null
  /**
   * The same search, from a world-space ray rather than a screen position, and
   * optionally restricted to one cloud.
   *
   * This is what the per-cloud `raycast` hook calls, and it is exported so the
   * measurement path can be tested without a canvas or a pointer event.
   */
  pickAlongRay(ray: THREE.Ray, tolerancePx?: number, cloudId?: string | null): PickedPoint | null
  /** Number of clouds currently resident. */
  count(): number
  dispose(): void
}

/** What the system needs in order to stream a cloud's octree. */
export interface StreamingSource {
  root: OctreeRoot
  nodes: OctreeNode[]
  /** SourceFrame.origin — chunk positions are relative to it. */
  frameOrigin: { x: number; y: number; z: number }
  /** Called when the resident set should change. Never called with empty lists. */
  onRequest(load: string[], evict: string[]): void
}

// ── Internals ──────────────────────────────────────────────────────────────────

interface ChunkRecord {
  id: string
  points: THREE.Points
  geometry: THREE.BufferGeometry
  count: number
  /** Chunk centre in world space, refreshed whenever the alignment changes. */
  worldCentre: THREE.Vector3
  /** Chunk bounding radius in world space (source radius × alignment scale). */
  worldRadius: number
  localRadius: number
  /** Allocated vertices. Equals count for immutable file chunks. */
  capacity: number
  dynamic: boolean
}

interface CloudRecord {
  id: string
  root: THREE.Group
  chunks: ChunkRecord[]
  alignment: PointCloudAlignment
  pointCount: number
  drawnCount: number
  /** Local-space bbox accumulated as chunks arrive. */
  localBox: THREE.Box3
  /** SourceFrame.origin, so a pick can report the file's own coordinates. */
  sourceOrigin: { x: number; y: number; z: number }
  /** Set only for streamed (COPC) clouds. */
  streaming: StreamingSource | null
  /** Node ids currently resident or in flight — the diff is taken against this. */
  residentNodes: Set<string>
  /** Unwanted nodes on borrowed time: id → when they left the selection. */
  deferredNodes: Map<string, number>
  /** Points per resident node, so the hard ceiling can be enforced. */
  nodePointCounts: Map<string, number>
  lastStreamAt: number
}

export function createPointCloudSystem(ctx: PointCloudContext): PointCloudSystemAPI {
  const clouds = new Map<string, CloudRecord>()
  let display: PointCloudDisplay = { ...DEFAULT_DISPLAY }
  let renderBudget = RENDER_BUDGET_DEFAULT
  let interactionActive = false
  let material: PointCloudMaterial | null = null
  let disposed = false

  let rafId: number | null = null
  let lastLodAt = 0
  let lastStreamAt = 0
  const lastCameraPos = new THREE.Vector3(NaN, NaN, NaN)

  const frustum = new THREE.Frustum()
  const projScreen = new THREE.Matrix4()
  const tmpVec = new THREE.Vector3()
  const tmpSphere = new THREE.Sphere()

  function getMaterial(): PointCloudMaterial {
    material ??= createPointCloudMaterial(display, ctx.renderer.getPixelRatio())
    return material
  }

  // ── Transform ────────────────────────────────────────────────────────────────

  function applyAlignment(cloud: CloudRecord): void {
    const t = effectiveTransform(cloud.alignment)
    cloud.root.position.set(t.position.x, t.position.y, t.position.z)
    // yaw(Y) ∘ pitch(X) ∘ roll(Z) ∘ tilt(X).
    //
    // The structural tilt is INNERMOST: it lays a Z-up source into the Y-up
    // scene, and everything after it therefore operates on a scan that is already
    // the right way up. That ordering is what makes the levelling sliders
    // intuitive — pitch really does tip the far edge up, whatever the source's
    // own convention was.
    //
    // Euler order 'YXZ' is yaw-pitch-roll, and with pitch and roll at zero this
    // collapses to exactly the yaw(Y) ∘ tilt(X) it has always been — the same
    // decomposition the basemap group uses, so the two subsystems still land
    // geographic data on the scene identically.
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(t.pitchRad, t.yawRad, t.rollRad, 'YXZ'),
    )
    if (t.tiltRad !== 0) {
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t.tiltRad))
    }
    cloud.root.quaternion.copy(q)
    cloud.root.scale.setScalar(t.scale)
    cloud.root.updateMatrixWorld(true)
    refreshChunkWorldGeometry(cloud)
    refreshElevationRange()
  }

  function refreshChunkWorldGeometry(cloud: CloudRecord): void {
    const scale = cloud.root.scale.x
    for (const chunk of cloud.chunks) {
      chunk.worldCentre.copy(chunk.points.position).applyMatrix4(cloud.root.matrixWorld)
      chunk.worldRadius = chunk.localRadius * scale
    }
  }

  /** Elevation ramp domain = the union of every resident cloud, in world Y. */
  function refreshElevationRange(): void {
    const bounds = worldBounds()
    if (bounds && material) material.setElevationRange(bounds.min.y, bounds.max.y)
  }

  // ── Bounds ───────────────────────────────────────────────────────────────────

  function cloudWorldBox(cloud: CloudRecord): THREE.Box3 | null {
    if (cloud.localBox.isEmpty()) return null
    cloud.root.updateMatrixWorld(true)
    return cloud.localBox.clone().applyMatrix4(cloud.root.matrixWorld)
  }

  function worldBounds(cloudId?: string): { min: THREE.Vector3; max: THREE.Vector3 } | null {
    const box = new THREE.Box3()
    let any = false
    for (const cloud of clouds.values()) {
      if (cloudId && cloud.id !== cloudId) continue
      const b = cloudWorldBox(cloud)
      if (b) { box.union(b); any = true }
    }
    return any ? { min: box.min.clone(), max: box.max.clone() } : null
  }

  // ── LOD loop ─────────────────────────────────────────────────────────────────

  function startLoop(): void {
    if (rafId !== null || disposed) return
    const tick = (): void => {
      rafId = requestAnimationFrame(tick)
      const now = performance.now()
      if (now - lastLodAt < LOD_INTERVAL_MS) return
      lastLodAt = now
      runLodPass()
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopLoop(): void {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  }

  /** Force the next pass to recompute even if the camera has not moved. */
  function invalidateLod(): void {
    lastCameraPos.set(NaN, NaN, NaN)
  }

  function effectiveRenderBudget(): number {
    const interactionFactor = interactionActive ? INTERACTION_BUDGET_FACTOR : 1
    return Math.max(1, Math.floor(renderBudget * display.density * interactionFactor))
  }

  /**
   * Decide which octree nodes should be resident for a streamed cloud, and ask
   * for the difference.
   *
   * The selection runs in the cloud's OWN coordinates, not the scene's: node
   * bounds and point spacing both come from the file, so putting the camera into
   * that space keeps the comparison unit-free and makes the alignment scale
   * cancel out instead of having to be threaded through.
   */
  function updateStreaming(
    cloud: CloudRecord, camWorld: THREE.Vector3, opts: { useFrustum: boolean } = { useFrustum: true },
  ): void {
    const src = cloud.streaming
    if (!src) return

    cloud.root.updateMatrixWorld(true)
    const camLocal = cloud.root.worldToLocal(camWorld.clone())
    const camSource = {
      x: camLocal.x + src.frameOrigin.x,
      y: camLocal.y + src.frameOrigin.y,
      z: camLocal.z + src.frameOrigin.z,
    }

    const size = ctx.renderer.getSize(new THREE.Vector2())
    const camera = ctx.getActiveCamera() as THREE.PerspectiveCamera
    const fov = typeof camera.fov === 'number' ? camera.fov : 60
    const projectionFactor = size.y / (2 * Math.tan((fov * Math.PI) / 360))

    const selection = selectNodes(src.nodes, src.root, {
      position: camSource,
      projectionFactor,
      // The very first pass runs before any frustum has been computed, and
      // culling the initial coarse load would leave the scene empty.
      isVisible: opts.useFrustum ? (b) => nodeVisible(cloud, b) : undefined,
    }, {
      maxSpacingPx: TARGET_SPACING_PX,
      budget: effectiveRenderBudget(),
    })

    const now = performance.now()
    const plan = planResidency(
      {
        resident: cloud.residentNodes,
        deferred: cloud.deferredNodes,
        pointCounts: cloud.nodePointCounts,
      },
      selection,
      {
        now,
        graceMs: NODE_GRACE_MS,
        overshoot: NODE_OVERSHOOT,
        budget: effectiveRenderBudget(),
      },
    )

    // A revived node never left the GPU — cancelling its clock costs nothing and
    // is the entire benefit of the grace period.
    for (const id of plan.revive) cloud.deferredNodes.delete(id)
    for (const id of plan.defer) cloud.deferredNodes.set(id, now)
    // Recorded as resident up front so the next pass does not re-request the
    // same nodes while they are still in flight.
    for (const id of plan.load) cloud.residentNodes.add(id)
    for (const id of plan.evict) {
      cloud.residentNodes.delete(id)
      cloud.deferredNodes.delete(id)
    }

    if (plan.load.length === 0 && plan.evict.length === 0) return
    src.onRequest(plan.load, plan.evict)
  }

  /** Frustum test for a node cube, taken into world space. */
  function nodeVisible(cloud: CloudRecord, bounds: NodeBounds): boolean {
    const src = cloud.streaming!
    tmpSphere.center.set(
      bounds.center.x - src.frameOrigin.x,
      bounds.center.y - src.frameOrigin.y,
      bounds.center.z - src.frameOrigin.z,
    ).applyMatrix4(cloud.root.matrixWorld)
    // The cube's circumradius, scaled into the scene.
    tmpSphere.radius = bounds.halfSize * Math.sqrt(3) * cloud.root.scale.x
    return frustum.intersectsSphere(tmpSphere)
  }

  function runLodPass(): void {
    if (clouds.size === 0) return
    const camera = ctx.getActiveCamera()
    camera.updateMatrixWorld()
    const camPos = tmpVec.setFromMatrixPosition(camera.matrixWorld)

    // A static camera over a static scene needs no re-allocation at all.
    const moved = !(Number.isFinite(lastCameraPos.x) && camPos.distanceTo(lastCameraPos) < LOD_CAMERA_EPSILON)
    // A streamed cloud still needs passes while the camera is still: nodes are
    // arriving, and each one changes what is drawable. diffSelection makes that
    // idempotent, so a settled view asks for nothing.
    const streaming = [...clouds.values()].some((c) => c.streaming !== null)
    if (!moved && !streaming) return
    lastCameraPos.copy(camPos)

    projScreen.multiplyMatrices(
      (camera as THREE.PerspectiveCamera).projectionMatrix,
      camera.matrixWorldInverse,
    )
    frustum.setFromProjectionMatrix(projScreen)

    const budget = effectiveRenderBudget()
    const views: ChunkView[] = []
    const byId = new Map<string, ChunkRecord>()

    for (const cloud of clouds.values()) {
      if (!cloud.root.visible) {
        for (const chunk of cloud.chunks) chunk.points.visible = false
        cloud.drawnCount = 0
        continue
      }
      for (const chunk of cloud.chunks) {
        tmpSphere.center.copy(chunk.worldCentre)
        tmpSphere.radius = Math.max(chunk.worldRadius, 1e-4)
        const key = `${cloud.id}/${chunk.id}`
        byId.set(key, chunk)
        views.push({
          id: key,
          count: chunk.count,
          distance: camPos.distanceTo(chunk.worldCentre),
          radius: tmpSphere.radius,
          visible: frustum.intersectsSphere(tmpSphere),
        })
      }
    }

    // Streamed clouds get a chance to change WHAT is resident, not just how much
    // of it is drawn. Throttled separately: this one hits the disk.
    const streamNow = performance.now()
    if (streamNow - lastStreamAt >= STREAM_INTERVAL_MS) {
      lastStreamAt = streamNow
      for (const cloud of clouds.values()) {
        if (cloud.streaming && cloud.root.visible) updateStreaming(cloud, camPos)
      }
    }

    const { draw } = allocateBudget(views, budget)
    const drawnPerCloud = new Map<string, number>()

    for (const [key, n] of draw) {
      const chunk = byId.get(key)
      if (!chunk) continue
      chunk.points.visible = n > 0
      chunk.geometry.setDrawRange(0, n)
      const cloudId = key.slice(0, key.indexOf('/'))
      drawnPerCloud.set(cloudId, (drawnPerCloud.get(cloudId) ?? 0) + n)
    }
    for (const cloud of clouds.values()) {
      if (cloud.root.visible) cloud.drawnCount = drawnPerCloud.get(cloud.id) ?? 0
    }
  }

  // ── Disposal ─────────────────────────────────────────────────────────────────

  function disposeChunk(chunk: ChunkRecord): void {
    chunk.geometry.dispose()
    chunk.points.removeFromParent()
  }

  function disposeCloud(cloud: CloudRecord): void {
    for (const chunk of cloud.chunks) disposeChunk(chunk)
    cloud.chunks.length = 0
    // Withdraw from the shared raycaster BEFORE leaving the scene. The registry
    // is a Set held elsewhere, so a root left in it survives removal from the
    // scene graph entirely — the closure keeps its chunks and their GPU buffers
    // reachable, and every later ray still runs a pick against a cloud the user
    // deleted. INV-P3 covers the buffers; this covers the reference.
    ctx.unregisterRaycastTarget?.(cloud.root)
    cloud.root.removeFromParent()
  }

  // ── API ──────────────────────────────────────────────────────────────────────


  /**
   * Screen-space pick tolerance in pixels when the ray comes from a measurement
   * tool rather than a deliberate inspect click.
   *
   * Tighter than inspect's 8 px on purpose. Someone measuring is aiming at one
   * specific point on one specific surface, and a generous radius does not help
   * them there — it silently snaps to a neighbour and reports a number that
   * looks entirely plausible.
   */
  const MEASURE_TOLERANCE_PX = 6

  /**
   * Nearest cloud point to a WORLD-SPACE ray — the shared core behind both
   * click-to-inspect and the measurement raycast.
   *
   * `only` restricts the search to one cloud, which is what the per-cloud
   * `raycast` needs: three calls it once per registered object and expects that
   * call to answer for that object alone.
   */
  function pickAlongRay(
    ray: THREE.Ray, tolerancePx: number, only: CloudRecord | null,
  ): PickedPoint | null {
    if (disposed || clouds.size === 0) return null
    const camera = ctx.getActiveCamera()

    const size = ctx.renderer.getSize(new THREE.Vector2())
    const persp = camera as THREE.PerspectiveCamera
    const fov = typeof persp.fov === 'number' ? persp.fov : 60
    const projectionFactor = size.y / (2 * Math.tan((fov * Math.PI) / 360))

    let best: PickedPoint | null = null
    let bestT = Infinity

    for (const cloud of (only ? [only] : clouds.values())) {
      if (!cloud.root.visible) continue
      cloud.root.updateMatrixWorld(true)

      // Take the ray into the cloud's local space once, rather than taking
      // every point out of it. The scale cancels in the comparison below.
      const inverse = new THREE.Matrix4().copy(cloud.root.matrixWorld).invert()
      const localOrigin = ray.origin.clone().applyMatrix4(inverse)
      const localDir = ray.direction.clone()
        .transformDirection(inverse).normalize()
      const localRay = {
        origin: { x: localOrigin.x, y: localOrigin.y, z: localOrigin.z },
        direction: { x: localDir.x, y: localDir.y, z: localDir.z },
      }
      const scale = cloud.root.scale.x || 1

      for (const chunk of cloud.chunks) {
        if (!chunk.points.visible) continue
        const centre = chunk.points.position
        // Prefilter on the chunk sphere: a few hundred cheap tests before any
        // point is touched at all.
        const hitAt = raySphereDistance(
          localRay, { x: centre.x, y: centre.y, z: centre.z }, chunk.localRadius * 1.05,
        )
        if (hitAt === null) continue

        // Screen-space tolerance, converted into this cloud's local units.
        const worldDistance = Math.max(hitAt * scale, 1e-3)
        const threshold = pickThresholdAt(worldDistance, tolerancePx, projectionFactor) / scale

        // Only the DRAWN range — LOD already decided what is visible, and
        // picking something the user cannot see would be a lie.
        const drawn = chunk.geometry.drawRange.count
        const count = Math.min(
          Number.isFinite(drawn) ? drawn : chunk.count,
          chunk.count,
        )
        if (count <= 0) continue

        const positions = chunk.geometry.getAttribute('position').array as Float32Array
        const hit = pickInPositions(localRay, positions, count, threshold, centre)
        if (!hit) continue

        const worldT = hit.t * scale
        if (worldT >= bestT) continue
        bestT = worldT

        const world = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)
          .applyMatrix4(cloud.root.matrixWorld)
        const cls = chunk.geometry.getAttribute('pcClass')
        const inten = chunk.geometry.getAttribute('pcIntensity')
        best = {
          cloudId: cloud.id,
          position: world,
          // Local coordinates are relative to SourceFrame.origin; adding it
          // back gives the number that appears in the file itself.
          sourcePosition: {
            x: hit.point.x + (cloud.streaming?.frameOrigin.x ?? cloud.sourceOrigin.x),
            y: hit.point.y + (cloud.streaming?.frameOrigin.y ?? cloud.sourceOrigin.y),
            z: hit.point.z + (cloud.streaming?.frameOrigin.z ?? cloud.sourceOrigin.z),
          },
          classification: cls ? (cls.array as Uint8Array)[hit.index] : null,
          intensity: inten ? (inten.array as Uint8Array)[hit.index] : null,
          distance: worldT,
        }
      }
    }
    return best
  }

  const api: PointCloudSystemAPI = {
    create(cloudId, alignment, sourceOrigin) {
      if (disposed) return
      const existing = clouds.get(cloudId)
      if (existing) disposeCloud(existing)

      const root = new THREE.Group()
      root.name = `point-cloud:${cloudId}`
      // Points are never lit, never shadowed and never picked by the model
      // raycaster — keeping them out of those paths is most of the win.
      root.matrixAutoUpdate = true

      /**
       * The seam that lets measurement tools reach a scan.
       *
       * `Raycaster.intersectObjects` calls `object.raycast(raycaster, intersects)`,
       * so anything that raycasts the scene — including @thatopen's `castRay`,
       * which merges this with its IFC fast-pick and keeps whichever is nearer —
       * gets cloud points through this one hook. That merge is precisely the
       * as-built-vs-as-designed question: how far is this scanned point from the
       * wall that was designed there.
       *
       * It hangs on the ROOT, not on the chunks, for two reasons. `castRay`
       * hands `world.meshes` straight to three, so one registration means
       * nothing has to stay in sync with LOD churn — chunks appear and vanish
       * on every camera move, and a stale entry per chunk is a leak per chunk.
       * And it routes through `pickAlongRay`, which keeps the bounding-sphere
       * rejection, the draw-range awareness and the screen-space tolerance that
       * three's own `Points.raycast` has none of: three tests EVERY vertex
       * against the ray, which at twenty million points is a frozen tab, and
       * that is exactly why the chunks below disable it.
       */
      root.raycast = (raycaster, intersects) => {
        const hit = pickAlongRay(raycaster.ray, MEASURE_TOLERANCE_PX, clouds.get(cloudId) ?? null)
        if (!hit) return
        intersects.push({
          // Distance from the ray ORIGIN, in world units — the same scale the
          // IFC hit is measured in, or the nearer-wins comparison is meaningless.
          distance: hit.distance,
          point: hit.position.clone(),
          object: root,
        })
      }

      ctx.scene.add(root)
      // Opt in to being raycast by the rest of the app. Optional: a context that
      // does not provide it (the tests, and any embedder without a world) simply
      // keeps the pre-existing behaviour where clouds are inspect-only.
      ctx.registerRaycastTarget?.(root)

      const record: CloudRecord = {
        id: cloudId, root, chunks: [], alignment,
        pointCount: 0, drawnCount: 0, localBox: new THREE.Box3(),
        sourceOrigin: sourceOrigin ?? { x: 0, y: 0, z: 0 },
        streaming: null, residentNodes: new Set(),
        deferredNodes: new Map(), nodePointCounts: new Map(), lastStreamAt: 0,
      }
      clouds.set(cloudId, record)
      applyAlignment(record)
      startLoop()
    },

    addChunk(cloudId, chunk) {
      if (disposed) return
      const cloud = clouds.get(cloudId)
      if (!cloud) { log.warn(`addChunk for unknown cloud "${cloudId}"`); return }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3))
      // Uint8 attributes, normalized — 3 bytes per point instead of 12. The
      // shader reads them as 0-1 floats with no extra work.
      geometry.setAttribute('pcColor', chunk.colors
        ? new THREE.BufferAttribute(chunk.colors, 3, true)
        : new THREE.BufferAttribute(new Uint8Array(chunk.count * 3).fill(200), 3, true))
      geometry.setAttribute('pcIntensity', chunk.intensity
        ? new THREE.BufferAttribute(chunk.intensity, 1, true)
        : new THREE.BufferAttribute(new Uint8Array(chunk.count).fill(255), 1, true))
      geometry.setAttribute('pcClass', chunk.classification
        ? new THREE.BufferAttribute(chunk.classification, 1, true)
        : new THREE.BufferAttribute(new Uint8Array(chunk.count), 1, true))
      geometry.setAttribute('pcConfidence', chunk.confidence
        ? new THREE.BufferAttribute(chunk.confidence, 1, true)
        : new THREE.BufferAttribute(new Uint8Array(chunk.count).fill(255), 1, true))

      // Three culls Points by boundingSphere; ours is known exactly, so setting
      // it avoids the full-attribute scan computeBoundingSphere would do.
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), chunk.radius || 1e-3)
      geometry.setDrawRange(0, chunk.count)

      const points = new THREE.Points(geometry, getMaterial())
      points.position.set(chunk.origin.x, chunk.origin.y, chunk.origin.z)
      points.frustumCulled = true
      // Never intercept a model click: the IFC selection raycast must behave
      // exactly as it did before a cloud was loaded.
      points.raycast = () => { /* not pickable */ }
      cloud.root.add(points)

      const record: ChunkRecord = {
        id: chunk.id, points, geometry, count: chunk.count,
        worldCentre: new THREE.Vector3(), worldRadius: chunk.radius,
        localRadius: chunk.radius, capacity: chunk.count, dynamic: false,
      }
      cloud.chunks.push(record)
      cloud.pointCount += chunk.count
      // Streamed clouds need per-node counts to enforce the residency ceiling.
      if (cloud.streaming) cloud.nodePointCounts.set(chunk.id, chunk.count)
      // A new chunk is uploaded with its draw range wide open, so it IS fully
      // drawn until the first LOD pass narrows it. Counting it now keeps the
      // stats honest in the window before that pass (and in environments where
      // rAF is throttled, such as a background tab).
      cloud.drawnCount += chunk.count

      cloud.localBox.expandByPoint(new THREE.Vector3(
        chunk.origin.x - chunk.radius, chunk.origin.y - chunk.radius, chunk.origin.z - chunk.radius))
      cloud.localBox.expandByPoint(new THREE.Vector3(
        chunk.origin.x + chunk.radius, chunk.origin.y + chunk.radius, chunk.origin.z + chunk.radius))

      cloud.root.updateMatrixWorld(true)
      record.worldCentre.copy(points.position).applyMatrix4(cloud.root.matrixWorld)
      record.worldRadius = chunk.radius * cloud.root.scale.x
      refreshElevationRange()
      invalidateLod()
    },

    addDynamicBuffer(cloudId, requestedCapacity) {
      if (disposed) return
      const cloud = clouds.get(cloudId)
      if (!cloud) { log.warn(`addDynamicBuffer for unknown cloud "${cloudId}"`); return }
      // A temporal source owns one buffer. Mixing immutable chunks into the
      // same root would make per-frame bounds and counts ambiguous.
      if (cloud.chunks.length > 0) {
        log.warn(`addDynamicBuffer requires an empty cloud "${cloudId}"`)
        return
      }

      const finiteCapacity = Number.isFinite(requestedCapacity) ? Math.floor(requestedCapacity) : 1
      const capacity = Math.min(MAX_POINTS_DEFAULT, Math.max(1, finiteCapacity))
      const geometry = new THREE.BufferGeometry()
      const position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
      const color = new THREE.BufferAttribute(new Uint8Array(capacity * 3).fill(200), 3, true)
      const intensity = new THREE.BufferAttribute(new Uint8Array(capacity).fill(255), 1, true)
      const classification = new THREE.BufferAttribute(new Uint8Array(capacity), 1, true)
      const confidence = new THREE.BufferAttribute(new Uint8Array(capacity).fill(255), 1, true)
      for (const attribute of [position, color, intensity, classification, confidence]) {
        attribute.setUsage(THREE.DynamicDrawUsage)
      }
      geometry.setAttribute('position', position)
      geometry.setAttribute('pcColor', color)
      geometry.setAttribute('pcIntensity', intensity)
      geometry.setAttribute('pcClass', classification)
      geometry.setAttribute('pcConfidence', confidence)
      geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e-3)
      geometry.setDrawRange(0, 0)

      const points = new THREE.Points(geometry, getMaterial())
      points.frustumCulled = true
      points.visible = false
      points.raycast = () => { /* routed through the cloud root */ }
      cloud.root.add(points)

      cloud.chunks.push({
        id: '__temporal__', points, geometry, count: 0, capacity, dynamic: true,
        worldCentre: new THREE.Vector3(), worldRadius: 1e-3, localRadius: 1e-3,
      })
      invalidateLod()
    },

    updateDynamicFrame(cloudId, frame) {
      if (disposed) return null
      const cloud = clouds.get(cloudId)
      const chunk = cloud?.chunks.find((candidate) => candidate.dynamic)
      if (!cloud || !chunk) {
        log.warn(`updateDynamicFrame for cloud without a dynamic buffer "${cloudId}"`)
        return null
      }

      const available = Math.floor(frame.positions.length / 3)
      const declared = Number.isFinite(frame.count) ? Math.floor(frame.count) : 0
      const requested = Math.max(0, Math.min(declared, available))
      const count = Math.min(requested, chunk.capacity)
      const previousCount = chunk.count
      const previousDrawn = Math.min(previousCount, chunk.geometry.drawRange.count)

      const copy = (
        name: string, source: Float32Array | Uint8Array | null,
        itemSize: number, fallback: number,
      ): void => {
        const attribute = chunk.geometry.getAttribute(name) as THREE.BufferAttribute
        const destination = attribute.array as Float32Array | Uint8Array
        const length = count * itemSize
        if (source) {
          const sourceLength = Math.min(length, source.length)
          destination.set(source.subarray(0, sourceLength), 0)
          if (sourceLength < length) destination.fill(fallback, sourceLength, length)
        } else {
          destination.fill(fallback, 0, length)
        }
        // Tell WebGL precisely which active prefix changed. The backing store is
        // fixed, so this remains one bufferSubData path for the whole replay.
        attribute.clearUpdateRanges()
        attribute.addUpdateRange(0, length)
        attribute.needsUpdate = true
      }

      copy('position', frame.positions, 3, 0)
      copy('pcColor', frame.colors, 3, 200)
      copy('pcIntensity', frame.intensity, 1, 255)
      copy('pcClass', frame.classification, 1, 0)
      copy('pcConfidence', frame.confidence, 1, 255)

      const radius = Math.max(Number.isFinite(frame.radius) ? frame.radius : 0, 1e-3)
      chunk.count = count
      chunk.localRadius = radius
      chunk.points.position.set(frame.origin.x, frame.origin.y, frame.origin.z)
      chunk.geometry.boundingSphere!.center.set(0, 0, 0)
      chunk.geometry.boundingSphere!.radius = radius

      const drawn = Math.min(count, effectiveRenderBudget())
      chunk.geometry.setDrawRange(0, drawn)
      chunk.points.visible = cloud.root.visible && drawn > 0
      cloud.pointCount += count - previousCount
      cloud.drawnCount = Math.max(0, cloud.drawnCount - previousDrawn) + drawn

      // A temporal cloud owns its root, so the current frame can replace the
      // bounds instead of monotonically expanding them across the recording.
      if (frame.bounds) {
        cloud.localBox.min.set(frame.bounds.min.x, frame.bounds.min.y, frame.bounds.min.z)
        cloud.localBox.max.set(frame.bounds.max.x, frame.bounds.max.y, frame.bounds.max.z)
      } else {
        cloud.localBox.min.set(frame.origin.x - radius, frame.origin.y - radius, frame.origin.z - radius)
        cloud.localBox.max.set(frame.origin.x + radius, frame.origin.y + radius, frame.origin.z + radius)
      }
      cloud.root.updateMatrixWorld(true)
      chunk.worldCentre.copy(chunk.points.position).applyMatrix4(cloud.root.matrixWorld)
      chunk.worldRadius = radius * cloud.root.scale.x
      refreshElevationRange()
      invalidateLod()

      return { count, capacity: chunk.capacity, truncated: Math.max(0, frame.count - count) }
    },

    setAlignment(cloudId, alignment) {
      const cloud = clouds.get(cloudId)
      if (!cloud) return
      cloud.alignment = alignment
      applyAlignment(cloud)
      invalidateLod()
    },

    setVisible(cloudId, visible) {
      const cloud = clouds.get(cloudId)
      if (!cloud) return
      cloud.root.visible = visible
      if (!visible) cloud.drawnCount = 0
      invalidateLod()
    },

    setDisplay(next) {
      display = next
      material?.applyDisplay(next, ctx.renderer.getPixelRatio())
      invalidateLod()
    },

    setRenderBudget(budget) {
      renderBudget = Math.max(1, budget)
      invalidateLod()
    },

    setInteractionActive(active) {
      if (interactionActive === active) return
      interactionActive = active
      invalidateLod()
    },

    getBounds(cloudId) {
      return worldBounds(cloudId)
    },

    frame(cloudId) {
      const b = worldBounds(cloudId)
      if (b) ctx.frameBox(b.min, b.max)
    },

    frameWithModel() {
      const b = worldBounds()
      const model = ctx.getActiveModelBounds()
      if (!b && !model) return
      const box = new THREE.Box3()
      if (b) box.union(new THREE.Box3(b.min, b.max))
      if (model) {
        const half = new THREE.Vector3(model.size.x / 2, model.size.y / 2, model.size.z / 2)
        const centre = new THREE.Vector3(model.center.x, model.center.y, model.center.z)
        box.union(new THREE.Box3(centre.clone().sub(half), centre.clone().add(half)))
      }
      if (!box.isEmpty()) ctx.frameBox(box.min, box.max)
    },

    getStats(cloudId) {
      let pointCount = 0, drawnCount = 0, chunkCount = 0, capacity = 0
      for (const cloud of clouds.values()) {
        if (cloudId && cloud.id !== cloudId) continue
        pointCount += cloud.pointCount
        drawnCount += cloud.drawnCount
        chunkCount += cloud.chunks.length
        for (const chunk of cloud.chunks) capacity += chunk.capacity
      }
      return { pointCount, drawnCount, chunkCount, gpuBytes: capacity * BYTES_PER_POINT }
    },

    enableStreaming(cloudId, opts) {
      const cloud = clouds.get(cloudId)
      if (!cloud) { log.warn(`enableStreaming for unknown cloud "${cloudId}"`); return }
      cloud.streaming = opts
      // Whatever open() already delivered (the root node) is resident.
      for (const chunk of cloud.chunks) {
        cloud.residentNodes.add(chunk.id)
        cloud.nodePointCounts.set(chunk.id, chunk.count)
      }
      invalidateLod()
      startLoop()

      // Ask for the first nodes NOW rather than waiting for the LOD loop.
      // Two reasons, and the second is the important one: it saves a frame plus
      // the stream interval before anything appears, and it means a cloud still
      // loads when requestAnimationFrame never fires at all — a background tab,
      // a hidden window, a browser in a low-power mode. A streamed cloud that
      // silently stays empty because the loop was throttled is indistinguishable
      // from a broken one.
      const camera = ctx.getActiveCamera()
      camera.updateMatrixWorld()
      const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
      updateStreaming(cloud, camPos, { useFrustum: false })
    },

    removeNode(cloudId, nodeId) {
      const cloud = clouds.get(cloudId)
      if (!cloud) return
      const index = cloud.chunks.findIndex((c) => c.id === nodeId)
      if (index < 0) { cloud.residentNodes.delete(nodeId); return }
      const [chunk] = cloud.chunks.splice(index, 1)
      cloud.pointCount -= chunk.count
      cloud.drawnCount = Math.max(0, cloud.drawnCount - chunk.count)
      cloud.residentNodes.delete(nodeId)
      cloud.deferredNodes.delete(nodeId)
      cloud.nodePointCounts.delete(nodeId)
      disposeChunk(chunk)
      refreshElevationRange()
      invalidateLod()
    },

    pickPoint(clientX, clientY, tolerancePx = 8) {
      if (disposed || clouds.size === 0) return null
      const camera = ctx.getActiveCamera()
      camera.updateMatrixWorld()

      const canvas = ctx.renderer.domElement
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(ndc, camera)
      return pickAlongRay(raycaster.ray, tolerancePx, null)
    },

    pickAlongRay(ray, tolerancePx = 8, cloudId = null) {
      const only = cloudId === null ? null : clouds.get(cloudId) ?? null
      if (cloudId !== null && !only) return null
      return pickAlongRay(ray, tolerancePx, only)
    },


    remove(cloudId) {
      const cloud = clouds.get(cloudId)
      if (!cloud) return
      disposeCloud(cloud)
      clouds.delete(cloudId)
      if (clouds.size === 0) stopLoop()
      refreshElevationRange()
    },

    count() {
      return clouds.size
    },

    dispose() {
      if (disposed) return
      disposed = true
      stopLoop()
      for (const cloud of clouds.values()) disposeCloud(cloud)
      clouds.clear()
      material?.dispose()
      material = null
    },
  }

  return api
}
