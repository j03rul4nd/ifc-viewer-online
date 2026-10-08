// ─── aggregate-mesh ───────────────────────────────────────────────────────────
// Hex cells and heat images (aggregate.ts) as scene objects, laid on the
// ground. Shown instead of the individual points when the camera is far.

import * as THREE from 'three'
import { hexbin, heatGrid, hexCorners, type PlanSample } from './aggregate'
import type { Aggregation } from './style-groups'

/** Hex cells: one merged mesh, a colour per cell (vertex colours), optional extrusion by value. */
export function buildHexMesh(samples: PlanSample[], agg: Aggregation): THREE.Mesh | null {
  const cells = hexbin(samples, agg)
  if (cells.length === 0) return null
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  let maxV = 0
  for (const c of cells) maxV = Math.max(maxV, Math.abs(c.value))
  const gap = 0.92 // a hairline between cells keeps them readable as cells
  for (const c of cells) {
    const corners = hexCorners(c.cx, c.cz, agg.cellM * gap)
    const h = agg.extrudeM > 0 && maxV > 0 ? (Math.abs(c.value) / maxV) * agg.extrudeM : 0
    const y0 = c.y + 0.4, y1 = y0 + h
    // Ramp colours are sRGB; vertex colours are read as LINEAR — convert, or
    // every cell comes out a washed-out pastel of what the legend promises.
    const lin = new THREE.Color().setRGB(c.rgb[0] / 255, c.rgb[1] / 255, c.rgb[2] / 255, THREE.SRGBColorSpace)
    const [r, g, b] = [lin.r, lin.g, lin.b]
    const top = pos.length / 3
    // Top face: centre + 6 corners.
    pos.push(c.cx, y1, c.cz); col.push(r, g, b)
    for (const k of corners) { pos.push(k.x, y1, k.z); col.push(r, g, b) }
    for (let i = 0; i < 6; i++) idx.push(top, top + 1 + i, top + 1 + ((i + 1) % 6))
    if (h > 0) {
      // Walls, slightly darker.
      for (let i = 0; i < 6; i++) {
        const a = corners[i], bb = corners[(i + 1) % 6]
        const w = pos.length / 3
        pos.push(a.x, y0, a.z, bb.x, y0, bb.z, bb.x, y1, bb.z, a.x, y1, a.z)
        for (let k = 0; k < 4; k++) col.push(r * 0.7, g * 0.7, b * 0.7)
        idx.push(w, w + 1, w + 2, w, w + 2, w + 3)
      }
    }
  }
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geom.setIndex(idx)
  geom.computeVertexNormals()
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    // Data colours must read as chosen: no filmic tone mapping on a legend.
    vertexColors: true, toneMapped: false, transparent: agg.opacity < 1, opacity: agg.opacity, side: THREE.DoubleSide,
    depthWrite: agg.opacity >= 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }))
  mesh.name = 'vector-hexbin'
  mesh.userData.cells = cells.length
  // The legend's scale: what the colours actually span in this data.
  mesh.userData.range = cells.reduce(
    (r, c) => ({ min: Math.min(r.min, c.value), max: Math.max(r.max, c.value) }), { min: Infinity, max: -Infinity })
  return mesh
}

/** Heat image on a ground plane. */
export function buildHeatPlane(samples: PlanSample[], agg: Aggregation): THREE.Mesh | null {
  const g = heatGrid(samples, agg)
  if (!g) return null
  const tex = new THREE.DataTexture(g.rgba, g.width, g.height, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  const w = g.maxX - g.minX, d = g.maxZ - g.minZ
  // Plane in XZ; texture row 0 = minZ, so v runs along +z.
  const geom = new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    map: tex, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }))
  mesh.position.set(g.minX + w / 2, g.y + 0.3, g.minZ + d / 2)
  mesh.name = 'vector-heatmap'
  return mesh
}
