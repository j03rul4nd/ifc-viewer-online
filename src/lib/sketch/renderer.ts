// ─── Drawing the sketch ───────────────────────────────────────────────────────
// Three.js scene on demand: a frame only when something changed, so a sketch
// left open does not drain a phone. Strokes are batched per layer into one
// growing buffer; drawing one more stroke appends to it instead of rebuilding.
// They ignore depth and paint in the order drawn, as ink does: a white stroke
// laid over black has to stay on top from every angle.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { intersectPlane, planeFromNormal, planeNormal } from './plane'
import type { LayerFilters } from './filters'
import type { EndpointCandidate } from './ink'
import type { ContextItem, ContextPoints } from './storage'
import { isAppendOf, ribbonSize, VERTEX_STRIDE, writeRibbon, type RibbonBuffers } from './ribbon'
import type { GridPattern, LayerBlend, OrbitState, PaperKind, PlacedImage, SketchBackground, SketchLayer, SketchPlane, Stroke, Vec3 } from './types'

export const PAPER: Record<PaperKind, { bg: string; ink: string; grid: string; plane: string }> = {
  warm: { bg: '#E4D6CC', ink: '#17130F', grid: '#3A2E26', plane: '#6E5A4C' },
  white: { bg: '#F7F6F3', ink: '#141414', grid: '#2B2B2B', plane: '#6A6F78' },
  night: { bg: '#21201D', ink: '#ECEBE7', grid: '#C8CAD4', plane: '#55CAC3' },
}

const FOV = 38
const SELECTION_COLOR = '#2F7BFF'
export const DEFAULT_ORBIT: OrbitState = { target: [0, 1, 0], azimuth: 0.62, elevation: 0.42, distance: 12, mode: 'perspective' }

const RIBBON_VERTEX = /* glsl */ `
  attribute vec3 previous;
  attribute vec3 next;
  attribute float side;
  attribute float lineWidth;
  attribute vec4 color;
  uniform float uSoft;
  uniform vec2 uResolution;
  uniform float uFadeNear;
  uniform float uFadeFar;
  varying vec4 vColor;
  varying float vSide;
  varying float vWidth;
  void main() {
    mat4 pv = projectionMatrix * modelViewMatrix;
    vec4 clip = pv * vec4(position, 1.0);
    vec4 a = pv * vec4(previous, 1.0);
    vec4 b = pv * vec4(next, 1.0);
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 pa = a.xy / max(a.w, 1e-4) * aspect;
    vec2 pb = b.xy / max(b.w, 1e-4) * aspect;
    vec2 dir = pb - pa;
    float len = length(dir);
    dir = len > 1e-6 ? dir / len : vec2(1.0, 0.0);
    // One extra pixel for the antialiased edge the fragment shader fades out.
    float w = lineWidth + 1.0 + uSoft * 2.0;
    vec2 offset = vec2(-dir.y, dir.x) * side * w / uResolution.y;
    offset.x /= aspect.x;
    clip.xy += offset * clip.w;
    gl_Position = clip;
    // Further strokes go lighter: it is what lets a wire sketch read as 3D.
    float depth = -(modelViewMatrix * vec4(position, 1.0)).z;
    float fade = 1.0 - 0.6 * smoothstep(uFadeNear, uFadeFar, depth);
    vColor = vec4(color.rgb, color.a * fade);
    vSide = side;
    vWidth = w;
  }
`

const RIBBON_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uPremultiply;
  uniform float uSoft;
  uniform float uHue;
  uniform float uSaturation;
  uniform float uBrightness;
  uniform float uGrain;
  uniform float uDuoOn;
  uniform vec3 uDuoA;
  uniform vec3 uDuoB;
  varying vec4 vColor;
  varying float vSide;
  varying float vWidth;
  float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float edge = 1.0 - smoothstep(1.0 - (2.0 + uSoft * 2.0) / vWidth, 1.0, abs(vSide));
    vec3 rgb = vColor.rgb;
    if (uHue != 0.0) {
      float c = cos(uHue), s = sin(uHue), k = (1.0 - c) / 3.0, q = 0.57735 * s;
      rgb = mat3(c + k, k + q, k - q, k - q, c + k, k + q, k + q, k - q, c + k) * rgb;
    }
    float grey = dot(rgb, vec3(0.299, 0.587, 0.114));
    rgb = mix(vec3(grey), rgb, uSaturation);
    if (uDuoOn > 0.5) rgb = mix(uDuoA, uDuoB, grey);
    rgb *= uBrightness;
    float alpha = vColor.a * edge * uOpacity;
    // Only the pencil has this alpha band: its tooth comes from the paper, in screen space.
    if (vColor.a > 0.5 && vColor.a < 0.95 && vWidth < 40.0) alpha *= 0.55 + 0.45 * noise(floor(gl_FragCoord.xy / 1.5));
    if (uGrain > 0.0) alpha *= 1.0 - uGrain + uGrain * noise(floor(gl_FragCoord.xy / 1.5));
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(rgb * mix(1.0, alpha, uPremultiply), alpha);
  }
`

const PLANE_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const PLANE_FRAGMENT = /* glsl */ `
  uniform vec3 uOrigin;
  uniform vec3 uU;
  uniform vec3 uV;
  uniform vec3 uTint;
  uniform vec3 uDot;
  uniform float uSpacing;
  uniform float uRadius;
  uniform float uFill;
  uniform float uDots;
  uniform float uPattern;
  varying vec3 vWorld;
  void main() {
    // A guide seen nearly edge-on is a smear of dots: let it go before it gets in the way.
    vec3 normal = normalize(cross(uU, uV));
    float facing = abs(dot(normalize(cameraPosition - vWorld), normal));
    vec3 d = vWorld - uOrigin;
    vec2 p = vec2(dot(d, uU), dot(d, uV));
    float fall = 1.0 - smoothstep(uRadius * 0.55, uRadius, length(p));
    vec2 cell = abs(fract(p / uSpacing + 0.5) - 0.5) * uSpacing;
    float px = max(fwidth(p.x), fwidth(p.y));
    float dotMask = 1.0 - smoothstep(px * 1.1, px * 2.2, length(cell));
    float axis = (1.0 - smoothstep(px * 0.5, px * 1.4, abs(p.x))) + (1.0 - smoothstep(px * 0.5, px * 1.4, abs(p.y)));
    // 0 dots, 1 grid, 2 lines, 3 plain.
    vec2 toLine = abs(fract(p / uSpacing + 0.5) - 0.5) * uSpacing;
    float gridLine = 1.0 - smoothstep(px * 0.4, px * 1.3, min(toLine.x, toLine.y));
    float ruled = 1.0 - smoothstep(px * 0.4, px * 1.3, toLine.y);
    float mark = uPattern < 0.5 ? dotMask : uPattern < 1.5 ? gridLine * 0.5 : uPattern < 2.5 ? ruled * 0.5 : 0.0;
    float a = uFill + uDots * (mark * 0.6 + min(axis, 1.0) * 0.35);
    vec3 col = mix(uTint, uDot, clamp(mark + axis, 0.0, 1.0));
    gl_FragColor = vec4(col, a * fall * smoothstep(0.04, 0.3, facing));
  }
`

class RibbonBatch {
  private capacityVertices = 0
  private capacityIndices = 0
  private buffers: RibbonBuffers = { vertices: new Float32Array(0), colors: new Uint8Array(0), indices: new Uint32Array(0), vertexCount: 0 }
  private indexCount = 0
  private strokes: readonly Stroke[] = []
  /** Index count after each stroke: what replay reveals one by one. */
  private ends: number[] = []
  private interleaved: THREE.InterleavedBuffer | null = null
  readonly geometry = new THREE.BufferGeometry()
  readonly mesh: THREE.Mesh
  /** Only on a layer with a glow filter. */
  glow: THREE.Mesh | null = null

  constructor(material: THREE.Material) {
    this.mesh = new THREE.Mesh(this.geometry, material)
    this.mesh.frustumCulled = false
  }

  get strokeCount(): number { return this.strokes.length }

  private ensure(vertices: number, indices: number): void {
    if (vertices <= this.capacityVertices && indices <= this.capacityIndices) return
    this.capacityVertices = Math.max(vertices, this.capacityVertices * 2, 1024)
    this.capacityIndices = Math.max(indices, this.capacityIndices * 2, 3072)
    const v = new Float32Array(this.capacityVertices * VERTEX_STRIDE)
    const c = new Uint8Array(this.capacityVertices * 4)
    const i = new Uint32Array(this.capacityIndices)
    v.set(this.buffers.vertices)
    c.set(this.buffers.colors)
    i.set(this.buffers.indices)
    this.buffers = { vertices: v, colors: c, indices: i, vertexCount: this.buffers.vertexCount }
    this.geometry.dispose()
    const inter = new THREE.InterleavedBuffer(v, VERTEX_STRIDE)
    inter.setUsage(THREE.DynamicDrawUsage)
    this.interleaved = inter
    this.geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 0))
    this.geometry.setAttribute('previous', new THREE.InterleavedBufferAttribute(inter, 3, 3))
    this.geometry.setAttribute('next', new THREE.InterleavedBufferAttribute(inter, 3, 6))
    this.geometry.setAttribute('side', new THREE.InterleavedBufferAttribute(inter, 1, 9))
    this.geometry.setAttribute('lineWidth', new THREE.InterleavedBufferAttribute(inter, 1, 10))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(c, 4, true).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setIndex(new THREE.BufferAttribute(i, 1).setUsage(THREE.DynamicDrawUsage))
  }

  sync(strokes: readonly Stroke[]): boolean {
    if (strokes === this.strokes) return false
    const append = isAppendOf(this.strokes, strokes)
    const from = append ? this.strokes.length : 0
    if (!append) {
      this.buffers.vertexCount = 0
      this.indexCount = 0
      this.ends = []
    }
    let vertices = this.buffers.vertexCount
    let indices = this.indexCount
    for (let s = from; s < strokes.length; s++) {
      const size = ribbonSize(strokes[s].points.length)
      vertices += size.vertices
      indices += size.indices
    }
    this.ensure(vertices, indices)
    for (let s = from; s < strokes.length; s++) {
      this.indexCount += writeRibbon(strokes[s], this.buffers, this.indexCount)
      this.ends.push(this.indexCount)
    }
    this.strokes = strokes
    if (this.interleaved) this.interleaved.needsUpdate = true
    const color = this.geometry.getAttribute('color') as THREE.BufferAttribute | undefined
    if (color) color.needsUpdate = true
    if (this.geometry.index) this.geometry.index.needsUpdate = true
    this.geometry.setDrawRange(0, this.indexCount)
    return true
  }

  /** Show the first `count` strokes; null shows all. */
  reveal(count: number | null): void {
    const n = count === null ? this.indexCount : count <= 0 ? 0 : this.ends[Math.min(count, this.ends.length) - 1] ?? 0
    this.geometry.setDrawRange(0, n)
  }

  dispose(): void {
    this.geometry.dispose()
  }
}

function planeUniforms(tint: string, dotColor: string, fill: number, dots: number) {
  // Raw sRGB, like the strokes: this ShaderMaterial does no output conversion.
  const raw = (hex: string) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace).convertLinearToSRGB()
  return {
    uOrigin: { value: new THREE.Vector3() }, uU: { value: new THREE.Vector3(1, 0, 0) }, uV: { value: new THREE.Vector3(0, 1, 0) },
    uTint: { value: raw(tint) }, uDot: { value: raw(dotColor) },
    uSpacing: { value: 1 }, uRadius: { value: 10 }, uFill: { value: fill }, uDots: { value: dots }, uPattern: { value: 0 },
  }
}

/** Blends that need premultiplied colour get it, so a soft edge does not brighten. */
function setBlend(material: THREE.ShaderMaterial, blend: LayerBlend): void {
  if (material.userData.blend === blend) return
  material.userData.blend = blend
  material.uniforms.uPremultiply.value = blend === 'normal' ? 0 : 1
  if (blend === 'normal') {
    material.blending = THREE.NormalBlending
  } else {
    material.blending = THREE.CustomBlending
    material.blendEquation = THREE.AddEquation
    material.blendSrc = blend === 'multiply' ? THREE.DstColorFactor : blend === 'screen' ? THREE.OneMinusDstColorFactor : THREE.OneFactor
    material.blendDst = blend === 'multiply' ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor
  }
  material.needsUpdate = true
}

const rawColor = (hex: string, into: THREE.Vector3): void => {
  const n = parseInt(hex.slice(1), 16)
  into.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function setFilters(material: THREE.ShaderMaterial, f: LayerFilters | undefined): void {
  const u = material.uniforms
  u.uSoft.value = f?.soft ?? 0
  u.uHue.value = ((f?.hue ?? 0) * Math.PI) / 180
  u.uSaturation.value = f?.saturation ?? 1
  u.uBrightness.value = f?.brightness ?? 1
  u.uGrain.value = f?.grain ?? 0
  u.uDuoOn.value = f?.duotone ? 1 : 0
  if (f?.duotone) { rawColor(f.duotone[0], u.uDuoA.value); rawColor(f.duotone[1], u.uDuoB.value) }
}

function buildPoints(item: ContextPoints): THREE.Points {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(item.positions, 3))
  if (item.colors) geometry.setAttribute('color', new THREE.BufferAttribute(item.colors, 3, true))
  const material = new THREE.PointsMaterial({
    size: 1.6, sizeAttenuation: false, vertexColors: !!item.colors, color: item.colors ? 0xffffff : 0x6e5a4c,
    transparent: true, opacity: 0.75, depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = -1
  points.frustumCulled = false
  return points
}

const toV = (v: Vec3): THREE.Vector3 => new THREE.Vector3(v[0], v[1], v[2])

export interface PickResult { kind: 'surface' | 'stroke'; plane: SketchPlane }

export class SketchRenderer {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly perspective = new THREE.PerspectiveCamera(FOV, 1, 0.01, 5000)
  private readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 5000)
  private readonly raycaster = new THREE.Raycaster()
  private readonly ribbon: THREE.ShaderMaterial
  private readonly selection: RibbonBatch
  private readonly batches = new Map<string, RibbonBatch>()
  private readonly live: RibbonBatch
  private readonly planeMesh: THREE.Mesh
  private readonly groundMesh: THREE.Mesh
  private readonly placedGroup = new THREE.Group()
  private readonly placedMeshes = new Map<string, THREE.Mesh>()
  private readonly textures = new Map<string, THREE.Texture>()
  private readonly contextGroup = new THREE.Group()
  private readonly lights = new THREE.Group()
  private orbit: OrbitState = DEFAULT_ORBIT
  private plane: SketchPlane
  private layers: readonly SketchLayer[] = []
  private width = 1
  private height = 1
  private frame = 0
  private disposed = false
  private showGuides = true

  /** Runs after a frame is drawn: the second view follows, for one. */
  onFrame: (() => void) | null = null
  /** Runs before a frame is drawn: the live stroke is built here, once per frame. */
  onBeforeFrame: (() => void) | null = null
  onContextLost: (() => void) | null = null
  onContextRestored: (() => void) | null = null
  private contextLost = false
  private paper: PaperKind = 'warm'
  private background: SketchBackground | undefined
  private readonly handleLost = () => {
    this.contextLost = true
    this.onContextLost?.()
  }
  private readonly handleRestored = () => {
    // three re-creates its GPU state; the buffers upload again from their arrays.
    this.contextLost = false
    // The clear colour is GL state and went with the context.
    this.setBackground(this.paper, this.background)
    this.onContextRestored?.()
    this.invalidate()
  }

  constructor(readonly canvas: HTMLCanvasElement, plane: SketchPlane) {
    this.plane = plane
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: 'high-performance',
      // Without this the PNG export and the video read an empty buffer after compositing.
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3))
    canvas.addEventListener('webglcontextlost', this.handleLost)
    canvas.addEventListener('webglcontextrestored', this.handleRestored)

    this.ribbon = this.ribbonMaterial()
    this.live = new RibbonBatch(this.ribbon)
    this.live.mesh.renderOrder = 1000
    this.selection = new RibbonBatch(this.ribbon)
    this.selection.mesh.renderOrder = 1001
    this.scene.add(this.live.mesh, this.selection.mesh)

    const quad = new THREE.PlaneGeometry(1, 1)
    this.groundMesh = this.guideMesh(quad, 0)
    this.planeMesh = this.guideMesh(quad, 1)
    this.placedGroup.renderOrder = 2
    this.scene.add(this.groundMesh, this.planeMesh, this.placedGroup, this.contextGroup)

    this.lights.add(new THREE.HemisphereLight(0xffffff, 0x887766, 2.2))
    this.scene.add(this.lights)
    this.setPaper('warm')
    this.applyCamera()
  }

  /** One per layer for its opacity; everything else is shared, so one write reaches all. */
  private ribbonMaterial(): THREE.ShaderMaterial {
    const shared = this.ribbon?.uniforms
    return new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX, fragmentShader: RIBBON_FRAGMENT, transparent: true,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uResolution: shared?.uResolution ?? { value: new THREE.Vector2(1, 1) },
        uFadeNear: shared?.uFadeNear ?? { value: 10 },
        uFadeFar: shared?.uFadeFar ?? { value: 30 },
        uOpacity: { value: 1 },
        uPremultiply: { value: 0 },
        uSoft: { value: 0 }, uHue: { value: 0 }, uSaturation: { value: 1 }, uBrightness: { value: 1 }, uGrain: { value: 0 },
        uDuoOn: { value: 0 }, uDuoA: { value: new THREE.Vector3() }, uDuoB: { value: new THREE.Vector3(1, 1, 1) },
      },
    })
  }

  private guideMesh(quad: THREE.BufferGeometry, renderOrder: number): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      vertexShader: PLANE_VERTEX, fragmentShader: PLANE_FRAGMENT, uniforms: planeUniforms('#000000', '#000000', 0, 0),
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(quad, material)
    mesh.frustumCulled = false
    mesh.renderOrder = renderOrder
    return mesh
  }

  get camera(): THREE.Camera { return this.orbit.mode === 'perspective' ? this.perspective : this.ortho }
  get orbitState(): OrbitState { return this.orbit }

  /** The colour of the sheet, a colour of one's own winning over the paper's. */
  setBackground(paper: PaperKind, background?: SketchBackground): void {
    const pattern: GridPattern = background?.pattern ?? 'dots'
    const index = { dots: 0, grid: 1, lines: 2, plain: 3 }[pattern]
    this.background = background
    this.setPaper(paper)
    for (const mesh of [this.planeMesh, this.groundMesh]) (mesh.material as THREE.ShaderMaterial).uniforms.uPattern.value = index
    this.invalidate()
  }

  /** A picture behind everything. Null clears it. */
  async setBackgroundImage(id: string | null, blob: Blob | undefined): Promise<void> {
    if (!id) {
      this.scene.background = null
      this.invalidate()
      return
    }
    const texture = await this.textureFor(id, blob)
    if (texture && !this.disposed) {
      this.scene.background = texture
      this.invalidate()
    }
  }

  setPaper(paper: PaperKind): void {
    this.paper = paper
    const p = PAPER[paper]
    this.renderer.setClearColor(new THREE.Color(this.background?.color ?? p.bg), 1)
    const set = (mesh: THREE.Mesh, fill: number, dots: number) => {
      const pattern = (mesh.material as THREE.ShaderMaterial).uniforms.uPattern
      Object.assign((mesh.material as THREE.ShaderMaterial).uniforms, planeUniforms(p.plane, p.grid, fill, dots), {
        uPattern: pattern,
        uOrigin: (mesh.material as THREE.ShaderMaterial).uniforms.uOrigin,
        uU: (mesh.material as THREE.ShaderMaterial).uniforms.uU,
        uV: (mesh.material as THREE.ShaderMaterial).uniforms.uV,
      })
    }
    set(this.planeMesh, 0.16, 1)
    set(this.groundMesh, 0, 0.45)
    this.invalidate()
  }

  setGuides(visible: boolean): void {
    this.showGuides = visible
    this.invalidate()
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.applyCamera()
  }

  setOrbit(orbit: OrbitState): void {
    this.orbit = orbit
    this.applyCamera()
  }

  setPlane(plane: SketchPlane): void {
    this.plane = plane
    this.applyGuides()
    this.invalidate()
  }

  private applyCamera(): void {
    const { target, azimuth, elevation, distance } = this.orbit
    const eye = new THREE.Vector3(
      target[0] + distance * Math.cos(elevation) * Math.sin(azimuth),
      target[1] + distance * Math.sin(elevation),
      target[2] + distance * Math.cos(elevation) * Math.cos(azimuth),
    )
    const aspect = this.width / this.height
    for (const cam of [this.perspective, this.ortho]) {
      cam.position.copy(eye)
      cam.up.set(0, 1, 0)
      cam.lookAt(toV(target))
      if (this.orbit.roll) cam.rotateZ(this.orbit.roll)
    }
    this.perspective.aspect = aspect
    this.perspective.near = Math.max(distance / 500, 0.005)
    this.perspective.far = distance * 200
    this.perspective.updateProjectionMatrix()
    const halfH = this.worldPerPixel() * this.height / 2
    this.ortho.left = -halfH * aspect
    this.ortho.right = halfH * aspect
    this.ortho.top = halfH
    this.ortho.bottom = -halfH
    this.ortho.updateProjectionMatrix()
    this.perspective.updateMatrixWorld()
    this.ortho.updateMatrixWorld()
    this.ribbon.uniforms.uResolution.value.set(this.width, this.height)
    this.ribbon.uniforms.uFadeNear.value = distance * 0.9
    this.ribbon.uniforms.uFadeFar.value = distance * 2.4
    this.applyGuides()
    this.invalidate()
  }

  private applyGuides(): void {
    const distance = this.orbit.distance
    const spacing = Math.pow(10, Math.floor(Math.log10(Math.max(distance, 1e-3) / 2.5)))
    const radius = distance * 1.6
    const pose = (mesh: THREE.Mesh, plane: SketchPlane) => {
      const n = planeNormal(plane)
      const basis = new THREE.Matrix4().makeBasis(toV(plane.u), toV(plane.v), toV(n))
      mesh.quaternion.setFromRotationMatrix(basis)
      mesh.position.copy(toV(plane.origin))
      mesh.scale.setScalar(radius * 2.2)
      const u = (mesh.material as THREE.ShaderMaterial).uniforms
      u.uOrigin.value.copy(mesh.position)
      u.uU.value.copy(toV(plane.u))
      u.uV.value.copy(toV(plane.v))
      u.uSpacing.value = spacing
      u.uRadius.value = radius
    }
    pose(this.planeMesh, this.plane)
    pose(this.groundMesh, { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1] })
  }

  worldPerPixel(): number {
    return 2 * this.orbit.distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / this.height
  }

  /** Sync layers from the document; only what changed touches the GPU. */
  syncLayers(layers: readonly SketchLayer[]): void {
    this.layers = layers
    const seen = new Set<string>()
    layers.forEach((layer, index) => {
      seen.add(layer.id)
      let batch = this.batches.get(layer.id)
      if (!batch) {
        batch = new RibbonBatch(this.ribbonMaterial())
        this.batches.set(layer.id, batch)
        this.scene.add(batch.mesh)
      }
      batch.sync(layer.strokes)
      batch.mesh.visible = layer.visible
      const material = batch.mesh.material as THREE.ShaderMaterial
      material.uniforms.uOpacity.value = layer.opacity ?? 1
      setBlend(material, layer.blend ?? 'normal')
      setFilters(material, layer.filters)
      // The halo: the same geometry again, wide and soft, under the line.
      const glow = layer.filters?.glow ?? 0
      if (glow > 0 && !batch.glow) {
        batch.glow = new THREE.Mesh(batch.geometry, this.ribbonMaterial())
        batch.glow.frustumCulled = false
        this.scene.add(batch.glow)
      }
      if (batch.glow) {
        const haloMaterial = batch.glow.material as THREE.ShaderMaterial
        setFilters(haloMaterial, layer.filters)
        haloMaterial.uniforms.uSoft.value = glow
        haloMaterial.uniforms.uOpacity.value = (layer.opacity ?? 1) * 0.55
        batch.glow.visible = layer.visible && glow > 0
        batch.glow.renderOrder = 9 + index
      }
      batch.mesh.renderOrder = 10 + index
    })
    for (const [id, batch] of this.batches) {
      if (seen.has(id)) continue
      this.scene.remove(batch.mesh)
      ;(batch.mesh.material as THREE.Material).dispose()
      if (batch.glow) {
        this.scene.remove(batch.glow)
        ;(batch.glow.material as THREE.Material).dispose()
      }
      batch.dispose()
      this.batches.delete(id)
    }
    this.invalidate()
  }

  /** Pass false from inside onBeforeFrame: that frame is already on its way. */
  setLive(strokes: readonly Stroke[], invalidate = true): void {
    this.live.sync(strokes)
    if (invalidate) this.invalidate()
  }

  /** Show these strokes as selected, drawn over the drawing in the selection colour. */
  setSelection(strokes: readonly Stroke[]): void {
    this.selection.sync(strokes.map((s) => ({ ...s, color: SELECTION_COLOR, opacity: 0.8, brush: 'pen' as const })))
    this.invalidate()
  }

  /** What colour is on screen at this point: ink, a reference, a model, or the paper. */
  pickColor(x: number, y: number): string {
    const was = this.showGuides
    this.showGuides = false
    this.renderNow()
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const ratio = this.canvas.width / this.width
    ctx?.drawImage(this.canvas, x * ratio, y * ratio, 1, 1, 0, 0, 1, 1)
    const data = ctx?.getImageData(0, 0, 1, 1).data
    this.showGuides = was
    this.invalidate()
    return data ? `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}` : '#000000'
  }

  /** Replay: show the first `count` strokes in layer order; null restores everything. */
  reveal(count: number | null): void {
    let left = count
    for (const layer of this.layers) {
      const batch = this.batches.get(layer.id)
      if (!batch) continue
      batch.reveal(left)
      if (left !== null) left = Math.max(0, left - batch.strokeCount)
    }
    this.invalidate()
  }

  async syncPlaced(placed: readonly PlacedImage[], blobOf: (imageId: string) => Blob | undefined): Promise<void> {
    const ids = new Set(placed.map((p) => p.id))
    for (const [id, mesh] of this.placedMeshes) {
      if (ids.has(id)) continue
      this.placedGroup.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
      this.placedMeshes.delete(id)
    }
    for (const item of placed) {
      const existing = this.placedMeshes.get(item.id)
      if (existing) {
        ;(existing.material as THREE.MeshBasicMaterial).opacity = item.opacity
        continue
      }
      const texture = await this.textureFor(item.imageId, blobOf(item.imageId))
      if (!texture || this.disposed || this.placedMeshes.has(item.id)) continue
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(item.width, item.height),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: item.opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
      )
      const n = planeNormal(item.plane)
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(toV(item.plane.u), toV(item.plane.v), toV(n)))
      mesh.position.copy(toV(item.plane.origin))
      mesh.renderOrder = 2
      this.placedMeshes.set(item.id, mesh)
      this.placedGroup.add(mesh)
    }
    this.invalidate()
  }

  private async textureFor(imageId: string, blob: Blob | undefined): Promise<THREE.Texture | null> {
    const known = this.textures.get(imageId)
    if (known) return known
    if (!blob) return null
    try {
      const bitmap = await createImageBitmap(blob)
      const texture = new THREE.CanvasTexture(bitmap)
      texture.colorSpace = THREE.SRGBColorSpace
      this.textures.set(imageId, texture)
      return texture
    } catch {
      return null
    }
  }

  /** What to sketch over, replacing all before. Parses everything before touching the scene. */
  async loadContext(items: readonly ContextItem[]): Promise<void> {
    const loader = new GLTFLoader()
    const built = await Promise.all(items.map(async (item) => {
      if (item.kind === 'points') return { id: item.id, object: buildPoints(item) as THREE.Object3D }
      const { scene } = await loader.parseAsync(await item.blob.arrayBuffer(), '')
      const material = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) { mesh.material = material; mesh.renderOrder = -1 }
      })
      return { id: item.id, object: scene as THREE.Object3D }
    }))
    this.clearContext()
    for (const { id, object } of built) {
      object.name = id
      this.contextGroup.add(object)
    }
    this.invalidate()
  }

  setContextVisible(id: string, visible: boolean): void {
    const object = this.contextGroup.getObjectByName(id)
    if (object) object.visible = visible
    this.invalidate()
  }

  clearContext(): void {
    this.contextGroup.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose?.()
      const material = mesh.material as THREE.Material | undefined
      material?.dispose?.()
    })
    this.contextGroup.clear()
    this.invalidate()
  }

  get hasContext(): boolean { return this.contextGroup.children.length > 0 }

  ray(x: number, y: number): { origin: Vec3; dir: Vec3 } {
    this.raycaster.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.camera)
    const { origin, direction } = this.raycaster.ray
    return { origin: [origin.x, origin.y, origin.z], dir: [direction.x, direction.y, direction.z] }
  }

  /** Where a screen point lands on the active plane. */
  hitPlane(x: number, y: number): Vec3 | null {
    const { origin, dir } = this.ray(x, y)
    return intersectPlane(this.plane, origin, dir)
  }

  viewDirection(): Vec3 {
    const d = this.camera.getWorldDirection(new THREE.Vector3())
    return [d.x, d.y, d.z]
  }

  project(point: Vec3): { x: number; y: number } | null {
    const v = toV(point).project(this.camera)
    if (v.z > 1) return null
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height }
  }

  /** Align to the face under the finger, else move through the nearest stroke. */
  pick(x: number, y: number, current: SketchPlane): PickResult | null {
    this.raycaster.setFromCamera(new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.camera)
    this.raycaster.params.Points.threshold = this.worldPerPixel() * 8
    const hit = this.raycaster.intersectObject(this.contextGroup, true).find((h) => h.object.visible)
    if (hit?.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
      return { kind: 'surface', plane: planeFromNormal([hit.point.x, hit.point.y, hit.point.z], [n.x, n.y, n.z]) }
    }
    // A scan point has no face: the plane keeps its angle and moves through it.
    if (hit) return { kind: 'stroke', plane: { ...current, origin: [hit.point.x, hit.point.y, hit.point.z] } }
    let best: Vec3 | null = null
    let bestDistance = 28
    for (const layer of this.layers) {
      if (!layer.visible) continue
      for (const stroke of layer.strokes) {
        for (let i = 0; i < stroke.points.length; i += 4) {
          const world: Vec3 = [stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]]
          const s = this.project(world)
          if (!s) continue
          const d = Math.hypot(s.x - x, s.y - y)
          if (d < bestDistance) { bestDistance = d; best = world }
        }
      }
    }
    return best ? { kind: 'stroke', plane: { ...current, origin: best } } : null
  }

  /** Both ends of every visible stroke: what a new line can join. */
  endpointCandidates(): EndpointCandidate[] {
    const out: EndpointCandidate[] = []
    const add = (s: Stroke, i: number) => {
      const world: Vec3 = [s.points[i], s.points[i + 1], s.points[i + 2]]
      const p = this.project(world)
      if (p) out.push({ x: p.x, y: p.y, world })
    }
    for (const layer of this.layers) {
      if (!layer.visible) continue
      for (const stroke of layer.strokes) {
        if (stroke.points.length < 8) continue
        add(stroke, 0)
        add(stroke, stroke.points.length - 4)
      }
    }
    return out
  }

  /** Stroke ids within `radius` px of a screen point, on layers that may be edited. */
  strokesAt(x: number, y: number, radius: number): string[] {
    const found: string[] = []
    for (const layer of this.layers) {
      if (!layer.visible || layer.locked) continue
      for (const stroke of layer.strokes) if (this.strokeNear(stroke, x, y, radius)) found.push(stroke.id)
    }
    return found
  }

  private strokeNear(stroke: Stroke, x: number, y: number, radius: number): boolean {
    let prev: { x: number; y: number } | null = null
    for (let i = 0; i < stroke.points.length; i += 4) {
      const p = this.project([stroke.points[i], stroke.points[i + 1], stroke.points[i + 2]])
      if (!p) { prev = null; continue }
      const a = prev ?? p
      const dx = p.x - a.x
      const dy = p.y - a.y
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0
      if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= radius) return true
      prev = p
    }
    return false
  }

  /** Centre and radius of what is drawn, or null on an empty page. */
  bounds(): { center: Vec3; radius: number } | null {
    const box = new THREE.Box3()
    const point = new THREE.Vector3()
    for (const layer of this.layers) {
      if (!layer.visible) continue
      for (const s of layer.strokes) for (let i = 0; i < s.points.length; i += 4) box.expandByPoint(point.set(s.points[i], s.points[i + 1], s.points[i + 2]))
    }
    if (this.contextGroup.children.length) box.expandByObject(this.contextGroup)
    if (box.isEmpty()) return null
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    return { center: [sphere.center.x, sphere.center.y, sphere.center.z], radius: Math.max(sphere.radius, 0.5) }
  }

  invalidate(): void {
    if (this.frame || this.disposed) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.renderNow()
    })
  }

  renderNow(): void {
    if (this.disposed || this.contextLost) return
    this.onBeforeFrame?.()
    this.planeMesh.visible = this.showGuides
    this.groundMesh.visible = this.showGuides
    this.renderer.render(this.scene, this.camera)
    this.onFrame?.()
  }

  /**
   * Draw the same scene into a second canvas's renderer, with no guides. Ribbons
   * are sized for the target, then restored for the main view.
   */
  renderInto(target: THREE.WebGLRenderer, camera: THREE.Camera, width: number, height: number): void {
    const res = this.ribbon.uniforms.uResolution.value as THREE.Vector2
    const saved = res.clone()
    const near = this.ribbon.uniforms.uFadeNear.value
    res.set(width, height)
    // Flat: a plan or an elevation should not fade with distance.
    this.ribbon.uniforms.uFadeNear.value = 1e6
    this.ribbon.uniforms.uFadeFar.value = 2e6
    this.planeMesh.visible = false
    this.groundMesh.visible = false
    target.render(this.scene, camera)
    res.copy(saved)
    this.ribbon.uniforms.uFadeNear.value = near
    this.ribbon.uniforms.uFadeFar.value = near * (2.4 / 0.9)
    this.planeMesh.visible = this.showGuides
    this.groundMesh.visible = this.showGuides
  }

  /** A JPEG data URL of the page as it stands, for the strip. */
  thumbnail(width = 200): string {
    this.showGuides = false
    this.renderNow()
    const height = Math.round(width * this.height / this.width)
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    c.getContext('2d')?.drawImage(this.canvas, 0, 0, width, height)
    this.showGuides = true
    this.renderNow()
    return c.toDataURL('image/jpeg', 0.7)
  }

  toBlob(type = 'image/png'): Promise<Blob | null> {
    this.showGuides = false
    this.renderNow()
    return new Promise((resolve) => this.canvas.toBlob((b) => {
      this.showGuides = true
      this.invalidate()
      resolve(b)
    }, type))
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.canvas.removeEventListener('webglcontextlost', this.handleLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored)
    this.clearContext()
    for (const b of this.batches.values()) b.dispose()
    this.live.dispose()
    for (const t of this.textures.values()) t.dispose()
    this.ribbon.dispose()
    this.renderer.dispose()
  }
}

/** Point an orthographic camera along one axis at a bound: the plan and elevation views. */
export function fitOrtho(camera: THREE.OrthographicCamera, axis: 'top' | 'front', center: Vec3, radius: number, aspect: number): void {
  const c = toV(center)
  const r = radius * 1.15
  camera.position.copy(c).add(axis === 'top' ? new THREE.Vector3(0, 100 + r, 0) : new THREE.Vector3(0, 0, 100 + r))
  camera.up.set(0, axis === 'top' ? 0 : 1, axis === 'top' ? -1 : 0)
  camera.lookAt(c)
  camera.left = -r * Math.max(aspect, 1)
  camera.right = r * Math.max(aspect, 1)
  camera.top = r * Math.max(1 / aspect, 1)
  camera.bottom = -r * Math.max(1 / aspect, 1)
  camera.near = 0.1
  camera.far = 400 + r * 4
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}
