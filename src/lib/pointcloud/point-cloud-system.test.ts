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
    reasons: [], offset: { x: 0, y: 0, z: 0, yawDeg: 0, scaleMul: 1 },
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
