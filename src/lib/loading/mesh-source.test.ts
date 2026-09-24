// @vitest-environment node
// The mesh adapter driven THROUGH a real LoadManager. Only the runner chunk,
// the viewer's mesh system and the network are faked; the fake runner follows
// the MeshRunOptions contract (entry, stages, resolvePlacement before the
// scene add, an abort that settles as 'error.cancelled').
import { describe, it, expect, afterEach } from 'vitest'
import { LoadManager } from './load-manager'
import { createResourcePolicy, type EnvironmentProbe } from './resource-policy'
import { createMeshSourceAdapter, type MeshRunnerModule } from './mesh-source'
import type { MeshRunOptions } from '../mesh/mesh-runner'
import type { MeshSystemAPI } from '../mesh/mesh-system'
import type { JobHandle, JobOutcome, LoadJobView, LoadSource, SubmitOptions } from './types'

async function until(pred: () => boolean, label = 'condition'): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise<void>((r) => { setTimeout(r, 1) })
  }
  if (!pred()) throw new Error(`timed out waiting for ${label}`)
}

interface MeshCall {
  opts: MeshRunOptions
  meshId: string
  /** Decode done: stage 'place', placement resolved, then the add. */
  place(): Promise<void>
  fail(errorKey: string): void
  placedWith: unknown
}

class FakeMeshRunner implements MeshRunnerModule {
  calls: MeshCall[] = []
  removed: string[] = []
  private n = 0

  runMeshLoad = (opts: MeshRunOptions): Promise<{ ok: boolean; meshId?: string; errorKey?: string }> => {
    const meshId = `mesh-${++this.n}`
    return new Promise((resolve) => {
      let settled = false
      const settle = (r: { ok: boolean; meshId?: string; errorKey?: string }): void => {
        if (settled) return
        settled = true
        resolve(r)
      }
      opts.onEntry?.(meshId)
      opts.onStage?.('decode')
      opts.signal?.addEventListener('abort', () => settle({ ok: false, errorKey: 'error.cancelled' }), { once: true })
      const call: MeshCall = {
        opts, meshId, placedWith: undefined,
        place: async () => {
          opts.onStage?.('place')
          call.placedWith = await opts.resolvePlacement?.()
          if (opts.signal?.aborted) { settle({ ok: false, errorKey: 'error.cancelled' }); return }
          settle({ ok: true, meshId })
        },
        fail: (key) => settle({ ok: false, errorKey: key }),
      }
      this.calls.push(call)
    })
  }

  removeMesh = (id: string): void => { this.removed.push(id) }
}

type FetchImpl = (url: string, o: { fileName?: string; onProgress: (p: { ratio: number | null; receivedBytes: number; totalBytes: number | null }) => void; cache: RequestCache }) => Promise<File>

function harness(opts: { sceneModels?: () => number; maxConcurrentDecodes?: number; fetchFile?: FetchImpl } = {}) {
  const env: EnvironmentProbe = { cores: 8, deviceMemoryGB: 8, crossOriginIsolated: false, mobile: false, heapLimitBytes: null }
  const policy = createResourcePolicy(env, { maxConcurrentDecodes: opts.maxConcurrentDecodes ?? 2 })
  const mgr = new LoadManager({ policy, countSceneModels: opts.sceneModels })
  const runner = new FakeMeshRunner()
  const framed: string[] = []
  const system = { frame: (id: string) => { framed.push(id) } } as unknown as MeshSystemAPI
  const fetched: string[] = []
  mgr.registerAdapter(createMeshSourceAdapter({
    loadRunner: async () => runner,
    getSystem: async () => system,
    fetchFile: async (url, o) => {
      fetched.push(url)
      if (opts.fetchFile) return opts.fetchFile(url, o)
      o.onProgress({ ratio: 1, receivedBytes: 10, totalBytes: 10 })
      return new File([new Uint8Array(10)], o.fileName ?? new URL(url).pathname.split('/').pop() ?? 'x')
    },
    placementInputs: () => ({ modelBounds: { center: { x: 1, y: 2, z: 3 }, size: { x: 4, y: 5, z: 6 } } }),
    removeEntry: () => {},
    shouldFrame: (o) => o.frame ?? false,
  }))
  const submit = (source: LoadSource, o: Partial<SubmitOptions> = {}): JobHandle =>
    mgr.submit(source, 'mesh', { origin: 'drop', ...o })
  const job = (id: string): LoadJobView => {
    const j = mgr.getSnapshot().jobs.find((x) => x.id === id)
    if (!j) throw new Error(`no job ${id}`)
    return j
  }
  return { mgr, runner, framed, fetched, submit, job }
}

let current: ReturnType<typeof harness> | null = null
afterEach(() => { current?.mgr.dispose(); current = null })

const glb = (name = 'chair.glb'): File => new File([new Uint8Array(64)], name)

describe('mesh adapter', () => {
  it('hands the runner the entry first plus its sidecars, then commits the mesh id', async () => {
    const h = current = harness()
    const tex = new File([new Uint8Array(8)], 'wood.png')
    const bin = new File([new Uint8Array(8)], 'chair.bin')
    const handle = h.submit({ type: 'file', file: glb('chair.gltf'), sidecars: [bin, tex] }, { frame: true })
    expect(h.job(handle.id).sizeBytes).toBe(64 + 8 + 8)
    await until(() => h.runner.calls.length === 1, 'runner')
    const call = h.runner.calls[0]
    expect(call.opts.files.map((f) => f.name)).toEqual(['chair.gltf', 'chair.bin', 'wood.png'])
    expect(call.opts.entryName).toBe('chair.gltf')
    expect(h.job(handle.id).resultId).toBe(call.meshId)
    expect(h.job(handle.id).phase).toBe('decode')

    await call.place()
    expect(call.placedWith).toEqual({ modelBounds: { center: { x: 1, y: 2, z: 3 }, size: { x: 4, y: 5, z: 6 } } })
    expect(await handle.settled).toMatchObject({ status: 'loaded', resultId: call.meshId })
    expect(h.job(handle.id).phases.map((p) => [p.id, p.status])).toEqual([['decode', 'done'], ['place', 'done']])
    expect(h.framed).toEqual([call.meshId])
  })

  it('frees its decode slot while it waits to be placed', async () => {
    const h = current = harness({ maxConcurrentDecodes: 1 })
    const a = h.submit({ type: 'file', file: glb('a.glb') })
    const b = h.submit({ type: 'file', file: glb('b.glb') })
    await until(() => h.runner.calls.length === 1, 'a decoding')
    expect(h.job(b.id).waitReason).toBe('slot')
    // a finishes decoding and queues for placement → b may decode.
    const placing = h.runner.calls[0].place()
    await until(() => h.runner.calls.length === 2, 'b decoding')
    await placing
    expect((await a.settled).status).toBe('loaded')
  })

  it('cancel stops THIS import only — no sibling is touched, nothing is left loading', async () => {
    const h = current = harness()
    const a = h.submit({ type: 'file', file: glb('a.glb') })
    const b = h.submit({ type: 'file', file: glb('b.glb') })
    await until(() => h.runner.calls.length === 2)
    h.mgr.cancel(a.id)
    expect((await a.settled).status).toBe('cancelled')
    expect(h.runner.calls[1].opts.signal?.aborted).toBe(false)
    await h.runner.calls[1].place()
    expect((await b.settled).status).toBe('loaded')
  })

  it('a runner key becomes detailKey; a missing entry file is not retried', async () => {
    const h = current = harness()
    const handle = h.submit({ type: 'file', file: glb() })
    await until(() => h.runner.calls.length === 1)
    h.runner.calls[0].fail('error.noEntryFile')
    const outcome = await handle.settled as Extract<JobOutcome, { status: 'failed' }>
    expect(outcome.error).toMatchObject({
      code: 'invalid-file', detailKey: 'mesh:error.noEntryFile', autoRetryable: false, userRetryable: false,
    })
  })

  it('downloads a multi-file URL source under one network ticket, entry first', async () => {
    const h = current = harness()
    const handle = h.submit({
      type: 'url',
      url: 'https://cdn.example/m/model.gltf?sig=1',
      sidecars: [{ url: 'https://cdn.example/m/model.bin?sig=1' }, { url: 'https://cdn.example/m/tex.png' }],
    }, { origin: 'sdk' })
    await until(() => h.runner.calls.length === 1)
    expect(h.fetched).toHaveLength(3)
    expect(h.runner.calls[0].opts.files.map((f) => f.name)).toEqual(['model.gltf', 'model.bin', 'tex.png'])
    expect(h.runner.calls[0].opts.sourceUrl).toBe('https://cdn.example/m/model.gltf?sig=1')
    expect(h.job(handle.id).phases.find((p) => p.id === 'download')).toMatchObject({ status: 'done', unit: 'bytes', done: 30 })
    await h.runner.calls[0].place()
    expect((await handle.settled).status).toBe('loaded')
  })

  it('Remove on a loaded mesh goes through mesh-runner\'s own removal', async () => {
    const h = current = harness()
    const handle = h.submit({ type: 'file', file: glb() })
    await until(() => h.runner.calls.length === 1)
    await h.runner.calls[0].place()
    await handle.settled
    await h.mgr.remove(handle.id)
    expect(h.runner.removed).toEqual([h.runner.calls[0].meshId])
  })

  it('never counts as a model load', async () => {
    const h = current = harness()
    h.submit({ type: 'file', file: glb() })
    await until(() => h.runner.calls.length === 1)
    expect(h.mgr.getSnapshot().summary.managedActive).toBe(0)
  })
})

describe('mesh adapter — review fixes', () => {
  it('a multi-file download moves by files while the byte total is unknown', async () => {
    const seen: Array<number | null> = []
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const h = current = harness({
      fetchFile: async (url, o) => {
        // The .obj reports its own length; the .mtl sends none.
        if (url.endsWith('.obj')) {
          o.onProgress({ ratio: 0.5, receivedBytes: 50, totalBytes: 100 })
          await gate
          o.onProgress({ ratio: 1, receivedBytes: 100, totalBytes: 100 })
        } else {
          o.onProgress({ ratio: null, receivedBytes: 5, totalBytes: null })
        }
        return new File([new Uint8Array(4)], new URL(url).pathname.split('/').pop() ?? 'x')
      },
    })
    const handle = h.submit({ type: 'url', url: 'https://cdn.example/m/man.obj', sidecars: [{ url: 'https://cdn.example/m/man.mtl' }] }, { origin: 'demo' })
    const dl = () => h.job(handle.id).phases.find((p) => p.id === 'download')
    await until(() => dl()?.fraction === 0.25, 'half of the first of two files')
    seen.push(dl()?.fraction ?? null)
    release()
    await until(() => h.runner.calls.length === 1, 'decoding')
    expect(seen).toEqual([0.25])
    expect(dl()?.status).toBe('done')
    await h.runner.calls[0].place()
    expect((await handle.settled).status).toBe('loaded')
  })

  it('cancel while waiting for the anchor to be placed: the job ends cancelled, the runner sees it', async () => {
    let models = 0
    const h = current = harness({ sceneModels: () => models })
    // An anchor IFC that converts until the test lets it go.
    let openIfc: () => void = () => {}
    const ifcGate = new Promise<void>((r) => { openIfc = r })
    h.mgr.registerAdapter({
      kind: 'ifc',
      plan: () => [{ id: 'geometry', weight: 1 }, { id: 'attach', weight: 1 }],
      sizeOf: () => 1,
      fileNameOf: () => 'anchor.ifc',
      estimate: () => ({ peakBytes: 1, exclusive: false }),
      run: async (ctx) => {
        ctx.phase('geometry')
        const c = await ctx.acquire('convert')
        await ifcGate
        c.release()
        ctx.phase('attach')
        const a = await ctx.acquire('attach')
        models = 1
        ctx.committed('m-1', { fromCache: false })
        a.release()
        return { resultId: 'm-1', fromCache: false }
      },
    })
    const anchor = h.mgr.submit({ type: 'file', file: new File(['x'], 'anchor.ifc') }, 'ifc', { origin: 'drop' })
    const mesh = h.submit({ type: 'file', file: glb() })
    await until(() => h.runner.calls.length === 1)
    const placing = h.runner.calls[0].place()
    await until(() => h.job(mesh.id).waitReason === 'anchor', 'mesh waits for the anchor')
    h.mgr.cancel(mesh.id)
    expect((await mesh.settled).status).toBe('cancelled')
    await placing
    expect(h.runner.calls[0].placedWith).toEqual({ modelBounds: null })
    openIfc()
    expect((await anchor.settled).status).toBe('loaded')
  })
})
