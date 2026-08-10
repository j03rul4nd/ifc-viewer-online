// ─── mesh importer tests ──────────────────────────────────────────────────────
// The parts of a mesh import that can be wrong without looking wrong: what unit
// it is in, which way is up, whether the placement arithmetic composes, whether
// a removed import actually frees its textures, and whether a multi-file OBJ
// finds its own materials.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import { inferUnitScale, inferUpAxis, initialPlacement, meshFileKey,
  savePlacement, loadPlacement, clearPlacement } from './mesh-align'
import { effectivePlacement } from './mesh-transform'
import { buildUrlMap, findEntryFile, collectStats, disposeObject } from './mesh-loader'
import { createMeshSystem, type MeshContext, type MeshSystemAPI } from './mesh-system'
import { loadMesh } from './mesh-runner'
import { NO_OFFSET } from '../pointcloud/pc-types'
import type { MeshFrame, MeshStats } from './mesh-types'

const boxOf = (min: [number, number, number], max: [number, number, number]) => ({
  min: { x: min[0], y: min[1], z: min[2] },
  max: { x: max[0], y: max[1], z: max[2] },
})

// ── Units ──────────────────────────────────────────────────────────────────────

describe('inferUnitScale', () => {
  it('reads a building-sized object as metres', () => {
    expect(inferUnitScale(boxOf([0, 0, 0], [24, 9, 15])).scale).toBe(1)
  })

  it('reads a building-sized object written in millimetres', () => {
    // 24 000 units for a 24 m building. Nothing anyone imports into a building
    // scene is 24 km across, so the alternative reading is the real one.
    const out = inferUnitScale(boxOf([0, 0, 0], [24_000, 9_000, 15_000]))
    expect(out.scale).toBe(0.001)
    expect(out.reason).toBe('reason.unitMillimetres')
  })

  it('reads centimetres', () => {
    expect(inferUnitScale(boxOf([0, 0, 0], [2_400, 900, 1_500])).scale).toBe(0.01)
  })

  it('leaves a chair alone', () => {
    // A metre-scale object must not be mistaken for anything — this is the
    // common case and it has to be untouched.
    expect(inferUnitScale(boxOf([0, 0, 0], [0.6, 1.1, 0.6])).scale).toBe(1)
  })

  it('does not divide by a degenerate box', () => {
    expect(inferUnitScale(boxOf([0, 0, 0], [0, 0, 0])).scale).toBe(1)
  })
})

// ── Orientation ────────────────────────────────────────────────────────────────

describe('inferUpAxis', () => {
  it('takes glTF at its word, because the specification mandates Y-up', () => {
    // Not a guess and not offered to the user: the format settles it. A tall
    // narrow glTF is still Y-up, so the shape heuristic must not run here.
    expect(inferUpAxis('glb', boxOf([0, 0, 0], [1, 40, 1])))
      .toEqual({ axis: 'y', source: 'declared' })
    expect(inferUpAxis('gltf', boxOf([0, 0, 0], [10, 2, 10])).source).toBe('declared')
  })

  it('infers OBJ from its shape, and admits it is inferring', () => {
    // OBJ has no convention at all — DCC tools write Y-up, CAD writes Z-up.
    expect(inferUpAxis('obj', boxOf([0, 0, 0], [10, 2.5, 8])))
      .toEqual({ axis: 'y', source: 'assumed' })
    expect(inferUpAxis('obj', boxOf([0, 0, 0], [10, 8, 2.5])))
      .toEqual({ axis: 'z', source: 'assumed' })
  })

  it('falls back to Y for a cubic OBJ, which is its commoner convention', () => {
    const out = inferUpAxis('obj', boxOf([0, 0, 0], [10, 9, 10]))
    expect(out).toEqual({ axis: 'y', source: 'assumed' })
  })
})

// ── The transform ──────────────────────────────────────────────────────────────

const frameOf = (patch: Partial<MeshFrame> = {}): MeshFrame => ({
  unitScale: 1, unitSource: 'assumed', upAxis: 'y', upAxisSource: 'declared',
  min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 },
  ...patch,
})

describe('effectivePlacement', () => {
  it('multiplies the unit and the user scale into ONE factor', () => {
    // A millimetre model nudged to 1.1× must end at 0.0011, not at 0.001 applied
    // twice or 1.1 applied to an already-scaled object.
    const t = effectivePlacement(
      frameOf({ unitScale: 0.001 }), { ...NO_OFFSET, scaleMul: 1.1 },
    )
    expect(t.scale).toBeCloseTo(0.0011, 12)
  })

  it('tilts a Z-up source and leaves a Y-up source level', () => {
    expect(effectivePlacement(frameOf({ upAxis: 'z' }), null).tiltRad).toBeCloseTo(-Math.PI / 2, 12)
    expect(effectivePlacement(frameOf({ upAxis: 'y' }), null).tiltRad).toBe(0)
  })

  it('carries the levelling angles through', () => {
    const t = effectivePlacement(frameOf(), { ...NO_OFFSET, pitchDeg: 3, rollDeg: -2 })
    expect(t.pitchRad).toBeCloseTo(3 * Math.PI / 180, 12)
    expect(t.rollRad).toBeCloseTo(-2 * Math.PI / 180, 12)
  })

  it('survives a null placement rather than throwing on a half-loaded import', () => {
    expect(() => effectivePlacement(frameOf(), null)).not.toThrow()
    expect(effectivePlacement(frameOf(), null).scale).toBe(1)
  })
})

describe('initialPlacement', () => {
  const MODEL = { center: { x: 100, y: 5, z: -50 }, size: { x: 20, y: 10, z: 20 } }

  it('drops the object onto the model floor, not through it', () => {
    // Placing by centre puts a chair half inside the slab. The bottom of the
    // object goes on the bottom of the model.
    const frame = frameOf({ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } })
    const p = initialPlacement({ frame, modelBounds: MODEL })
    const floorY = MODEL.center.y - MODEL.size.y / 2
    expect(p.y).toBeCloseTo(floorY, 9)
  })

  it('accounts for an object whose own origin is not at its base', () => {
    // Exported from a DCC tool with the pivot in the middle: min.y is negative,
    // so the object has to be lifted, not lowered.
    const frame = frameOf({ min: { x: -1, y: -1.5, z: -1 }, max: { x: 1, y: 1.5, z: 1 } })
    const p = initialPlacement({ frame, modelBounds: MODEL })
    expect(p.y).toBeCloseTo(MODEL.center.y - MODEL.size.y / 2 + 1.5, 9)
  })

  it('applies the unit scale before deciding where the floor is', () => {
    // A millimetre model 2000 units tall is 2 m tall. Forgetting the unit here
    // lifts it two kilometres.
    const frame = frameOf({
      unitScale: 0.001, min: { x: 0, y: 0, z: 0 }, max: { x: 1000, y: 2000, z: 1000 },
    })
    const p = initialPlacement({ frame, modelBounds: MODEL })
    expect(p.y).toBeCloseTo(MODEL.center.y - MODEL.size.y / 2, 9)
    // And centred in plan on a 1 m half-extent, not a 1000-unit one.
    expect(Math.abs(p.x - MODEL.center.x)).toBeLessThan(1)
  })

  it('is identity when there is no model to place against', () => {
    expect(initialPlacement({ frame: frameOf(), modelBounds: null })).toEqual(NO_OFFSET)
  })
})

// ── Multi-file resolution ──────────────────────────────────────────────────────

const fileOf = (name: string, body = 'x'): File => new File([body], name)

describe('finding the parts of an import', () => {
  it('picks the model out of a folder-worth of selected files', () => {
    // Users select everything, and the entry point is rarely first
    // alphabetically. Guessing wrong parses a .bin as a model.
    const files = [fileOf('atlas.png'), fileOf('scene.bin'), fileOf('scene.gltf'), fileOf('notes.txt')]
    expect(findEntryFile(files)).toMatchObject({ format: 'gltf' })
    expect(findEntryFile(files)!.file.name).toBe('scene.gltf')
  })

  it('returns null when nothing in the selection is a model', () => {
    expect(findEntryFile([fileOf('a.png'), fileOf('b.mtl')])).toBeNull()
  })

  it('resolves references by basename, because the paths are from another machine', () => {
    // A .mtl written on someone's desktop asks for `textures/wall.jpg` or even
    // `C:\work\wall.jpg`. Matching the basename is what makes a flat selection
    // work at all.
    const wall = fileOf('wall.jpg')
    const map = buildUrlMap([fileOf('model.obj'), wall])
    expect(map.get('wall.jpg')).toBe(wall)
  })

  it('is case-insensitive, since exporters and filesystems disagree', () => {
    const tex = fileOf('Wall.JPG')
    expect(buildUrlMap([tex]).get('wall.jpg')).toBe(tex)
  })

  it('prefers the first of two files with the same basename', () => {
    const first = fileOf('tex.png', 'a')
    const second = fileOf('tex.png', 'b')
    expect(buildUrlMap([first, second]).get('tex.png')).toBe(first)
  })
})

// ── Counting ───────────────────────────────────────────────────────────────────

function meshWith(triangles: number, indexed: boolean): THREE.Mesh {
  const geo = new THREE.BufferGeometry()
  const verts = triangles * 3
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3))
  if (indexed) geo.setIndex(new THREE.BufferAttribute(new Uint32Array(verts), 1))
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial())
}

describe('collectStats', () => {
  it('counts indexed and non-indexed geometry alike', () => {
    const root = new THREE.Group()
    root.add(meshWith(10, true), meshWith(5, false))
    const stats = collectStats(root)
    expect(stats.meshes).toBe(2)
    expect(stats.triangles).toBe(15)
  })

  it('counts a shared material once', () => {
    const shared = new THREE.MeshStandardMaterial()
    const root = new THREE.Group()
    const a = meshWith(1, false); a.material = shared
    const b = meshWith(1, false); b.material = shared
    root.add(a, b)
    expect(collectStats(root).materials).toBe(1)
  })

  it('finds textures hanging off any material slot', () => {
    const tex = new THREE.Texture()
    tex.image = { width: 512, height: 512 }
    const mat = new THREE.MeshStandardMaterial()
    mat.map = tex
    const mesh = meshWith(1, false)
    mesh.material = mat
    const root = new THREE.Group(); root.add(mesh)

    const stats = collectStats(root)
    expect(stats.textures).toBe(1)
    expect(stats.textureBytes).toBeGreaterThan(512 * 512 * 4)
  })
})

// ── Disposal — the leak that matters ───────────────────────────────────────────

describe('disposeObject', () => {
  it('disposes geometry, material AND texture', () => {
    // Textures are the reason this exists. They are tens of megabytes, they are
    // not reachable from the geometry, and three frees none of them when an
    // object leaves the scene — the WebGL objects stay allocated until the
    // context is lost.
    const tex = new THREE.Texture()
    const texSpy = vi.spyOn(tex, 'dispose')
    const mat = new THREE.MeshStandardMaterial()
    mat.map = tex
    const matSpy = vi.spyOn(mat, 'dispose')
    const mesh = meshWith(2, false)
    mesh.material = mat
    const geoSpy = vi.spyOn(mesh.geometry, 'dispose')

    const root = new THREE.Group()
    root.add(mesh)
    new THREE.Scene().add(root)

    disposeObject(root)
    expect(geoSpy).toHaveBeenCalled()
    expect(matSpy).toHaveBeenCalled()
    expect(texSpy).toHaveBeenCalled()
    expect(root.parent).toBeNull()
  })

  it('disposes a shared material only once', () => {
    const shared = new THREE.MeshStandardMaterial()
    const spy = vi.spyOn(shared, 'dispose')
    const root = new THREE.Group()
    const a = meshWith(1, false); a.material = shared
    const b = meshWith(1, false); b.material = shared
    root.add(a, b)
    disposeObject(root)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// ── The system ─────────────────────────────────────────────────────────────────

function makeContext(over: Partial<MeshContext> = {}): MeshContext & { scene: THREE.Scene } {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  return {
    scene,
    getActiveCamera: () => camera,
    renderer: { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer,
    frameBox: vi.fn(),
    ...over,
  }
}

const STATS: MeshStats = { meshes: 1, triangles: 100, materials: 1, textures: 0, textureBytes: 0 }

describe('createMeshSystem', () => {
  it('wraps the import in one root and applies the placement there', () => {
    // The decoded object is never mutated: everything an import needs is on the
    // wrapper, so re-placing it cannot corrupt the geometry.
    const ctx = makeContext()
    const sys = createMeshSystem(ctx)
    const object = new THREE.Group(); object.add(meshWith(1, false))

    sys.add('m1', object, frameOf({ unitScale: 0.5 }), { ...NO_OFFSET, x: 10 }, STATS)
    const root = ctx.scene.children.find((c) => c.name === 'mesh:m1')!
    expect(root.position.x).toBe(10)
    expect(root.scale.x).toBe(0.5)
    expect(object.position.toArray()).toEqual([0, 0, 0])
  })

  it('frees everything on remove, and withdraws from the raycaster first', () => {
    const registered = new Set<THREE.Object3D>()
    const ctx = makeContext({
      registerRaycastTarget: (o) => { registered.add(o) },
      unregisterRaycastTarget: (o) => { registered.delete(o) },
    })
    const sys = createMeshSystem(ctx)

    const mesh = meshWith(3, false)
    const geoSpy = vi.spyOn(mesh.geometry, 'dispose')
    const object = new THREE.Group(); object.add(mesh)
    sys.add('m1', object, frameOf(), { ...NO_OFFSET }, STATS)
    expect(registered.size).toBe(1)

    sys.remove('m1')
    expect(geoSpy).toHaveBeenCalled()
    expect(registered.size).toBe(0)
    expect(ctx.scene.children.some((c) => c.name === 'mesh:m1')).toBe(false)
    expect(sys.count()).toBe(0)
  })

  it('reports resident triangles, which is what the budget is checked against', () => {
    const ctx = makeContext()
    const sys = createMeshSystem(ctx)
    sys.add('a', new THREE.Group(), frameOf(), { ...NO_OFFSET }, { ...STATS, triangles: 1_000 })
    sys.add('b', new THREE.Group(), frameOf(), { ...NO_OFFSET }, { ...STATS, triangles: 2_500 })
    expect(sys.triangleCount()).toBe(3_500)
    sys.remove('a')
    expect(sys.triangleCount()).toBe(2_500)
  })

  it('replacing an id frees the old import rather than orphaning it', () => {
    const ctx = makeContext()
    const sys = createMeshSystem(ctx)
    const first = meshWith(1, false)
    const spy = vi.spyOn(first.geometry, 'dispose')
    const a = new THREE.Group(); a.add(first)
    sys.add('m1', a, frameOf(), { ...NO_OFFSET }, STATS)
    sys.add('m1', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
    expect(spy).toHaveBeenCalled()
    expect(sys.count()).toBe(1)
  })

  it('dispose clears every import', () => {
    const ctx = makeContext()
    const sys = createMeshSystem(ctx)
    sys.add('a', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
    sys.add('b', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
    sys.dispose()
    expect(sys.count()).toBe(0)
    expect(ctx.scene.children.filter((c) => c.name.startsWith('mesh:'))).toHaveLength(0)
  })

  it('a hidden import is left out of the bounds', () => {
    const ctx = makeContext()
    const sys = createMeshSystem(ctx)
    const object = new THREE.Group(); object.add(meshWith(1, false))
    sys.add('m1', object, frameOf(), { ...NO_OFFSET }, STATS)
    expect(sys.getBounds('m1')).not.toBeNull()
    sys.setVisible('m1', false)
    expect(sys.getBounds('m1')).toBeNull()
  })
})

// ── Persistence ────────────────────────────────────────────────────────────────

describe('placement is remembered per file', () => {
  const KEY = 'chair.glb:1024:7'
  beforeEach(() => { clearPlacement(KEY) })

  it('round-trips a placement someone worked out', () => {
    savePlacement(KEY, { ...NO_OFFSET, x: 3.5, yawDeg: 90, pitchDeg: 1 })
    const back = loadPlacement(KEY)
    expect(back?.x).toBe(3.5)
    expect(back?.yawDeg).toBe(90)
    expect(back?.pitchDeg).toBe(1)
  })

  it('stores nothing for an untouched import', () => {
    savePlacement(KEY, { ...NO_OFFSET })
    expect(loadPlacement(KEY)).toBeNull()
  })

  it('identifies a fetched model by URL, not by the File around its bytes', () => {
    const a = meshFileKey({ name: 'a.glb', size: 10, lastModified: 1 }, 'https://x/a.glb')
    const b = meshFileKey({ name: 'a.glb', size: 10, lastModified: 999 }, 'https://x/a.glb')
    expect(a).toBe(b)
  })
})

// ── Robustness: the failures that do not announce themselves ──────────────────

describe('loadMesh input guards', () => {
  const system = (): MeshSystemAPI => createMeshSystem(makeContext())

  it('refuses a selection with nothing importable in it', async () => {
    const out = await loadMesh({ files: [fileOf('notes.txt')], system: system(), modelBounds: null })
    expect(out).toEqual({ ok: false, errorKey: 'error.noEntryFile' })
  })

  it('survives the shapes an SDK caller can send', async () => {
    // Reachable from the embed bridge, where `files` has been through a
    // postMessage round trip and the caller is someone else's code. A non-array
    // here used to throw inside the loader with a stack that said nothing about
    // what the host did wrong.
    for (const files of [undefined, null, 'scene.glb', 42, {}] as unknown[]) {
      const out = await loadMesh({
        files: files as File[], system: system(), modelBounds: null,
      })
      expect(out.ok, `files=${JSON.stringify(files)}`).toBe(false)
      expect(out.errorKey).toBe('error.noEntryFile')
    }
  })

  it('drops non-File entries rather than handing them to the loader', async () => {
    const out = await loadMesh({
      files: [null, 'a.glb', { name: 'b.glb' }] as unknown as File[],
      system: system(), modelBounds: null,
    })
    expect(out.errorKey).toBe('error.noEntryFile')
  })

  it('reports an empty file as empty, not as a parse failure', async () => {
    const empty = new File([], 'model.glb')
    const out = await loadMesh({ files: [empty], system: system(), modelBounds: null })
    expect(out.errorKey).toBe('error.emptyFile')
  })

  it('does not throw when handed no system at all', async () => {
    const out = await loadMesh({
      files: [fileOf('a.glb')], system: undefined as unknown as MeshSystemAPI, modelBounds: null,
    })
    expect(out.ok).toBe(false)
  })
})

describe('a disposed system refuses rather than swallowing', () => {
  it('add() returns false once disposed', () => {
    // It used to return void. The runner could not tell refusal from success, so
    // it marked the store 'ready' for a model that was in no scene and whose
    // textures nothing would ever free.
    const sys = createMeshSystem(makeContext())
    sys.dispose()
    const accepted = sys.add('m1', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
    expect(accepted).toBe(false)
    expect(sys.count()).toBe(0)
  })

  it('add() returns true on the normal path', () => {
    const sys = createMeshSystem(makeContext())
    expect(sys.add('m1', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)).toBe(true)
  })
})

describe('mesh-system tolerates being driven wrongly', () => {
  it('ignores operations on ids that do not exist', () => {
    // The SDK can address a mesh that was removed a moment earlier, and a panel
    // effect can fire after its subject is gone. None of it may throw.
    const sys = createMeshSystem(makeContext())
    expect(() => {
      sys.setPlacement('ghost', frameOf(), { ...NO_OFFSET })
      sys.setVisible('ghost', false)
      sys.remove('ghost')
      sys.frame('ghost')
    }).not.toThrow()
    expect(sys.getBounds('ghost')).toBeNull()
  })

  it('survives being disposed twice', () => {
    const sys = createMeshSystem(makeContext())
    sys.add('a', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
    sys.dispose()
    expect(() => sys.dispose()).not.toThrow()
    expect(sys.count()).toBe(0)
  })

  it('keeps working when the raycast hooks are absent', () => {
    // Every older context, and any embedder without a world, has neither hook.
    const sys = createMeshSystem(makeContext())
    expect(() => {
      sys.add('a', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
      sys.remove('a')
    }).not.toThrow()
  })

  it('frame() does not depend on `this`, so a destructured API still works', () => {
    // `const { frame } = system` is what a caller writes without thinking, and a
    // `this` that silently becomes undefined is a crash in the one path nobody
    // exercises.
    const ctx = makeContext()
    const sys = createMeshSystem(ctx)
    sys.add('a', new THREE.Group(), frameOf(), { ...NO_OFFSET }, STATS)
    const { frame, getBounds } = sys
    expect(() => { frame('a'); getBounds('a') }).not.toThrow()
  })
})

describe('disposeObject tolerates malformed graphs', () => {
  it('handles a mesh with no material and a material with no textures', () => {
    const root = new THREE.Group()
    const bare = new THREE.Mesh(new THREE.BufferGeometry())
    ;(bare as unknown as { material: unknown }).material = null
    root.add(bare, meshWith(1, false))
    expect(() => disposeObject(root)).not.toThrow()
  })

  it('handles an array of materials on one mesh', () => {
    const a = new THREE.MeshStandardMaterial()
    const b = new THREE.MeshStandardMaterial()
    const spyA = vi.spyOn(a, 'dispose')
    const spyB = vi.spyOn(b, 'dispose')
    const mesh = meshWith(1, false)
    mesh.material = [a, b]
    const root = new THREE.Group(); root.add(mesh)
    disposeObject(root)
    expect(spyA).toHaveBeenCalled()
    expect(spyB).toHaveBeenCalled()
  })
})
