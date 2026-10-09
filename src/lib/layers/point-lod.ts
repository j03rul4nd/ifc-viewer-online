// ─── point-lod ────────────────────────────────────────────────────────────────
// Points the way a web map draws them: by distance to the camera.
//
//   d < detailM   full symbol + text label (and the 3D model, if the group has one)
//   d < iconM     the symbol alone
//   d < dotM      a small dot in the group's colour
//   farther       nothing
//
// Each group of identical symbols is built ONCE in all its representations;
// `updatePointLod` only flips visibility (and refills the dot buffer) when a
// point crosses a band. 10 000 distance checks per frame is ~0.1 ms; nothing is
// rebuilt while the camera moves.

import * as THREE from 'three'
import type { IconId } from './symbology'
import type { PointStyle, ZoomBands } from './style-groups'

export interface PointInput {
  pos: THREE.Vector3
  feature: number
  label: string | null
}

export interface PointGroupInput {
  style: PointStyle
  points: PointInput[]
}

export interface LodContext {
  iconTexture?: (icon: IconId, color: string) => THREE.Texture | null
  assets?: Map<string, THREE.Object3D>
}

type Band = 0 | 1 | 2 | 3 // detail, icon, dot, hidden

interface LodState {
  points: PointInput[]
  bands: Uint8Array
  /** One object per point for icons / models (null for instanced primitives). */
  objects: Array<THREE.Object3D | null>
  /** Instanced primitives: base matrices, for hiding by zero-scale. */
  inst: { mesh: THREE.InstancedMesh; base: Float32Array } | null
  /**
   * Label sprites, made on first need: a label only shows in the detail band,
   * and building thousands up front made every live refresh of a large layer
   * stall (10 000 named points: ~1 s). `makeLabel` builds one when its point
   * first comes close.
   */
  labels: Array<THREE.Sprite | null | undefined>
  makeLabel: (i: number) => THREE.Sprite | null
  dots: THREE.Points
  /** Model groups swap to their icon beyond detailM (a 3D model at 2 km is noise). */
  modelFallback: Array<THREE.Object3D | null>
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

/** Icon size (UI units) → screen pixels. Size 4 ≈ 28 px. */
export function iconPixels(size: number): number {
  return Math.min(96, Math.max(14, size * 6 + 4))
}

/**
 * Keep a non-attenuated sprite at a fixed pixel size: its scale lives in clip
 * space, so it depends on viewport height and projection. Per frame, so
 * resizes and orthographic zooms never leave it stale.
 */
export function pinToPixels(sp: THREE.Sprite, pxH: number, aspect = 1): void {
  sp.onBeforeRender = (renderer, _scene, camera) => {
    const el = (renderer as unknown as { domElement?: HTMLCanvasElement }).domElement
    const h = el?.clientHeight || 600
    const p11 = camera.projectionMatrix.elements[5] || 1
    const k = (2 * pxH) / (h * p11)
    sp.scale.set(k * aspect, k, 1)
  }
}

// ── Dots ───────────────────────────────────────────────────────────────────────

let dotTex: THREE.Texture | null | undefined
/** A soft round sprite for Points — GL points are squares otherwise. */
function roundDot(): THREE.Texture | null {
  if (dotTex !== undefined) return dotTex
  dotTex = null
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath(); ctx.arc(16, 16, 13, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.stroke()
      dotTex = new THREE.CanvasTexture(c)
    }
  } catch { /* headless */ }
  return dotTex
}

// ── Labels ─────────────────────────────────────────────────────────────────────

const labelCache = new Map<string, { tex: THREE.Texture; aspect: number } | null>()

function labelTexture(text: string, color: string): { tex: THREE.Texture; aspect: number } | null {
  const key = `${color}|${text}`
  if (labelCache.has(key)) return labelCache.get(key) ?? null
  let out: { tex: THREE.Texture; aspect: number } | null = null
  try {
    const font = '600 26px system-ui, -apple-system, "Segoe UI", sans-serif'
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (ctx) {
      ctx.font = font
      const w = Math.min(560, Math.ceil(ctx.measureText(text).width) + 24)
      c.width = w; c.height = 40
      ctx.font = font
      // A dark pill with a coloured edge: legible on satellite AND on a white model.
      ctx.fillStyle = 'rgba(16,18,24,0.82)'
      ctx.beginPath()
      ctx.roundRect?.(1, 1, w - 2, 38, 12)
      ctx.fill()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 12, 21, w - 24)
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      out = { tex, aspect: w / 40 }
    }
  } catch { /* headless */ }
  labelCache.set(key, out)
  return out
}

// ── Build ──────────────────────────────────────────────────────────────────────

const primitiveGeometry = (shape: string, size: number): THREE.BufferGeometry => {
  switch (shape) {
    case 'cube': return new THREE.BoxGeometry(size, size, size).translate(0, size / 2, 0)
    case 'cylinder': return new THREE.CylinderGeometry(size * 0.3, size * 0.3, size, 16).translate(0, size / 2, 0)
    case 'cone': return new THREE.ConeGeometry(size * 0.4, size, 16).translate(0, size / 2, 0)
    case 'pin': return new THREE.ConeGeometry(size * 0.25, size, 16).rotateX(Math.PI).translate(0, size / 2, 0)
    default: return new THREE.SphereGeometry(size / 2, 14, 10).translate(0, size / 2, 0)
  }
}

function iconMaterial(tex: THREE.Texture): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map: tex, transparent: true, sizeAttenuation: false, toneMapped: false })
}

/** `mat` is shared by every icon of a group: one material, not one per point. */
function iconSprite(mat: THREE.SpriteMaterial, px: number): THREE.Sprite {
  const sp = new THREE.Sprite(mat)
  sp.center.set(0.5, 0)
  sp.scale.set(px / 600, px / 600, 1)
  pinToPixels(sp, px)
  return sp
}

/**
 * Build one group of identically-styled points in all its representations.
 * The returned object carries its LOD state; call `updatePointLod` per frame.
 */
export function buildPointLodGroup(input: PointGroupInput, ctx: LodContext): THREE.Group | null {
  const { style, points } = input
  if (points.length === 0) return null
  const holder = new THREE.Group()
  holder.name = 'vector-points-lod'
  holder.userData.isPointGroup = true
  const color = new THREE.Color(style.color)
  const px = iconPixels(style.size)
  const objects: Array<THREE.Object3D | null> = points.map(() => null)
  const modelFallback: Array<THREE.Object3D | null> = points.map(() => null)
  let inst: LodState['inst'] = null
  const s = style.symbol

  const iconTex = s.kind === 'icon' ? ctx.iconTexture?.(s.icon, style.color) ?? null : null
  const template = s.kind === 'model' ? ctx.assets?.get(s.assetId) ?? null : null

  if (iconTex) {
    const mat = iconMaterial(iconTex)
    points.forEach((p, i) => {
      const sp = iconSprite(mat, px)
      sp.position.set(p.pos.x, p.pos.y + 0.3, p.pos.z)
      sp.userData.feature = p.feature
      holder.add(sp)
      objects[i] = sp
    })
  } else if (template) {
    const box = new THREE.Box3().setFromObject(template)
    const size = box.getSize(new THREE.Vector3())
    const k = style.size / Math.max(1e-6, size.x, size.y, size.z)
    // Beyond detailM a model reads as a pin: an icon stand-in, same colour.
    const pinTex = ctx.iconTexture?.('pin', style.color) ?? null
    const pinMat = pinTex ? iconMaterial(pinTex) : null
    points.forEach((p, i) => {
      const c = template.clone(true)
      c.scale.setScalar(k)
      c.position.set(p.pos.x - (box.min.x + size.x / 2) * k, p.pos.y - box.min.y * k, p.pos.z - (box.min.z + size.z / 2) * k)
      c.userData.feature = p.feature
      c.userData.sharedAsset = true
      holder.add(c)
      objects[i] = c
      if (pinMat) {
        const sp = iconSprite(pinMat, px)
        sp.position.set(p.pos.x, p.pos.y + 0.3, p.pos.z)
        sp.userData.feature = p.feature
        holder.add(sp)
        modelFallback[i] = sp
      }
    })
  } else {
    const shape = s.kind === 'primitive' ? s.shape : s.kind === 'icon' ? 'pin' : 'cube'
    const mesh = new THREE.InstancedMesh(primitiveGeometry(shape, style.size), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), points.length)
    const m = new THREE.Matrix4()
    points.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.pos.x, p.pos.y, p.pos.z)))
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.userData.instanceFeature = Int32Array.from(points.map((p) => p.feature))
    mesh.name = 'vector-points'
    holder.add(mesh)
    inst = { mesh, base: Float32Array.from(mesh.instanceMatrix.array as Float32Array) }
  }

  // Labels, only where there is something to say — and only once needed.
  const labels: Array<THREE.Sprite | null | undefined> = points.map((p) => (p.label ? undefined : null))
  const makeLabel = (i: number): THREE.Sprite | null => {
    const p = points[i]
    const lt = p.label ? labelTexture(p.label, style.color) : null
    if (!lt) return null
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt.tex, transparent: true, sizeAttenuation: false, depthTest: false, toneMapped: false }))
    // Sits just above the icon: center below the sprite by (icon / label height).
    sp.center.set(0.5, -(px + 4) / 20)
    pinToPixels(sp, 20, lt.aspect)
    sp.position.set(p.pos.x, p.pos.y + 0.3, p.pos.z)
    sp.renderOrder = 10
    sp.visible = false
    sp.userData.feature = p.feature
    holder.add(sp)
    return sp
  }

  // Dots: one Points draw for the whole group, refilled when membership changes.
  const dotGeom = new THREE.BufferGeometry()
  dotGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(points.length * 3), 3))
  dotGeom.setDrawRange(0, 0)
  const dotMap = roundDot()
  const dots = new THREE.Points(dotGeom, new THREE.PointsMaterial({
    color, size: Math.max(6, Math.round(px / 3)), sizeAttenuation: false, depthWrite: false, toneMapped: false,
    ...(dotMap ? { map: dotMap, transparent: true, alphaTest: 0.4 } : {}),
  }))
  dots.frustumCulled = false
  dots.name = 'vector-dots'
  holder.add(dots)

  const state: LodState = {
    points, bands: new Uint8Array(points.length).fill(255), objects, inst, labels, makeLabel, dots, modelFallback,
  }
  holder.userData.lod = state
  return holder
}

/**
 * Apply zoom bands for the current camera. Returns true when anything changed.
 * `suppress` hides every band (an aggregate is showing instead).
 */
export function updatePointLod(holder: THREE.Object3D, cam: THREE.Vector3, bands: ZoomBands, suppress = false): boolean {
  const st = holder.userData.lod as LodState | undefined
  if (!st) return false
  let changed = false
  let dotsDirty = false
  const d2 = [bands.detailM ** 2, bands.iconM ** 2, bands.dotM ** 2]
  for (let i = 0; i < st.points.length; i++) {
    const p = st.points[i].pos
    const dd = (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2
    const band: Band = suppress ? 3 : dd < d2[0] ? 0 : dd < d2[1] ? 1 : dd < d2[2] ? 2 : 3
    if (band === st.bands[i]) continue
    const was = st.bands[i]
    st.bands[i] = band
    changed = true
    if ((was === 2) !== (band === 2)) dotsDirty = true
    const showSymbol = band <= 1
    const obj = st.objects[i]
    const fallback = st.modelFallback[i]
    if (obj) obj.visible = fallback ? band === 0 : showSymbol
    if (fallback) fallback.visible = band === 1
    if (st.inst) st.inst.mesh.setMatrixAt(i, showSymbol
      ? new THREE.Matrix4().fromArray(st.inst.base, i * 16)
      : ZERO)
    let label = st.labels[i]
    if (label === undefined && band === 0) label = st.labels[i] = st.makeLabel(i)
    if (label) label.visible = band === 0
  }
  if (changed && st.inst) st.inst.mesh.instanceMatrix.needsUpdate = true
  if (dotsDirty) {
    const attr = st.dots.geometry.getAttribute('position') as THREE.BufferAttribute
    let n = 0
    for (let i = 0; i < st.points.length; i++) {
      if (st.bands[i] !== 2) continue
      const p = st.points[i].pos
      attr.setXYZ(n++, p.x, p.y + 0.5, p.z)
    }
    attr.needsUpdate = true
    st.dots.geometry.setDrawRange(0, n)
    st.dots.geometry.computeBoundingSphere()
  }
  return changed
}

/** Which band each feature of a group is in now (tests, and picking rules). */
export function lodBands(holder: THREE.Object3D): Uint8Array | null {
  return (holder.userData.lod as LodState | undefined)?.bands ?? null
}
