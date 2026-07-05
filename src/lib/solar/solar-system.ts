// ─── solar-system ─────────────────────────────────────────────────────────────
// Sun & Moon Study lifecycle owner (docs/SUN_MOON_STUDY_PLAN.md D2/D6). Twin
// of geo-system: this module owns every Three.js resource the study touches;
// solarStore owns product state; the viewer carries only a lazy getSolar()
// hook. Loaded via dynamic import — never import statically from entry code.
//
// Restore-exact discipline (the geo INV-3 rule applied to lights): everything
// enable() mutates — key/hemi/fill lights, shadow camera, per-mesh cast flags,
// the ground catcher — is snapshotted and restored byte-exact on disable().

import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import {
  sunAt, moonAt, sunDirectionScene,
  sunColorForAltitude, sunIntensityForAltitude, moonIntensityFor,
  SUN_HORIZON_DEG, type MoonState, type SkyPosition,
} from './sun-math'
import { fitSunShadow } from './shadow-fit'
import { createLogger } from '../logger'

const log = createLogger('SolarSystem')

const DEG = Math.PI / 180
/** Fill light is dimmed (not killed) while the sun rules the scene. */
const FILL_DIMMED = 0.05
const HEMI_DAY = 0.35
const HEMI_NIGHT = 0.12
const HEMI_NIGHT_MOON = 0.18
const CATCHER_OPACITY = 0.35
const MOON_COLOR = 0x8fa8c8
const QUALITY_MAP_SIZE = { standard: 2048, high: 4096 } as const

// ── Context provided by viewer.ts ───────────────────────────────────────────────

export interface SolarSystemContext {
  scene: THREE.Scene
  keyLight: THREE.DirectionalLight
  hemiLight: THREE.HemisphereLight
  fillLight: THREE.DirectionalLight
  getActiveModelBounds(): {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
  getLoadedModelIds(): string[]
  getModelObject(modelId: string): THREE.Object3D | null
  /** Subscribe to model loads (appBus 'model:loaded'). Returns unsubscribe. */
  onModelLoaded(cb: (modelId: string) => void): () => void
}

// ── Public API ──────────────────────────────────────────────────────────────────

export interface SolarStudyState {
  timeUTC: number
  lat: number
  lon: number
  /** Placement yaw in degrees — the same compass the map mode uses. */
  yawDeg: number
  moonOn: boolean
}

export interface SolarSystemAPI {
  /** Take over the scene lights + enable casting. Idempotent while active. */
  enable(): void
  /** Restore every touched value exactly and drop study resources. */
  disable(): void
  isActive(): boolean
  /** Recompute sun/moon for a study state (called on every slider move). */
  setState(state: SolarStudyState): void
  setQuality(q: 'standard' | 'high'): void
  /**
   * Physical sky dome (three Sky shader) — replaces the scene background while
   * on; snapshotted background/fog restore exactly on toggle-off/disable.
   * Only honoured while the study is active.
   */
  setSky(enabled: boolean): void
  getSunInfo(): SkyPosition | null
  getMoonInfo(): MoonState | null
  dispose(): void
}

interface LightsSnapshot {
  keyPos: THREE.Vector3
  keyColor: THREE.Color
  keyIntensity: number
  keyBias: number
  keyNormalBias: number
  keyMapSize: number
  frustum: { left: number; right: number; top: number; bottom: number; near: number; far: number }
  camUp: THREE.Vector3
  hemiIntensity: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  fillIntensity: number
  targetPos: THREE.Vector3
}

export function createSolarSystem(ctx: SolarSystemContext): SolarSystemAPI {
  let active = false
  let disposed = false
  let snapshot: LightsSnapshot | null = null
  let catcher: THREE.Mesh | null = null
  let moonLight: THREE.DirectionalLight | null = null
  let sky: Sky | null = null
  let skySnapshot: { background: THREE.Scene['background']; fog: THREE.Scene['fog'] } | null = null
  let unsubscribeModels: (() => void) | null = null
  /** Meshes whose cast/receive flags WE set (to unset exactly on disable). */
  let flagged: Set<THREE.Mesh> = new Set()
  let lastState: SolarStudyState | null = null
  let sunInfo: SkyPosition | null = null
  let moonInfo: MoonState | null = null

  const api: SolarSystemAPI = {
    enable() {
      if (disposed || active) return
      active = true
      snapshot = takeSnapshot()

      // The sun owns the frame: competing directions wash out the read.
      ctx.fillLight.intensity = FILL_DIMMED
      ctx.hemiLight.intensity = HEMI_DAY

      // DirectionalLight only honours .target when it's in the scene graph.
      ctx.scene.add(ctx.keyLight.target)

      for (const id of ctx.getLoadedModelIds()) flagModel(id)
      unsubscribeModels = ctx.onModelLoaded((modelId) => {
        if (!active) return
        flagModel(modelId)
        if (lastState) api.setState(lastState) // bounds changed → refit
      })

      ensureCatcher()
      log.info('sun study enabled')
    },

    disable() {
      if (!active) return
      active = false
      unsubscribeModels?.()
      unsubscribeModels = null

      for (const mesh of flagged) {
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
      flagged = new Set()

      if (catcher) {
        catcher.removeFromParent()
        catcher.geometry.dispose()
        ;(catcher.material as THREE.Material).dispose()
        catcher = null
      }
      if (moonLight) {
        moonLight.target.removeFromParent()
        moonLight.removeFromParent()
        moonLight.dispose()
        moonLight = null
      }
      teardownSky()
      ctx.scene.remove(ctx.keyLight.target)

      restoreSnapshot()
      lastState = null
      sunInfo = null
      moonInfo = null
      log.info('sun study disabled')
    },

    isActive() {
      return active
    },

    setState(state) {
      if (!active) return
      lastState = state
      const when = new Date(state.timeUTC)
      const yawRad = state.yawDeg * DEG
      sunInfo = sunAt(when, state.lat, state.lon)

      const bounds = ctx.getActiveModelBounds() ?? {
        center: { x: 0, y: 0, z: 0 }, size: { x: 50, y: 20, z: 50 },
      }

      // ── Sun ────────────────────────────────────────────────────────────────
      const key = ctx.keyLight
      const intensity = sunIntensityForAltitude(sunInfo.altitudeDeg)
      // The sky needs the direction even below the horizon (dusk/night tints).
      const dir = sunDirectionScene(sunInfo.azimuthDeg, sunInfo.altitudeDeg, yawRad)
      key.intensity = intensity
      if (intensity > 0) {
        const fit = fitSunShadow(bounds, dir)
        key.position.set(fit.position.x, fit.position.y, fit.position.z)
        key.target.position.set(bounds.center.x, bounds.center.y, bounds.center.z)
        key.target.updateMatrixWorld()
        const c = sunColorForAltitude(sunInfo.altitudeDeg)
        key.color.setRGB(c.r, c.g, c.b)

        const cam = key.shadow.camera
        cam.up.set(fit.up.x, fit.up.y, fit.up.z) // basis must match the fit
        cam.left = fit.left; cam.right = fit.right
        cam.top = fit.top; cam.bottom = fit.bottom
        cam.near = fit.near; cam.far = fit.far
        cam.updateProjectionMatrix()
        // Auto-bias: scale with frustum size (ShadowedScene's one good idea).
        const frustumSize = Math.max(fit.right - fit.left, fit.top - fit.bottom)
        key.shadow.bias = clamp(-0.0008 * (frustumSize / 100), -0.004, -0.0002)
        key.shadow.normalBias = 0.03
      }

      // ── Moon + night ambience ──────────────────────────────────────────────
      moonInfo = state.moonOn ? moonAt(when, state.lat, state.lon) : null
      const nightSun = sunInfo.altitudeDeg <= SUN_HORIZON_DEG
      if (state.moonOn && moonInfo) {
        const moon = ensureMoonLight()
        const mi = moonIntensityFor(moonInfo.fraction, moonInfo.altitudeDeg)
        moon.intensity = mi
        if (mi > 0) {
          const mdir = sunDirectionScene(moonInfo.azimuthDeg, moonInfo.altitudeDeg, yawRad)
          const span = Math.hypot(bounds.size.x, bounds.size.y, bounds.size.z)
          moon.position.set(
            bounds.center.x + mdir.x * span * 2,
            bounds.center.y + mdir.y * span * 2,
            bounds.center.z + mdir.z * span * 2,
          )
          moon.target.position.set(bounds.center.x, bounds.center.y, bounds.center.z)
          moon.target.updateMatrixWorld()
        }
        ctx.hemiLight.intensity = nightSun ? HEMI_NIGHT_MOON : HEMI_DAY
      } else {
        if (moonLight) moonLight.intensity = 0
        ctx.hemiLight.intensity = nightSun ? HEMI_NIGHT : HEMI_DAY
      }

      // ── Sky dome ───────────────────────────────────────────────────────────
      if (sky) {
        ;(sky.material.uniforms['sunPosition'].value as THREE.Vector3).set(dir.x, dir.y, dir.z)
        // Keep the dome inside the camera far plane (tuneSceneToBounds uses
        // ~size×50; span×20 stays comfortably within at any model scale).
        const span = Math.hypot(bounds.size.x, bounds.size.y, bounds.size.z)
        sky.scale.setScalar(Math.min(45_000, Math.max(500, span * 20)))
        sky.position.set(bounds.center.x, bounds.center.y, bounds.center.z)
      }

      updateCatcher(bounds)
    },

    setSky(enabled) {
      if (!active) return
      if (enabled && !sky) {
        skySnapshot = { background: ctx.scene.background, fog: ctx.scene.fog }
        ctx.scene.background = null
        ctx.scene.fog = null // dark fog against a bright sky reads as smog
        sky = new Sky()
        const u = sky.material.uniforms
        u['turbidity'].value = 4
        u['rayleigh'].value = 1.2
        u['mieCoefficient'].value = 0.005
        u['mieDirectionalG'].value = 0.8
        ctx.scene.add(sky)
        if (lastState) api.setState(lastState) // position the sun in the dome
      } else if (!enabled && sky) {
        teardownSky()
      }
    },

    setQuality(q) {
      const size = QUALITY_MAP_SIZE[q]
      const shadow = ctx.keyLight.shadow
      if (shadow.mapSize.x === size) return
      shadow.mapSize.set(size, size)
      shadow.map?.dispose()
      shadow.map = null // three re-allocates at the new size on next render
    },

    getSunInfo() {
      return sunInfo
    },

    getMoonInfo() {
      return moonInfo
    },

    dispose() {
      api.disable()
      disposed = true
    },
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  function flagModel(modelId: string): void {
    const root = ctx.getModelObject(modelId)
    if (!root) return
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh || mesh.castShadow) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      flagged.add(mesh)
    })
  }

  function ensureCatcher(): void {
    if (catcher) return
    const material = new THREE.ShadowMaterial({ opacity: CATCHER_OPACITY })
    material.depthWrite = false
    catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
    catcher.rotation.x = -Math.PI / 2
    catcher.receiveShadow = true
    catcher.name = 'solar-shadow-catcher'
    ctx.scene.add(catcher)
    updateCatcher(ctx.getActiveModelBounds() ?? { center: { x: 0, y: 0, z: 0 }, size: { x: 50, y: 20, z: 50 } })
  }

  function updateCatcher(bounds: NonNullable<ReturnType<SolarSystemContext['getActiveModelBounds']>>): void {
    if (!catcher) return
    const span = Math.max(bounds.size.x, bounds.size.z, 10) * 3
    catcher.scale.set(span, span, 1)
    catcher.position.set(
      bounds.center.x,
      bounds.center.y - bounds.size.y / 2 - 0.01,
      bounds.center.z,
    )
  }

  function teardownSky(): void {
    if (!sky) return
    sky.removeFromParent()
    sky.geometry.dispose()
    sky.material.dispose()
    sky = null
    if (skySnapshot) {
      ctx.scene.background = skySnapshot.background
      ctx.scene.fog = skySnapshot.fog
      skySnapshot = null
    }
  }

  function ensureMoonLight(): THREE.DirectionalLight {
    if (!moonLight) {
      moonLight = new THREE.DirectionalLight(MOON_COLOR, 0)
      moonLight.castShadow = false // spec: no unrealistic hard moon shadows
      ctx.scene.add(moonLight)
      ctx.scene.add(moonLight.target)
    }
    return moonLight
  }

  function takeSnapshot(): LightsSnapshot {
    const key = ctx.keyLight
    const cam = key.shadow.camera
    return {
      keyPos: key.position.clone(),
      keyColor: key.color.clone(),
      keyIntensity: key.intensity,
      keyBias: key.shadow.bias,
      keyNormalBias: key.shadow.normalBias,
      keyMapSize: key.shadow.mapSize.x,
      frustum: {
        left: cam.left, right: cam.right, top: cam.top, bottom: cam.bottom,
        near: cam.near, far: cam.far,
      },
      camUp: cam.up.clone(),
      hemiIntensity: ctx.hemiLight.intensity,
      hemiSky: ctx.hemiLight.color.clone(),
      hemiGround: ctx.hemiLight.groundColor.clone(),
      fillIntensity: ctx.fillLight.intensity,
      targetPos: key.target.position.clone(),
    }
  }

  function restoreSnapshot(): void {
    if (!snapshot) return
    const key = ctx.keyLight
    key.position.copy(snapshot.keyPos)
    key.color.copy(snapshot.keyColor)
    key.intensity = snapshot.keyIntensity
    key.shadow.bias = snapshot.keyBias
    key.shadow.normalBias = snapshot.keyNormalBias
    if (key.shadow.mapSize.x !== snapshot.keyMapSize) {
      key.shadow.mapSize.set(snapshot.keyMapSize, snapshot.keyMapSize)
      key.shadow.map?.dispose()
      key.shadow.map = null
    }
    const cam = key.shadow.camera
    cam.left = snapshot.frustum.left; cam.right = snapshot.frustum.right
    cam.top = snapshot.frustum.top; cam.bottom = snapshot.frustum.bottom
    cam.near = snapshot.frustum.near; cam.far = snapshot.frustum.far
    cam.up.copy(snapshot.camUp)
    cam.updateProjectionMatrix()
    key.target.position.copy(snapshot.targetPos)
    ctx.hemiLight.intensity = snapshot.hemiIntensity
    ctx.hemiLight.color.copy(snapshot.hemiSky)
    ctx.hemiLight.groundColor.copy(snapshot.hemiGround)
    ctx.fillLight.intensity = snapshot.fillIntensity
    snapshot = null
  }

  return api
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}
