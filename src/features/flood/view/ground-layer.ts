// ─── simulation ground ────────────────────────────────────────────────────────
// The bed the solver runs on, drawn as a shaded surface. Only shown when the
// scene has no ground of its own there — an imported DEM, the demo plane with
// the map off, or the map's relief raised to the model's ground floor
// (GroundFit); otherwise the viewer already draws the ground and this would
// double it.
//
// Obstacle cells are drawn too, darker: footprints the water goes around. A
// hole there showed whatever lay below — on a raised ground, the map a couple
// of metres down, as white jagged blocks — and the water seemed to avoid
// nothing at all where OpenStreetMap had a building the view does not draw.

import * as THREE from 'three'
import type { GridFrame } from '../core/grid'

export interface GroundLayerInit {
  nx: number
  ny: number
  dx: number
  frame: GridFrame
  /** Scene Y of the bed per cell. */
  bed: Float32Array
  blocked: Uint8Array
  maxSide?: number
}

export function createGroundLayer(o: GroundLayerInit): THREE.Mesh {
  const { nx, ny, dx } = o
  const side = o.maxSide ?? 512
  const step = Math.max(1, Math.ceil(Math.max(nx, ny) / side))
  const cols: number[] = []
  for (let i = 0; i < nx; i += step) cols.push(i)
  if (cols[cols.length - 1] !== nx - 1) cols.push(nx - 1)
  const rows: number[] = []
  for (let j = 0; j < ny; j += step) rows.push(j)
  if (rows[rows.length - 1] !== ny - 1) rows.push(ny - 1)
  const vw = cols.length
  const vh = rows.length
  const pos = new Float32Array(vw * vh * 3)
  const col = new Float32Array(vw * vh * 3)
  const ground = new THREE.Color(0xb3ada1)
  const footprint = new THREE.Color(0x77726a)
  for (let q = 0; q < vh; q++) {
    for (let p = 0; p < vw; p++) {
      const c = rows[q] * nx + cols[p]
      const v = (q * vw + p) * 3
      pos[v] = (cols[p] + 0.5) * dx
      pos[v + 1] = o.bed[c]
      pos[v + 2] = -(rows[q] + 0.5) * dx
      const k = o.blocked[c] ? footprint : ground
      col[v] = k.r; col[v + 1] = k.g; col[v + 2] = k.b
    }
  }
  const idx: number[] = []
  for (let q = 0; q < vh - 1; q++) {
    for (let p = 0; p < vw - 1; p++) {
      const a = q * vw + p
      idx.push(a, a + 1, a + vw + 1, a, a + vw + 1, a + vw)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const mesh = new THREE.Mesh(g, mat)
  mesh.name = 'flood-ground'
  mesh.receiveShadow = true
  mesh.position.set(o.frame.originX, 0, o.frame.originZ)
  mesh.rotation.y = o.frame.rotation
  mesh.raycast = () => { /* the IFC keeps the clicks */ }
  return mesh
}
