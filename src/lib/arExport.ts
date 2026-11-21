// ─── AR export: a phone-sized GLB / USDZ of a loaded model ─────────────────────
// For "View in your space" (Android Scene Viewer / WebXR take GLB, iOS Quick
// Look takes USDZ). A plain GLB export keeps every part as its own mesh, which
// a phone's AR runtime chokes on long before the triangle count does. This:
//  - keeps only what is visible and drops spaces, openings and other virtual
//    elements (they are boxes of air that would hide the real model),
//  - merges every part that shares a material into ONE mesh,
//  - optionally caps the triangle count by leaving out the smallest parts,
//  - places the model's base centre at the origin, y-up, in metres (what both
//    AR viewers expect: the model then stands on the floor where you tap).
// Everything runs in the visitor's browser; nothing is uploaded.

import type * as THREE_NS from 'three'

type Three = typeof THREE_NS

/** IFC classes that are not physical: never part of an AR model. */
export const AR_EXCLUDED_CATEGORIES: RegExp[] = [
  /^IFCSPACE$/i, /^IFCOPENINGELEMENT$/i, /^IFCOPENINGSTANDARDCASE$/i, /^IFCVIRTUALELEMENT$/i,
  /^IFCANNOTATION$/i, /^IFCGRID$/i, /^IFCSPATIALZONE$/i, /^IFCSITE$/i,
]

/** The excluded classes, with IfcSite (terrain) kept when asked. */
export function excludedCategories(includeSite = false): RegExp[] {
  return includeSite ? AR_EXCLUDED_CATEGORIES.filter((r) => !r.test('IFCSITE')) : AR_EXCLUDED_CATEGORIES
}

export interface ArOptions {
  /** Leave out the smallest parts until the model is at most this many triangles. 0/undefined = no cap. */
  maxTriangles?: number
  /** Multiplier to metres, when the scene is not already in metres. Default 1. */
  unitScale?: number
  /** Keep IfcSite geometry (terrain). Default false: the building stands on the real floor. */
  includeSite?: boolean
}

export interface ArStats {
  meshes: number
  triangles: number
  droppedParts: number
}

/** One part before merging: its baked geometry, material and size. */
export interface ArPart {
  geometry: THREE_NS.BufferGeometry
  material: THREE_NS.Material
  materialKey: string
}

export function triangleCount(g: THREE_NS.BufferGeometry): number {
  const n = g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)
  return Math.floor(n / 3)
}

/**
 * Which parts survive a triangle cap: the largest first (by bounding-box
 * diagonal), as many as fit. Returns kept indices in their original order.
 * Pure, so a cap is testable without geometry.
 */
export function pickParts(parts: Array<{ triangles: number; size: number }>, cap?: number): number[] {
  const all = parts.map((_, i) => i)
  if (!cap || cap <= 0) return all
  const total = parts.reduce((s, p) => s + p.triangles, 0)
  if (total <= cap) return all
  const order = [...all].sort((a, b) => parts[b].size - parts[a].size || a - b)
  const kept: number[] = []
  let used = 0
  for (const i of order) {
    if (used + parts[i].triangles > cap) continue
    kept.push(i)
    used += parts[i].triangles
  }
  return kept.sort((a, b) => a - b)
}

/** Only position + float normal + uint32 index: the shape mergeGeometries needs from every input. */
function normalise(THREE: Three, src: THREE_NS.BufferGeometry, matrix: THREE_NS.Matrix4 | null): THREE_NS.BufferGeometry {
  const pos = src.getAttribute('position')
  const g = new THREE.BufferGeometry()
  const p = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i) }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  const nrm = src.getAttribute('normal')
  if (nrm && nrm.count === pos.count) {
    const n = new Float32Array(nrm.count * 3)
    // getX() undoes `normalized` int16 storage.
    for (let i = 0; i < nrm.count; i++) { n[i * 3] = nrm.getX(i); n[i * 3 + 1] = nrm.getY(i); n[i * 3 + 2] = nrm.getZ(i) }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3))
  }
  const idx = src.index
  const ix = new Uint32Array(idx ? idx.count : pos.count)
  for (let i = 0; i < ix.length; i++) ix[i] = idx ? idx.getX(i) : i
  g.setIndex(new THREE.BufferAttribute(ix, 1))
  if (!g.getAttribute('normal')) g.computeVertexNormals()
  if (matrix) g.applyMatrix4(matrix)
  return g
}

function materialKeyOf(m: THREE_NS.Material): string {
  const c = (m as { color?: THREE_NS.Color }).color
  return `${c ? c.getHexString() : 'none'}|${m.opacity ?? 1}|${m.transparent ? 1 : 0}`
}

/** An AR-friendly material (both exporters understand MeshStandardMaterial). */
function arMaterial(THREE: Three, color: THREE_NS.Color | null, opacity: number, transparent: boolean): THREE_NS.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: color ? color.clone() : new THREE.Color(0xb8b8b8),
    opacity, transparent: transparent && opacity < 1, roughness: 0.8, metalness: 0,
    side: THREE.DoubleSide,
  })
}

/**
 * Parts of a scene subtree that has readable geometry: visible meshes only
 * (a hidden parent hides its children), world transform baked in, and parts
 * whose `userData.ifcType` is a non-physical class left out.
 */
export function partsFromObject(THREE: Three, root: THREE_NS.Object3D, includeSite = false): ArPart[] {
  const excluded = excludedCategories(includeSite)
  root.updateWorldMatrix(true, true)
  const out: ArPart[] = []
  const walk = (node: THREE_NS.Object3D) => {
    if (!node.visible) return
    const type = String((node.userData as { ifcType?: string })?.ifcType ?? '')
    if (type && excluded.some((r) => r.test(type))) return
    const mesh = node as THREE_NS.Mesh
    if (mesh.isMesh && mesh.geometry?.getAttribute('position')) {
      const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      const col = (src as { color?: THREE_NS.Color })?.color ?? null
      const mat = arMaterial(THREE, col, src?.opacity ?? 1, !!src?.transparent)
      out.push({ geometry: normalise(THREE, mesh.geometry, mesh.matrixWorld), material: mat, materialKey: materialKeyOf(mat) })
    }
    for (const c of node.children) walk(c)
  }
  walk(root)
  return out
}

/** The subset of a ThatOpen FragmentsModel this module uses. All optional ones are feature-detected. */
export interface FragmentsLike {
  getLocalIds(): Promise<number[]>
  getItemsGeometry(localIds: number[]): Promise<Array<Array<{
    transform?: THREE_NS.Matrix4
    positions?: Float32Array | Float64Array
    normals?: Int16Array | Float32Array
    indices?: Uint8Array | Uint16Array | Uint32Array
  }>>>
  getItemsOfCategories?(categories: RegExp[]): Promise<Record<string, number[]>>
  getItemsByVisibility?(visible: boolean): Promise<number[]>
  getItemsMaterialDefinition?(localIds: number[]): Promise<Array<{
    definition: { color: THREE_NS.Color; opacity: number; transparent: boolean }
    localIds: number[]
  }>>
}

/** Parts of a fragments model (geometry read back from the library), filtered and grouped by material. */
export async function partsFromFragments(THREE: Three, model: FragmentsLike, placement: THREE_NS.Matrix4 | null, includeSite = false): Promise<ArPart[]> {
  let ids = await model.getLocalIds()
  if (model.getItemsByVisibility) {
    try {
      const hidden = new Set(await model.getItemsByVisibility(false))
      if (hidden.size) ids = ids.filter((i) => !hidden.has(i))
    } catch { /* older library: keep all */ }
  }
  if (model.getItemsOfCategories) {
    try {
      const byCat = await model.getItemsOfCategories(excludedCategories(includeSite))
      const drop = new Set(Object.values(byCat).flat())
      if (drop.size) ids = ids.filter((i) => !drop.has(i))
    } catch { /* keep all */ }
  }
  if (!ids.length) throw new Error('The model has nothing visible to place in AR')

  let groups: Array<{ material: THREE_NS.MeshStandardMaterial; ids: number[] }> = []
  if (model.getItemsMaterialDefinition) {
    try {
      const defs = await model.getItemsMaterialDefinition(ids)
      const wanted = new Set(ids)
      groups = defs.map((d) => ({
        material: arMaterial(THREE, d.definition.color ?? null, d.definition.opacity ?? 1, !!d.definition.transparent),
        ids: d.localIds.filter((i) => wanted.has(i)),
      })).filter((g) => g.ids.length)
    } catch { groups = [] }
  }
  if (!groups.length) groups = [{ material: arMaterial(THREE, null, 1, false), ids }]

  const out: ArPart[] = []
  const BATCH = 500
  for (const g of groups) {
    const key = materialKeyOf(g.material)
    for (let i = 0; i < g.ids.length; i += BATCH) {
      const batch = await model.getItemsGeometry(g.ids.slice(i, i + BATCH))
      for (const item of batch) for (const part of item) {
        if (!part?.positions || part.positions.length === 0) continue
        const src = new THREE.BufferGeometry()
        src.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(part.positions), 3))
        if (part.normals && part.normals.length === part.positions.length) {
          src.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3, part.normals instanceof Int16Array))
        }
        if (part.indices) src.setIndex(new THREE.BufferAttribute(part.indices, 1))
        const m = new THREE.Matrix4()
        if (part.transform) m.copy(part.transform)
        if (placement) m.premultiply(placement)
        out.push({ geometry: normalise(THREE, src, m), material: g.material, materialKey: key })
        src.dispose()
      }
    }
  }
  if (!out.length) throw new Error('No geometry could be read from the model')
  return out
}

/**
 * Parts → one mesh per material, capped, in metres, base centre at the origin.
 * Disposes the input geometries.
 */
export async function buildArGroup(THREE: Three, parts: ArPart[], opts: ArOptions = {}): Promise<{ group: THREE_NS.Group; stats: ArStats }> {
  const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js')
  // Whatever does not end up in the returned group is released here, on success or failure.
  const usedGeoms = new Set<THREE_NS.BufferGeometry>()
  const usedMats = new Set<THREE_NS.Material>()
  let ok = false
  const group = new THREE.Group()
  try {
  const sizes = parts.map((p) => {
    p.geometry.computeBoundingBox()
    const b = p.geometry.boundingBox!
    return { triangles: triangleCount(p.geometry), size: b.min.distanceTo(b.max) }
  })
  const kept = new Set(pickParts(sizes, opts.maxTriangles))
  const byKey = new Map<string, { material: THREE_NS.Material; geoms: THREE_NS.BufferGeometry[] }>()
  parts.forEach((p, i) => {
    if (!kept.has(i)) return
    const e = byKey.get(p.materialKey) ?? { material: p.material, geoms: [] }
    e.geoms.push(p.geometry)
    byKey.set(p.materialKey, e)
  })
  group.name = 'ar-model'
  let triangles = 0
  for (const [key, e] of byKey) {
    const merged = e.geoms.length === 1 ? e.geoms[0] : mergeGeometries(e.geoms, false)
    if (!merged) continue
    usedGeoms.add(merged)
    usedMats.add(e.material)
    triangles += triangleCount(merged)
    const mesh = new THREE.Mesh(merged, e.material)
    mesh.name = `material-${key.split('|')[0]}`
    group.add(mesh)
  }
  if (!group.children.length) throw new Error('No geometry could be read from the model')

  const scale = opts.unitScale && opts.unitScale > 0 ? opts.unitScale : 1
  const box = new THREE.Box3()
  for (const c of group.children) { const g = (c as THREE_NS.Mesh).geometry; g.computeBoundingBox(); box.union(g.boundingBox!) }
  const cx = (box.min.x + box.max.x) / 2
  const cz = (box.min.z + box.max.z) / 2
  // Baked into the vertices: some AR viewers ignore node transforms on load.
  const m = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-cx, -box.min.y, -cz))
  for (const c of group.children) { const g = (c as THREE_NS.Mesh).geometry; g.applyMatrix4(m); g.computeBoundingBox(); g.computeBoundingSphere() }
  ok = true
  return { group, stats: { meshes: group.children.length, triangles, droppedParts: parts.length - kept.size } }
  } finally {
    for (const p of parts) {
      if (!ok || !usedGeoms.has(p.geometry)) p.geometry.dispose()
      if (!ok || !usedMats.has(p.material)) p.material.dispose()
    }
    if (!ok) disposeGroup(group)
  }
}

export function disposeGroup(group: THREE_NS.Object3D): void {
  group.traverse((n) => {
    const mesh = n as THREE_NS.Mesh
    mesh.geometry?.dispose?.()
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const mt of mats) mt.dispose()
  })
}

/** True when every vertex in a subtree is readable on the CPU (see exportAsGlb in diffStore). */
function readable(obj: THREE_NS.Object3D): boolean {
  let found = false
  let freed = false
  obj.traverse((node) => {
    const geometry = (node as { geometry?: { attributes?: Record<string, { array?: unknown }> } }).geometry
    for (const a of Object.values(geometry?.attributes ?? {})) { if (a.array) found = true; else freed = true }
  })
  return found && !freed
}

/**
 * The AR model of a loaded model as a GLB or USDZ Blob. `obj` is the model in
 * the scene; `fragmentsModel` is used when the scene keeps geometry on the GPU.
 */
export async function exportForAr(
  obj: THREE_NS.Object3D,
  fragmentsModel: unknown,
  format: 'glb' | 'usdz',
  opts: ArOptions = {},
): Promise<{ blob: Blob; stats: ArStats }> {
  const THREE = await import('three')
  let parts: ArPart[]
  if (readable(obj)) parts = partsFromObject(THREE, obj, opts.includeSite)
  else {
    const model = fragmentsModel as FragmentsLike | undefined
    if (!model?.getItemsGeometry || !model?.getLocalIds) throw new Error('This model keeps its geometry on the GPU, and no source was supplied to read it back from.')
    obj.updateWorldMatrix(true, false)
    parts = await partsFromFragments(THREE, model, obj.matrixWorld, opts.includeSite)
  }
  const { group, stats } = await buildArGroup(THREE, parts, opts)
  try {
    if (format === 'usdz') {
      const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js')
      const bytes = await new USDZExporter().parseAsync(group)
      return { blob: new Blob([bytes as BlobPart], { type: 'model/vnd.usdz+zip' }), stats }
    }
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
    const result = await new GLTFExporter().parseAsync(group, { binary: true })
    if (!(result instanceof ArrayBuffer)) throw new Error('GLTFExporter returned JSON, expected binary')
    return { blob: new Blob([result], { type: 'model/gltf-binary' }), stats }
  } finally {
    disposeGroup(group)
  }
}
