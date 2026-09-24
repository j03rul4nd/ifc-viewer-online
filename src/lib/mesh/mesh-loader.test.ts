// ─── mesh-loader tests ────────────────────────────────────────────────────────
// Which file is the model, which .mtl is its own, what a failed glTF says about
// why, and the texture drain — the wait that used to decide, invisibly, whether
// an OBJ arrived textured, and whether a cancelled import sat in it for thirty
// seconds.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import {
  findEntryFile, mtllibNames, pickMtlFile, loadMeshFiles,
} from './mesh-loader'

const fileOf = (name: string, body = 'x'): File => new File([body], name)

const TRIANGLE = 'v 0 0 0\nv 1 0 0\nv 0 1 0\n'

/** The colour of the first material on the first mesh — what an .mtl decided. */
function firstColor(root: THREE.Object3D): THREE.Color | null {
  let color: THREE.Color | null = null
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (color || !mesh.isMesh) return
    const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshPhongMaterial
    color = m.color ?? null
  })
  return color
}

// ── Entry selection ───────────────────────────────────────────────────────────

describe('findEntryFile with an entry name', () => {
  const files = [fileOf('scene.bin'), fileOf('draft.gltf'), fileOf('final.glb'), fileOf('atlas.png')]

  it('picks the named entry out of a selection holding several', () => {
    expect(findEntryFile(files, 'final.glb')?.file.name).toBe('final.glb')
    expect(findEntryFile(files, 'final.glb')?.format).toBe('glb')
  })

  it('matches by basename, case-insensitively, like every reference', () => {
    expect(findEntryFile(files, 'C:\\exports\\FINAL.GLB')?.file.name).toBe('final.glb')
    expect(findEntryFile(files, 'models/Final.glb')?.file.name).toBe('final.glb')
  })

  it('falls back to the first entry when the name is not an entry in the selection', () => {
    // The hint was wrong, not the files. A sidecar's name must not make the
    // loader parse a .bin as a model, and a name that is not there at all
    // must not fail an import that has a perfectly good entry.
    expect(findEntryFile(files, 'scene.bin')?.file.name).toBe('draft.gltf')
    expect(findEntryFile(files, 'missing.glb')?.file.name).toBe('draft.gltf')
    expect(findEntryFile(files, '')?.file.name).toBe('draft.gltf')
  })

  it('without a name, keeps selection order', () => {
    expect(findEntryFile(files)?.file.name).toBe('draft.gltf')
  })
})

// ── Material libraries ────────────────────────────────────────────────────────

describe('mtllibNames', () => {
  it('reads the library an OBJ names', () => {
    expect(mtllibNames(`# exported\nmtllib site.mtl\n${TRIANGLE}`)).toEqual(['site.mtl'])
  })

  it('tries a name with spaces whole before splitting it', () => {
    // "Site Model.mtl" is far commoner than the space-separated list the format
    // technically describes, so the whole remainder goes first.
    expect(mtllibNames('mtllib Site Model.mtl\r\n')).toEqual(['Site Model.mtl', 'Site', 'Model.mtl'])
  })

  it('reads every mtllib line, in order', () => {
    expect(mtllibNames('mtllib a.mtl\nv 0 0 0\n  mtllib b.mtl\n')).toEqual(['a.mtl', 'b.mtl'])
  })

  it('only looks at the header, so a huge OBJ does not pay a second full pass', () => {
    const body = 'v 0 0 0\n'.repeat(10_000) // 80 000 chars, past the scan window
    expect(mtllibNames(`${body}mtllib late.mtl\n`)).toEqual([])
  })

  it('returns nothing for an OBJ with no library', () => {
    expect(mtllibNames(TRIANGLE)).toEqual([])
  })
})

describe('pickMtlFile', () => {
  const obj = fileOf('house.obj')

  it("prefers the library the OBJ names over one that merely shares its name", () => {
    const named = fileOf('materials_v2.mtl')
    const twin = fileOf('house.mtl')
    expect(pickMtlFile(obj, [twin, obj, named], 'mtllib materials_v2.mtl\n')).toBe(named)
  })

  it('matches the named library by basename, since the path is from another machine', () => {
    const named = fileOf('House_Mats.mtl')
    expect(pickMtlFile(obj, [fileOf('other.mtl'), named], 'mtllib C:\\work\\house_mats.mtl\n')).toBe(named)
  })

  it('pairs by name when the OBJ names nothing present', () => {
    // Two models selected at once: the first .mtl used to win, and half of
    // them wore the other's materials.
    const twin = fileOf('House.MTL')
    expect(pickMtlFile(obj, [fileOf('garage.mtl'), obj, twin], 'mtllib gone.mtl\n')).toBe(twin)
    expect(pickMtlFile(obj, [fileOf('garage.mtl'), obj, twin])).toBe(twin)
  })

  it('falls back to the first .mtl, which still beats none', () => {
    const first = fileOf('a.mtl')
    expect(pickMtlFile(obj, [obj, first, fileOf('b.mtl')])).toBe(first)
  })

  it('returns null when the selection has no .mtl at all', () => {
    expect(pickMtlFile(obj, [obj, fileOf('tex.png')], 'mtllib house.mtl\n')).toBeNull()
  })
})

describe('an OBJ wears its own materials', () => {
  it('out of a selection holding two models', async () => {
    const red = 'newmtl skin\nKd 1 0 0\n'
    const green = 'newmtl skin\nKd 0 1 0\n'
    const obj = fileOf('house.obj', `${TRIANGLE}usemtl skin\nf 1 2 3\n`)
    // garage.mtl is first in the selection — the one the old rule would take.
    const out = await loadMeshFiles([fileOf('garage.mtl', green), obj, fileOf('house.mtl', red)])
    expect(firstColor(out.object)?.toArray()).toEqual([1, 0, 0])
  })

  it('and the one its mtllib names, when it names one', async () => {
    const obj = fileOf('house.obj', `mtllib shared.mtl\n${TRIANGLE}usemtl skin\nf 1 2 3\n`)
    const out = await loadMeshFiles([
      fileOf('house.mtl', 'newmtl skin\nKd 1 0 0\n'),
      obj,
      fileOf('shared.mtl', 'newmtl skin\nKd 0 0 1\n'),
    ])
    expect(firstColor(out.object)?.toArray()).toEqual([0, 0, 1])
  })

  it('decodes the named entry when a selection holds two OBJs', async () => {
    const a = fileOf('a.obj', `${TRIANGLE}f 1 2 3\n`)
    const b = fileOf('b.obj', `${TRIANGLE}v 1 1 0\nf 1 2 3\nf 2 4 3\n`)
    const out = await loadMeshFiles([a, b], { entryName: 'b.obj' })
    expect(out.entryFile).toBe(b)
    expect(out.stats.triangles).toBe(2)
  })
})

// ── glTF failures ─────────────────────────────────────────────────────────────

/** The error a decode rejected with — failing the test if it resolved instead. */
async function rejection(p: Promise<unknown>): Promise<Error & { cause?: unknown }> {
  try { await p } catch (e) { return e as Error & { cause?: unknown } }
  throw new Error('expected the decode to fail')
}

describe('a glTF that fails to parse keeps its cause', () => {
  it('when three reports it', async () => {
    const old = fileOf('old.gltf', JSON.stringify({ asset: { version: '1.0' } }))
    const err = await rejection(loadMeshFiles([old]))
    // The user reads 'parseFailed'; whoever diagnoses it needs to know that
    // three said "unsupported asset", not merely that something went wrong.
    expect(err.message).toBe('parseFailed')
    expect(String((err.cause as Error)?.message)).toMatch(/Unsupported asset/)
  })

  it('when parse() throws instead of reporting', async () => {
    const junk = fileOf('junk.gltf', '{ this is not json')
    const err = await rejection(loadMeshFiles([junk]))
    expect(err.message).toBe('parseFailed')
    expect(err.cause).toBeInstanceOf(Error)
  })
})

// ── The texture drain ─────────────────────────────────────────────────────────
// jsdom never loads an <img>, which is exactly the hung-texture case: the
// manager stays busy until the test says otherwise. Blob URLs are stubbed so
// minting and revoking can be counted.

describe('the texture drain', () => {
  const minted: string[] = []
  const revoked: string[] = []
  const images: HTMLImageElement[] = []
  const urlApi = URL as unknown as {
    createObjectURL?: (b: Blob) => string
    revokeObjectURL?: (u: string) => void
  }
  const original = { create: urlApi.createObjectURL, revoke: urlApi.revokeObjectURL }

  beforeEach(() => {
    minted.length = 0
    revoked.length = 0
    images.length = 0
    urlApi.createObjectURL = () => {
      const url = `blob:test/${minted.length}`
      minted.push(url)
      return url
    }
    urlApi.revokeObjectURL = (url) => { revoked.push(url) }
    const create = document.createElementNS.bind(document)
    vi.spyOn(document, 'createElementNS').mockImplementation(((ns: string, name: string) => {
      const el = create(ns, name)
      if (name === 'img') images.push(el as HTMLImageElement)
      return el
    }) as typeof document.createElementNS)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    urlApi.createObjectURL = original.create
    urlApi.revokeObjectURL = original.revoke
  })

  const texturedObj = () => [
    fileOf('room.obj', `mtllib room.mtl\n${TRIANGLE}usemtl wall\nf 1 2 3\n`),
    fileOf('room.mtl', 'newmtl wall\nKd 1 1 1\nmap_Kd wall.png\n'),
    fileOf('wall.png', 'png'),
  ]

  const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms))

  it('counts texture bytes after the textures land, not before', async () => {
    // Stats used to be taken before the drain. An OBJ's textures have no image
    // until they load, so a model carrying real textures reported 0 bytes.
    const pending = loadMeshFiles(texturedObj())
    await vi.waitFor(() => expect(images).toHaveLength(1))
    await tick()

    const img = images[0]
    Object.defineProperty(img, 'width', { value: 64 })
    Object.defineProperty(img, 'height', { value: 32 })
    img.dispatchEvent(new Event('load'))

    const out = await pending
    expect(out.stats.textures).toBe(1)
    expect(out.stats.textureBytes).toBe(Math.round(64 * 32 * 4 * 1.33))
    // Revoked only once the texture had what it needed from the URL.
    expect(revoked).toEqual(minted)
  })

  it('an abort cuts the wait short, still revokes, and frees the object', async () => {
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const ctrl = new AbortController()
    const pending = loadMeshFiles(texturedObj(), { signal: ctrl.signal })
    let settled = false
    void pending.catch(() => {}).finally(() => { settled = true })

    await vi.waitFor(() => expect(minted).toHaveLength(1))
    await tick()
    // Parked in the drain: the texture never loads, so without the abort this
    // would sit here for the full thirty-second timeout.
    expect(settled).toBe(false)

    ctrl.abort()
    await expect(pending).rejects.toThrow('cancelled')
    expect(revoked).toEqual(minted)
    // Built, never handed over — so the loader is the only one who can free it.
    expect(dispose).toHaveBeenCalled()
  })

  it('an abort before the decode starts reads nothing', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const files = texturedObj()
    const read = vi.spyOn(files[0], 'text')
    await expect(loadMeshFiles(files, { signal: ctrl.signal })).rejects.toThrow('cancelled')
    expect(read).not.toHaveBeenCalled()
    expect(minted).toEqual([])
  })
})
