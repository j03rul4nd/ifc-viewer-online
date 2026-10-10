// ─── plan-view rasterisation on the GPU ──────────────────────────────────────
// Turns geometry into per-cell numbers with the viewer's own WebGLRenderer, by
// drawing it straight down onto the grid (and straight up from below):
//
//   terrain, from above     → the ground's elevation per cell (mean of hits)
//   obstacles, from below   → the LOWEST underside per cell
//   obstacles, from above   → the HIGHEST top per cell, and how much of the
//                             cell any obstacle covers
//
// A cell is an obstacle where something reaches down to the ground (a wall, a
// slab on grade, a basement); where the lowest underside is well above the
// ground (a canopy, an overhang, pilotis, a bridge deck) water flows beneath
// and only the rain is intercepted. One top-down view would have turned every
// canopy into a wall. That decision is taken by the caller (build.ts) with
// the ground known; this file only measures.
//
// HOW. No camera: the vertex shader maps world (x, z) to the grid's own axes
// and writes clip space directly, with depth = height (or its opposite from
// below), so the depth test keeps the nearest surface and the colour holds its
// world Y. Each cell is supersampled S×S — a 20 cm wall in a 2 m cell is hit by
// one of 16 samples, not by the cell centre alone, so building envelopes stay
// closed — then folded to one texel per cell by a reduction pass. No float
// blending is needed (EXT_float_blend is not everywhere); EXT_color_buffer_float
// is, wherever WebGL2 is.
//
// The renderer's state (target, clear colour, clipping, auto-clear) is saved
// and restored; the viewer's scene is never drawn.

import * as THREE from 'three'
import type { GridPlan } from './frame'

export interface RasterInput {
  renderer: THREE.WebGLRenderer
  plan: GridPlan
  /** World-placed objects (matrices set). */
  terrain: THREE.Object3D[]
  obstacles: THREE.Object3D[]
  /** World Y range that holds every surface. */
  yMin: number
  yMax: number
  /** Samples per cell side; default from the grid size (≤ 4). */
  supersample?: number
}

export interface RasterOutput {
  /** Mean elevation of the terrain hits (scene Y); NaN where none. */
  terrainTop: Float32Array
  /** Fraction of the cell the terrain covers (0..1). */
  terrainCover: Float32Array
  /** Lowest obstacle underside (scene Y); +∞ where none. */
  obstacleBottom: Float32Array
  /** Highest obstacle top (scene Y); −∞ where none. */
  obstacleTop: Float32Array
  /** Fraction of the cell any obstacle covers, seen from above (0..1). */
  obstacleCover: Float32Array
  supersample: number
  ms: number
}

const VS = /* glsl */`
uniform vec2 uOrigin;
uniform vec2 uAxis;
uniform vec2 uSize;
uniform vec2 uYRange;
uniform float uFromBelow;
out float vY;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec2 d = vec2(w.x, -w.z) - uOrigin;
  float a = dot(d, uAxis);
  float b = dot(d, vec2(-uAxis.y, uAxis.x));
  float t = clamp((w.y - uYRange.x) / (uYRange.y - uYRange.x), 0.0, 1.0);
  float depth = uFromBelow > 0.5 ? t : 1.0 - t;
  gl_Position = vec4(2.0 * a / uSize.x - 1.0, 2.0 * b / uSize.y - 1.0, depth * 2.0 - 1.0, 1.0);
  vY = w.y;
}
`
// three's GLSL3 ShaderMaterial declares no output: it is ours to name.
const FS = /* glsl */`
in float vY;
out vec4 outColor;
void main() { outColor = vec4(vY, 1.0, 0.0, 1.0); }
`
const REDUCE_VS = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`
// mode 0: mean, 1: min, 2: max — over the samples that hit (G = 1).
const REDUCE_FS = /* glsl */`
uniform sampler2D uSrc;
uniform int uS;
uniform int uMode;
out vec4 outColor;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * uS;
  float acc = uMode == 1 ? 3.0e38 : (uMode == 2 ? -3.0e38 : 0.0);
  float hits = 0.0;
  for (int dy = 0; dy < uS; dy++) {
    for (int dx = 0; dx < uS; dx++) {
      vec4 t = texelFetch(uSrc, base + ivec2(dx, dy), 0);
      if (t.g > 0.5) {
        hits += 1.0;
        acc = uMode == 0 ? acc + t.r : (uMode == 1 ? min(acc, t.r) : max(acc, t.r));
      }
    }
  }
  float v = uMode == 0 ? (hits > 0.0 ? acc / hits : 0.0) : acc;
  outColor = vec4(v, hits / float(uS * uS), 0.0, 1.0);
}
`

/** World-placed stand-in for an object that already has a parent (the map's buildings). */
export function proxyOf(src: THREE.Mesh): THREE.Mesh {
  const m = new THREE.Mesh(src.geometry)
  src.updateWorldMatrix(true, false)
  m.matrixAutoUpdate = false
  m.matrix.copy(src.matrixWorld)
  m.matrixWorld.copy(src.matrixWorld)
  m.frustumCulled = false
  return m
}

export function rasterize(inp: RasterInput): RasterOutput {
  const t0 = performance.now()
  const { renderer, plan } = inp
  const { nx, ny, dx, frame } = plan
  const maxTex = renderer.capabilities.maxTextureSize
  // At most 4 M supersamples (RGBA32F: 64 MB) and the GPU's texture size.
  const S = Math.max(1, Math.min(
    inp.supersample ?? 4,
    Math.floor(Math.sqrt(4e6 / (nx * ny))),
    Math.floor(maxTex / Math.max(nx, ny)),
  ))
  const W = nx * S
  const H = ny * S
  const rtOpts = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false }
  // RGBA throughout: an RG32F target failed to draw (INVALID_OPERATION) in
  // the viewer's context, and RGBA float is what readPixels must accept.
  const hi = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, format: THREE.RGBAFormat, depthBuffer: true })
  const lo = new THREE.WebGLRenderTarget(nx, ny, { ...rtOpts, format: THREE.RGBAFormat, depthBuffer: false })

  const span = Math.max(1, inp.yMax - inp.yMin)
  const drawMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VS,
    fragmentShader: FS,
    side: THREE.DoubleSide,
    uniforms: {
      uOrigin: { value: new THREE.Vector2(frame.originX, -frame.originZ) },
      uAxis: { value: new THREE.Vector2(Math.cos(frame.rotation), Math.sin(frame.rotation)) },
      uSize: { value: new THREE.Vector2(nx * dx, ny * dx) },
      uYRange: { value: new THREE.Vector2(inp.yMin - 0.01 * span, inp.yMax + 0.01 * span) },
      uFromBelow: { value: 0 },
    },
  })
  const reduceMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: REDUCE_VS,
    fragmentShader: REDUCE_FS,
    uniforms: { uSrc: { value: hi.texture }, uS: { value: S }, uMode: { value: 0 } },
    depthTest: false,
    depthWrite: false,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), reduceMat)
  quad.frustumCulled = false
  const quadScene = new THREE.Scene()
  quadScene.add(quad)
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // Renderer state to restore.
  const prev = {
    target: renderer.getRenderTarget(),
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    planes: renderer.clippingPlanes,
    local: renderer.localClippingEnabled,
  }
  const buf = new Float32Array(nx * ny * 4)
  const pass = (objects: THREE.Object3D[], fromBelow: boolean, mode: 0 | 1 | 2): Float32Array => {
    const scene = new THREE.Scene()
    scene.overrideMaterial = drawMat
    const parents = objects.map((o) => o.parent)
    // Objects keep their world matrices; they are borrowed for the draw.
    for (const o of objects) scene.add(o)
    drawMat.uniforms.uFromBelow.value = fromBelow ? 1 : 0
    renderer.setRenderTarget(hi)
    renderer.setClearColor(0x000000, 0)
    renderer.clear(true, true, false)
    renderer.render(scene, cam)
    objects.forEach((o, k) => { scene.remove(o); parents[k]?.add(o) })
    reduceMat.uniforms.uMode.value = mode
    renderer.setRenderTarget(lo)
    renderer.render(quadScene, cam)
    renderer.readRenderTargetPixels(lo, 0, 0, nx, ny, buf)
    return buf.slice()
  }

  try {
    renderer.clippingPlanes = []
    renderer.localClippingEnabled = false
    renderer.autoClear = false
    const n = nx * ny
    const terrainTop = new Float32Array(n).fill(NaN)
    const terrainCover = new Float32Array(n)
    const obstacleBottom = new Float32Array(n).fill(Infinity)
    const obstacleTop = new Float32Array(n).fill(-Infinity)
    const obstacleCover = new Float32Array(n)
    if (inp.terrain.length) {
      const t = pass(inp.terrain, false, 0)
      for (let c = 0; c < n; c++) if (t[c * 4 + 1] > 0) { terrainTop[c] = t[c * 4]; terrainCover[c] = t[c * 4 + 1] }
    }
    if (inp.obstacles.length) {
      const b = pass(inp.obstacles, true, 1)
      for (let c = 0; c < n; c++) if (b[c * 4 + 1] > 0) obstacleBottom[c] = b[c * 4]
      const t = pass(inp.obstacles, false, 2)
      for (let c = 0; c < n; c++) if (t[c * 4 + 1] > 0) { obstacleTop[c] = t[c * 4]; obstacleCover[c] = t[c * 4 + 1] }
    }
    return { terrainTop, terrainCover, obstacleBottom, obstacleTop, obstacleCover, supersample: S, ms: performance.now() - t0 }
  } finally {
    renderer.setRenderTarget(prev.target)
    renderer.setClearColor(prev.clear, prev.alpha)
    renderer.autoClear = prev.autoClear
    renderer.clippingPlanes = prev.planes
    renderer.localClippingEnabled = prev.local
    hi.dispose()
    lo.dispose()
    drawMat.dispose()
    reduceMat.dispose()
    quad.geometry.dispose()
  }
}
