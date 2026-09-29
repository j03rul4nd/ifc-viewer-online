// ─── section-system tests: what a BCF viewpoint reads and restores ───────────
// getActivePlanes() is what a viewpoint records, applyPlanes() what opening it
// puts back. The one property that matters: the SAME half-spaces are kept
// after the round trip — what was visible stays visible, what was cut stays
// cut — even though a box comes back as six loose face planes.

import { describe, it, expect, afterEach } from 'vitest'
import * as THREE from 'three'
import { createSectionSystem, type SectionCut, type SectionSystem } from './section-system'
import type { ScenePicker } from './picker'

// Scene box of a small building: 20 m east, 9 m up, 10 m north (scene −z).
const MODEL = new THREE.Box3(new THREE.Vector3(0, 0, -10), new THREE.Vector3(20, 9, 0))

let systems: SectionSystem[] = []
afterEach(() => { for (const s of systems) s.dispose(); systems = [] })

function makeSystem() {
  const registered = new Set<THREE.Plane>()
  const canvas = document.createElement('canvas')
  const container = document.createElement('div')
  container.appendChild(canvas)
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  camera.position.set(40, 25, 30)
  camera.lookAt(10, 4, -5)
  const system = createSectionSystem({
    scene: new THREE.Scene(),
    canvas,
    container,
    getCamera: () => camera,
    // Only face placement and handle hit-tests pick; neither runs here.
    picker: {} as ScenePicker,
    setPlane: (on, plane) => { if (on) registered.add(plane); else registered.delete(plane) },
    getSceneBounds: () => MODEL.clone(),
    getSelectionBounds: async () => null,
    setControlsEnabled: () => {},
    planesChanged: () => {},
    setPoche: () => {},
    lookAt: () => {},
    aim: (e) => ({ x: e.clientX, y: e.clientY }),
    isPointerBusy: () => false,
  })
  systems.push(system)
  return { system, registered }
}

/** Is `p` visible through every registered plane (the renderer's rule)? */
function kept(registered: Set<THREE.Plane>, p: THREE.Vector3): boolean {
  return [...registered].every((plane) => plane.distanceToPoint(p) >= 0)
}

/** Probe points inside, on the edges of and outside the model. */
function probes(): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (const x of [-1, 0.5, 10, 19.5, 21]) for (const y of [-1, 0.5, 4.5, 8.5, 10]) for (const z of [-11, -9.5, -5, -0.5, 1]) {
    out.push(new THREE.Vector3(x, y, z))
  }
  return out
}

function onPlane(cut: SectionCut): number {
  const n = cut.normal
  const p = cut.point
  return n.x * p.x + n.y * p.y + n.z * p.z
}

describe('section system ↔ BCF viewpoint planes', () => {
  it('reports nothing when nothing is cut', () => {
    const { system } = makeSystem()
    expect(system.getActivePlanes()).toEqual([])
  })

  it('reports a plan cut as the half-space it keeps, at the model', () => {
    const { system } = makeSystem()
    const id = system.addAxisPlane('z')!
    system.setOffset(id, 3, true)
    const [cut] = system.getActivePlanes()
    // A plan keeps what is below: the kept normal points down.
    expect(cut.normal.x).toBeCloseTo(0)
    expect(cut.normal.y).toBeCloseTo(-1)
    expect(cut.normal.z).toBeCloseTo(0)
    // On the plane, over the middle of the model rather than the world origin.
    expect(cut.point).toEqual({ x: 10, y: 3, z: -5 })

    system.setEnabled(id, false)
    expect(system.getActivePlanes()).toEqual([])
  })

  it('a box comes back as six face planes that keep exactly the same space', () => {
    const { system, registered } = makeSystem()
    return system.enableBox('model').then((ok) => {
      expect(ok).toBe(true)
      system.setBoxRange('x', { min: 4, max: 12 }, true)
      system.setBoxRange('z', { min: 1, max: 6 }, true)
      const before = system.getActivePlanes()
      expect(before).toHaveLength(6)
      const visibleBefore = probes().map((p) => kept(registered, p))
      expect(visibleBefore.some(Boolean)).toBe(true)
      expect(visibleBefore.some((v) => !v)).toBe(true)

      system.applyPlanes(before)

      const snap = system.getSnapshot()
      expect(snap.box).toBeNull()
      expect(snap.planes).toHaveLength(6)
      expect(snap.planes.every((p) => p.kind === 'face' && p.enabled && !p.flipped)).toBe(true)
      expect(snap.active).toBe(6)
      expect(registered.size).toBe(6)
      expect(probes().map((p) => kept(registered, p))).toEqual(visibleBefore)

      // And they read back as the same planes.
      const after = system.getActivePlanes()
      for (let i = 0; i < 6; i++) {
        expect(after[i].normal.x).toBeCloseTo(before[i].normal.x, 9)
        expect(after[i].normal.y).toBeCloseTo(before[i].normal.y, 9)
        expect(after[i].normal.z).toBeCloseTo(before[i].normal.z, 9)
        expect(onPlane(after[i])).toBeCloseTo(onPlane(before[i]), 9)
      }
    })
  })

  it('restored planes stay usable in the panel: a slider across the model, flip, remove', () => {
    const { system, registered } = makeSystem()
    system.applyPlanes([{ point: { x: 10, y: 3, z: -5 }, normal: { x: 0, y: -1, z: 0 } }])
    const [info] = system.getSnapshot().planes
    // Offset is along the kept normal; the model spans y 0..9, so −6..3 (padded).
    expect(info.offset).toBe(0)
    expect(info.range.min).toBeLessThan(-5.9)
    expect(info.range.max).toBeGreaterThan(2.9)
    expect(info.step).toBeGreaterThan(0)

    system.flip(info.id)
    expect(system.getActivePlanes()[0].normal.y).toBeCloseTo(1)
    system.remove(info.id)
    expect(registered.size).toBe(0)
  })

  it('replaces what was there, normalises normals, skips degenerate cuts, and [] clears', () => {
    const { system, registered } = makeSystem()
    system.addAxisPlane('x')
    system.applyPlanes([
      { point: { x: 0, y: 3, z: 0 }, normal: { x: 0, y: -2, z: 0 } },
      { point: { x: 0, y: 3, z: 0 }, normal: { x: 0, y: 0, z: 0 } },
      { point: { x: Number.NaN, y: 0, z: 0 }, normal: { x: 1, y: 0, z: 0 } },
    ])
    expect(system.getSnapshot().planes).toHaveLength(1)
    const [cut] = system.getActivePlanes()
    expect(Math.hypot(cut.normal.x, cut.normal.y, cut.normal.z)).toBeCloseTo(1, 12)
    expect(onPlane(cut)).toBeCloseTo(-3, 9)

    system.applyPlanes([])
    expect(system.getSnapshot().planes).toHaveLength(0)
    expect(system.getSnapshot().active).toBe(0)
    expect(registered.size).toBe(0)
  })
})
