// ─── point-cloud-system tests ─────────────────────────────────────────────────
// Scene-graph and lifecycle guards. No WebGL is involved: three's scene graph,
// geometry and material objects all work headless, and the properties that
// matter here (object count, draw range, disposal) are CPU-side.
//
// The first test is the performance invariant the brief calls out explicitly:
// ONE Object3D per chunk, never one per point.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { createPointCloudSystem, type PointCloudContext } from './point-cloud-system'
import { DEFAULT_DISPLAY, type PointChunk, type PointCloudAlignment } from './pc-types'

function makeContext(overrides: Partial<PointCloudContext> = {}): PointCloudContext & { scene: THREE.Scene } {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  camera.position.set(0, 10, 30)
  camera.updateMatrixWorld()
  return {
    scene,
    getActiveCamera: () => camera,
    renderer: {
      getPixelRatio: () => 1,
      getSize: (v: THREE.Vector2) => v.set(800, 600),
      // pickPoint needs a canvas rect; jsdom gives zeros unless we supply one.
      domElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      },
    } as unknown as THREE.WebGLRenderer,
    getActiveModelBounds: () => ({ center: { x: 0, y: 5, z: 0 }, size: { x: 20, y: 10, z: 20 } }),
    frameBox: vi.fn(),
    ...overrides,
  }
}

function alignment(patch: Partial<PointCloudAlignment> = {}): PointCloudAlignment {
  return {
    rung: 'local', confidence: 'high',
    origin: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: 1, upAxis: 'z',
    reasons: [], offset: { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 },
    ...patch,
  }
}

function chunk(id: string, count: number, origin = { x: 0, y: 0, z: 0 }): PointChunk {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (i % 10) - 5
    positions[i * 3 + 1] = Math.floor(i / 10) % 10 - 5
    positions[i * 3 + 2] = 0
  }
  return {
    id, origin, radius: 8, count, positions,
    colors: new Uint8Array(count * 3).fill(180),
    intensity: new Uint8Array(count).fill(200),
    classification: new Uint8Array(count).fill(2),
    confidence: null,
  }
}

/** Every Points object under the cloud roots. */
function pointObjects(scene: THREE.Scene): THREE.Points[] {
  const out: THREE.Points[] = []
  scene.traverse((o) => { if ((o as THREE.Points).isPoints) out.push(o as THREE.Points) })
  return out
}

beforeEach(() => {
  // The LOD loop uses rAF; jsdom has no scheduler that advances on its own, so
  // make it a no-op and drive the pass through the public API instead.
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => { /* no-op */ })
})

describe('createPointCloudSystem — scene graph', () => {
  it('creates exactly one Object3D per chunk, never one per point', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())

    const CHUNKS = 6
    const POINTS = 50_000
    for (let i = 0; i < CHUNKS; i++) system.addChunk('c1', chunk(`k${i}`, POINTS, { x: i * 20, y: 0, z: 0 }))

    const objects = pointObjects(ctx.scene)
    expect(objects).toHaveLength(CHUNKS)
    expect(system.getStats().pointCount).toBe(CHUNKS * POINTS)
    expect(system.getStats().chunkCount).toBe(CHUNKS)

    // The whole scene graph, roots included, stays in single digits for 300 000
    // points. This is the invariant the feature lives or dies by.
    let nodes = 0
    ctx.scene.traverse(() => { nodes++ })
    expect(nodes).toBeLessThan(20)
  })

  it('shares one material across every chunk of every cloud', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('a', alignment())
    system.create('b', alignment())
    system.addChunk('a', chunk('k0', 100))
    system.addChunk('a', chunk('k1', 100, { x: 30, y: 0, z: 0 }))
    system.addChunk('b', chunk('k0', 100, { x: 60, y: 0, z: 0 }))

    const materials = new Set(pointObjects(ctx.scene).map((p) => p.material))
    expect(materials.size).toBe(1)
  })

  it('uploads colour as normalized bytes, not floats', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 1_000))

    const geometry = pointObjects(ctx.scene)[0].geometry
    const color = geometry.getAttribute('pcColor')
    expect(color.array).toBeInstanceOf(Uint8Array)
    expect(color.normalized).toBe(true)
    expect(geometry.getAttribute('position').array).toBeInstanceOf(Float32Array)
  })

  it('reuses one fixed GPU buffer across temporal frames', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('live', alignment({ upAxis: 'y' }))
    system.addDynamicBuffer('live', 8)

    const points = pointObjects(ctx.scene)[0]
    const geometry = points.geometry
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    expect(position.usage).toBe(THREE.DynamicDrawUsage)
    expect(system.getStats('live').gpuBytes).toBe(8 * 18)

    const first = system.updateDynamicFrame('live', {
      sequence: 1, timestampMs: 0, count: 3,
      origin: { x: 1, y: 2, z: 3 }, radius: 5,
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      colors: new Uint8Array(9).fill(90), intensity: null,
      classification: null, confidence: null,
    })
    expect(first).toEqual({ count: 3, capacity: 8, truncated: 0 })
    expect(system.getStats('live').pointCount).toBe(3)
    expect(points.position.toArray()).toEqual([1, 2, 3])

    const second = system.updateDynamicFrame('live', {
      sequence: 2, timestampMs: 80, count: 12,
      origin: { x: 0, y: 0, z: 0 }, radius: 9,
      bounds: { min: { x: -2, y: 0, z: -3 }, max: { x: 4, y: 5, z: 6 } },
      positions: new Float32Array(12 * 3).fill(4),
      colors: null, intensity: null, classification: null, confidence: null,
    })
    expect(second).toEqual({ count: 8, capacity: 8, truncated: 4 })
    expect(system.getStats('live').pointCount).toBe(8)
    // The geometry and attribute objects are stable: only their array prefixes
    // were updated, so replay cannot create one allocation per frame.
    expect(pointObjects(ctx.scene)).toHaveLength(1)
    expect(points.geometry).toBe(geometry)
    expect(geometry.getAttribute('position')).toBe(position)
    expect(geometry.drawRange.count).toBe(8)
    expect(system.getBounds('live')!.min.toArray()).toEqual([-2, 0, -3])
    expect(system.getBounds('live')!.max.toArray()).toEqual([4, 5, 6])
  })

  it('never intercepts a model pick', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 100))

    const raycaster = new THREE.Raycaster()
    raycaster.set(new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -1))
    expect(raycaster.intersectObjects(pointObjects(ctx.scene), true)).toHaveLength(0)
  })
})

describe('createPointCloudSystem — alignment', () => {
  it('applies the transform to the cloud root, not to individual chunks', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment({ origin: { x: 100, y: 3, z: -50 }, yawRad: Math.PI / 2, scale: 2 }))
    system.addChunk('c1', chunk('k0', 100, { x: 5, y: 0, z: 0 }))

    const root = ctx.scene.children.find((o) => o.name === 'point-cloud:c1')!
    expect(root.position.toArray()).toEqual([100, 3, -50])
    expect(root.scale.x).toBe(2)
    // The chunk carries only its own offset from the cloud origin.
    expect(pointObjects(ctx.scene)[0].position.toArray()).toEqual([5, 0, 0])
  })

  it('tilts a Z-up source onto the Y-up scene and leaves a Y-up source alone', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('z', alignment({ upAxis: 'z' }))
    system.create('y', alignment({ upAxis: 'y' }))

    const zRoot = ctx.scene.children.find((o) => o.name === 'point-cloud:z')!
    const yRoot = ctx.scene.children.find((o) => o.name === 'point-cloud:y')!
    // Source +Z (up) must become scene +Y for a Z-up cloud.
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(zRoot.quaternion)
    expect(up.y).toBeCloseTo(1, 6)
    expect(yRoot.quaternion.equals(new THREE.Quaternion())).toBe(true)
  })

  it('re-applies a new alignment live without touching the buffers', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 1_000))
    const geometry = pointObjects(ctx.scene)[0].geometry
    const before = geometry.getAttribute('position')

    system.setAlignment('c1', alignment({ origin: { x: 42, y: 0, z: 0 } }))
    expect(ctx.scene.children.find((o) => o.name === 'point-cloud:c1')!.position.x).toBe(42)
    // Same attribute object — a nudge must never re-upload the cloud.
    expect(pointObjects(ctx.scene)[0].geometry.getAttribute('position')).toBe(before)
  })
})

describe('createPointCloudSystem — bounds and framing', () => {
  it('reports world bounds that follow the alignment', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment({ origin: { x: 10, y: 0, z: 0 } }))
    system.addChunk('c1', chunk('k0', 100))

    const bounds = system.getBounds('c1')!
    expect(bounds.min.x).toBeLessThan(10)
    expect(bounds.max.x).toBeGreaterThan(10)
  })

  it('returns null bounds when nothing is loaded', () => {
    expect(createPointCloudSystem(makeContext()).getBounds()).toBeNull()
  })

  it('frames the union of the model and every cloud', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment({ origin: { x: 500, y: 0, z: 0 } }))
    system.addChunk('c1', chunk('k0', 100))
    system.frameWithModel()

    expect(ctx.frameBox).toHaveBeenCalledOnce()
    const [min, max] = (ctx.frameBox as ReturnType<typeof vi.fn>).mock.calls[0]
    // Must span the model at x≈0 AND the cloud at x≈500.
    expect((min as THREE.Vector3).x).toBeLessThanOrEqual(-10)
    expect((max as THREE.Vector3).x).toBeGreaterThanOrEqual(500)
  })
})

describe('createPointCloudSystem — lifecycle', () => {
  it('disposes every geometry it uploaded when a cloud is removed', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 1_000))
    system.addChunk('c1', chunk('k1', 1_000, { x: 30, y: 0, z: 0 }))

    const geometries = pointObjects(ctx.scene).map((p) => p.geometry)
    const disposed = geometries.map((g) => vi.spyOn(g, 'dispose'))

    system.remove('c1')
    for (const spy of disposed) expect(spy).toHaveBeenCalled()
    expect(pointObjects(ctx.scene)).toHaveLength(0)
    expect(ctx.scene.children.some((o) => o.name === 'point-cloud:c1')).toBe(false)
    expect(system.count()).toBe(0)
    expect(system.getStats().pointCount).toBe(0)
  })

  it('disposes everything, including the shared material, on dispose()', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('a', alignment())
    system.addChunk('a', chunk('k0', 500))
    system.create('b', alignment())
    system.addChunk('b', chunk('k0', 500, { x: 40, y: 0, z: 0 }))

    const material = pointObjects(ctx.scene)[0].material as THREE.Material
    const materialSpy = vi.spyOn(material, 'dispose')

    system.dispose()
    expect(materialSpy).toHaveBeenCalled()
    expect(pointObjects(ctx.scene)).toHaveLength(0)
    expect(system.count()).toBe(0)
  })

  it('replaces a cloud created twice under the same id instead of leaking the first', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 500))
    system.create('c1', alignment())
    expect(pointObjects(ctx.scene)).toHaveLength(0)
    expect(system.count()).toBe(1)
  })

  it('ignores chunks for an unknown cloud rather than throwing', () => {
    const system = createPointCloudSystem(makeContext())
    expect(() => system.addChunk('nope', chunk('k0', 10))).not.toThrow()
  })

  it('is inert after disposal', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.dispose()
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 10))
    expect(pointObjects(ctx.scene)).toHaveLength(0)
  })
})

describe('createPointCloudSystem — display and budget', () => {
  it('pushes display settings into the shared material uniforms', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 100))
    system.setDisplay({ ...DEFAULT_DISPLAY, pointSize: 7, opacity: 0.4, confidenceThreshold: 0.5, colorMode: 'intensity' })

    const material = pointObjects(ctx.scene)[0].material as THREE.ShaderMaterial
    expect(material.uniforms.uSize.value).toBe(7)
    expect(material.uniforms.uOpacity.value).toBe(0.4)
    expect(material.uniforms.uConfidenceMin.value).toBe(0.5)
    expect(material.transparent).toBe(true)
  })

  it('hides a cloud without discarding its buffers', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 1_000))

    system.setVisible('c1', false)
    expect(ctx.scene.children.find((o) => o.name === 'point-cloud:c1')!.visible).toBe(false)
    expect(system.getStats().pointCount).toBe(1_000)

    system.setVisible('c1', true)
    expect(ctx.scene.children.find((o) => o.name === 'point-cloud:c1')!.visible).toBe(true)
  })

  it('reports GPU bytes proportional to resident points', () => {
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 100_000))
    const stats = system.getStats()
    expect(stats.gpuBytes).toBe(100_000 * 18)
  })

  it('draws a lighter cloud while the camera moves and restores detail at rest', () => {
    let scheduled: FrameRequestCallback | null = null
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      scheduled = cb
      return 1
    })
    const now = vi.spyOn(performance, 'now')
    const ctx = makeContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunk('k0', 10_000))
    system.setRenderBudget(10_000)

    now.mockReturnValue(100)
    ;(scheduled as unknown as FrameRequestCallback)(100)
    expect(system.getStats().drawnCount).toBe(10_000)

    system.setInteractionActive(true)
    now.mockReturnValue(200)
    ;(scheduled as unknown as FrameRequestCallback)(200)
    expect(system.getStats().drawnCount).toBe(4_500)

    system.setInteractionActive(false)
    now.mockReturnValue(300)
    ;(scheduled as unknown as FrameRequestCallback)(300)
    expect(system.getStats().drawnCount).toBe(10_000)
  })
})

describe('createPointCloudSystem — picking', () => {
  /** A chunk with points laid out at known positions, in chunk-local space. */
  function chunkAt(id: string, pts: Array<[number, number, number]>, origin = { x: 0, y: 0, z: 0 }): PointChunk {
    const positions = new Float32Array(pts.length * 3)
    pts.forEach(([x, y, z], i) => { positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z })
    return {
      id, origin, radius: 20, count: pts.length, positions,
      colors: new Uint8Array(pts.length * 3).fill(200),
      intensity: new Uint8Array(pts.length).fill(128),
      classification: new Uint8Array(pts.length).fill(6),
      confidence: null,
    }
  }

  /** Camera on +Z looking at the origin — a click at the centre shoots down −Z. */
  function pickingContext() {
    const ctx = makeContext()
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000)
    camera.position.set(0, 0, 50)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    ctx.getActiveCamera = () => camera
    return ctx
  }

  it('picks the point under the cursor and reports it in scene space', () => {
    const ctx = pickingContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment(), { x: 100, y: 200, z: 300 })
    system.addChunk('c1', chunkAt('k0', [[0, 0, 0]]))

    const hit = system.pickPoint(400, 300)      // dead centre
    expect(hit).not.toBeNull()
    expect(hit!.cloudId).toBe('c1')
    expect(hit!.position.length()).toBeLessThan(0.01)
    expect(hit!.distance).toBeCloseTo(50, 1)
  })

  it('reports the point in the file’s own coordinates too', () => {
    // A surveyor quotes the number in the file, not our scene metres.
    const ctx = pickingContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment({ upAxis: 'y' }), { x: 500_000, y: 4_500_000, z: 42 })
    system.addChunk('c1', chunkAt('k0', [[0, 0, 0]]))

    const hit = system.pickPoint(400, 300)
    expect(hit!.sourcePosition).toEqual({ x: 500_000, y: 4_500_000, z: 42 })
  })

  it('returns null when the cursor is nowhere near a point', () => {
    const ctx = pickingContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunkAt('k0', [[0, 0, 0]]))
    expect(system.pickPoint(10, 10)).toBeNull()
  })

  it('never picks from a hidden cloud', () => {
    const ctx = pickingContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunkAt('k0', [[0, 0, 0]]))
    system.setVisible('c1', false)
    expect(system.pickPoint(400, 300)).toBeNull()
  })

  it('carries the attributes the file had', () => {
    const ctx = pickingContext()
    const system = createPointCloudSystem(ctx)
    system.create('c1', alignment())
    system.addChunk('c1', chunkAt('k0', [[0, 0, 0]]))
    const hit = system.pickPoint(400, 300)!
    expect(hit.classification).toBe(6)
    expect(hit.intensity).toBe(128)
  })

  it('returns null when nothing is loaded', () => {
    expect(createPointCloudSystem(pickingContext()).pickPoint(400, 300)).toBeNull()
  })
})

// ── Measurement: the scan as a raycast target ─────────────────────────────────
//
// Measuring against a scan works by joining the app's shared raycaster rather
// than by growing a second measurement system. These guard the seam.

describe('point-cloud-system · raycast integration', () => {
  /** A ray down −Z from in front of the cloud, which the fixture sits on. */
  const rayAtCloud = (): THREE.Ray =>
    new THREE.Ray(new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -1))

  it('registers the cloud root as a raycast target, and withdraws it on remove', () => {
    // The withdrawal is the half that leaks. The registry is a Set owned
    // elsewhere, so a root left in it keeps the whole closure — chunks, GPU
    // buffers and all — reachable after the user deleted the scan, and every
    // later ray still picks against it.
    const registered: THREE.Object3D[] = []
    const ctx = makeContext({
      registerRaycastTarget: (o) => { registered.push(o) },
      unregisterRaycastTarget: (o) => {
        const i = registered.indexOf(o)
        if (i >= 0) registered.splice(i, 1)
      },
    })
    const sys = createPointCloudSystem(ctx)

    sys.create('pc-1', alignment())
    sys.addChunk('pc-1', chunk('c0', 100))
    expect(registered).toHaveLength(1)
    expect(registered[0].name).toBe('point-cloud:pc-1')

    sys.remove('pc-1')
    expect(registered).toHaveLength(0)
  })

  it('withdraws every cloud on dispose', () => {
    const registered = new Set<THREE.Object3D>()
    const ctx = makeContext({
      registerRaycastTarget: (o) => { registered.add(o) },
      unregisterRaycastTarget: (o) => { registered.delete(o) },
    })
    const sys = createPointCloudSystem(ctx)
    sys.create('a', alignment())
    sys.create('b', alignment())
    expect(registered.size).toBe(2)
    sys.dispose()
    expect(registered.size).toBe(0)
  })

  it('works without the optional hooks, staying inspect-only', () => {
    // Any embedder without a world, and every older context, must keep the
    // previous behaviour rather than throw.
    const sys = createPointCloudSystem(makeContext())
    expect(() => {
      sys.create('pc-1', alignment())
      sys.addChunk('pc-1', chunk('c0', 50))
      sys.remove('pc-1')
    }).not.toThrow()
  })

  it('the root reports an intersection three can consume', () => {
    const ctx = makeContext()
    const sys = createPointCloudSystem(ctx)
    sys.create('pc-1', alignment())
    sys.addChunk('pc-1', chunk('c0', 100))

    const root = findRoot(ctx.scene)
    expect(root).toBeTruthy()

    const raycaster = new THREE.Raycaster()
    raycaster.ray.copy(rayAtCloud())
    const hits: THREE.Intersection[] = []
    root!.raycast(raycaster, hits)

    expect(hits).toHaveLength(1)
    // Shape matters: OBC's castRay compares `distance` against its IFC hit to
    // decide which wins, and filterClippingPlanes reads `point`. A malformed
    // intersection would not throw — it would quietly always lose, or crash the
    // clipping filter.
    expect(hits[0].point).toBeInstanceOf(THREE.Vector3)
    expect(hits[0].object).toBe(root)
    expect(hits[0].distance).toBeGreaterThan(0)
    expect(Number.isFinite(hits[0].distance)).toBe(true)
    // The load-bearing property, asserted against the returned point rather
    // than a hardcoded number: `distance` must be the world-space distance from
    // the ray ORIGIN to `point`. OBC compares it directly against the distance
    // of its IFC hit, so any other convention — distance from the near plane,
    // distance in the cloud's local units — makes the scan win or lose every
    // comparison for reasons that have nothing to do with geometry.
    expect(hits[0].distance).toBeCloseTo(
      raycaster.ray.origin.distanceTo(hits[0].point), 4,
    )
  })

  it('reports nothing when the ray misses, rather than a bogus point', () => {
    const ctx = makeContext()
    const sys = createPointCloudSystem(ctx)
    sys.create('pc-1', alignment())
    sys.addChunk('pc-1', chunk('c0', 100))
    const root = findRoot(ctx.scene)!

    const raycaster = new THREE.Raycaster()
    raycaster.ray.copy(new THREE.Ray(
      new THREE.Vector3(500, 500, 50), new THREE.Vector3(0, 0, -1),
    ))
    const hits: THREE.Intersection[] = []
    root.raycast(raycaster, hits)
    expect(hits).toHaveLength(0)
  })

  it('a hidden cloud is not measurable', () => {
    // Measuring to something the user cannot see would be indefensible.
    const ctx = makeContext()
    const sys = createPointCloudSystem(ctx)
    sys.create('pc-1', alignment())
    sys.addChunk('pc-1', chunk('c0', 100))
    const root = findRoot(ctx.scene)!
    sys.setVisible('pc-1', false)

    const raycaster = new THREE.Raycaster()
    raycaster.ray.copy(rayAtCloud())
    const hits: THREE.Intersection[] = []
    root.raycast(raycaster, hits)
    expect(hits).toHaveLength(0)
  })

  it("each root answers only for its own cloud", () => {
    // three calls raycast once per registered object. A root that answered for
    // every cloud would report the same nearest point N times and make the
    // merge-by-distance comparison meaningless.
    const ctx = makeContext()
    const sys = createPointCloudSystem(ctx)
    sys.create('near', alignment())
    sys.addChunk('near', chunk('c0', 100))
    sys.create('far', alignment({ origin: { x: 0, y: 0, z: -40 } }))
    sys.addChunk('far', chunk('c1', 100))

    const roots = ctx.scene.children.filter((c) => c.name.startsWith('point-cloud:'))
    expect(roots).toHaveLength(2)

    const raycaster = new THREE.Raycaster()
    raycaster.ray.copy(rayAtCloud())
    const nearHits: THREE.Intersection[] = []
    const farHits: THREE.Intersection[] = []
    roots.find((r) => r.name.endsWith('near'))!.raycast(raycaster, nearHits)
    roots.find((r) => r.name.endsWith('far'))!.raycast(raycaster, farHits)

    expect(nearHits).toHaveLength(1)
    expect(farHits).toHaveLength(1)
    // And the nearer cloud must genuinely be nearer, or "whichever is closest
    // wins" picks the wrong surface.
    expect(nearHits[0].distance).toBeLessThan(farHits[0].distance)
  })

  it('STILL never lets a chunk intercept a model click', () => {
    // The invariant that made this integration safe in the first place. Three
    // tests every vertex in a Points geometry against the ray; at twenty million
    // points that is a frozen tab, so the chunks stay unpickable and only the
    // root — which routes through the fast pc-pick path — answers.
    const ctx = makeContext()
    const sys = createPointCloudSystem(ctx)
    sys.create('pc-1', alignment())
    sys.addChunk('pc-1', chunk('c0', 100))

    const root = findRoot(ctx.scene)!
    const raycaster = new THREE.Raycaster()
    raycaster.ray.copy(rayAtCloud())
    for (const child of root.children) {
      const hits: THREE.Intersection[] = []
      child.raycast(raycaster, hits)
      expect(hits, 'a chunk answered a raycast').toHaveLength(0)
    }
  })

  it('pickAlongRay can be scoped to one cloud, and rejects an unknown id', () => {
    const sys = createPointCloudSystem(makeContext())
    sys.create('pc-1', alignment())
    sys.addChunk('pc-1', chunk('c0', 100))

    expect(sys.pickAlongRay(rayAtCloud())?.cloudId).toBe('pc-1')
    expect(sys.pickAlongRay(rayAtCloud(), 8, 'pc-1')?.cloudId).toBe('pc-1')
    expect(sys.pickAlongRay(rayAtCloud(), 8, 'nope')).toBeNull()
  })
})

/** The single cloud root in a scene, for tests that made exactly one. */
function findRoot(scene: THREE.Scene): THREE.Object3D | null {
  return scene.children.find((c) => c.name.startsWith('point-cloud:')) ?? null
}
