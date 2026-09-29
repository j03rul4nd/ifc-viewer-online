// ─── bimoRuntime.ts ───────────────────────────────────────────────────────────
// Framework-free runtime for Bimo, the product mascot. One call mounts the
// rigged GLB (built by scripts/blender/build-mascot.py) on a canvas and returns
// a tiny API the landing, the app and blog embeds can all share:
//
//   const bimo = await createBimo({ canvas })
//   bimo.play('celebrate'); bimo.say(2500); bimo.lookAt(x, y); bimo.dispose()
//
// Clips give the body its poses; everything that makes him feel alive between
// poses is layered here, following the usual feature-animation checklist:
//   • moving holds — he never freezes: breathing and a slow sway run under
//     every clip (AnimSchool, "Animating Nothing | Create Moving Holds").
//   • eye darts — small, fast saccades every 0.4–2 s while the gaze target
//     is still, which is what reads as "thinking".
//   • eyes lead, head follows — gaze springs are ~4× stiffer than the head.
//   • blink on change of thought — every emotion switch triggers a blink,
//     the classic Disney/Richard Williams trick to sell a new idea.
//   • secondary action / follow-through — the antenna is a damped spring
//     driven by the head's angular velocity and the body's vertical velocity.
//   • squash & stretch with anticipation — a small volume-preserving pop on
//     every change.
// Shading follows the Disney principled model (MeshPhysicalMaterial), plus
// GLSL micro-roughness breakup so highlights don't look CG-perfect.

import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'

export interface BimoMeta {
  emotions: string[]
  oneshots: string[]
  shapeKeys: string[]
  face: Record<string, Record<string, number | string>>
}

// ── shared asset ─────────────────────────────────────────────────────────────
// Parsed once per page; every instance clones the rigged scene (bones, skin,
// morph targets) with SkeletonUtils and shares geometry and clips.
// bimo.opt.glb is bimo.glb run through `npm run mascot:optimize` (meshopt +
// quantisation): ~570 KB on disk, ~200 KB over the wire, versus 2.7 MB.

const assets = new Map<string, Promise<{ meta: BimoMeta; gltf: GLTF }>>()

export function loadBimoAsset(base = '/mascot/') {
  let p = assets.get(base)
  if (!p) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    p = Promise.all([
      fetch(base + 'mascot.json').then(r => r.json() as Promise<BimoMeta>),
      loader.loadAsync(base + 'bimo.opt.glb'),
    ]).then(([meta, gltf]) => ({ meta, gltf }))
    p.catch(() => assets.delete(base))  // let a later instance retry
    assets.set(base, p)
  }
  return p
}

// Soft radial glow for the eyes, drawn once. Stands in for bloom, which does
// not survive a transparent canvas and would cost a full-screen pass per Bimo.
let glowTex: THREE.Texture | null = null
function eyeGlowTexture() {
  if (glowTex) return glowTex
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}

export interface BimoOptions {
  canvas: HTMLCanvasElement
  /** Folder holding bimo.glb + mascot.json. */
  baseUrl?: string
  /** First clip; defaults to the 'hello' entrance. */
  initial?: string
  /** Show the soft contact shadow under the feet. */
  shadow?: boolean
  /** Camera framing: distance and look-at height (metres). */
  distance?: number
  targetY?: number
}

/** Procedural micro-reactions, layered on top of whatever clip is playing. */
export type BimoMicro =
  | 'blink' | 'flinch' | 'giggle' | 'boing' | 'shiver' | 'perk'
  | 'nod' | 'tilt' | 'squish' | 'heart' | 'glance'

/** What a screen point hits on the model (see pick). */
export type BimoPart = 'antenna' | 'face' | 'head' | 'body' | 'arm' | 'foot'

export interface Bimo {
  play(name: string): void
  say(ms?: number): void
  /** Gaze target in normalised device coords (-1..1). */
  lookAt(x: number, y: number): void
  /** Gaze at a screen point (client px) or the centre of an element. */
  lookAtClient(x: number, y: number): void
  lookAtElement(el: Element): void
  /** A short procedural reaction; `strength` scales it (default 1). */
  micro(kind: BimoMicro, strength?: number): void
  /** Hold shape-key weights on top of the clip's face until cleared
   *  (e.g. { EyeWide: 0.6, MouthO: 0.4 }). Pass null to release. */
  setExpression(weights: Record<string, number> | null): void
  /** Briefly add weight to one shape key, decaying on its own. */
  pulse(key: string, amount?: number): void
  /** Ray-cast a client-space point against the skinned model. */
  pick(clientX: number, clientY: number): BimoPart | null
  setPaused(p: boolean): void
  resize(): void
  readonly state: string
  readonly meta: BimoMeta
  dispose(): void
}

class Spring {
  x: number; v = 0; t: number
  constructor(v = 0, public k = 170, public d = 17) { this.x = v; this.t = v }
  step(dt: number) {
    const a = this.k * (this.t - this.x) - this.d * this.v
    this.v += a * dt; this.x += this.v * dt
    return this.x
  }
}

// Cheap 3D value noise for surface breakup (roughness, smudges).
const NOISE_GLSL = /* glsl */`
  float bHash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float bNoise(vec3 x){
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(bHash(i), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float bFbm(vec3 p){ return 0.55 * bNoise(p) + 0.3 * bNoise(p * 2.7) + 0.15 * bNoise(p * 6.1); }
`

type Shader = THREE.WebGLProgramParametersWithUniforms

function withObjectPos(s: Shader) {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;')
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\n' + NOISE_GLSL)
}

/** Fresnel rim + roughness breakup; `amp` is how far roughness may wander. */
function stylise(m: THREE.MeshPhysicalMaterial, U: Record<string, THREE.IUniform>, rim: number, amp: number, scale: number) {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uRim: U.uRim, uRimStrength: U.uRimStrength })
    withObjectPos(s)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimStrength;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (bFbm(vObj * ${scale.toFixed(1)}) - 0.5) * ${amp.toFixed(3)}, 0.02, 1.0);`)
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - abs(dot(normal, normalize(-vViewPosition))), 3.0);
        outgoingLight += uRim * fres * uRimStrength * ${rim.toFixed(2)};
        #include <opaque_fragment>`)
  }
}

export async function createBimo(opts: BimoOptions): Promise<Bimo> {
  const base = opts.baseUrl ?? '/mascot/'
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const { meta, gltf } = await loadBimoAsset(base)

  const { canvas } = opts
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.toneMapping = THREE.AgXToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = opts.shadow !== false
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  scene.environmentIntensity = 0.4

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50)
  const dist = opts.distance ?? 3.2
  const target = new THREE.Vector3(0, opts.targetY ?? 0.5, 0)
  camera.position.set(0.28 * dist, target.y + 0.12 * dist, dist)
  camera.lookAt(target)

  const key = new THREE.DirectionalLight(0xfff5ec, 1.7)
  key.position.set(1.6, 2.6, 2.2); key.castShadow = true
  key.shadow.mapSize.set(1024, 1024); key.shadow.normalBias = 0.02
  Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1.5, bottom: -0.5 })
  const fill = new THREE.DirectionalLight(0xb8c2ff, 0.4); fill.position.set(-2.2, 1.2, 1.4)
  const rim = new THREE.DirectionalLight(0x8b93e8, 1.9); rim.position.set(-0.6, 2.0, -2.2)
  const kick = new THREE.PointLight(0x5e6ad2, 1.4, 5); kick.position.set(1.8, 0.5, -1.2)
  scene.add(key, fill, rim, kick)

  if (opts.shadow !== false) {
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShadowMaterial({ opacity: 0.28 }))
    catcher.rotation.x = -Math.PI / 2; catcher.receiveShadow = true
    scene.add(catcher)
  }

  const U: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uRim: { value: new THREE.Color(0x8b93e8) },
    uRimStrength: { value: 0.45 },
    uEyeTint: { value: new THREE.Color(0x8c95ff) },
    uGlow: { value: 1 },
  }

  // ── materials ──────────────────────────────────────────────────────────────
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  eyeMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uTime: U.uTime, uTint: U.uEyeTint, uGlow: U.uGlow })
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec3 uTint; uniform float uGlow; varying float vH;')
      .replace('#include <opaque_fragment>', `
        float grad = smoothstep(0.5, 0.75, vH);
        float pulse = 0.94 + 0.06 * sin(uTime * 2.2);
        outgoingLight = mix(uTint * 0.8, vec3(0.9), 0.05 + 0.2 * grad) * 0.85 * uGlow * pulse;
        #include <opaque_fragment>`)
  }
  let blushMat: THREE.MeshBasicMaterial | null = null
  const disposables: { dispose(): void }[] = [eyeMat, envTex, pmrem]

  const root = SkeletonUtils.clone(gltf.scene)
  scene.add(root)
  const morphMeshes: THREE.Mesh[] = []
  const bones: Record<string, THREE.Bone> = {}
  root.traverse((o) => {
    // GLTFLoader sanitises node names ('antenna.1' → 'antenna1'); key bones by
    // the sanitised form so lookups don't depend on that detail.
    if ((o as THREE.Bone).isBone) bones[o.name.replace(/[^A-Za-z0-9_]/g, '')] = o as THREE.Bone
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    const name = (mesh.material as THREE.Material).name
    let m: THREE.Material | null = null
    if (name === 'Bimo_Pearl') {
      const p = new THREE.MeshPhysicalMaterial({
        color: (mesh.material as THREE.MeshStandardMaterial).color, roughness: 0.4,
        clearcoat: 0.6, clearcoatRoughness: 0.14, sheen: 0.5, sheenColor: new THREE.Color(0xa5adf5),
        sheenRoughness: 0.4, iridescence: 0.15, iridescenceIOR: 1.3,
      })
      stylise(p, U, 1.0, 0.16, 7.0); m = p
    } else if (name === 'Bimo_Indigo') {
      const p = new THREE.MeshPhysicalMaterial({
        color: (mesh.material as THREE.MeshStandardMaterial).color, roughness: 0.3,
        clearcoat: 0.9, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: new THREE.Color(0xc9ceff),
      })
      stylise(p, U, 1.3, 0.12, 9.0); m = p
    } else if (name === 'Bimo_Visor') {
      // glass with faint smudges: the breakup makes reflections read as real
      const p = new THREE.MeshPhysicalMaterial({
        color: 0x07080f, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03,
        iridescence: 0.25, iridescenceIOR: 1.6, envMapIntensity: 0.6,
      })
      stylise(p, U, 0.5, 0.18, 14.0); m = p
    } else if (name === 'Bimo_Eye') {
      m = eyeMat; mesh.castShadow = false
    } else if (name === 'Bimo_Blush') {
      blushMat = new THREE.MeshBasicMaterial({ color: 0xff8fb8, transparent: true, opacity: 0, depthWrite: false })
      m = blushMat; mesh.castShadow = false
    } else if (name === 'Bimo_Spark') {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), toneMapped: false }); mesh.castShadow = false
    } else if (name === 'Bimo_Cube') {
      m = new THREE.MeshPhysicalMaterial({
        color: 0x8b93e8, emissive: 0x8b93e8, emissiveIntensity: 1.4, roughness: 0.15, clearcoat: 1,
      })
    }
    if (m) { mesh.material = m; disposables.push(m) }
    // geometry is shared by every clone on the page: never dispose it here
    if (mesh.morphTargetDictionary) morphMeshes.push(mesh)
  })

  const rest = ['head', 'body', 'antenna1', 'antenna2'].filter(n => bones[n])
    .map(n => ({ bone: bones[n], q: bones[n].quaternion.clone(), s: bones[n].scale.clone() }))

  // eye halos, parented to the head so they follow every clip
  const halos: THREE.Sprite[] = []
  if (bones.head) {
    root.updateMatrixWorld(true)
    for (const x of [-0.138, 0.138]) {
      const mat = new THREE.SpriteMaterial({
        map: eyeGlowTexture(), color: 0x8c95ff, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })
      const sp = new THREE.Sprite(mat)
      sp.scale.setScalar(0.2)
      sp.position.copy(bones.head.worldToLocal(new THREE.Vector3(x, 0.655, 0.47)))
      bones.head.add(sp); halos.push(sp); disposables.push(mat)
    }
  }

  // ── state springs ──────────────────────────────────────────────────────────
  const face: Record<string, Spring> = Object.fromEntries(meta.shapeKeys.map(k => [k, new Spring(0)]))
  const blush = new Spring(0, 90, 14), glow = new Spring(1, 120, 14)
  const t0 = new THREE.Color(0x8c95ff)
  const tint = { r: new Spring(t0.r), g: new Spring(t0.g), b: new Spring(t0.b) }
  const pop = new Spring(1, 260, 9)
  // additive kick springs for micro-reactions (head nod/turn/tilt, body lean)
  const nudge = { x: new Spring(0, 220, 13), y: new Spring(0, 220, 13), z: new Spring(0, 200, 11) }
  const lean = new Spring(0, 150, 12)
  let wiggleT = 0, wiggleAmp = 0, wiggleHz = 0
  const transient: Record<string, number> = {}
  let hold: Record<string, number> | null = null
  const head = { x: new Spring(0, 55, 12), y: new Spring(0, 55, 12) }
  const eye = { x: new Spring(0, 320, 30), y: new Spring(0, 320, 30) }
  const ant = { x: new Spring(0, 90, 5), z: new Spring(0, 90, 5) }       // under-damped on purpose
  const gaze = new THREE.Vector2()
  const dart = new THREE.Vector2()

  const mixer = new THREE.AnimationMixer(root)
  const actions: Record<string, THREE.AnimationAction> = {}
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip)
  const ONESHOT = new Set(meta.oneshots)
  let current: THREE.AnimationAction | null = null
  let currentName = '', loopName = 'idle', talking = false
  let blinkT = -1, nextBlink = 1.5, nextDart = 1

  function applyFace(name: string) {
    const p = meta.face[name] || {}
    for (const k in face) face[k].t = (hold && k in hold) ? hold[k] : ((p[k] as number) ?? 0)
    blush.t = (p._blush as number) ?? 0
    glow.t = (p._glow as number) ?? 1
    const c = new THREE.Color((p._tint as string) ?? '#8C95FF')
    tint.r.t = c.r; tint.g.t = c.g; tint.b.t = c.b
    talking = !!p._talk
  }

  function play(name: string, fade = 0.5) {
    if (reduced && (name === 'celebrate' || name === 'jump' || name === 'dance' || name === 'excited')) name = 'happy'
    if (name === currentName || !actions[name]) return
    const next = actions[name]
    const once = ONESHOT.has(name)
    next.reset().setEffectiveWeight(1)
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    next.clampWhenFinished = once
    next.play()
    if (current) current.crossFadeTo(next, once ? 0.18 : fade, true); else next.fadeIn(0.25)
    current = next; currentName = name
    if (!once) loopName = name
    applyFace(name)
    pop.x = 0.9; pop.v = 0
    if (blinkT < 0) blinkT = 0          // blink on a change of thought
  }
  mixer.addEventListener('finished', (e) => {
    if (e.action === current && ONESHOT.has(currentName)) play(loopName, 0.35)
  })

  // ── loop ───────────────────────────────────────────────────────────────────
  const timer = new THREE.Timer()
  const q = new THREE.Quaternion(), eul = new THREE.Euler(), sv = new THREE.Vector3()
  const headPrev = new THREE.Quaternion(), rootPrevY = { v: 0 }
  let paused = false, disposed = false

  function frame() {
    if (disposed) return
    timer.update()
    const dt = Math.min(timer.getDelta(), 1 / 30)
    const t = timer.getElapsed()
    U.uTime.value = t
    // The procedural layers below multiply onto these bones. A clip that
    // doesn't key a bone leaves last frame's result in place, so restore the
    // rest pose first or the squash/tilt would compound every frame.
    for (const r of rest) { r.bone.quaternion.copy(r.q); r.bone.scale.copy(r.s) }
    mixer.update(dt)

    // blink
    if (t > nextBlink && blinkT < 0) blinkT = 0
    let blinkAdd = 0
    if (blinkT >= 0) {
      blinkT += dt
      blinkAdd = Math.sin(Math.min(1, blinkT / 0.15) * Math.PI)
      if (blinkT > 0.15) { blinkT = -1; nextBlink = t + 1.8 + Math.random() * 3.8 }
    }
    // eye darts: tiny saccades around the gaze point
    if (t > nextDart) {
      dart.set((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25)
      nextDart = t + 0.4 + Math.random() * 1.6
    }

    const w: Record<string, number> = {}
    for (const k in face) w[k] = face[k].step(dt)
    const decay = Math.exp(-4.5 * dt)
    for (const k in transient) {
      if (k === '_blush') blush.x += transient[k] * (1 - decay)
      else if (k in w) w[k] = Math.min(1, w[k] + transient[k])
      transient[k] *= decay
      if (transient[k] < 0.01) delete transient[k]
    }
    w.EyeBlink = Math.min(1, Math.max(0, w.EyeBlink) + blinkAdd * (1 - (w.EyeHappy ?? 0)) * (1 - (w.EyeHeart ?? 0)))
    if (talking) {
      const v = 0.5 + 0.5 * Math.sin(t * 13) * Math.sin(t * 5.3 + 1) + 0.2 * Math.sin(t * 29)
      w.MouthOpen = Math.max(0, Math.min(1, v)) * 0.75
      w.MouthO = Math.max(0, Math.sin(t * 7.1)) * 0.3
    }
    eye.x.t = gaze.x * 0.8 + dart.x; eye.y.t = gaze.y * 0.8 + dart.y
    const ex = eye.x.step(dt), ey = eye.y.step(dt)
    w.EyeLookR = Math.min(1, (w.EyeLookR ?? 0) + Math.max(0, ex))
    w.EyeLookL = Math.min(1, (w.EyeLookL ?? 0) + Math.max(0, -ex))
    w.EyeUp = Math.min(1, (w.EyeUp ?? 0) + Math.max(0, ey) * 0.6)
    w.EyeDown = Math.min(1, (w.EyeDown ?? 0) + Math.max(0, -ey) * 0.6)
    for (const m of morphMeshes) {
      const dict = m.morphTargetDictionary!, inf = m.morphTargetInfluences!
      for (const k in w) { const i = dict[k]; if (i !== undefined) inf[i] = Math.max(0, w[k]) }
    }
    if (blushMat) blushMat.opacity = Math.max(0, blush.step(dt)) * 0.75
    const open = 1 - Math.min(1, Math.max(w.EyeBlink ?? 0, w.EyeHappy ?? 0) * 0.85)
    for (const h of halos) {
      const hm = h.material as THREE.SpriteMaterial
      hm.opacity = 0.5 * open * (U.uGlow.value as number)
      hm.color.copy(U.uEyeTint.value as THREE.Color)
    }
    U.uGlow.value = glow.step(dt)
    ;(U.uEyeTint.value as THREE.Color).setRGB(tint.r.step(dt), tint.g.step(dt), tint.b.step(dt))

    // head follows the eyes, slower (additive on top of the clip)
    head.x.t = -gaze.y * 0.16; head.y.t = gaze.x * 0.28
    if (bones.head) {
      bones.head.quaternion.multiply(q.setFromEuler(eul.set(
        head.x.step(dt) + nudge.x.step(dt), head.y.step(dt) + nudge.y.step(dt), nudge.z.step(dt))))
    }
    // moving hold: breathing + slow sway under every clip
    if (bones.body) {
      const s = pop.step(dt) * (1 + (reduced ? 0 : 0.012 * Math.sin(t * 2.1)))
      bones.body.scale.multiply(sv.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)))
      let wob = 0
      if (wiggleT > 0) { wiggleT -= dt; wob = Math.sin(t * wiggleHz * Math.PI * 2) * wiggleAmp * Math.min(1, wiggleT * 3) }
      if (!reduced) bones.body.quaternion.multiply(q.setFromEuler(eul.set(0, 0, 0.012 * Math.sin(t * 0.7) + lean.step(dt) + wob)))
    }
    // follow-through: antenna lags head rotation and body bounce
    if (bones.head && bones.antenna1) {
      bones.head.updateWorldMatrix(true, false)
      const hq = bones.head.getWorldQuaternion(new THREE.Quaternion())
      const dq = hq.clone().multiply(headPrev.invert())
      headPrev.copy(hq)
      eul.setFromQuaternion(dq)
      const ry = bones.root ? bones.root.getWorldPosition(sv).y : 0
      const vy = (ry - rootPrevY.v) / Math.max(dt, 1e-3); rootPrevY.v = ry
      ant.x.v += (-eul.x * 18 + vy * 1.2) ; ant.z.v += -eul.z * 18
      ant.x.t = 0; ant.z.t = 0
      const ax = THREE.MathUtils.clamp(ant.x.step(dt), -0.6, 0.6)
      const az = THREE.MathUtils.clamp(ant.z.step(dt), -0.6, 0.6)
      bones.antenna1.quaternion.multiply(q.setFromEuler(eul.set(ax * 0.5, 0, az * 0.5)))
      bones.antenna2?.quaternion.multiply(q.setFromEuler(eul.set(ax, 0, az)))
    }
    renderer.render(scene, camera)
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  resize()
  renderer.setAnimationLoop(frame)
  play(opts.initial ?? 'hello')

  function micro(kind: BimoMicro, k = 1) {
    const r = reduced ? 0.4 : 1
    k *= r
    switch (kind) {
      case 'blink': blinkT = 0; break
      case 'flinch': pop.x = 1 - 0.14 * k; nudge.x.v -= 5 * k; lean.v += (Math.random() - 0.5) * 3 * k; pulse('EyeWide', 0.8 * k); blinkT = 0; break
      case 'giggle': wiggleT = 0.7; wiggleAmp = 0.05 * k; wiggleHz = 7; pulse('EyeHappy', 1); pulse('MouthOpen', 0.6 * k); pulse('_blush', 0.6); break
      case 'boing': ant.x.v += 26 * k; ant.z.v += (Math.random() - 0.5) * 20 * k; pop.x = 1 - 0.06 * k; pulse('EyeWide', 0.4 * k); break
      case 'shiver': wiggleT = 0.9; wiggleAmp = 0.025 * k; wiggleHz = 16; pulse('EyeSmall', 0.6 * k); break
      case 'perk': nudge.x.v -= 3.5 * k; ant.x.v -= 12 * k; pop.x = 1 + 0.06 * k; pulse('EyeWide', 0.6 * k); break
      case 'nod': nudge.x.v += 6 * k; break
      case 'tilt': nudge.z.v += (Math.random() < 0.5 ? -1 : 1) * 4 * k; pulse('EyeUp', 0.3 * k); break
      case 'squish': pop.x = 1 - 0.2 * k; pulse('EyeHappy', 0.7 * k); break
      case 'heart': pulse('EyeHeart', 1); pulse('_blush', 1); pulse('MouthCat', 0.8); pop.x = 1 + 0.05 * k; break
      case 'glance': dart.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6); nextDart = timer.getElapsed() + 0.9; break
    }
  }
  function pulse(key: string, amount = 1) { transient[key] = Math.max(transient[key] ?? 0, amount) }

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  function pick(cx: number, cy: number): BimoPart | null {
    const r = canvas.getBoundingClientRect()
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    root.updateMatrixWorld(true)
    const hit = ray.intersectObject(root, true).find(h => (h.object as THREE.Mesh).isMesh && !(h.object as THREE.Sprite).isSprite)
    if (!hit) return null
    const n = hit.object.name.toLowerCase()
    if (n.includes('antenna')) return 'antenna'
    if (n.includes('arm')) return 'arm'
    if (n.includes('foot')) return 'foot'
    if (n.includes('visor') || n.includes('face')) return 'face'
    return hit.point.y > 0.55 ? 'head' : 'body'
  }
  function lookAtClient(cx: number, cy: number) {
    const r = canvas.getBoundingClientRect()
    const x = (cx - (r.left + r.width / 2)) / (innerWidth * 0.35)
    const y = -(cy - (r.top + r.height * 0.45)) / (innerHeight * 0.35)
    gaze.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1))
  }

  return {
    play: (n) => play(n),
    say(ms = 2500) {
      const back = loopName === 'talking' ? 'idle' : loopName
      play('talking')
      window.setTimeout(() => { if (currentName === 'talking') play(back) }, ms)
    },
    lookAt(x, y) { gaze.set(THREE.MathUtils.clamp(x, -1, 1), THREE.MathUtils.clamp(y, -1, 1)) },
    lookAtClient,
    lookAtElement(el) { const b = el.getBoundingClientRect(); lookAtClient(b.left + b.width / 2, b.top + b.height / 2) },
    micro,
    setExpression(weights) { hold = weights; applyFace(currentName) },
    pulse,
    pick,
    setPaused(p) {
      if (p === paused) return
      paused = p
      renderer.setAnimationLoop(p ? null : frame)
      if (!p) timer.reset?.()
    },
    resize,
    get state() { return currentName },
    meta,
    dispose() {
      disposed = true
      renderer.setAnimationLoop(null)
      mixer.stopAllAction()
      disposables.forEach(d => d.dispose())
      renderer.dispose()
    },
  }
}
