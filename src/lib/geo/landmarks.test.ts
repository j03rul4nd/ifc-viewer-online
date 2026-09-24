// ─── landmarks tests ──────────────────────────────────────────────────────────
// A landmark is placed at the centroid its model was authored about, with no
// rotation and no scale beyond metres → normalized, standing on the ground.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { LANDMARKS, landmarksIn, buildLandmarkLayer, replacedFeatureIds } from './landmarks'
import { latLonToNormalized, metresToNormalized } from './geo-math'

describe('landmarks', () => {
  it('finds landmarks by the feature id the parser emits, and nothing else', () => {
    const found = landmarksIn([{ id: 'w135115868' }, { id: 'n1497569358' }, { id: 'w1' }, { id: 'r135115868-0' }])
    expect(found.map((l) => l.asset)).toEqual(['cascada-ciutadella', 'mamut'])
  })

  it('places each model at its authored origin, unrotated, in metres', () => {
    const geo = new THREE.BoxGeometry(10, 10, 10)
    const l = LANDMARKS[0]
    const group = buildLandmarkLayer([{ landmark: l, geometry: geo }], { anchorLat: l.origin.lat })!
    const mesh = group.children[0] as THREE.Mesh
    const at = latLonToNormalized(l.origin.lat, l.origin.lon)
    expect(mesh.position.x).toBeCloseTo(at.nx, 12)
    expect(mesh.position.y).toBeCloseTo(at.ny, 12)
    expect(mesh.quaternion.equals(new THREE.Quaternion())).toBe(true)
    expect(mesh.scale.x).toBeCloseTo(metresToNormalized(l.origin.lat), 15)
  })

  it('drops the terraces the Cascada model carries along with the Cascada itself', () => {
    const cascada = LANDMARKS.find((l) => l.asset === 'cascada-ciutadella')!
    expect([...replacedFeatureIds([cascada])].sort()).toEqual(['w135115868', 'w135115884'])
  })

  it('ships a model for every landmark', () => {
    // Lazy glob: only the file names are read, nothing is imported.
    const shipped = Object.keys(import.meta.glob('../../../public/models/landmarks/*.glb'))
      .map((p) => p.replace(/^.*\//, '').replace(/\.glb$/, ''))
    for (const l of LANDMARKS) expect(shipped).toContain(l.asset)
  })

  it('finds a building by its parts, when the parser stood its outline down', () => {
    // The Casa del Guarda's outline w672895475 never reaches the scene.
    expect(landmarksIn([{ id: 'w672896035' }]).map((l) => l.asset)).toEqual(['casa-del-guarda'])
  })

  it('keeps the park a point monument is keyed on', () => {
    const found = landmarksIn([{ id: 'w66713401' }])
    expect(found.map((l) => l.asset).sort()).toEqual(['portic-bugadera', 'turo-tres-creus'])
    expect(replacedFeatureIds(found).has('w66713401')).toBe(false)
  })

  it('finds a landmark nothing mapped stands for by the loaded area', () => {
    const at = LANDMARKS.find((l) => l.asset === 'torre-calatrava')!.origin
    const box = (lat: number, lon: number) => ({ south: lat - 0.005, north: lat + 0.005, west: lon - 0.005, east: lon + 0.005 })
    expect(landmarksIn([], box(at.lat, at.lon)).map((l) => l.asset)).toContain('torre-calatrava')
    expect(landmarksIn([], box(at.lat + 0.02, at.lon))).toEqual([])
  })

  it('places the twin Venetian towers from one model, each at its own centroid', () => {
    const twins = landmarksIn([{ id: 'w305825427' }, { id: 'w305825428' }])
    expect(twins.map((l) => l.asset)).toEqual(['torre-veneciana', 'torre-veneciana'])
    expect(twins[0].origin).not.toEqual(twins[1].origin)
  })

  it('replaces each mapped feature with at most one model', () => {
    const replaced = LANDMARKS.flatMap((l) => [...replacedFeatureIds([l])])
    expect(new Set(replaced).size).toBe(replaced.length)
    const placed = LANDMARKS.map((l) => `${l.asset}@${l.origin.lat},${l.origin.lon}`)
    expect(new Set(placed).size).toBe(placed.length)
  })
})
