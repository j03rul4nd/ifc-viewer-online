import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'
import { createPairController } from './pair-controller'
import { useAsBuiltStore } from '../../stores/asBuiltStore'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import type { Vec3 } from './rigid-fit'
import type { PointCloudAlignment, PointCloudEntry } from '../pointcloud/pc-types'

const flush = () => new Promise((r) => setTimeout(r, 0))

function setup() {
  const target = document.createElement('div')
  const keyTarget = new EventTarget()
  const scene = new THREE.Scene()
  let n = 0
  const pickModel = vi.fn(async (): Promise<Vec3> => [n, 0, 0])
  const pickCloud = vi.fn((): Vec3 => [n++, 1, 0])
  const ctl = createPairController({ target, keyTarget, scene, pickModel, pickCloud })
  const click = async () => { target.dispatchEvent(new MouseEvent('click', { clientX: 1, clientY: 2 })); await flush() }
  const esc = () => keyTarget.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }))
  return { ctl, scene, click, esc, pickModel, pickCloud }
}

describe('pair-controller', () => {
  beforeEach(() => useAsBuiltStore.getState().reset())

  it('ignores clicks until started', async () => {
    const { click, pickModel } = setup()
    await click()
    expect(pickModel).not.toHaveBeenCalled()
  })

  it('two clicks make one pair with two same-colour markers', async () => {
    const { ctl, click, scene } = setup()
    ctl.start()
    await click()
    expect(useAsBuiltStore.getState().phase).toBe('picking-cloud')
    await click()
    const s = useAsBuiltStore.getState()
    expect(s.pairs).toEqual([{ model: [0, 0, 0], cloud: [0, 1, 0] }])
    expect(s.phase).toBe('picking-model')
    expect(scene.children).toHaveLength(2)
    const [a, b] = scene.children as THREE.Mesh[]
    expect((a.material as THREE.MeshBasicMaterial).color.getHex()).toBe((b.material as THREE.MeshBasicMaterial).color.getHex())
    ctl.stop()
  })

  it('Esc leaves no half pair', async () => {
    const { ctl, click, esc, scene } = setup()
    ctl.start()
    await click()
    expect(scene.children).toHaveLength(1)
    esc()
    expect(scene.children).toHaveLength(0)
    await click(); await click()
    expect(useAsBuiltStore.getState().pairs).toHaveLength(1)
    expect(useAsBuiltStore.getState().pairs.every((p) => p.model && p.cloud)).toBe(true)
    ctl.stop()
  })

  it('stop() disposes every marker and detaches listeners', async () => {
    const { ctl, click, scene, pickModel } = setup()
    ctl.start()
    await click(); await click(); await click()
    const meshes = scene.children.slice() as THREE.Mesh[]
    expect(meshes).toHaveLength(3)
    const spies = meshes.flatMap((m) => [vi.spyOn(m.geometry, 'dispose'), vi.spyOn(m.material as THREE.Material, 'dispose')])
    ctl.stop()
    expect(scene.children).toHaveLength(0)
    for (const s of spies) expect(s).toHaveBeenCalled()
    expect(useAsBuiltStore.getState().phase).toBe('idle')
    pickModel.mockClear()
    await click()
    expect(pickModel).not.toHaveBeenCalled()
  })

  it('apply() writes the fitted alignment, persists the offset and re-projects cloud ends', () => {
    const alignment = {
      rung: 'local', confidence: 'low', reasons: ['align.reason.local'],
      origin: { x: 0, y: 0, z: 0 }, yawRad: 0, scale: 1, tilt: null,
      offset: { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 },
    } as unknown as PointCloudAlignment
    const entry = { id: 'c1', fileKey: 'k', alignment } as unknown as PointCloudEntry
    usePointCloudStore.setState({ clouds: [entry] })
    const setOffset = vi.spyOn(usePointCloudStore.getState(), 'setOffset')
    useAsBuiltStore.getState().setCloudId('c1')
    const M: Vec3[] = [[0, 0, 0], [10, 0, 0], [0, 8, 0], [0, 0, 3]]
    for (const m of M) useAsBuiltStore.getState().addPair({ model: m, cloud: [m[0] - 2, m[1], m[2]] })
    const { ctl } = setup()
    expect(ctl.apply()).toEqual({ ok: true })
    const after = usePointCloudStore.getState().clouds[0].alignment!
    expect(after.offset.x).toBeCloseTo(2, 6)
    expect(after.reasons).toContain('align.reason.pointPairs')
    expect(setOffset).toHaveBeenCalledWith('c1', after.offset)
    const s = useAsBuiltStore.getState()
    s.pairs.forEach((p) => p.cloud!.forEach((v, i) => expect(v).toBeCloseTo(p.model![i], 6)))
    expect(s.fit!.fitRmseM).toBeLessThan(1e-6)
  })
})
