// ─── water layer ──────────────────────────────────────────────────────────────
// The simulated water drawn in the viewer's scene: one vertex per cell (or per
// k cells on big grids), lifted in the vertex shader to bed + depth from two
// textures — the bed as the viewer draws it (map relief included) and the
// latest display frame from the solver (half floats: h, u, v, hMax). Updating
// the water is one texture upload; the geometry never changes.
//
// The fragment shader samples depth with linear filtering and drops anything
// shallower than the visibility threshold, so the shoreline follows the depth
// field rather than the triangles. Transparent, no depth writes, no raycast:
// IFC elements show through and keep their hover, selection and properties.

import * as THREE from 'three'
import type { GridFrame } from '../core/grid'

export type WaterMode = 'now' | 'max'

const VS = /* glsl */`
uniform sampler2D uBed;
uniform sampler2D uFrame;
uniform vec2 uGrid;
uniform float uDx;
uniform int uMode;
in vec2 aCell;
out vec2 vUv;
out vec3 vWorld;
void main() {
  ivec2 c = ivec2(aCell);
  float bed = texelFetch(uBed, c, 0).r;
  vec4 f = texelFetch(uFrame, c, 0);
  float h = uMode == 1 ? f.a : f.r;
  vec3 p = vec3((aCell.x + 0.5) * uDx, bed + max(h, 0.0), -(aCell.y + 0.5) * uDx);
  vUv = (aCell + 0.5) / uGrid;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const FS = /* glsl */`
uniform sampler2D uFrame;
uniform int uMode;
uniform float uThreshold;
uniform float uOpacity;
uniform vec3 uSun;
in vec2 vUv;
in vec3 vWorld;
out vec4 outColor;
// Depth ramp (sRGB): shallow pale blue → deep navy.
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
vec3 ramp(float h) {
  vec3 c0 = srgb(vec3(0.62, 0.81, 0.98));
  vec3 c1 = srgb(vec3(0.38, 0.65, 0.93));
  vec3 c2 = srgb(vec3(0.20, 0.47, 0.84));
  vec3 c3 = srgb(vec3(0.12, 0.31, 0.71));
  vec3 c4 = srgb(vec3(0.07, 0.19, 0.51));
  vec3 c5 = srgb(vec3(0.04, 0.10, 0.31));
  if (h < 0.15) return mix(c0, c1, smoothstep(0.05, 0.15, h));
  if (h < 0.3) return mix(c1, c2, (h - 0.15) / 0.15);
  if (h < 0.6) return mix(c2, c3, (h - 0.3) / 0.3);
  if (h < 1.2) return mix(c3, c4, (h - 0.6) / 0.6);
  return mix(c4, c5, clamp((h - 1.2) / 1.3, 0.0, 1.0));
}
void main() {
  vec4 f = texture(uFrame, vUv);
  float h = uMode == 1 ? f.a : f.r;
  if (h < uThreshold) discard;
  vec3 col = ramp(h);
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col = mix(col, srgb(vec3(0.72, 0.82, 0.93)), 0.35 * fres);
  col += 0.35 * pow(max(dot(reflect(-uSun, n), v), 0.0), 80.0);
  float a = clamp(0.55 + 1.1 * h, 0.55, 0.9) * uOpacity;
  a *= smoothstep(uThreshold, uThreshold * 1.5 + 0.01, h);
  // Linear in, the renderer's output space out (three's own conversion).
  outColor = linearToOutputTexel(vec4(col, a));
}
`

export interface WaterLayerInit {
  nx: number
  ny: number
  dx: number
  frame: GridFrame
  /** Scene Y of the bed per cell, as drawn. */
  displayBed: Float32Array
  /** Most vertices per side (the mesh skips cells beyond it). Default 640. */
  maxSide?: number
}

export class WaterLayer {
  readonly object: THREE.Mesh
  private readonly frameTex: THREE.DataTexture
  private readonly bedTex: THREE.DataTexture
  private readonly mat: THREE.ShaderMaterial

  constructor(o: WaterLayerInit) {
    const { nx, ny, dx } = o
    this.bedTex = new THREE.DataTexture(Float32Array.from(o.displayBed), nx, ny, THREE.RedFormat, THREE.FloatType)
    this.bedTex.minFilter = THREE.NearestFilter
    this.bedTex.magFilter = THREE.NearestFilter
    this.bedTex.needsUpdate = true
    this.frameTex = new THREE.DataTexture(new Uint16Array(nx * ny * 4), nx, ny, THREE.RGBAFormat, THREE.HalfFloatType)
    this.frameTex.minFilter = THREE.LinearFilter
    this.frameTex.magFilter = THREE.LinearFilter
    this.frameTex.needsUpdate = true

    // Vertices on cell centres, every `step` cells (the last row/column always kept).
    const side = o.maxSide ?? 640
    const step = Math.max(1, Math.ceil(Math.max(nx, ny) / side))
    const cols: number[] = []
    for (let i = 0; i < nx; i += step) cols.push(i)
    if (cols[cols.length - 1] !== nx - 1) cols.push(nx - 1)
    const rows: number[] = []
    for (let j = 0; j < ny; j += step) rows.push(j)
    if (rows[rows.length - 1] !== ny - 1) rows.push(ny - 1)
    const vw = cols.length
    const vh = rows.length
    const cell = new Float32Array(vw * vh * 2)
    for (let q = 0; q < vh; q++) for (let p = 0; p < vw; p++) { cell[(q * vw + p) * 2] = cols[p]; cell[(q * vw + p) * 2 + 1] = rows[q] }
    const index = new Uint32Array((vw - 1) * (vh - 1) * 6)
    let k = 0
    for (let q = 0; q < vh - 1; q++) {
      for (let p = 0; p < vw - 1; p++) {
        const a = q * vw + p
        const b = a + 1
        const c = a + vw
        const d = c + 1
        index[k++] = a; index[k++] = b; index[k++] = d
        index[k++] = a; index[k++] = d; index[k++] = c
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('aCell', new THREE.BufferAttribute(cell, 2))
    // three needs a position attribute to count vertices; the shader ignores it.
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vw * vh * 3), 3))
    g.setIndex(new THREE.BufferAttribute(index, 1))

    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      uniforms: {
        uBed: { value: this.bedTex },
        uFrame: { value: this.frameTex },
        uGrid: { value: new THREE.Vector2(nx, ny) },
        uDx: { value: dx },
        uMode: { value: 0 },
        uThreshold: { value: 0.05 },
        uOpacity: { value: 1 },
        uSun: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
      },
    })
    const mesh = new THREE.Mesh(g, this.mat)
    mesh.name = 'flood-water'
    mesh.frustumCulled = false
    mesh.renderOrder = 5
    mesh.raycast = () => { /* never in the way of IFC picking */ }
    mesh.position.set(o.frame.originX, 0, o.frame.originZ)
    mesh.rotation.y = o.frame.rotation
    mesh.userData.ignoreInCaptureBounds = true
    this.object = mesh
  }

  /** A display frame from the solver (RGBA half floats per cell). */
  setFrame(data: Uint16Array): void {
    const img = this.frameTex.image as { data: Uint16Array }
    if (img.data.length === data.length) img.data.set(data)
    else img.data = data
    this.frameTex.needsUpdate = true
  }

  setMode(mode: WaterMode): void { this.mat.uniforms.uMode.value = mode === 'max' ? 1 : 0 }
  setThreshold(m: number): void { this.mat.uniforms.uThreshold.value = Math.max(0, m) }
  setOpacity(a: number): void { this.mat.uniforms.uOpacity.value = Math.min(1, Math.max(0, a)) }
  setVisible(v: boolean): void { this.object.visible = v }

  dispose(): void {
    this.object.removeFromParent()
    this.object.geometry.dispose()
    this.mat.dispose()
    this.frameTex.dispose()
    this.bedTex.dispose()
  }
}
