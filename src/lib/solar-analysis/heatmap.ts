// ─── heatmap ──────────────────────────────────────────────────────────────────
// The result on the model: one small tile per sensor, lying on its surface and
// coloured by the metric — a continuous map on the ground and on the façades,
// the way Ladybug draws a sensor grid. Unlit, so the colour IS the value.

import * as THREE from 'three'
import type { SensorSet, SensorKind } from './sensors'
import { SENSOR_KINDS } from './sensors'
import { rampColor } from './results'

export interface Heatmap {
  object: THREE.InstancedMesh
  /** Recolour from per-sensor values, on [min, max]. */
  setValues(values: ArrayLike<number>, min: number, max: number): void
  /** Show only some kinds (ground, façades, windows, roofs), and never a buried sensor (`open[i] === 0`). */
  setKinds(kinds: ReadonlySet<SensorKind>, open?: Uint8Array): void
  /** Sensor index under an instance id (instances are sensors, one to one). */
  sensorOf(instanceId: number): number
  dispose(): void
}

export function createHeatmap(sensors: SensorSet): Heatmap {
  const geometry = new THREE.PlaneGeometry(1, 1)
  const material = new THREE.MeshBasicMaterial({
    // Front faces only: a tile faces its surface's normal, so the tiles on the
    // INSIDE face of a wall look inwards and vanish from outside, instead of
    // speckling the façade with their zero hours.
    side: THREE.FrontSide,
    toneMapped: false,
    // Opaque: a translucent map let the scene grid draw through it.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, sensors.count))
  mesh.name = 'solar-analysis-heatmap'
  mesh.frustumCulled = false
  mesh.renderOrder = 5

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const zAxis = new THREE.Vector3(0, 0, 1)
  const n = new THREE.Vector3()
  const p = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const ground = SENSOR_KINDS.indexOf('ground')
  const matrices: THREE.Matrix4[] = []
  for (let i = 0; i < sensors.count; i++) {
    n.set(sensors.normals[i * 3], sensors.normals[i * 3 + 1], sensors.normals[i * 3 + 2])
    p.set(sensors.positions[i * 3], sensors.positions[i * 3 + 1], sensors.positions[i * 3 + 2])
    q.setFromUnitVectors(zAxis, n)
    // A tile the size of the area it stands for: the map closes up without gaps.
    // Surface points are scattered, not gridded, so their tiles overlap a little
    // (×1.6) or the surface shows through between them.
    const side = sensors.kind[i] === ground ? sensors.spacing.ground * 1.02 : Math.min(sensors.spacing.surface * 1.6, Math.sqrt(sensors.area[i]) * 1.6)
    scale.set(side, side, 1)
    m.compose(p, q, scale)
    mesh.setMatrixAt(i, m)
    matrices.push(m.clone())
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, sensors.count) * 3), 3)

  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0)
  return {
    object: mesh,
    setValues(values, min, max) {
      const span = max - min || 1
      const c = new THREE.Color()
      for (let i = 0; i < sensors.count; i++) {
        const [r, g, b] = rampColor((values[i] - min) / span)
        c.setRGB(r, g, b, THREE.SRGBColorSpace)
        mesh.setColorAt(i, c)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    },
    setKinds(kinds, open) {
      for (let i = 0; i < sensors.count; i++) {
        const show = kinds.has(SENSOR_KINDS[sensors.kind[i]]) && (!open || open[i] === 1)
        mesh.setMatrixAt(i, show ? matrices[i] : hiddenMatrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
    sensorOf: (instanceId) => instanceId,
    dispose() {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
      mesh.dispose()
    },
  }
}
