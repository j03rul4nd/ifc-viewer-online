// ─── ifc-parser.worker message-handling tests ─────────────────────────────────
// The worker's contract is that every `parse` gets exactly one terminal reply
// (result or error) with a code the retry policy can act on, and that the File
// path reads the bytes HERE — the main thread posts a handle and never holds
// the IFC. Pinned here:
//   • the pre-WASM paths (invalid bytes, unreadable File) answer with the right
//     code and never construct the importer;
//   • the conversion path, with IfcImporter replaced by a scripted fake: stage
//     order, the importer's ProgressData passed through, the result handed back
//     without a copy, thrown text classified into codes;
//   • the pure helpers (throttle gate, transfer, classifier).
//
// `self` in jsdom is the window, so importing the module installs its onmessage
// handler on it and messages can be dispatched by hand (as in ids.worker.test).
// web-ifc and fragments are mocked: real WASM has no place in a unit test.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

type Posted = {
  type: string
  id?: string
  code?: string
  message?: string
  stage?: string
  percent?: number
  fraction?: number
  process?: string
  state?: string
  className?: string
  entitiesProcessed?: number
  fragmentsBuffer?: ArrayBuffer
}

type ProcessArgs = { bytes: Uint8Array; progressCallback?: (p: number, d?: unknown) => void }

const h = vi.hoisted(() => ({
  script: null as null | ((args: ProcessArgs) => Promise<Uint8Array>),
  importers: [] as Array<{ webIfcSettings: Record<string, unknown>; wasm: unknown; received?: Uint8Array }>,
}))

vi.mock('web-ifc', () => ({
  IfcAPI: class {
    Init(): Promise<void> { return Promise.resolve() }
  },
}))

vi.mock('@thatopen/fragments', () => ({
  IfcImporter: class {
    webIfcSettings: Record<string, unknown> = { COORDINATE_TO_ORIGIN: true, OPTIMIZE_PROFILES: true }
    wasm: unknown = { path: '', absolute: false }
    received?: Uint8Array
    constructor() { h.importers.push(this) }
    process(args: ProcessArgs): Promise<Uint8Array> {
      this.received = args.bytes
      if (!h.script) return Promise.reject(new Error('no script'))
      return h.script(args)
    }
  },
}))

type WorkerModule = typeof import('./ifc-parser.worker')

const posted: Posted[] = []
const transfers: Array<Transferable[] | undefined> = []
let mod: WorkerModule

function send(data: unknown): void {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  if (!handler) throw new Error('worker did not install an onmessage handler')
  handler({ data } as MessageEvent)
}

/** Wait until the job has a terminal reply (result/error). */
async function settle(id: string): Promise<Posted> {
  for (let i = 0; i < 100; i++) {
    const done = posted.find((m) => m.id === id && (m.type === 'result' || m.type === 'error'))
    if (done) return done
    await new Promise((r) => setTimeout(r, 5))
  }
  throw new Error(`no terminal reply for ${id}; got ${JSON.stringify(posted.map((m) => m.type))}`)
}

const IFC_HEADER = 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'ViewDefinition [CoordinationView]\'),\'2;1\');\nENDSEC;\nDATA;\n'

function ifcBuffer(): ArrayBuffer {
  return new TextEncoder().encode(IFC_HEADER + '#1=IFCPROJECT(\'0YvctVUKr0kugbFTf53O9L\',$,$,$,$,$,$,$,$);\nENDSEC;\nEND-ISO-10303-21;\n').buffer as ArrayBuffer
}

function blobOf(buf: ArrayBuffer): Blob {
  // A Blob-shaped handle whose read can be spied on; the worker needs only
  // `size` and `arrayBuffer()`.
  return { size: buf.byteLength, type: '', arrayBuffer: () => Promise.resolve(buf.slice(0)) } as unknown as Blob
}

beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: unknown, t?: Transferable[]) => { posted.push(m as Posted); transfers.push(t) })
  mod = await import('./ifc-parser.worker')
})

beforeEach(() => {
  posted.length = 0
  transfers.length = 0
  h.importers.length = 0
  h.script = null
})

// ── Pre-WASM paths ────────────────────────────────────────────────────────────

describe('ifc-parser.worker — before any WASM', () => {
  it('rejects bytes that are not IFC as invalid-file, without constructing the importer', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 this is a pdf, not an ifc file at all — long enough to pass the size check'.repeat(2))
    send({ type: 'parse', id: 'j1', fileName: 'drawing.pdf', buffer: bytes.buffer })
    const reply = await settle('j1')
    expect(reply).toMatchObject({ type: 'error', id: 'j1', code: 'invalid-file' })
    expect(reply.message).toContain('drawing.pdf')
    expect(posted.some((m) => m.type === 'stage')).toBe(false)
    expect(h.importers).toHaveLength(0)
  })

  it('rejects an empty buffer as invalid-file', async () => {
    send({ type: 'parse', id: 'j2', fileName: 'empty.ifc', buffer: new ArrayBuffer(0) })
    expect(await settle('j2')).toMatchObject({ type: 'error', code: 'invalid-file' })
  })

  it('a File is read inside the worker: stage "reading" first, then the guard', async () => {
    const bad = new TextEncoder().encode('not an ifc, just text that is long enough to reach the signature check...').buffer as ArrayBuffer
    const file = blobOf(bad)
    const read = vi.spyOn(file, 'arrayBuffer')
    send({ type: 'parse', id: 'j3', fileName: 'notes.ifc', file })
    expect(posted[0]).toEqual({ type: 'stage', id: 'j3', stage: 'reading' })
    const reply = await settle('j3')
    expect(read).toHaveBeenCalledTimes(1)
    expect(reply).toMatchObject({ type: 'error', code: 'invalid-file' })
    expect(posted.map((m) => m.type)).toEqual(['stage', 'error'])
    expect(h.importers).toHaveLength(0)
  })

  it('a real (tiny, invalid) Blob goes through the same path', async () => {
    const blob = new Blob(['tiny'])
    send({ type: 'parse', id: 'j3b', fileName: 'tiny.ifc', file: blob })
    expect(posted[0]).toMatchObject({ type: 'stage', stage: 'reading' })
    expect(await settle('j3b')).toMatchObject({ type: 'error', code: 'invalid-file' })
  })

  it('a File that cannot be read is read-failed; an allocation failure is out-of-memory', async () => {
    const gone = { size: 10, arrayBuffer: () => Promise.reject(new DOMException('The file could not be read', 'NotReadableError')) }
    send({ type: 'parse', id: 'j4', fileName: 'moved.ifc', file: gone })
    const r1 = await settle('j4')
    expect(r1).toMatchObject({ type: 'error', code: 'read-failed' })
    expect(r1.message).toContain('NotReadableError')

    const huge = { size: 3e9, arrayBuffer: () => Promise.reject(new RangeError('Array buffer allocation failed')) }
    send({ type: 'parse', id: 'j5', fileName: 'huge.ifc', file: huge })
    expect(await settle('j5')).toMatchObject({ type: 'error', code: 'out-of-memory' })
  })

  it('a parse with neither file nor buffer is answered, not dropped', async () => {
    send({ type: 'parse', id: 'j6', fileName: 'x.ifc' })
    expect(await settle('j6')).toMatchObject({ type: 'error', code: 'invalid-file' })
  })

  it('stays quiet for messages nobody is waiting on', async () => {
    send(null)
    send({ type: 'nonsense', id: 'j7' })
    send({ type: 'parse', fileName: 'x.ifc', buffer: ifcBuffer() })   // no id
    await new Promise((r) => setTimeout(r, 20))
    expect(posted).toEqual([])
  })
})

// ── Conversion path (scripted importer) ───────────────────────────────────────

describe('ifc-parser.worker — conversion', () => {
  it('File path: reading → converting → progress (ProgressData passed through) → result without a copy', async () => {
    const out = new Uint8Array(new ArrayBuffer(32))
    h.script = async ({ progressCallback }) => {
      progressCallback?.(0, { process: 'conversion', state: 'start' })
      progressCallback?.(0.25, { process: 'geometries', state: 'start', class: 'IFCWALL', entitiesProcessed: 12 })
      progressCallback?.(0.5, { process: 'geometries', state: 'finish', class: 'IFCSLAB', entitiesProcessed: 3 })
      progressCallback?.(0.6, { process: 'attributes', state: 'start', entitiesProcessed: 15 })
      progressCallback?.(1, { process: 'conversion', state: 'finish' })
      return out
    }
    send({ type: 'parse', id: 'c1', fileName: 'Hotel_Vela_ARC.ifc', file: blobOf(ifcBuffer()) })
    const reply = await settle('c1')

    expect(posted.filter((m) => m.type === 'stage').map((m) => m.stage)).toEqual(['reading', 'converting'])
    const stageIdx = posted.findIndex((m) => m.stage === 'converting')
    const firstProgress = posted.findIndex((m) => m.type === 'progress')
    expect(stageIdx).toBeLessThan(firstProgress)

    const progress = posted.filter((m) => m.type === 'progress')
    expect(progress.map((m) => m.fraction)).toEqual([0, 0.25, 0.5, 0.6, 1])
    // Legacy fields survive for embed-loader / useIfcLoader.
    expect(progress.map((m) => m.percent)).toEqual([0, 25, 50, 60, 99])
    expect(progress.every((m) => (m as { phase?: string }).phase === 'parsing')).toBe(true)
    expect(progress[1]).toMatchObject({ process: 'geometries', state: 'start', className: 'IFCWALL', entitiesProcessed: 12 })
    expect(progress[3]).toMatchObject({ process: 'attributes', state: 'start', entitiesProcessed: 15 })
    expect(progress[3].className).toBeUndefined()

    expect(reply.type).toBe('result')
    expect(reply.fragmentsBuffer).toBe(out.buffer)            // no slice: the view spans its buffer
    expect(transfers[posted.indexOf(reply)]).toEqual([out.buffer])

    // The importer got the file's bytes and the app's coordinate policy.
    const imp = h.importers[0]
    expect(imp.received?.byteLength).toBe(ifcBuffer().byteLength)
    expect(imp.webIfcSettings.COORDINATE_TO_ORIGIN).toBe(false)
    expect(imp.webIfcSettings.OPTIMIZE_PROFILES).toBe(true)
  })

  it('buffer path (legacy): no reading stage, and a partial view is sliced to its range', async () => {
    const backing = new Uint8Array(64).map((_, i) => i)
    const view = backing.subarray(8, 24)
    h.script = async () => view
    send({ type: 'parse', id: 'c2', fileName: 'embed.ifc', buffer: ifcBuffer() })
    const reply = await settle('c2')
    expect(posted.filter((m) => m.type === 'stage').map((m) => m.stage)).toEqual(['converting'])
    expect(reply.type).toBe('result')
    const got = new Uint8Array(reply.fragmentsBuffer!)
    expect(got.byteLength).toBe(16)
    expect(Array.from(got)).toEqual(Array.from(view))
    expect(reply.fragmentsBuffer).not.toBe(backing.buffer)
  })

  it.each([
    ['RuntimeError: Aborted(OOM)', 'out-of-memory'],
    ['Cannot enlarge memory arrays to size 2147549184 bytes', 'out-of-memory'],
    ['RuntimeError: memory access out of bounds', 'out-of-memory'],
    ['Aborted(both async and sync fetching of the wasm failed)', 'worker-init'],
    ['failed to asynchronously prepare wasm: CompileError: WebAssembly.instantiate(): expected magic word', 'worker-init'],
    ['Fragments: Model schema not recognized.', 'parse'],
  ])('classifies a thrown "%s" as %s', async (text, code) => {
    h.script = async () => { throw new Error(text) }
    const id = `e-${code}-${text.length}`
    send({ type: 'parse', id, fileName: 'Model.ifc', buffer: ifcBuffer() })
    const reply = await settle(id)
    expect(reply).toMatchObject({ type: 'error', code })
    expect(reply.message).toContain('Model.ifc')
    expect(reply.message).toContain(text.replace(/^RuntimeError: /, ''))
  })

  it('uses the error name too (a bare WebAssembly.CompileError message)', async () => {
    class CompileError extends Error { constructor(m: string) { super(m); this.name = 'CompileError' } }
    h.script = async () => { throw new CompileError('expected magic word 00 61 73 6d') }
    send({ type: 'parse', id: 'e-name', fileName: 'Model.ifc', buffer: ifcBuffer() })
    expect(await settle('e-name')).toMatchObject({ type: 'error', code: 'worker-init' })
  })
})

// ── Pure helpers ──────────────────────────────────────────────────────────────

describe('createProgressGate', () => {
  type PM = import('./ifc-parser.worker').ProgressMessage
  const msg = (over: Partial<PM>): PM => ({
    type: 'progress', id: 'g', phase: 'parsing', percent: 0, fraction: 0, ...over,
  })

  it('always posts process changes, start/finish and new classes', () => {
    let t = 0
    const gate = mod.createProgressGate(50, () => t)
    const posts = [
      gate.offer(msg({ process: 'geometries', state: 'start', className: 'A', entitiesProcessed: 1 })),
      gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'B', entitiesProcessed: 1 })),
      gate.offer(msg({ process: 'geometries', state: 'finish', className: 'B', entitiesProcessed: 1 })),
      gate.offer(msg({ process: 'attributes', state: 'inProgress', className: 'B', entitiesProcessed: 1 })),
    ]
    expect(posts.map((p) => p.length)).toEqual([1, 1, 1, 1])
  })

  it('throttles same-class repeats to one per interval and carries their entities forward', () => {
    let t = 0
    const gate = mod.createProgressGate(50, () => t)
    expect(gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'W', entitiesProcessed: 10 }))).toHaveLength(1)
    t = 10
    expect(gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'W', entitiesProcessed: 5, fraction: 0.1 }))).toEqual([])
    t = 20
    expect(gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'W', entitiesProcessed: 7, fraction: 0.2 }))).toEqual([])
    t = 60
    const [m] = gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'W', entitiesProcessed: 1, fraction: 0.3 }))
    expect(m).toMatchObject({ fraction: 0.3, entitiesProcessed: 13 })   // 1 + 5 + 7
    expect(gate.flush()).toEqual([])
  })

  it('flushes a pending message before a new process, and at the end', () => {
    let t = 0
    const gate = mod.createProgressGate(50, () => t)
    gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'W', entitiesProcessed: 1 }))
    t = 1
    expect(gate.offer(msg({ process: 'geometries', state: 'inProgress', className: 'W', entitiesProcessed: 4, fraction: 0.4 }))).toEqual([])
    t = 2
    const out = gate.offer(msg({ process: 'attributes', state: 'start', entitiesProcessed: 9, fraction: 0.6 }))
    expect(out.map((m) => [m.process, m.entitiesProcessed])).toEqual([['geometries', 4], ['attributes', 9]])

    t = 3
    gate.offer(msg({ process: 'attributes', state: 'inProgress', className: 'X', entitiesProcessed: 2, fraction: 0.61 }))
    t = 4
    expect(gate.offer(msg({ process: 'attributes', state: 'inProgress', className: 'X', entitiesProcessed: 3, fraction: 0.62 }))).toEqual([])
    expect(gate.flush()).toEqual([expect.objectContaining({ fraction: 0.62, entitiesProcessed: 3 })])
    expect(gate.flush()).toEqual([])
  })
})

describe('transferableBuffer', () => {
  it('returns the buffer itself when the view spans it', () => {
    const u = new Uint8Array(10)
    expect(mod.transferableBuffer(u)).toBe(u.buffer)
  })

  it('slices exactly the view range otherwise', () => {
    const u = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).subarray(2, 5)
    const b = mod.transferableBuffer(u)
    expect(b).not.toBe(u.buffer)
    expect(Array.from(new Uint8Array(b))).toEqual([2, 3, 4])
  })

  it('a view that starts at 0 but is shorter than its buffer is sliced too', () => {
    const u = new Uint8Array(new ArrayBuffer(16), 0, 4)
    expect(mod.transferableBuffer(u).byteLength).toBe(4)
  })
})

describe('classifyConversionError', () => {
  it('checks memory before init (an OOM abort is not an init failure)', () => {
    expect(mod.classifyConversionError('Aborted(OOM)')).toBe('out-of-memory')
    expect(mod.classifyConversionError('RangeError: Array buffer allocation failed')).toBe('out-of-memory')
    expect(mod.classifyConversionError('out of memory')).toBe('out-of-memory')
    expect(mod.classifyConversionError('WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance')).toBe('out-of-memory')
    expect(mod.classifyConversionError('WebAssembly.instantiate(): expected magic word')).toBe('worker-init')
    expect(mod.classifyConversionError('TypeError: Cannot read properties of undefined')).toBe('parse')
  })
})
