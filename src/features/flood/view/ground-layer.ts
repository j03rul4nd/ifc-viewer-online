// ─── simulation ground ────────────────────────────────────────────────────────
// The bed the solver runs on, drawn as a shaded surface. Only shown when the
// scene has no ground of its own there — an imported DEM or the demo plane
// with the map off; with IFC terrain or the map's relief the viewer already
// draws the ground and this would double it. Obstacle cells are left out (the
// buildings stand there).

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
  for (let q = 0; q < vh; q++) {
    for (let p = 0; p < vw; p++) {
      const c = rows[q] * nx + cols[p]
      const v = (q * vw + p) * 3
      pos[v] = (cols[p] + 0.5) * dx
      pos[v + 1] = o.bed[c]
      pos[v + 2] = -(rows[q] + 0.5) * dx
    }
  }
  const idx: number[] = []
  for (let q = 0; q < vh - 1; q++) {
    for (let p = 0; p < vw - 1; p++) {
      const a = q * vw + p
      const corners = [rows[q] * nx + cols[p], rows[q] * nx + cols[p + 1], rows[q + 1] * nx + cols[p], rows[q + 1] * nx + cols[p + 1]]
      if (corners.every((c) => o.blocked[c])) continue
      idx.push(a, a + 1, a + vw + 1, a, a + vw + 1, a + vw)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({ color: 0x9a968c, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  const mesh = new THREE.Mesh(g, mat)
  mesh.name = 'flood-ground'
  mesh.receiveShadow = true
  mesh.position.set(o.frame.originX, 0, o.frame.originZ)
  mesh.rotation.y = o.frame.rotation
  mesh.raycast = () => { /* the IFC keeps the clicks */ }
  return mesh
}
