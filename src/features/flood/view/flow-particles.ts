// ─── flow particles ───────────────────────────────────────────────────────────
// Streaks that ride the simulated velocity field, brighter where the water is
// faster — the flow paths the depth colours cannot show.
//
// GPU particles on the viewer's renderer: positions (grid-local metres, age,
// life) live in a float texture, one texel per particle, advanced by a
// full-screen pass that samples the same display-frame texture the water
// layer draws (h, u, v). A particle that ages out, leaves the grid or finds
// itself in water shallower than the threshold is respawned at a random wet
// cell (a few random tries per frame — where little is wet, few are drawn).
// Each particle is drawn as a short segment from its position back along its
// velocity, fading towards the tail; segments sit just above the water.
//
// Same transform as the water mesh (grid origin, rotation): mesh-local
// x = a, z = −b. No raycast.

import * as THREE from 'three'
import type { GridFrame } from '../core/grid'

const UPDATE_VS = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`
const UPDATE_FS = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uFrame;
uniform vec2 uGrid;
uniform float uDx;
uniform float uDt;
uniform float uScale;
uniform float uThreshold;
uniform float uSeed;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float depthAt(vec2 m) { return texture(uFrame, m / uDx / uGrid).r; }
void main() {
  vec2 id = gl_FragCoord.xy;
  vec4 p = texelFetch(uPos, ivec2(id), 0);
  vec2 cell = p.xy / uDx;
  bool outside = any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, uGrid));
  if (outside || p.z > p.w || depthAt(p.xy) < uThreshold) {
    // Respawn: a few random tries for a wet cell.
    vec2 best = vec2(hash(id + uSeed), hash(id * 1.7 + uSeed + 3.1)) * uGrid * uDx;
    for (int k = 0; k < 6; k++) {
      vec2 r = vec2(hash(id + uSeed + float(k) * 7.13), hash(id * 1.3 + uSeed + float(k) * 3.71)) * uGrid * uDx;
      if (depthAt(r) >= uThreshold) { best = r; break; }
    }
    outColor = vec4(best, 0.0, 2.0 + 4.0 * hash(id * 0.7 + uSeed));
    return;
  }
  vec2 vel = texture(uFrame, cell / uGrid).gb;
  outColor = vec4(p.xy + vel * uDt * uScale, p.z + uDt, p.w);
}
`

const DRAW_VS = /* glsl */`
uniform sampler2D uPos;
uniform sampler2D uFrame;
uniform sampler2D uBed;
uniform vec2 uGrid;
uniform float uDx;
uniform float uTail;
uniform float uThreshold;
in vec2 aRef;
in float aEnd;
out float vAlpha;
void main() {
  vec4 p = texelFetch(uPos, ivec2(aRef), 0);
  vec2 cell = p.xy / uDx;
  vec4 f = texture(uFrame, cell / uGrid);
  vec2 vel = f.gb;
  float speed = length(vel);
  // Tail: back along the velocity — at least half a cell where the water moves
  // at all (so slow flow reads as lines, not dots), at most three cells.
  vec2 back = speed > 0.01 ? vel / speed * clamp(speed * uTail, 0.5 * uDx, 3.0 * uDx) : vec2(0.0);
  vec2 m = p.xy - back * aEnd;
  ivec2 c = ivec2(clamp(m / uDx, vec2(0.0), uGrid - 1.0));
  float y = texelFetch(uBed, c, 0).r + max(f.r, 0.0) + 0.04;
  float life = smoothstep(0.0, 0.4, p.z) * (1.0 - smoothstep(p.w - 0.6, p.w, p.z));
  float wet = step(uThreshold, f.r);
  vAlpha = wet * life * (1.0 - aEnd) * clamp(0.25 + speed * 1.2, 0.25, 1.0);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(m.x, y, -m.y, 1.0);
}
`
const DRAW_FS = /* glsl */`
in float vAlpha;
out vec4 outColor;
void main() {
  if (vAlpha < 0.01) discard;
  outColor = linearToOutputTexel(vec4(vec3(0.92, 0.97, 1.0), vAlpha));
}
`

export interface FlowParticlesInit {
  renderer: THREE.WebGLRenderer
  nx: number
  ny: number
  dx: number
  frame: GridFrame
  frameTexture: THREE.DataTexture
  bedTexture: THREE.DataTexture
  /** Particles; rounded up to a multiple of 256. */
  count?: number
}

export class FlowParticles {
  readonly object: THREE.LineSegments
  private readonly renderer: THREE.WebGLRenderer
  private targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private readonly updateMat: THREE.ShaderMaterial
  private readonly drawMat: THREE.ShaderMaterial
  private readonly quadScene = new THREE.Scene()
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private seed = 0
  enabled = true

  constructor(o: FlowParticlesInit) {
    this.renderer = o.renderer
    const W = 256
    const H = Math.max(1, Math.ceil((o.count ?? 32768) / W))
    const init = new Float32Array(W * H * 4)
    for (let k = 0; k < W * H; k++) {
      init[k * 4] = Math.random() * o.nx * o.dx
      init[k * 4 + 1] = Math.random() * o.ny * o.dx
      init[k * 4 + 2] = Math.random() * 4 // staggered ages so they do not all respawn together
      init[k * 4 + 3] = 2 + Math.random() * 4
    }
    const opts = { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false }
    this.targets = [new THREE.WebGLRenderTarget(W, H, opts), new THREE.WebGLRenderTarget(W, H, opts)]
    const seedTex = new THREE.DataTexture(init, W, H, THREE.RGBAFormat, THREE.FloatType)
    seedTex.needsUpdate = true

    const grid = new THREE.Vector2(o.nx, o.ny)
    this.updateMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: UPDATE_VS,
      fragmentShader: UPDATE_FS,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPos: { value: seedTex },
        uFrame: { value: o.frameTexture },
        uGrid: { value: grid },
        uDx: { value: o.dx },
        uDt: { value: 0 },
        uScale: { value: 30 },
        uThreshold: { value: 0.05 },
        uSeed: { value: 0 },
      },
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.updateMat)
    quad.frustumCulled = false
    this.quadScene.add(quad)
    // Seed the first target from the random positions.
    this.step(0)
    seedTex.dispose()

    const ref = new Float32Array(W * H * 2 * 2)
    const end = new Float32Array(W * H * 2)
    for (let k = 0; k < W * H; k++) {
      const x = k % W
      const y = Math.floor(k / W)
      ref.set([x, y, x, y], k * 4)
      end[k * 2] = 0
      end[k * 2 + 1] = 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('aRef', new THREE.BufferAttribute(ref, 2))
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1))
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(W * H * 2 * 3), 3))
    this.drawMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DRAW_VS,
      fragmentShader: DRAW_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms: {
        uPos: { value: this.targets[0].texture },
        uFrame: { value: o.frameTexture },
        uBed: { value: o.bedTexture },
        uGrid: { value: grid },
        uDx: { value: o.dx },
        uTail: { value: 15 },
        uThreshold: { value: 0.05 },
      },
    })
    const lines = new THREE.LineSegments(g, this.drawMat)
    lines.name = 'flood-flow'
    lines.frustumCulled = false
    lines.renderOrder = 6
    lines.raycast = () => { /* the IFC keeps the clicks */ }
    lines.position.set(o.frame.originX, 0, o.frame.originZ)
    lines.rotation.y = o.frame.rotation
    this.object = lines
  }

  /** Advances the particles by dt wall seconds. */
  step(dt: number): void {
    const r = this.renderer
    const prev = r.getRenderTarget()
    const write = this.targets[1]
    this.updateMat.uniforms.uDt.value = Math.min(dt, 0.1)
    this.updateMat.uniforms.uSeed.value = (this.seed = (this.seed + 1) % 1000) * 0.618
    r.setRenderTarget(write)
    r.render(this.quadScene, this.quadCam)
    r.setRenderTarget(prev)
    this.targets = [write, this.targets[0]]
    this.updateMat.uniforms.uPos.value = this.targets[0].texture
    if (this.drawMat) this.drawMat.uniforms.uPos.value = this.targets[0].texture
  }

  setThreshold(m: number): void {
    this.updateMat.uniforms.uThreshold.value = m
    this.drawMat.uniforms.uThreshold.value = m
  }

  setVisible(v: boolean): void { this.object.visible = v }

  dispose(): void {
    this.object.removeFromParent()
    this.object.geometry.dispose()
    this.drawMat.dispose()
    this.updateMat.dispose()
    for (const t of this.targets) t.dispose()
    ;(this.quadScene.children[0] as THREE.Mesh).geometry.dispose()
  }
}
