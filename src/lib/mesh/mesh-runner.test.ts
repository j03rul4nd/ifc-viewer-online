// ─── mesh-runner lifecycle tests ──────────────────────────────────────────────
// An import against everything else that can happen to the store while it
// decodes: a sibling removed, its own row removed, a cancel, a clear.
//
// The bug these pin down: every removal used to bump a store-wide epoch that
// every import in flight treated as its cancellation token. Deleting ONE
// finished model threw away a sibling still decoding — and threw it away
// without touching its row, which then said 'loading' forever.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { runMeshLoad, loadMesh, removeMesh, type MeshLoadResult } from './mesh-runner'
import { createMeshSystem, type MeshContext, type MeshSystemAPI } from './mesh-system'
import { useMeshStore, pendingEntry } from '../../stores/meshStore'
import { MAX_TRIANGLES_DEFAULT } from './mesh-types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TRIANGLE = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'

let seq = 0
/** A fresh name per call, so nothing persisted per file leaks between tests. */
const objFile = (name = `model-${++seq}.obj`, body = TRIANGLE): File => new File([body], name)

/**
 * A real File whose read waits for the test to open it — the only way to hold
 * an import inside its decode while something else happens to the store.
 */
function gated(file: File): { file: File; open: () => void } {
  let open!: () => void
  const gate = new Promise<void>((r) => { open = r })
  const read = file.text.bind(file)
  Object.defineProperty(file, 'text', { value: () => gate.then(read) })
  return { file, open }
}

/** A resolvePlacement that never answers, and says when it was asked. */
function stalledPlacement(): { resolvePlacement: () => Promise<never>; asked: Promise<void> } {
  let mark!: () => void
  const asked = new Promise<void>((r) => { mark = r })
  return {
    resolvePlacement: () => { mark(); return new Promise<never>(() => { /* never */ }) },
    asked,
  }
}

const glbFile = (name = `held-${++seq}.glb`): File => new File(['glb bytes'], name)

/**
 * A glTF parse that answers only when the test says so — or never. It is the
 * one await in an import nothing can race: three parses (and Draco-decodes)
 * in a single call, and a .gltf whose absolute buffer URI stalls never calls
 * back at all. The file bytes are irrelevant; the parse is stubbed.
 */
function heldParse(): {
  parsing: Promise<void>
  answer: (scene: THREE.Object3D) => void
  fail: (cause: unknown) => void
} {
  let onLoad: ((gltf: GLTF) => void) | null = null
  let onError: ((event: ErrorEvent) => void) | undefined
  let mark!: () => void
  const parsing = new Promise<void>((r) => { mark = r })
  vi.spyOn(GLTFLoader.prototype, 'parse').mockImplementation((_data, _path, load, error) => {
    onLoad = load
    onError = error
    mark()
  })
  return {
    parsing,
    answer: (scene) => onLoad?.({ scene } as unknown as GLTF),
    fail: (cause) => onError?.(cause as ErrorEvent),
  }
}

/** One triangle, with a handle on the geometry to see whether it was freed. */
function triangleScene(): { scene: THREE.Group; geometry: THREE.BufferGeometry } {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()))
  return { scene, geometry }
}

/**
 * How many store subscriptions made from here on are still live. In these
 * tests the runner's own is the only one, so anything above zero once an
 * import is over — or once it is cancelled — is a listener re-checking a dead
 * import on every store change for the life of the page.
 */
function trackSubscriptions(): () => number {
  const real = useMeshStore.subscribe
  let live = 0
  vi.spyOn(useMeshStore, 'subscribe').mockImplementation((listener) => {
    const off = real(listener)
    live++
    let open = true
    return () => {
      if (open) { open = false; live-- }
      off()
    }
  })
  return () => live
}

/** A few macrotask turns: long enough for anything already able to settle to do so. */
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
}

function makeSystem(): MeshSystemAPI {
  const ctx: MeshContext = {
    scene: new THREE.Scene(),
    getActiveCamera: () => new THREE.PerspectiveCamera(),
    renderer: { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer,
    frameBox: vi.fn(),
  }
  return createMeshSystem(ctx)
}

const rows = () => useMeshStore.getState().meshes
const rowOf = (id: string | undefined) => rows().find((m) => m.id === id)
const loadingRows = () => rows().filter((m) => m.status === 'loading')
/** The id of the row an import just created (addMesh makes it the active one). */
const activeId = () => useMeshStore.getState().activeMeshId!

const CANCELLED: MeshLoadResult = { ok: false, errorKey: 'error.cancelled' }

let system: MeshSystemAPI

beforeEach(() => {
  useMeshStore.setState({
    meshes: [], activeMeshId: null, epoch: 0, maxTriangles: MAX_TRIANGLES_DEFAULT,
  })
  system = makeSystem()
})

afterEach(() => {
  vi.restoreAllMocks()
  system.dispose()
})

// ── Baseline ──────────────────────────────────────────────────────────────────

describe('runMeshLoad', () => {
  it('imports an OBJ and settles its row as ready', async () => {
    const out = await runMeshLoad({ files: [objFile()], system })
    expect(out.ok).toBe(true)
    expect(rowOf(out.meshId)?.status).toBe('ready')
    expect(rowOf(out.meshId)?.stats.triangles).toBe(1)
    expect(system.count()).toBe(1)
  })

  it('announces the row before it starts decoding', async () => {
    const seen: string[] = []
    const out = await runMeshLoad({
      files: [objFile()], system,
      onEntry: (id) => { seen.push(`entry:${rowOf(id)?.status}`) },
      onStage: (stage) => { seen.push(stage) },
      resolvePlacement: () => { seen.push('resolvePlacement'); return { modelBounds: null } },
    })
    expect(out.ok).toBe(true)
    // The row exists (and is loading) when the adapter hears the id; 'place'
    // comes right before the placement inputs are read, not after.
    expect(seen).toEqual(['entry:loading', 'decode', 'place', 'resolvePlacement'])
  })
})

// ── Siblings ──────────────────────────────────────────────────────────────────

describe('an import in flight is only cancelled by what concerns it', () => {
  it('removing a finished sibling does not cancel it', async () => {
    const a = gated(objFile())
    const pending = runMeshLoad({ files: [a.file], system })
    const aId = activeId()

    const b = await runMeshLoad({ files: [objFile()], system })
    expect(b.ok).toBe(true)
    removeMesh(b.meshId!, system)

    a.open()
    const out = await pending
    expect(out).toEqual({ ok: true, meshId: aId })
    expect(rowOf(aId)?.status).toBe('ready')
  })

  it('nor does removing an errored row, or an id that was never there', async () => {
    // The three removals that used to cancel everything for no reason at all:
    // the errored row was already dead, and the ghost id was never alive.
    const a = gated(objFile())
    const pending = runMeshLoad({ files: [a.file], system })
    const aId = activeId()

    const broken = await runMeshLoad({ files: [new File(['not a model'], 'broken.glb')], system })
    expect(broken.ok).toBe(false)
    const errored = rows().find((m) => m.status === 'error')!
    useMeshStore.getState().removeMesh(errored.id)
    useMeshStore.getState().removeMesh('mesh-ghost')

    a.open()
    expect((await pending).ok).toBe(true)
    expect(rowOf(aId)?.status).toBe('ready')
    expect(useMeshStore.getState().epoch).toBe(0)
  })

  it('clearMeshes still cancels everything in flight', async () => {
    const a = gated(objFile())
    const b = gated(objFile())
    const pa = runMeshLoad({ files: [a.file], system })
    const pb = runMeshLoad({ files: [b.file], system })

    useMeshStore.getState().clearMeshes()
    a.open(); b.open()

    expect(await pa).toEqual(CANCELLED)
    expect(await pb).toEqual(CANCELLED)
    expect(rows()).toEqual([])
    expect(system.count()).toBe(0)
  })

  it('removing its OWN row mid-decode settles it as cancelled', async () => {
    // Panel X on a loading row, or the loading watcher: the row goes first,
    // the import notices at its next check and does not resurrect it.
    const a = gated(objFile())
    const pending = runMeshLoad({ files: [a.file], system })
    removeMesh(activeId(), system)
    a.open()
    expect(await pending).toEqual(CANCELLED)
    expect(rows()).toEqual([])
    expect(system.count()).toBe(0)
  })
})

// ── Cancel ────────────────────────────────────────────────────────────────────

describe('cancelling one import', () => {
  it('an abort during the decode removes its row', async () => {
    const ctrl = new AbortController()
    const a = gated(objFile())
    const pending = runMeshLoad({ files: [a.file], system, signal: ctrl.signal })
    const id = activeId()
    expect(rowOf(id)?.status).toBe('loading')

    ctrl.abort()
    a.open()
    expect(await pending).toEqual(CANCELLED)
    expect(rowOf(id)).toBeUndefined()
    expect(system.count()).toBe(0)
  })

  it('an abort while waiting on resolvePlacement settles at once and frees the decode', async () => {
    // The wait is for the attach lane — possibly behind an IFC that takes
    // minutes. A cancel must not sit behind it, and the decoded object must
    // not outlive the import: it never reached the system, so nothing else
    // would ever dispose its geometry.
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const ctrl = new AbortController()
    const stalled = stalledPlacement()
    const pending = runMeshLoad({
      files: [objFile()], system, signal: ctrl.signal,
      resolvePlacement: stalled.resolvePlacement,
    })
    const id = activeId()
    await stalled.asked

    ctrl.abort()
    expect(await pending).toEqual(CANCELLED)
    expect(rowOf(id)).toBeUndefined()
    expect(system.count()).toBe(0)
    expect(dispose).toHaveBeenCalled()
  })

  it('removing the row while waiting on resolvePlacement settles too', async () => {
    const stalled = stalledPlacement()
    const pending = runMeshLoad({ files: [objFile()], system, resolvePlacement: stalled.resolvePlacement })
    const id = activeId()
    await stalled.asked

    useMeshStore.getState().removeMesh(id)
    expect(await pending).toEqual(CANCELLED)
    expect(rows()).toEqual([])
    expect(system.count()).toBe(0)
  })

  it('a signal aborted before the start creates no row at all', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const onEntry = vi.fn()
    expect(await runMeshLoad({ files: [objFile()], system, signal: ctrl.signal, onEntry })).toEqual(CANCELLED)
    expect(rows()).toEqual([])
    expect(onEntry).not.toHaveBeenCalled()
  })

  it('cancelling one leaves its sibling alone', async () => {
    const ctrl = new AbortController()
    const a = gated(objFile())
    const b = gated(objFile())
    const pa = runMeshLoad({ files: [a.file], system, signal: ctrl.signal })
    const aId = activeId()
    const pb = runMeshLoad({ files: [b.file], system })
    const bId = activeId()

    ctrl.abort()
    a.open(); b.open()
    expect(await pa).toEqual(CANCELLED)
    expect(await pb).toEqual({ ok: true, meshId: bId })
    expect(rowOf(aId)).toBeUndefined()
    expect(rowOf(bId)?.status).toBe('ready')
  })

  it('a scene torn down mid-import is a cancel: object freed, no row left', async () => {
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const gone = makeSystem()
    gone.dispose()
    expect(await runMeshLoad({ files: [objFile()], system: gone })).toEqual(CANCELLED)
    expect(rows()).toEqual([])
    expect(dispose).toHaveBeenCalled()
  })

  it('an abort after the import landed changes nothing', async () => {
    // A late cancel from the manager (the job already committed) must not reach
    // back into a finished import.
    const ctrl = new AbortController()
    const out = await runMeshLoad({ files: [objFile()], system, signal: ctrl.signal })
    ctrl.abort()
    expect(out.ok).toBe(true)
    expect(rowOf(out.meshId)?.status).toBe('ready')
    expect(system.count()).toBe(1)
  })

  it('an abort that lands inside the commit changes nothing', async () => {
    // Past its last await the import runs to the end in one synchronous step,
    // so a cancel there cannot be acted on — and must not be half-acted on. A
    // store subscriber aborting as the row turns 'ready' would otherwise have
    // the row removed from under a model the system already owns.
    const ctrl = new AbortController()
    const off = useMeshStore.subscribe((s) => {
      if (s.meshes.some((m) => m.status === 'ready')) ctrl.abort()
    })
    const out = await runMeshLoad({ files: [objFile()], system, signal: ctrl.signal })
    off()
    expect(ctrl.signal.aborted).toBe(true)
    expect(out.ok).toBe(true)
    expect(rowOf(out.meshId)?.status).toBe('ready')
    expect(system.count()).toBe(1)
  })
})

// ── A cancel during the glTF parse ────────────────────────────────────────────
// The parse is the one await nothing races, deliberately: it is main-thread
// work, and settling early would hand the decode slot to the next import while
// the CPU is still busy with this one. But the ROW must not wait with it: the
// Loading Center says 'Cancelled' the instant the job aborts, and a row still
// spinning beside it — for tens of seconds of Draco, or for ever on a stalled
// buffer URI — is the stuck 'loading' this module exists to rule out.

describe('a cancel during the glTF parse', () => {
  it('control: the held parse, once answered, imports normally', async () => {
    // Without this the tests below could pass against a stub that broke the
    // import some other way.
    const parse = heldParse()
    const pending = runMeshLoad({ files: [glbFile()], system })
    await parse.parsing
    parse.answer(triangleScene().scene)
    const out = await pending
    expect(out.ok).toBe(true)
    expect(rowOf(out.meshId)?.status).toBe('ready')
  })

  it('an abort removes the row at once, even when the parse never answers', async () => {
    const live = trackSubscriptions()
    const parse = heldParse()
    const ctrl = new AbortController()
    let settled = false
    void runMeshLoad({ files: [glbFile()], system, signal: ctrl.signal }).then(() => { settled = true })
    const id = activeId()
    await parse.parsing
    expect(rowOf(id)?.status).toBe('loading')
    expect(live()).toBe(1)

    ctrl.abort()
    // Synchronously: no await between the abort and these.
    expect(rowOf(id)).toBeUndefined()
    expect(loadingRows()).toEqual([])
    // Nothing left listening on behalf of an import that may never return.
    expect(live()).toBe(0)

    // …and yet it has not settled: the abandoned parse still owns the CPU, so
    // the lanes the adapter holds for it must stay held until it ends.
    await flush()
    expect(settled).toBe(false)
  })

  it('a parse answering late is freed, settles as a cancel, and leaves nothing behind', async () => {
    const live = trackSubscriptions()
    const parse = heldParse()
    const ctrl = new AbortController()
    const pending = runMeshLoad({ files: [glbFile()], system, signal: ctrl.signal })
    const id = activeId()
    await parse.parsing

    ctrl.abort()
    expect(rowOf(id)).toBeUndefined()

    const late = triangleScene()
    const dispose = vi.spyOn(late.geometry, 'dispose')
    parse.answer(late.scene)
    expect(await pending).toEqual(CANCELLED)
    // It never reached the system, so nothing else would ever free it.
    expect(dispose).toHaveBeenCalled()
    expect(system.count()).toBe(0)
    expect(rows()).toEqual([])
    expect(live()).toBe(0)
  })

  it('removing its own row mid-parse stops listening at once, and settles when the parse ends', async () => {
    // The store-side trip: panel X on a row whose GLB is still decoding. The
    // row is already gone; what must not linger is the subscription.
    const live = trackSubscriptions()
    const parse = heldParse()
    const pending = runMeshLoad({ files: [glbFile()], system })
    await parse.parsing

    removeMesh(activeId(), system)
    expect(live()).toBe(0)

    const late = triangleScene()
    const dispose = vi.spyOn(late.geometry, 'dispose')
    parse.answer(late.scene)
    expect(await pending).toEqual(CANCELLED)
    expect(dispose).toHaveBeenCalled()
    expect(rows()).toEqual([])
    expect(system.count()).toBe(0)
  })

  it('a sibling cancelled mid-parse leaves the other import alone', async () => {
    // The removal happens inside the abort, synchronously; it must take THIS
    // import's row and nobody else's.
    const ctrl = new AbortController()
    const parse = heldParse()
    const pa = runMeshLoad({ files: [glbFile()], system, signal: ctrl.signal })
    const aId = activeId()
    await parse.parsing
    const b = gated(objFile())
    const pb = runMeshLoad({ files: [b.file], system })
    const bId = activeId()

    ctrl.abort()
    expect(rowOf(aId)).toBeUndefined()
    expect(rowOf(bId)?.status).toBe('loading')

    b.open()
    expect(await pb).toEqual({ ok: true, meshId: bId })
    parse.answer(triangleScene().scene)
    expect(await pa).toEqual(CANCELLED)
    expect(rows().map((m) => m.id)).toEqual([bId])
  })
})

// ── Placement ─────────────────────────────────────────────────────────────────

describe('placement inputs are read after the decode', () => {
  const MODEL = { center: { x: 100, y: 5, z: -50 }, size: { x: 20, y: 10, z: 20 } }

  it('fits against the bounds resolvePlacement returns', async () => {
    const out = await runMeshLoad({
      files: [objFile()], system,
      resolvePlacement: async () => ({ modelBounds: MODEL }),
    })
    const placement = rowOf(out.meshId)!.placement
    expect(Math.abs(placement.x - MODEL.center.x)).toBeLessThan(1)
    expect(Math.abs(placement.z - MODEL.center.z)).toBeLessThan(1)
  })

  it('loadMesh still fits against the bounds it was handed', async () => {
    const out = await loadMesh({ files: [objFile()], system, modelBounds: MODEL })
    expect(Math.abs(rowOf(out.meshId)!.placement.x - MODEL.center.x)).toBeLessThan(1)
  })

  it('a failing resolvePlacement costs the fit, not the import', async () => {
    for (const resolvePlacement of [
      () => { throw new Error('viewer gone') },
      () => Promise.reject(new Error('viewer gone')),
    ]) {
      const out = await runMeshLoad({ files: [objFile()], system, resolvePlacement })
      expect(out.ok).toBe(true)
      expect(rowOf(out.meshId)?.status).toBe('ready')
    }
  })

  it('a throwing listener does not break the import', async () => {
    const out = await runMeshLoad({
      files: [objFile()], system,
      onEntry: () => { throw new Error('listener bug') },
      onStage: () => { throw new Error('listener bug') },
    })
    expect(out.ok).toBe(true)
  })
})

// ── The invariant ─────────────────────────────────────────────────────────────

describe('no row is ever left loading', () => {
  // Every way an import can end. A row stuck at 'loading' is a Loading Center
  // row that spins forever and a panel entry with no way out.
  const scenarios: Array<[string, () => Promise<MeshLoadResult>]> = [
    ['success', () => runMeshLoad({ files: [objFile()], system })],
    ['parse failure', () => runMeshLoad({ files: [new File(['junk'], 'broken.glb')], system })],
    ['no geometry', () => runMeshLoad({ files: [objFile(undefined, 'v 0 0 0\nv 1 1 1\n')], system })],
    ['budget exhausted', () => {
      useMeshStore.setState({ maxTriangles: 0 })
      return runMeshLoad({ files: [objFile()], system })
    }],
    ['system disposed mid-import', () => {
      const gone = makeSystem()
      gone.dispose()
      return runMeshLoad({ files: [objFile()], system: gone })
    }],
    ['aborted mid-decode', () => {
      const ctrl = new AbortController()
      const a = gated(objFile())
      const p = runMeshLoad({ files: [a.file], system, signal: ctrl.signal })
      ctrl.abort(); a.open()
      return p
    }],
    ['own row removed mid-decode', () => {
      const a = gated(objFile())
      const p = runMeshLoad({ files: [a.file], system })
      useMeshStore.getState().removeMesh(activeId())
      a.open()
      return p
    }],
    ['a sibling removed mid-decode', () => {
      useMeshStore.getState().addMesh({
        ...pendingEntry('sibling', new File(['x'], 'sibling.glb'), 'glb', 'sibling'), status: 'ready',
      })
      const a = gated(objFile())
      const p = runMeshLoad({ files: [a.file], system })
      useMeshStore.getState().removeMesh('sibling')
      a.open()
      return p
    }],
    ['cleared mid-decode', () => {
      const a = gated(objFile())
      const p = runMeshLoad({ files: [a.file], system })
      useMeshStore.getState().clearMeshes()
      a.open()
      return p
    }],
    ['aborted mid-parse, the parse answering late', async () => {
      const parse = heldParse()
      const ctrl = new AbortController()
      const p = runMeshLoad({ files: [glbFile()], system, signal: ctrl.signal })
      await parse.parsing
      ctrl.abort(); parse.answer(triangleScene().scene)
      return p
    }],
    ['aborted mid-parse, the parse failing late', async () => {
      // A late failure after a cancel is still a cancel: no 'error' row for an
      // import the user already asked to go away.
      const parse = heldParse()
      const ctrl = new AbortController()
      const p = runMeshLoad({ files: [glbFile()], system, signal: ctrl.signal })
      await parse.parsing
      ctrl.abort(); parse.fail(new Error('Draco decoder gone'))
      return p
    }],
    ['own row removed mid-parse', async () => {
      const parse = heldParse()
      const p = runMeshLoad({ files: [glbFile()], system })
      await parse.parsing
      useMeshStore.getState().removeMesh(activeId()); parse.answer(triangleScene().scene)
      return p
    }],
    ['cleared mid-parse', async () => {
      const parse = heldParse()
      const p = runMeshLoad({ files: [glbFile()], system })
      await parse.parsing
      useMeshStore.getState().clearMeshes(); parse.answer(triangleScene().scene)
      return p
    }],
    ['aborted waiting on resolvePlacement', async () => {
      const stalled = stalledPlacement()
      const ctrl = new AbortController()
      const p = runMeshLoad({ files: [objFile()], system, signal: ctrl.signal, resolvePlacement: stalled.resolvePlacement })
      await stalled.asked
      ctrl.abort()
      return p
    }],
    ['own row removed waiting on resolvePlacement', async () => {
      const stalled = stalledPlacement()
      const p = runMeshLoad({ files: [objFile()], system, resolvePlacement: stalled.resolvePlacement })
      await stalled.asked
      useMeshStore.getState().removeMesh(activeId())
      return p
    }],
    ['resolvePlacement failing', () =>
      runMeshLoad({ files: [objFile()], system, resolvePlacement: () => Promise.reject(new Error('viewer gone')) })],
    ['system.add throwing', () => {
      // Not a refusal (that is a cancel) but a bug in the hand-off: a failure,
      // with its row, like any other.
      vi.spyOn(system, 'add').mockImplementation(() => { throw new Error('gpu said no') })
      return runMeshLoad({ files: [objFile()], system })
    }],
    ['aborted inside the commit', () => {
      const ctrl = new AbortController()
      const off = useMeshStore.subscribe((s) => {
        if (s.meshes.some((m) => m.status === 'ready')) ctrl.abort()
      })
      return runMeshLoad({ files: [objFile()], system, signal: ctrl.signal }).finally(off)
    }],
  ]

  it.each(scenarios)('%s', async (_name, run) => {
    const live = trackSubscriptions()
    const out = await run()
    expect(typeof out.ok).toBe('boolean')
    expect(loadingRows()).toEqual([])
    // And nothing left subscribed to the store on the import's behalf.
    expect(live()).toBe(0)
    // Failures keep their row with the reason; cancels have none; successes
    // are ready. There is no fourth state.
    for (const row of rows()) expect(['ready', 'error']).toContain(row.status)
  })

  // The table above looks once the import is OVER. A cancel must not wait for
  // that: wherever the import is parked — including the awaits nothing races,
  // a slow file read and the glTF parse — its row goes with the abort, and so
  // does its store subscription, before the import itself gets round to ending.
  type Parked = { pending: Promise<MeshLoadResult>; id: string; finish: () => void }
  const parked: Array<[string, (signal: AbortSignal) => Promise<Parked>]> = [
    ['reading the file', async (signal) => {
      const a = gated(objFile())
      const pending = runMeshLoad({ files: [a.file], system, signal })
      return { pending, id: activeId(), finish: a.open }
    }],
    ['in the glTF parse', async (signal) => {
      const parse = heldParse()
      const pending = runMeshLoad({ files: [glbFile()], system, signal })
      const id = activeId()
      await parse.parsing
      return { pending, id, finish: () => parse.answer(triangleScene().scene) }
    }],
    ['waiting on resolvePlacement', async (signal) => {
      const stalled = stalledPlacement()
      const pending = runMeshLoad({ files: [objFile()], system, signal, resolvePlacement: stalled.resolvePlacement })
      const id = activeId()
      await stalled.asked
      return { pending, id, finish: () => { /* raced: nothing to finish */ } }
    }],
  ]

  it.each(parked)('not even for the moment it is cancelled — %s', async (_name, park) => {
    const live = trackSubscriptions()
    const ctrl = new AbortController()
    const { pending, id, finish } = await park(ctrl.signal)
    expect(rowOf(id)?.status).toBe('loading')

    ctrl.abort()
    expect(rowOf(id)).toBeUndefined()
    expect(live()).toBe(0)

    finish()
    expect(await pending).toEqual(CANCELLED)
    expect(rows()).toEqual([])
    expect(system.count()).toBe(0)
  })
})

// ── Entry selection ───────────────────────────────────────────────────────────

describe('entryName', () => {
  it('imports the named entry out of a selection holding two', async () => {
    const first = objFile('first.obj')
    const second = objFile('second.obj', 'v 0 0 0\nv 2 0 0\nv 0 2 0\nv 2 2 0\nf 1 2 3\nf 2 4 3\n')
    const out = await runMeshLoad({ files: [first, second], entryName: 'second.obj', system })
    expect(out.ok).toBe(true)
    expect(rowOf(out.meshId)?.fileName).toBe('second.obj')
    // And it is the second file's geometry that was decoded, not just its name
    // on the first file's triangles.
    expect(rowOf(out.meshId)?.stats.triangles).toBe(2)
  })

  it('without one, the first entry in the selection is imported, as before', async () => {
    const out = await runMeshLoad({ files: [objFile('a.obj'), objFile('b.obj')], system })
    expect(rowOf(out.meshId)?.fileName).toBe('a.obj')
  })
})
