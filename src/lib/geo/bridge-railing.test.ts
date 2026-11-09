import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { appendBridgeRailing } from './bridge-railing'

describe('bridge railing — only the faces anyone sees', () => {
  it('spends 72 vertices on the rails of a segment and 24 on each post', () => {
    const positions: number[] = []
    const colors: number[] = []
    // 9 m of railing, metres as the unit: 5 bays of posts.
    appendBridgeRailing(positions, colors, new THREE.Vector3(0, 0, 0), new THREE.Vector3(9, 0, 0), 1, [0.5, 0.5, 0.5])
    expect(positions.length / 3).toBe(72 + 5 * 24)
    expect(colors.length).toBe(positions.length)
  })

  it('keeps the top of the handrail and both faces of every bar', () => {
    const positions: number[] = []
    appendBridgeRailing(positions, [], new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0), 1, [1, 1, 1])
    let top = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      top = Math.max(top, positions[i + 2]); minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1])
    }
    expect(top).toBeCloseTo(1.1, 5)
    expect(minY).toBeLessThan(0)
    expect(maxY).toBeGreaterThan(0)
  })
})
