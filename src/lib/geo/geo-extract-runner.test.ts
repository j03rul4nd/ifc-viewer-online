// ─── geo-extract-runner tests ─────────────────────────────────────────────────
// quickScanGeoref is pure; runGeoExtract / ensureGeorefExtracted are tested
// against a stubbed global Worker (jsdom has none).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  quickScanGeoref,
  quickScanAndStore,
  runGeoExtract,
  ensureGeorefExtracted,
} from './geo-extract-runner'
import { useGeoStore } from '../../stores/geoStore'
import { modelRegistry } from '../model-registry'
import type { GeorefExtraction } from './geo-types'

// ── Helpers ─────────────────────────────────────────────────────────────────────

function toBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer
}

function foundExtraction(): GeorefExtraction {
  return {
    status: 'found', rung: 1, epsgCode: 'EPSG:25832',
    lat: null, lon: null, heightM: 100, rotationDeg: 0,
    eastings: 500_000, northings: 5_400_000, scale: 1,
    raw: {}, reasons: [], largeWcsOffset: false,
  }
}

function registerModel(id: string, buffer: ArrayBuffer | null = toBuffer('ISO-10303-21; data')): void {
  modelRegistry.register({
    modelId: id,
    fileName: 'test.ifc',
    ifcBuffer: buffer ?? new ArrayBuffer(0),
    opfsCacheKey: `key-${id}`,
    expressIDToType: new Map<number, string>(),
    loadedAt: Date.now(),
  })
}

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  terminated = false
  lastMessage: { type: string; id: string; buffer: ArrayBuffer } | null = null

  constructor(public url: URL, public opts: unknown) {
    FakeWorker.instances.push(this)
  }
  postMessage(msg: { type: string; id: string; buffer: ArrayBuffer }): void {
    this.lastMessage = msg
  }
  terminate(): void { this.terminated = true }

  respondDone(extraction: GeorefExtraction): void {
    this.onmessage?.({
      data: { type: 'done', id: this.lastMessage!.id, extraction },
    } as MessageEvent)
  }
  respondError(message: string): void {
    this.onmessage?.({
      data: { type: 'error', id: this.lastMessage!.id, message },
    } as MessageEvent)
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  useGeoStore.getState().resetForScene()
  modelRegistry.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ── quickScanGeoref ─────────────────────────────────────────────────────────────

describe('quickScanGeoref', () => {
  it('flags IFCMAPCONVERSION as a conversion hint', () => {
    const g = quickScanGeoref(toBuffer('#12=IFCMAPCONVERSION(#1,#2,500000.,5400000.,$,$,$,$);'))
    expect(g.status).toBe('unknown')
    expect(g.raw['quickScan']).toBe('conversion-hint')
  })

  it('flags ePSet_MapConversion (mixed case) as a conversion hint', () => {
    const g = quickScanGeoref(toBuffer("#9=IFCPROPERTYSET('x',#2,'ePSet_MapConversion',$,(#10));"))
    expect(g.status).toBe('unknown')
    expect(g.raw['quickScan']).toBe('conversion-hint')
  })

  it('flags IFCSITE without conversion entities as a site hint', () => {
    const g = quickScanGeoref(toBuffer("#5=IFCSITE('guid',#2,'Site',$,$,#6,$,$,.ELEMENT.,(40,25,0),(0,-3,0),0.,$,$);"))
    expect(g.status).toBe('unknown')
    expect(g.raw['quickScan']).toBe('site-hint')
  })

  it('returns a definitive none for a fully scanned file without geo tokens', () => {
    const g = quickScanGeoref(toBuffer('ISO-10303-21; #1=IFCWALL($); ENDSEC;'))
    expect(g.status).toBe('none')
    expect(g.rung).toBe(4)
    expect(g.raw['quickScan']).toBe('full-scan')
  })

  it('stays inconclusive for large files it cannot fully scan', () => {
    // 100-byte file, 16-byte scan window each end → middle is unscanned
    const middle = 'IFCWALL '.repeat(10)
    const g = quickScanGeoref(toBuffer(`A`.repeat(20) + middle + 'B'.repeat(20)), 16)
    expect(g.status).toBe('unknown')
    expect(g.raw['quickScan']).toBe('no-hint')
  })

  it('finds tokens sitting in the tail window of a large file', () => {
    const text = 'X'.repeat(200) + '#12=IFCMAPCONVERSION(#1,#2);'
    const g = quickScanGeoref(toBuffer(text), 32)
    expect(g.raw['quickScan']).toBe('conversion-hint')
  })
})

describe('quickScanAndStore', () => {
  it('stores the scan stub in geoStore under the modelId', () => {
    quickScanAndStore('m1', toBuffer('#12=IFCMAPCONVERSION(#1,#2);'))
    expect(useGeoStore.getState().georefByModel['m1']?.raw['quickScan']).toBe('conversion-hint')
  })
})

// ── runGeoExtract ───────────────────────────────────────────────────────────────

describe('runGeoExtract', () => {
  it('resolves with the worker extraction and terminates the worker', async () => {
    const p = runGeoExtract(toBuffer('data'))
    const w = FakeWorker.instances[0]
    w.respondDone(foundExtraction())
    await expect(p).resolves.toMatchObject({ status: 'found', epsgCode: 'EPSG:25832' })
    expect(w.terminated).toBe(true)
  })

  it('copies the buffer instead of transferring the original', () => {
    const original = toBuffer('original-bytes')
    void runGeoExtract(original).catch(() => { /* never settles in this test */ })
    const sent = FakeWorker.instances[0].lastMessage!.buffer
    expect(sent).not.toBe(original)
    expect(sent.byteLength).toBe(original.byteLength)
    expect(original.byteLength).toBeGreaterThan(0) // not detached
  })

  it('rejects on worker error message', async () => {
    const p = runGeoExtract(toBuffer('data'))
    FakeWorker.instances[0].respondError('WASM exploded')
    await expect(p).rejects.toThrow('WASM exploded')
    expect(FakeWorker.instances[0].terminated).toBe(true)
  })

  it('rejects after the watchdog timeout', async () => {
    vi.useFakeTimers()
    const p = runGeoExtract(toBuffer('data'))
    const assertion = expect(p).rejects.toThrow(/timed out/)
    vi.advanceTimersByTime(60_001)
    await assertion
    expect(FakeWorker.instances[0].terminated).toBe(true)
  })
})

// ── ensureGeorefExtracted ───────────────────────────────────────────────────────

describe('ensureGeorefExtracted', () => {
  it('runs the worker, stores the result, and resolves it', async () => {
    registerModel('m1')
    const p = ensureGeorefExtracted('m1')
    expect(useGeoStore.getState().georefByModel['m1']?.status).toBe('extracting')
    FakeWorker.instances[0].respondDone(foundExtraction())
    const g = await p
    expect(g.status).toBe('found')
    expect(useGeoStore.getState().georefByModel['m1']?.status).toBe('found')
  })

  it('dedupes concurrent calls into one worker', async () => {
    registerModel('m1')
    const p1 = ensureGeorefExtracted('m1')
    const p2 = ensureGeorefExtracted('m1')
    expect(FakeWorker.instances).toHaveLength(1)
    FakeWorker.instances[0].respondDone(foundExtraction())
    const [g1, g2] = await Promise.all([p1, p2])
    expect(g1.status).toBe('found')
    expect(g2.status).toBe('found')
  })

  it('returns the cached extraction without spawning a worker', async () => {
    registerModel('m1')
    useGeoStore.getState().setGeoref('m1', foundExtraction())
    const g = await ensureGeorefExtracted('m1')
    expect(g.status).toBe('found')
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('re-runs after a quick-scan stub (status unknown)', async () => {
    registerModel('m1')
    quickScanAndStore('m1', toBuffer('#12=IFCMAPCONVERSION(#1);'))
    const p = ensureGeorefExtracted('m1')
    expect(FakeWorker.instances).toHaveLength(1)
    FakeWorker.instances[0].respondDone(foundExtraction())
    await expect(p).resolves.toMatchObject({ status: 'found' })
  })

  it('resolves to an unknown stub when the worker fails (never rejects)', async () => {
    registerModel('m1')
    const p = ensureGeorefExtracted('m1')
    FakeWorker.instances[0].respondError('boom')
    const g = await p
    expect(g.status).toBe('unknown')
    expect(g.reasons).toContain('extract.failed')
    expect(useGeoStore.getState().georefByModel['m1']?.reasons).toContain('extract.failed')
  })

  it('resolves to a noSourceBuffer stub when the registry has no IFC bytes', async () => {
    registerModel('m1', null) // empty buffer → getBuffer returns null
    const g = await ensureGeorefExtracted('m1')
    expect(g.status).toBe('unknown')
    expect(g.reasons).toContain('extract.noSourceBuffer')
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('does not resurrect store entries for models removed mid-flight', async () => {
    registerModel('m1')
    const p = ensureGeorefExtracted('m1')
    modelRegistry.unregister('m1')
    useGeoStore.getState().removeGeoref('m1')
    FakeWorker.instances[0].respondDone(foundExtraction())
    const g = await p
    expect(g.status).toBe('found') // caller still gets the result…
    expect(useGeoStore.getState().georefByModel['m1']).toBeUndefined() // …but the store stays clean
  })

  it('allows a fresh extraction after the previous one settles', async () => {
    registerModel('m1')
    const p1 = ensureGeorefExtracted('m1')
    FakeWorker.instances[0].respondError('boom')
    await p1 // settles to 'unknown' stub → eligible for retry
    const p2 = ensureGeorefExtracted('m1')
    expect(FakeWorker.instances).toHaveLength(2)
    FakeWorker.instances[1].respondDone(foundExtraction())
    await expect(p2).resolves.toMatchObject({ status: 'found' })
  })
})
