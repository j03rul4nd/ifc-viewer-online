// ─── geo-system tests ─────────────────────────────────────────────────────────
// The basemap engine is mocked — these tests cover the LIFECYCLE contract:
// scoped env overrides + exact restoration (INV-3), geoRoot transform
// composition (INV-2), projection re-registration, and leak-free re-enable.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as THREE from 'three'
import { createGeoSystem, type GeoSystemContext } from './geo-system'
import { composeGeoRootTransform, WEB_MERCATOR_WORLD_M, cosLatScale, latLonToTile } from './geo-math'
import type { GeoPlacement, MapProvider } from './geo-types'

// ── basemap-engine mock ─────────────────────────────────────────────────────────

const fakeEngine = {
  group: new THREE.Group(),
  onDegraded: null as ((d: boolean) => void) | null,
  setProvider: vi.fn(),
  setCamera: vi.fn(),
  setResolution: vi.fn(),
  update: vi.fn(),
  setHole: vi.fn(),
  getAttributions: vi.fn(() => ['© Test']),
  getGpuBytesEstimate: vi.fn(() => 42),
  dispose: vi.fn(),
}

vi.mock('./basemap-engine', () => ({
  createBasemapEngine: () => fakeEngine,
}))

// ── geo-terrain mock (terrain-sync tests) ───────────────────────────────────────

interface FakePatch {
  group: THREE.Group
  anchorElevation: number
  zoom: number
  centerTx: number
  centerTy: number
  redrape: ReturnType<typeof vi.fn>
  setStyle: ReturnType<typeof vi.fn>
  setExaggeration: ReturnType<typeof vi.fn>
  setLook: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}

const terrainMock = vi.hoisted(() => ({
  patches: [] as unknown[],
  buildTerrainPatch: vi.fn(),
}))

vi.mock('./geo-terrain', () => ({
  buildTerrainPatch: terrainMock.buildTerrainPatch,
  tileNormalizedCenter: (tx: number, ty: number, zoom: number) => {
    const n = Math.pow(2, zoom)
    return { nx: (tx + 0.5) / n - 0.5, ny: 0.5 - (ty + 0.5) / n, size: 1 / n }
  },
  TERRAIN_EDGE_FADE: 0.12,
}))

function fakePatches(): FakePatch[] {
  return terrainMock.patches as FakePatch[]
}

// ── Context fixture ─────────────────────────────────────────────────────────────

interface Fixture {
  ctx: GeoSystemContext
  scene: THREE.Scene
  persp: THREE.PerspectiveCamera
  ortho: THREE.OrthographicCamera
  controls: {
    maxDistance: number
    maxPolarAngle: number
    getPosition: (out: THREE.Vector3) => THREE.Vector3
    getTarget: (out: THREE.Vector3) => THREE.Vector3
    setLookAt: ReturnType<typeof vi.fn>
  }
  flags: { grid: boolean; tuneLock: boolean; pointer: boolean }
  projectionListeners: Array<(c: THREE.Camera) => void>
  bounds: { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
}

function makeFixture(): Fixture {
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x0a0a0c, 80, 200)
  const persp = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  persp.position.set(0, 100, 0)
  persp.lookAt(0, 0, 0)
  persp.updateMatrixWorld(true)
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)

  const flags = { grid: true, tuneLock: false, pointer: false }
  const projectionListeners: Array<(c: THREE.Camera) => void> = []
  const controls = {
    maxDistance: 500,
    maxPolarAngle: Math.PI,
    getPosition: (out: THREE.Vector3) => out.set(0, 100, 0),
    getTarget: (out: THREE.Vector3) => out.set(0, 0, 0),
    setLookAt: vi.fn(),
  }

  const fixture: Fixture = {
    scene, persp, ortho, controls, flags, projectionListeners,
    bounds: { center: { x: 0, y: 5, z: 0 }, size: { x: 20, y: 10, z: 20 } },
    ctx: {
      scene,
      perspCamera: persp,
      orthoCamera: ortho,
      getActiveCamera: () => persp,
      renderer: {
        domElement: {
          getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
        },
      } as unknown as THREE.WebGLRenderer,
      controls,
      onProjectionChanged: (cb) => {
        projectionListeners.push(cb)
        return () => {
          const i = projectionListeners.indexOf(cb)
          if (i !== -1) projectionListeners.splice(i, 1)
        }
      },
      getGridVisible: () => flags.grid,
      setGridVisible: (v) => { flags.grid = v },
      setSceneTuneLock: (locked) => { flags.tuneLock = locked },
      setPointerSuppressed: (s) => { flags.pointer = s },
      getActiveModelBounds: () => fixture.bounds,
    },
  }
  return fixture
}

const PLACEMENT: GeoPlacement = {
  lat: 41.3851, lon: 2.1734, rotationDeg: 30, heightOffsetM: 0,
  source: 'ifc', confidence: 'high',
}

const PROVIDER: MapProvider = {
  id: 'osm', kind: 'streets', urlTemplate: 'https://t.example.com/{z}/{x}/{y}.png',
  attribution: '© Test', maxZoom: 19, tileDimension: 256,
  requiresTermsNotice: false, homepage: '', lastReviewed: '2026-06',
}

beforeEach(() => {
  vi.clearAllMocks()
  fakeEngine.group = new THREE.Group()
  fakeEngine.onDegraded = null
  terrainMock.patches.length = 0
  terrainMock.buildTerrainPatch.mockImplementation(async (placement: GeoPlacement) => {
    const t = latLonToTile(placement.lat, placement.lon, 15)
    const patch: FakePatch = {
      group: new THREE.Group(),
      anchorElevation: 100,
      zoom: 15,
      centerTx: t.x,
      centerTy: t.y,
      redrape: vi.fn(async () => { /* drape swapped */ }),
      setStyle: vi.fn(),
      setExaggeration: vi.fn(),
      setLook: vi.fn(),
      dispose: vi.fn(),
    }
    terrainMock.patches.push(patch)
    return patch
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('geo-system · enable/disable lifecycle (INV-3)', () => {
  it('applies the scoped environment overrides on enable', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)

    expect(f.persp.far).toBe(60_000)
    expect(f.ortho.far).toBe(60_000)
    expect((f.scene.fog as THREE.Fog).near).toBe(30_000)
    expect((f.scene.fog as THREE.Fog).far).toBe(55_000)
    expect(f.controls.maxDistance).toBe(30_000)
    expect(f.controls.maxPolarAngle).toBeCloseTo((88 * Math.PI) / 180, 6)
    expect(f.flags.grid).toBe(false)
    expect(f.flags.tuneLock).toBe(true)
    expect(f.scene.getObjectByName('geo-root')).toBeTruthy()
    expect(fakeEngine.setProvider).toHaveBeenCalledWith(PROVIDER)
    expect(fakeEngine.setCamera).toHaveBeenCalledWith(f.persp)
    expect(geo.isActive()).toBe(true)
    geo.dispose()
  })

  it('restores EVERY touched value exactly on disable', async () => {
    const f = makeFixture()
    const before = {
      perspNear: f.persp.near, perspFar: f.persp.far,
      orthoNear: f.ortho.near, orthoFar: f.ortho.far,
      fogNear: (f.scene.fog as THREE.Fog).near, fogFar: (f.scene.fog as THREE.Fog).far,
      maxDistance: f.controls.maxDistance, maxPolarAngle: f.controls.maxPolarAngle,
      grid: f.flags.grid, children: f.scene.children.length,
    }
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    geo.disable()

    expect({
      perspNear: f.persp.near, perspFar: f.persp.far,
      orthoNear: f.ortho.near, orthoFar: f.ortho.far,
      fogNear: (f.scene.fog as THREE.Fog).near, fogFar: (f.scene.fog as THREE.Fog).far,
      maxDistance: f.controls.maxDistance, maxPolarAngle: f.controls.maxPolarAngle,
      grid: f.flags.grid, children: f.scene.children.length,
    }).toEqual(before)
    expect(f.flags.tuneLock).toBe(false)
    expect(f.flags.pointer).toBe(false)
    expect(fakeEngine.dispose).toHaveBeenCalled()
    // Camera pose restored via an animated setLookAt back to the snapshot
    const calls = f.controls.setLookAt.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall?.slice(0, 6)).toEqual([0, 100, 0, 0, 0, 0])
    expect(geo.isActive()).toBe(false)
  })

  it('10× enable/disable cycles leave the scene at baseline (leak check)', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    const baseline = f.scene.children.length
    for (let i = 0; i < 10; i++) {
      await geo.enable(PLACEMENT, PROVIDER)
      geo.disable()
    }
    expect(f.scene.children.length).toBe(baseline)
    expect(f.projectionListeners).toHaveLength(0)
  })

  it('enable is idempotent while active', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.enable(PLACEMENT, PROVIDER)
    expect(f.scene.children.filter((c) => c.name === 'geo-root')).toHaveLength(1)
    geo.dispose()
  })
})

describe('geo-system · placement transform (INV-2)', () => {
  it('applies composeGeoRootTransform output to the geoRoot', async () => {
    const f = makeFixture()
    f.bounds = { center: { x: 10, y: 5, z: -20 }, size: { x: 20, y: 10, z: 20 } }
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)

    const expected = composeGeoRootTransform({
      placement: PLACEMENT,
      anchorScene: { x: 10, z: -20 },
      modelMinY: 0, // center.y 5 − size.y/2
    })
    const root = f.scene.getObjectByName('geo-root')!
    expect(root.position.x).toBeCloseTo(expected.position.x, 4)
    expect(root.position.y).toBeCloseTo(expected.position.y, 6)
    expect(root.position.z).toBeCloseTo(expected.position.z, 4)
    expect(root.scale.x).toBeCloseTo(WEB_MERCATOR_WORLD_M * cosLatScale(PLACEMENT.lat), 2)

    const q = new THREE.Quaternion()
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), expected.yawRad)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), expected.tiltRad))
    expect(root.quaternion.angleTo(q)).toBeCloseTo(0, 6)
    geo.dispose()
  })

  it('the model itself is never moved — only the geoRoot receives the transform', async () => {
    const f = makeFixture()
    const model = new THREE.Group()
    model.name = 'ifc-model-pivot-test'
    f.scene.add(model)
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    expect(model.position.lengthSq()).toBe(0)
    expect(model.scale.x).toBe(1)
    geo.dispose()
  })
})

describe('geo-system · camera & picking', () => {
  it('re-registers the camera on projection swap', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    fakeEngine.setCamera.mockClear()
    f.projectionListeners.forEach((cb) => cb(f.ortho))
    expect(fakeEngine.setCamera).toHaveBeenCalledWith(f.ortho)
    geo.dispose()
  })

  it('pickGround inverts a straight-down centre ray to the anchor lat/lon', async () => {
    const f = makeFixture()
    f.bounds = { center: { x: 0, y: 5, z: 0 }, size: { x: 20, y: 10, z: 20 } }
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    // Camera sits at (0,100,0) looking at the origin — the canvas centre ray
    // hits the ground plane at the anchor, whose geographic position is the
    // placement lat/lon by construction.
    const hit = geo.pickGround(50, 50)
    expect(hit).not.toBeNull()
    expect(hit!.lat).toBeCloseTo(PLACEMENT.lat, 4)
    expect(hit!.lon).toBeCloseTo(PLACEMENT.lon, 4)
    geo.dispose()
  })

  it('exposes north direction from the placement yaw', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable({ ...PLACEMENT, rotationDeg: 0 }, PROVIDER)
    const n = geo.getNorthDirection()
    expect(n.x).toBeCloseTo(0, 6)
    expect(n.z).toBeCloseTo(-1, 6)
    geo.dispose()
  })
})

// ── Terrain sync (provider switch + placement moves) ────────────────────────────

const PROVIDER2: MapProvider = {
  ...PROVIDER,
  id: 'esri-imagery',
  kind: 'satellite',
  urlTemplate: 'https://sat.example.com/{z}/{y}/{x}',
}

describe('geo-system · terrain sync', () => {
  it('redrapes the active terrain when the provider switches (BUG-1)', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)
    expect(terrainMock.buildTerrainPatch).toHaveBeenCalledTimes(1)
    const patch = fakePatches()[0]

    geo.setProvider(PROVIDER2)
    expect(patch.redrape).toHaveBeenCalledWith(PROVIDER2)
    expect(terrainMock.buildTerrainPatch).toHaveBeenCalledTimes(1) // DEM untouched
    geo.dispose()
  })

  it('does nothing terrain-related on provider switch when terrain is off', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    geo.setProvider(PROVIDER2)
    expect(terrainMock.buildTerrainPatch).not.toHaveBeenCalled()
    geo.dispose()
  })

  it('passes the active provider and model span into the patch build', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)
    const [placementArg, providerArg, optsArg] = terrainMock.buildTerrainPatch.mock.calls[0]
    expect(placementArg.lat).toBe(PLACEMENT.lat)
    expect(providerArg).toBe(PROVIDER)
    expect(optsArg.modelSpanM).toBeCloseTo(Math.hypot(20, 20), 6)
    geo.dispose()
  })

  it('rebuilds (debounced) after the placement leaves the centre tile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)
    const first = fakePatches()[0]

    geo.setPlacement({ ...PLACEMENT, lat: PLACEMENT.lat + 1 }) // ≫ 1 tile at z15
    expect(terrainMock.buildTerrainPatch).toHaveBeenCalledTimes(1) // not yet — debounced
    await vi.advanceTimersByTimeAsync(800)
    expect(first.dispose).toHaveBeenCalled()
    expect(terrainMock.buildTerrainPatch).toHaveBeenCalledTimes(2)
    // The rebuild used the NEW placement
    const rebuiltWith = terrainMock.buildTerrainPatch.mock.calls[1][0] as GeoPlacement
    expect(rebuiltWith.lat).toBeCloseTo(PLACEMENT.lat + 1, 9)
    geo.dispose()
  })

  it('does NOT rebuild for nudges inside the same tile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)

    geo.setPlacement({ ...PLACEMENT, lat: PLACEMENT.lat + 1e-7 })
    await vi.advanceTimersByTimeAsync(2000)
    expect(terrainMock.buildTerrainPatch).toHaveBeenCalledTimes(1)
    geo.dispose()
  })

  it('disable cancels a pending placement rebuild', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)

    geo.setPlacement({ ...PLACEMENT, lat: PLACEMENT.lat + 1 })
    geo.disable()
    await vi.advanceTimersByTimeAsync(2000)
    expect(terrainMock.buildTerrainPatch).toHaveBeenCalledTimes(1)
    expect(fakePatches()[0].dispose).toHaveBeenCalled()
    geo.dispose()
  })

  it('terrain toggled off disposes the patch and provider switches stop redraping', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)
    const patch = fakePatches()[0]
    await geo.setTerrain(false)
    expect(patch.dispose).toHaveBeenCalled()
    geo.setProvider(PROVIDER2)
    expect(patch.redrape).not.toHaveBeenCalled()
    geo.dispose()
  })

  it('clips a 4-plane hole in the flat basemap under the patch, restored on teardown', async () => {
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setTerrain(true)

    const callsAfterBuild = fakeEngine.setHole.mock.calls
    const lastHole = callsAfterBuild[callsAfterBuild.length - 1][0] as THREE.Plane[] | null
    expect(Array.isArray(lastHole)).toBe(true)
    expect(lastHole).toHaveLength(4)
    // World-space planes: with the huge geoRoot scale the normals must still
    // be unit length (Plane.applyMatrix4 renormalizes).
    for (const p of lastHole!) expect(p.normal.length()).toBeCloseTo(1, 6)

    await geo.setTerrain(false)
    const last = fakeEngine.setHole.mock.calls[fakeEngine.setHole.mock.calls.length - 1][0]
    expect(last).toBeNull()
    geo.dispose()
  })

  it('re-applies sticky style and exaggeration to rebuilt patches', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    geo.setTerrainStyle('hypsometric')
    geo.setTerrainExaggeration(2)
    await geo.setTerrain(true)

    const first = fakePatches()[0]
    expect(first.setStyle).toHaveBeenCalledWith('hypsometric')
    expect(first.setExaggeration).toHaveBeenCalledWith(2)

    // Live changes forward to the active patch…
    geo.setTerrainExaggeration(3)
    expect(first.setExaggeration).toHaveBeenCalledWith(3)

    // …and survive a placement-driven rebuild.
    geo.setPlacement({ ...PLACEMENT, lat: PLACEMENT.lat + 1 })
    await vi.advanceTimersByTimeAsync(800)
    const second = fakePatches()[1]
    expect(second.setStyle).toHaveBeenCalledWith('hypsometric')
    expect(second.setExaggeration).toHaveBeenCalledWith(3)
    geo.dispose()
  })

  it('re-applies the sticky advanced look, clamped, to rebuilt patches', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = makeFixture()
    const geo = createGeoSystem(f.ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    // Out-of-range values must never reach the patch — the system clamps.
    geo.setTerrainLook({
      sunAzimuth: 400, sunAltitude: 200, softness: 0.25,
      occlusion: 5, detail: 0.4, contourInterval: 10,
    })
    await geo.setTerrain(true)

    const first = fakePatches()[0]
    expect(first.setLook).toHaveBeenCalledWith(
      expect.objectContaining({ sunAzimuth: 40, sunAltitude: 90, occlusion: 1, detail: 0.4 }),
    )

    // Live changes forward to the active patch…
    geo.setTerrainLook({ sunAzimuth: 120, sunAltitude: 30, softness: 1, occlusion: 0, detail: 0, contourInterval: 0 })
    expect(first.setLook).toHaveBeenCalledWith(expect.objectContaining({ sunAzimuth: 120 }))

    // …and survive a placement-driven rebuild.
    geo.setPlacement({ ...PLACEMENT, lat: PLACEMENT.lat + 1 })
    await vi.advanceTimersByTimeAsync(800)
    expect(fakePatches()[1].setLook).toHaveBeenCalledWith(expect.objectContaining({ sunAzimuth: 120 }))
    geo.dispose()
  })
})

// ── Surrounding features: one query per neighbourhood ─────────────────────────
//
// Overpass is a shared public service with rate limits, and the query takes
// seconds. Toggling the surroundings off and on, or re-enabling map mode at the
// same site, must rebuild from the reply already in memory — otherwise the
// control feels broken and the service gets hammered for bytes we are holding.

describe('geo-system · OSM feature cache', () => {
  /** Fake worker that answers one canned reply and counts how often it is built. */
  class FakeBuildingsWorker {
    static built = 0
    onmessage: ((e: MessageEvent<unknown>) => void) | null = null
    onerror: ((e: ErrorEvent) => void) | null = null
    constructor() { FakeBuildingsWorker.built++ }
    postMessage(msg: { id: string }): void {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'buildings',
            id: msg.id,
            features: [{
              id: 'w1',
              kind: 'building',
              ring: [
                { lat: 41.3851, lon: 2.1734 }, { lat: 41.3852, lon: 2.1734 },
                { lat: 41.3852, lon: 2.1735 }, { lat: 41.3851, lon: 2.1735 },
              ],
              height: { heightM: 12, source: 'tag' },
              style: { roofShape: 'flat', roofHeightM: 0 },
            }],
            counts: { building: 1, water: 0, green: 0, tree: 0, bridge: 0 },
            truncated: false,
          },
        } as MessageEvent<unknown>)
      })
    }
    terminate(): void { /* no-op */ }
  }

  const originalWorker = globalThis.Worker

  beforeEach(() => {
    FakeBuildingsWorker.built = 0
    ;(globalThis as { Worker: unknown }).Worker = FakeBuildingsWorker
  })
  afterEach(() => {
    ;(globalThis as { Worker: unknown }).Worker = originalWorker
  })

  it('queries once, then rebuilds from memory when toggled off and on', async () => {
    const geo = createGeoSystem(makeFixture().ctx)
    await geo.enable(PLACEMENT, PROVIDER)

    const first = await geo.setBuildings(true)
    expect(first.status).toBe('ready')
    expect(FakeBuildingsWorker.built).toBe(1)

    await geo.setBuildings(false)
    const second = await geo.setBuildings(true)

    expect(second.status).toBe('ready')
    expect(FakeBuildingsWorker.built).toBe(1) // served from cache
    if (second.status === 'ready') expect(second.counts.building).toBe(1)
  })

  it('survives a map-mode cycle at the same site', async () => {
    const geo = createGeoSystem(makeFixture().ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setBuildings(true)
    geo.disable()

    await geo.enable(PLACEMENT, PROVIDER)
    const again = await geo.setBuildings(true)

    expect(again.status).toBe('ready')
    expect(FakeBuildingsWorker.built).toBe(1)
  })

  it('re-queries once the model moves out of the cached neighbourhood', async () => {
    const geo = createGeoSystem(makeFixture().ctx)
    await geo.enable(PLACEMENT, PROVIDER)
    await geo.setBuildings(true)
    expect(FakeBuildingsWorker.built).toBe(1)

    geo.disable()
    // ~1.5 km north — a different neighbourhood, so a different query.
    await geo.enable({ ...PLACEMENT, lat: PLACEMENT.lat + 0.015 }, PROVIDER)
    await geo.setBuildings(true)

    expect(FakeBuildingsWorker.built).toBe(2)
  })
})
