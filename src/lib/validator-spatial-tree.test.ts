// buildSpatialTree as the loading engine drives it: one build per committed
// model on the shared validator worker. Two builds must never cross (ids are
// per request, not per millisecond), and a model that left the scene while
// its tree was parsed must not get a tree back.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface Posted {
  type: string
  id: string
  buffer: ArrayBuffer
}

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  readonly posted: Posted[] = []

  constructor() {
    super()
    FakeWorker.instances.push(this)
  }

  postMessage(msg: Posted): void {
    this.posted.push(msg)
  }

  terminate(): void { /* nothing to stop */ }

  /** Answer a posted build the way validator.worker does: the tree, then tree-done. */
  answer(id: string, name: string): void {
    const tree = [{ expressId: 1, globalId: `g-${name}`, name, ifcClass: 'IFCSITE', children: [], containedElements: [] }]
    this.dispatchEvent(new MessageEvent('message', { data: { type: 'tree', id, tree } }))
    this.dispatchEvent(new MessageEvent('message', { data: { type: 'tree-done', id } }))
  }
}

vi.stubGlobal('Worker', FakeWorker)

const { buildSpatialTree } = await import('./validator')
const { modelRegistry } = await import('./model-registry')
const { useValidationStore } = await import('../stores/validationStore')

function register(modelId: string): ArrayBuffer {
  const ifcBuffer = new TextEncoder().encode(`ISO-10303-21;\nHEADER;\n${'/* padding */'.repeat(8)}\n`).buffer as ArrayBuffer
  modelRegistry.register({
    modelId, fileName: `${modelId}.ifc`, ifcBuffer, opfsCacheKey: `v3:${modelId}`, expressIDToType: new Map(), loadedAt: 1,
  })
  return ifcBuffer
}

function worker(): FakeWorker {
  const w = FakeWorker.instances[0]
  if (!w) throw new Error('no validator worker was created')
  return w
}

function postedFor(count: number): Posted[] {
  return worker().posted.slice(-count)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_726_000_000_000)
  for (const level of ['debug', 'info', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => {})
})

afterEach(() => {
  modelRegistry.clear()
  useValidationStore.getState().reset()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('buildSpatialTree', () => {
  it('two builds started in the same millisecond get distinct ids and their own trees', async () => {
    register('m1')
    register('m2')
    const a = buildSpatialTree('m1')
    const b = buildSpatialTree('m2')
    const [p1, p2] = postedFor(2)
    expect(p1.type).toBe('build-tree')
    expect(p1.id).not.toBe(p2.id)

    // Answered out of order: each tree still lands on its own model.
    worker().answer(p2.id, 'second')
    worker().answer(p1.id, 'first')
    await Promise.all([a, b])
    const trees = useValidationStore.getState().spatialTrees
    expect(trees.m1?.[0]?.name).toBe('first')
    expect(trees.m2?.[0]?.name).toBe('second')
  })

  it('posts a copy: the registry keeps its buffer intact', async () => {
    const buf = register('m3')
    const done = buildSpatialTree('m3')
    const [p] = postedFor(1)
    expect(p.buffer).not.toBe(buf)
    expect(buf.byteLength).toBeGreaterThan(0)
    worker().answer(p.id, 'site')
    await done
  })

  it('a model removed while its tree is parsed gets no tree', async () => {
    register('gone')
    const done = buildSpatialTree('gone')
    const [p] = postedFor(1)
    modelRegistry.unregister('gone')
    worker().answer(p.id, 'late')
    await done
    const s = useValidationStore.getState()
    expect(s.spatialTrees.gone).toBeUndefined()
    expect(s.activeValidationModelId).not.toBe('gone')
  })

  it('a model that is not registered is never parsed', async () => {
    const before = FakeWorker.instances[0]?.posted.length ?? 0
    await buildSpatialTree('never-registered')
    expect(FakeWorker.instances[0]?.posted.length ?? 0).toBe(before)
    expect(useValidationStore.getState().spatialTrees['never-registered']).toBeUndefined()
  })
})
