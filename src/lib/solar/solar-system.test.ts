// ─── solar-system tests ───────────────────────────────────────────────────────
// Lifecycle contract: exact restore, leak-free re-enable, correct sun-driven
// light placement, mesh flagging (incl. late loads), moon behaviour. The
// shadow-frustum fit is validated with three's OWN projection math.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { createSolarSystem, type SolarSystemContext, type SolarStudyState } from './solar-system'
import { fitSunShadow } from './shadow-fit'
import { sunDirectionScene } from './sun-math'

const MADRID_NOON: SolarStudyState = {
  timeUTC: Date.UTC(2026, 5, 21, 12, 0),
  lat: 40.4168, lon: -3.7038, yawDeg: 0, moonOn: false,
}
const MADRID_NIGHT: SolarStudyState = { ...MADRID_NOON, timeUTC: Date.UTC(2026, 5, 21, 1, 0) }

interface Fixture {
  ctx: SolarSystemContext
  scene: THREE.Scene
  key: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  fill: THREE.DirectionalLight
  models: Map<string, THREE.Object3D>
  loadedCbs: Array<(id: string) => void>
}

function makeFixture(): Fixture {
  const scene = new THREE.Scene()
  const key = new THREE.DirectionalLight(0xfff5e8, 1.1)
  key.position.set(40, 60, 30)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0008
  const hemi = new THREE.HemisphereLight(0xb8c4e0, 0x1a1a22, 0.6)
  const fill = new THREE.DirectionalLight(0x6b7ac8, 0.3)
  scene.add(hemi, key, fill)

  const models = new Map<string, THREE.Object3D>()
  const loadedCbs: Array<(id: string) => void> = []

  const makeModel = (id: string): THREE.Object3D => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), new THREE.MeshBasicMaterial()))
    g.add(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshBasicMaterial()))
    scene.add(g)
    models.set(id, g)
    return g
  }
  makeModel('m1')

  return {
    scene, key, hemi, fill, models, loadedCbs,
    ctx: {
      scene,
      keyLight: key,
      hemiLight: hemi,
      fillLight: fill,
      getActiveModelBounds: () => ({ center: { x: 0, y: 5, z: 0 }, size: { x: 20, y: 10, z: 20 } }),
      getLoadedModelIds: () => [...models.keys()],
      getModelObject: (id) => models.get(id) ?? null,
      onModelLoaded: (cb) => {
        loadedCbs.push(cb)
        return () => {
          const i = loadedCbs.indexOf(cb)
          if (i !== -1) loadedCbs.splice(i, 1)
        }
      },
    },
  }
}

function meshesOf(obj: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) })
  return out
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Lifecycle ───────────────────────────────────────────────────────────────────

describe('solar-system · enable/disable', () => {
  it('flags meshes, adds the catcher + target, dims fill', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.enable()
    expect(meshesOf(f.models.get('m1')!).every((m) => m.castShadow && m.receiveShadow)).toBe(true)
    expect(f.scene.getObjectByName('solar-shadow-catcher')).toBeTruthy()
    expect(f.fill.intensity).toBeCloseTo(0.05, 6)
    expect(f.scene.children).toContain(f.key.target)
    solar.dispose()
  })

  it('restores EVERY touched value exactly on disable', () => {
    const f = makeFixture()
    const before = {
      keyPos: f.key.position.clone(),
      keyColor: f.key.color.getHex(),
      keyIntensity: f.key.intensity,
      bias: f.key.shadow.bias,
      mapSize: f.key.shadow.mapSize.x,
      frustum: { l: f.key.shadow.camera.left, r: f.key.shadow.camera.right },
      hemi: f.hemi.intensity,
      fill: f.fill.intensity,
      children: f.scene.children.length,
    }
    const solar = createSolarSystem(f.ctx)
    solar.enable()
    solar.setState(MADRID_NOON)
    solar.setQuality('high')
    solar.disable()

    expect(f.key.position.equals(before.keyPos)).toBe(true)
    expect(f.key.color.getHex()).toBe(before.keyColor)
    expect(f.key.intensity).toBe(before.keyIntensity)
    expect(f.key.shadow.bias).toBe(before.bias)
    expect(f.key.shadow.mapSize.x).toBe(before.mapSize)
    expect(f.key.shadow.camera.left).toBe(before.frustum.l)
    expect(f.key.shadow.camera.right).toBe(before.frustum.r)
    expect(f.hemi.intensity).toBe(before.hemi)
    expect(f.fill.intensity).toBe(before.fill)
    expect(f.scene.children.length).toBe(before.children)
    expect(meshesOf(f.models.get('m1')!).every((m) => !m.castShadow && !m.receiveShadow)).toBe(true)
  })

  it('10× enable/disable cycles leave the scene at baseline (leak check)', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    const baseline = f.scene.children.length
    for (let i = 0; i < 10; i++) {
      solar.enable()
      solar.setState({ ...MADRID_NOON, moonOn: true })
      solar.disable()
    }
    expect(f.scene.children.length).toBe(baseline)
    expect(f.loadedCbs).toHaveLength(0) // subscriptions released
  })

  it('flags models loaded while active and refits', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.enable()
    solar.setState(MADRID_NOON)

    const late = new THREE.Group()
    late.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial()))
    f.scene.add(late)
    f.models.set('m2', late)
    f.loadedCbs.forEach((cb) => cb('m2'))

    expect(meshesOf(late).every((m) => m.castShadow)).toBe(true)
    solar.dispose()
  })
})

// ── Sun placement ───────────────────────────────────────────────────────────────

describe('solar-system · setState', () => {
  it('noon sun: light above the model, warm-white, intensity > 1', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.enable()
    solar.setState(MADRID_NOON)
    expect(f.key.intensity).toBeGreaterThan(1)
    expect(f.key.position.y).toBeGreaterThan(10) // high sun
    const info = solar.getSunInfo()
    expect(info!.altitudeDeg).toBeGreaterThan(68)
    // Southern sky at yaw 0 → light sits toward +Z
    expect(f.key.position.z).toBeGreaterThan(0)
    solar.dispose()
  })

  it('night: sun intensity 0, hemi drops to night level', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.enable()
    solar.setState(MADRID_NIGHT)
    expect(f.key.intensity).toBe(0)
    expect(f.hemi.intensity).toBeCloseTo(0.12, 6)
    solar.dispose()
  })

  it('setState before enable is a no-op; getSunInfo null', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.setState(MADRID_NOON)
    expect(solar.getSunInfo()).toBeNull()
    expect(f.key.intensity).toBe(1.1) // untouched
  })
})

// ── Moon ────────────────────────────────────────────────────────────────────────

describe('solar-system · moon', () => {
  it('moon light exists only while enabled, never casts hard shadows', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.enable()

    // Find an hour that night when the moon is up (deterministic scan).
    let state: SolarStudyState | null = null
    for (let h = 0; h < 24; h++) {
      const t = { ...MADRID_NOON, timeUTC: Date.UTC(2026, 5, 21, h, 0), moonOn: true }
      solar.setState(t)
      const m = solar.getMoonInfo()
      if (m && m.altitudeDeg > 5 && solar.getSunInfo()!.altitudeDeg < 0) { state = t; break }
    }
    if (state) {
      const moon = f.scene.children.find(
        (c) => c !== f.key && c !== f.fill && (c as THREE.DirectionalLight).isDirectionalLight,
      ) as THREE.DirectionalLight
      expect(moon).toBeTruthy()
      expect(moon.castShadow).toBe(false)
      expect(moon.intensity).toBeGreaterThan(0)
      expect(f.hemi.intensity).toBeCloseTo(0.18, 6) // night + moon ambience
    }
    solar.disable()
    const stillThere = f.scene.children.some(
      (c) => (c as THREE.Light).isLight && c !== f.key && c !== f.fill && c !== f.hemi,
    )
    expect(stillThere).toBe(false)
  })
})

// ── Sky dome ────────────────────────────────────────────────────────────────────

describe('solar-system · sky dome', () => {
  it('replaces background/fog while on and restores them exactly', async () => {
    const f = makeFixture()
    f.scene.background = new THREE.Color(0x0a0a0c)
    f.scene.fog = new THREE.Fog(0x0a0a0c, 80, 200)
    const bgBefore = f.scene.background
    const fogBefore = f.scene.fog

    const solar = createSolarSystem(f.ctx)
    solar.enable()
    solar.setState(MADRID_NOON)
    solar.setSky(true)
    expect(f.scene.background).toBeNull()
    expect(f.scene.fog).toBeNull()
    const dome = f.scene.children.find((c) => (c as THREE.Mesh).isMesh && c !== undefined && (c as THREE.Mesh).geometry?.type === 'BoxGeometry')
    expect(dome).toBeTruthy() // three Sky is a box mesh

    solar.setSky(false)
    expect(f.scene.background).toBe(bgBefore)
    expect(f.scene.fog).toBe(fogBefore)

    // Also restored via full disable
    solar.setSky(true)
    solar.disable()
    expect(f.scene.background).toBe(bgBefore)
    expect(f.scene.fog).toBe(fogBefore)
    solar.dispose()
  })

  it('sky is ignored while inactive and sized within the camera far heuristic', () => {
    const f = makeFixture()
    const solar = createSolarSystem(f.ctx)
    solar.setSky(true) // inactive → no-op
    expect(f.scene.children.some((c) => (c as THREE.Mesh).geometry?.type === 'BoxGeometry')).toBe(false)

    solar.enable()
    solar.setSky(true)
    solar.setState(MADRID_NOON)
    const dome = f.scene.children.find((c) => (c as THREE.Mesh).geometry?.type === 'BoxGeometry') as THREE.Mesh
    // bounds span ≈ hypot(20,10,20) ≈ 30 → scale ≈ 600 ≪ far (size×50)
    expect(dome.scale.x).toBeGreaterThanOrEqual(500)
    expect(dome.scale.x).toBeLessThan(45_001)
    solar.dispose()
  })
})

// ── Shadow frustum fit (validated with three's projection) ─────────────────────

describe('fitSunShadow', () => {
  const BOUNDS = { center: { x: 3, y: 8, z: -5 }, size: { x: 24, y: 12, z: 30 } }

  function cornersOf(b: typeof BOUNDS): THREE.Vector3[] {
    const out: THREE.Vector3[] = []
    for (let i = 0; i < 8; i++) {
      out.push(new THREE.Vector3(
        b.center.x + (i & 1 ? 1 : -1) * b.size.x / 2,
        b.center.y + (i & 2 ? 1 : -1) * b.size.y / 2,
        b.center.z + (i & 4 ? 1 : -1) * b.size.z / 2,
      ))
    }
    return out
  }

  it.each([
    ['south 45°', sunDirectionScene(180, 45, 0)],
    ['east low', sunDirectionScene(90, 8, 0)],
    ['northwest steep', sunDirectionScene(315, 70, 0)],
    ['near zenith', sunDirectionScene(10, 89.5, 0)],
  ])('every bbox corner projects inside the frustum (%s)', (_label, dir) => {
    const fit = fitSunShadow(BOUNDS, dir)
    const cam = new THREE.OrthographicCamera(fit.left, fit.right, fit.top, fit.bottom, fit.near, fit.far)
    cam.up.set(fit.up.x, fit.up.y, fit.up.z)
    cam.position.set(fit.position.x, fit.position.y, fit.position.z)
    cam.lookAt(BOUNDS.center.x, BOUNDS.center.y, BOUNDS.center.z)
    cam.updateMatrixWorld(true)
    cam.updateProjectionMatrix()
    for (const corner of cornersOf(BOUNDS)) {
      const p = corner.clone().project(cam)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.001)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1.001)
      expect(Math.abs(p.z)).toBeLessThanOrEqual(1.001)
    }
  })
})
