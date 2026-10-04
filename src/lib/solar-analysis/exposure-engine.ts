// ─── exposure-engine ──────────────────────────────────────────────────────────
// GPU: for every sensor, how many hours of the period it sees the sun and how
// much direct radiation it receives, with every occluder in the scene — the
// model itself, the map's buildings and its terrain.
//
// HOW. It does not reimplement shadows; it borrows three's. For each sun
// instant a dedicated directional light is aimed at the site and the renderer
// draws its shadow map exactly as it does for the sun study — so whatever casts
// a shadow there (fragments, OSM buildings, terrain) casts one here. Then one
// full-screen pass over a texture of sensors (one texel each: position, normal)
// tests every sensor against that shadow map and adds to an accumulator, per
// sensor: hours of sun (R), beam + circumsolar Wh/m² (G), a cosine-weighted
// share of sky (B, for the sky-view runs) and the hours the sun is LIKELY out,
// given the site's sunshine record (A). The accumulator is two float render targets used in turn
// (ping-pong): blending into float32 needs EXT_float_blend, which is not
// everywhere, and half floats lose the hours of a year.
//
// Cost: one shadow render per instant. A day at 15 min is ~50; a year sampled
// every 14 days is ~650. The main pass is aimed at nothing so only the shadow
// pass draws the scene.

import * as THREE from 'three'
import type { SensorSet } from './sensors'
import type { SunSample } from './sun-paths'
import type { ExposureResult } from './results'

export interface ExposureContext {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  /** Roots whose meshes must cast shadows for the run (models, the map). */
  occluders(): THREE.Object3D[]
  /** Objects to hide during the run (the heatmap itself, helpers). */
  hidden(): THREE.Object3D[]
  /**
   * Stop / resume the viewer's own render loop. The run yields to the browser
   * every few instants, and a viewer frame drawn in between lost accumulated
   * hours at random (measured: 609 instants summed to anything from 105 to 753
   * hours of the 1 333 expected). Nothing else draws while this runs.
   */
  pauseViewer?(paused: boolean): void
}

export interface ExposureOptions {
  /**
   * Accumulate a cosine-weighted sky view in B with this weight per direction
   * (2 / N for N directions spread evenly over the hemisphere). 0: off.
   */
  skyWeight?: number
  /** Shadow map resolution. Default 4096. */
  mapSize?: number
  /** How far towards the sun occluders are looked for, metres. Default 600. */
  reachM?: number
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

const TEX_W = 512

const VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */`
precision highp float;
precision highp sampler2DShadow;
uniform sampler2D uPrev;
uniform sampler2D uPos;
uniform sampler2D uNrm;
uniform sampler2DShadow uShadow;
uniform mat4 uShadowMatrix;
uniform vec3 uSun;
uniform float uHours;
uniform float uBeam;
uniform float uProb;
uniform float uSkyW;
uniform vec2 uSize;
uniform float uBias;
uniform float uNormalBias;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 prev = texture(uPrev, uv);
  vec4 p = texture(uPos, uv);
  if (p.w < 0.5) { outColor = prev; return; }
  vec3 n = texture(uNrm, uv).xyz;
  float c = dot(n, uSun);
  if (c <= 0.0) { outColor = prev; return; }
  vec4 sc = uShadowMatrix * vec4(p.xyz + n * uNormalBias, 1.0);
  vec3 s = sc.xyz / sc.w;
  float vis = 1.0;
  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) {
    // Slope-scaled bias: a surface the sun grazes spans many depth texels and
    // shadows itself with a fixed bias; one it faces needs almost none.
    float slope = clamp(sqrt(max(0.0, 1.0 - c * c)) / c, 0.0, 6.0);
    float b = uBias * (0.5 + slope);
    // 2×2 taps of the hardware PCF: a soft, stable edge instead of a texel
    // staircase that flips sensors in and out of shadow between sun positions.
    vec2 px = vec2(0.5) / vec2(textureSize(uShadow, 0));
    vis = 0.25 * (
      texture(uShadow, vec3(s.xy + vec2(-px.x, -px.y), s.z - b)) +
      texture(uShadow, vec3(s.xy + vec2( px.x, -px.y), s.z - b)) +
      texture(uShadow, vec3(s.xy + vec2(-px.x,  px.y), s.z - b)) +
      texture(uShadow, vec3(s.xy + vec2( px.x,  px.y), s.z - b)));
  }
  outColor = prev + vec4(vis * uHours, vis * uBeam * c * uHours, vis * c * uSkyW, vis * uHours * uProb);
}
`

/** Hand the browser a turn without rAF (it freezes in a hidden tab). */
const yieldTurn = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

export async function runExposure(
  ctx: ExposureContext,
  sensors: SensorSet,
  samples: SunSample[],
  days: number,
  o: ExposureOptions = {},
): Promise<ExposureResult> {
  const { renderer, scene } = ctx
  const gl = renderer.getContext()
  if (!renderer.capabilities.isWebGL2 && !(gl as WebGL2RenderingContext).texStorage2D) {
    throw new Error('The solar analysis needs WebGL 2')
  }
  if (!renderer.extensions.has('EXT_color_buffer_float')) {
    throw new Error('This graphics card cannot render to float textures, which the solar analysis needs')
  }

  const n = sensors.count
  const W = TEX_W
  const H = Math.max(1, Math.ceil(n / W))
  const pos = new Float32Array(W * H * 4)
  const nrm = new Float32Array(W * H * 4)
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    pos[i * 4] = sensors.positions[i * 3]
    pos[i * 4 + 1] = sensors.positions[i * 3 + 1]
    pos[i * 4 + 2] = sensors.positions[i * 3 + 2]
    pos[i * 4 + 3] = 1
    nrm[i * 4] = sensors.normals[i * 3]
    nrm[i * 4 + 1] = sensors.normals[i * 3 + 1]
    nrm[i * 4 + 2] = sensors.normals[i * 3 + 2]
    box.expandByPoint(v.set(pos[i * 4], pos[i * 4 + 1], pos[i * 4 + 2]))
  }
  const dataTex = (data: Float32Array): THREE.DataTexture => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
    t.minFilter = THREE.NearestFilter
    t.magFilter = THREE.NearestFilter
    t.needsUpdate = true
    return t
  }
  const posTex = dataTex(pos)
  const nrmTex = dataTex(nrm)
  const rtOpts = { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false }
  let read = new THREE.WebGLRenderTarget(W, H, rtOpts)
  let write = new THREE.WebGLRenderTarget(W, H, rtOpts)

  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uPrev: { value: null }, uPos: { value: posTex }, uNrm: { value: nrmTex }, uShadow: { value: null },
      uShadowMatrix: { value: new THREE.Matrix4() }, uSun: { value: new THREE.Vector3() },
      uHours: { value: 0 }, uBeam: { value: 0 }, uProb: { value: 1 }, uSkyW: { value: 0 }, uSize: { value: new THREE.Vector2(W, H) },
      uBias: { value: 0.0005 }, uNormalBias: { value: 0.03 },
    },
    depthTest: false, depthWrite: false,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // The sun, and a camera that looks at nothing so the main pass draws nothing.
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(5, box.getSize(new THREE.Vector3()).length() / 2) * 1.05
  const reach = o.reachM ?? 600
  const light = new THREE.DirectionalLight(0xffffff, 0)
  light.name = 'solar-analysis-sun'
  light.castShadow = true
  const mapSize = Math.min(renderer.capabilities.maxTextureSize, o.mapSize ?? 4096)
  light.shadow.mapSize.set(mapSize, mapSize)
  light.shadow.bias = 0
  light.shadow.normalBias = 0
  const sc = light.shadow.camera as THREE.OrthographicCamera
  sc.left = -radius; sc.right = radius; sc.top = radius; sc.bottom = -radius
  sc.near = 0.5; sc.far = reach + radius * 2
  sc.updateProjectionMatrix()
  // Depth bias in METRES, turned into the shadow map's 0–1 depth: ~15 cm at
  // normal incidence (scaled up with the slope in the shader) keeps a surface
  // from shadowing itself without letting a real occluder through. The normal
  // offset follows the texel size, so a big site's coarser map stays clean.
  const texel = (2 * radius) / mapSize
  material.uniforms.uBias.value = 0.15 / (sc.far - sc.near)
  material.uniforms.uNormalBias.value = Math.max(0.03, texel * 0.75)
  light.shadow.autoUpdate = false
  scene.add(light, light.target)
  const blind = new THREE.PerspectiveCamera(1, 1, 1, 2)
  blind.position.set(center.x, center.y - 1e6, center.z)
  blind.lookAt(center.x, center.y - 2e6, center.z)
  blind.updateMatrixWorld()
  const sink = new THREE.WebGLRenderTarget(1, 1)

  // Borrow the scene: every occluder casts, no other light does, helpers hide.
  const castRestore: Array<[THREE.Object3D, boolean]> = []
  for (const root of ctx.occluders()) {
    root.traverse((obj) => {
      const m = obj as THREE.Mesh
      if (!m.isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) return
      castRestore.push([obj, obj.castShadow])
      obj.castShadow = true
    })
  }
  const lightRestore: Array<[THREE.Light, boolean]> = []
  scene.traverse((obj) => {
    const l = obj as THREE.Light
    if (l.isLight && l !== light && l.castShadow) { lightRestore.push([l, true]); l.castShadow = false }
  })
  const visRestore: Array<[THREE.Object3D, boolean]> = ctx.hidden().map((h) => [h, h.visible])
  for (const [h] of visRestore) h.visible = false
  const prevTarget = renderer.getRenderTarget()
  const prevAutoUpdate = renderer.shadowMap.autoUpdate
  const prevAutoClear = renderer.autoClear
  renderer.shadowMap.autoUpdate = false
  ctx.pauseViewer?.(true)

  try {
    // Start from zero.
    for (const rt of [read, write]) {
      renderer.setRenderTarget(rt)
      renderer.setClearColor(0x000000, 0)
      renderer.clear(true, false, false)
    }
    material.uniforms.uSkyW.value = o.skyWeight ?? 0
    for (let k = 0; k < samples.length; k++) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const s = samples[k]
      light.position.set(center.x + s.dir.x * (reach + radius), center.y + s.dir.y * (reach + radius), center.z + s.dir.z * (reach + radius))
      light.target.position.copy(center)
      light.updateMatrixWorld(true)
      light.target.updateMatrixWorld(true)
      renderer.shadowMap.needsUpdate = true
      // Per light too: with autoUpdate off, three skips a shadow not marked dirty.
      light.shadow.needsUpdate = true
      renderer.setRenderTarget(sink)
      renderer.render(scene, blind)

      const map = light.shadow.map
      if (!map?.depthTexture) throw new Error('The shadow map was not created')
      const u = material.uniforms
      u.uPrev.value = read.texture
      u.uShadow.value = map.depthTexture
      u.uShadowMatrix.value.copy(light.shadow.matrix)
      u.uSun.value.set(s.dir.x, s.dir.y, s.dir.z)
      u.uHours.value = s.hours
      u.uBeam.value = s.beamNormal
      u.uProb.value = s.sunProb
      renderer.setRenderTarget(write)
      renderer.render(quadScene, quadCam)
      const t = read; read = write; write = t

      if (k % 4 === 3) {
        o.onProgress?.((k + 1) / samples.length)
        await yieldTurn()
      }
    }
    o.onProgress?.(1)

    const out = new Float32Array(W * H * 4)
    renderer.readRenderTargetPixels(read, 0, 0, W, H, out)
    // Diffuse and reflected are filled by the caller, which knows the sky view.
    const result: ExposureResult = {
      sunHours: new Float32Array(n),
      probableSunHours: new Float32Array(n),
      directWh: new Float32Array(n),
      diffuseWh: new Float32Array(n),
      reflectedWh: new Float32Array(n),
      skyCos: new Float32Array(n),
      days,
    }
    for (let i = 0; i < n; i++) {
      result.sunHours[i] = out[i * 4]
      result.directWh[i] = out[i * 4 + 1]
      result.skyCos[i] = Math.min(1, out[i * 4 + 2])
      result.probableSunHours[i] = out[i * 4 + 3]
    }
    return result
  } finally {
    ctx.pauseViewer?.(false)
    renderer.shadowMap.autoUpdate = prevAutoUpdate
    renderer.shadowMap.needsUpdate = true
    renderer.autoClear = prevAutoClear
    renderer.setRenderTarget(prevTarget)
    for (const [obj, cast] of castRestore) obj.castShadow = cast
    for (const [l, cast] of lightRestore) l.castShadow = cast
    for (const [h, vis] of visRestore) h.visible = vis
    scene.remove(light, light.target)
    light.shadow.map?.dispose()
    light.dispose()
    read.dispose(); write.dispose(); sink.dispose()
    posTex.dispose(); nrmTex.dispose()
    material.dispose(); quad.geometry.dispose()
  }
}
