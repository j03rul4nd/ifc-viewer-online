import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createModelStaging, planContactShadow } from './model-staging'

describe('planContactShadow', () => {
  it('pads the footprint by a margin that grows with the building', () => {
    const kiosk = planContactShadow(4, 4)!
    const block = planContactShadow(40, 20)!
    expect(kiosk.margin).toBe(1.5)
    expect(block.margin).toBeCloseTo(7.2, 6)
    expect(block.width).toBeCloseTo(40 + 2 * 7.2, 6)
  })
  it('caps the margin so a tower does not get a stain', () => {
    expect(planContactShadow(300, 300)!.margin).toBe(10)
  })
  it('has nothing to draw for an empty footprint', () => {
    expect(planContactShadow(0, 10)).toBeNull()
    expect(planContactShadow(NaN, 10)).toBeNull()
  })
})

describe('createModelStaging', () => {
  const bounds = { center: { x: 10, y: 5, z: -3 }, size: { x: 20, y: 10, z: 12 } }

  it('lights the model only when the look asks for it', () => {
    const scene = new THREE.Scene()
    const s = createModelStaging(scene)
    s.update(bounds, 0, 0.2, 0, '#ffc27a')
    const spot = scene.getObjectByName('geo-floodlight') as THREE.SpotLight
    expect(spot.visible).toBe(false)
    s.update(bounds, 0, 0.2, 1.6, '#ffc27a')
    expect(spot.visible).toBe(true)
    expect(spot.intensity).toBe(1.6)
    // Bounded: it must not light the city behind the model.
    expect(spot.distance).toBeGreaterThan(spot.position.distanceTo(spot.target.position))
    expect(spot.distance).toBeLessThan(spot.position.distanceTo(spot.target.position) * 3)
    // Aimed at the model, from below its top: an uplight.
    expect(spot.target.position.x).toBe(10)
    expect(spot.position.y).toBeLessThan(bounds.size.y)
  })

  it('removes everything it added on dispose', () => {
    const scene = new THREE.Scene()
    const s = createModelStaging(scene)
    s.update(bounds, 0, 0.3, 1, '#ffffff')
    s.dispose()
    expect(scene.getObjectByName('geo-model-staging')).toBeUndefined()
  })
})
