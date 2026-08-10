// ─── pc-runner tests ──────────────────────────────────────────────────────────
// The worker-driven load path needs a browser, but re-alignment does not, and it
// carries the one claim worth pinning down in a test: re-deriving the transform
// must NOT discard the placement the user tuned by hand. The derived half and
// the manual half are separate by construction — this is what proves it stays
// that way.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { realignCloud, guardPostHeader } from './pc-runner'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { DEFAULT_DISPLAY, type PointCloudEntry, type PointCloudAlignment, type SourceFrame } from './pc-types'
import type { PointCloudSystemAPI } from './point-cloud-system'

const FRAME: SourceFrame = {
  unitScale: 1, unitSource: 'assumed', epsgCode: null, upAxis: 'z', upAxisSource: 'declared',
  min: { x: -10, y: -8, z: 0 }, max: { x: 10, y: 8, z: 6 },
  origin: { x: 0, y: 0, z: 3 },
}

const MODEL_BOUNDS = { center: { x: 0, y: 4, z: 0 }, size: { x: 24, y: 8, z: 20 } }

const NUDGED: PointCloudAlignment = {
  rung: 'manual', confidence: 'manual',
  origin: { x: 999, y: 999, z: 999 },   // deliberately wrong — re-alignment must replace it
  yawRad: 0, scale: 1, upAxis: 'z', reasons: [],
  offset: { x: 3.5, y: -0.25, z: 1, yawDeg: 15, pitchDeg: 0, rollDeg: 0, scaleMul: 1.05 },
}

function entry(patch: Partial<PointCloudEntry> = {}): PointCloudEntry {
  return {
    id: 'pc-1', fileName: 'scan.las', fileSize: 2048, format: 'las',
    status: 'ready', errorKey: null, progress: 100,
    pointCount: 5_000, declaredCount: 5_000, truncated: false, visible: true,
    frame: FRAME,
    attributes: { color: true, intensity: true, classification: true, confidence: false },
    alignment: NUDGED, alignedToModelId: null, fileKey: 'scan.las:2048:1', loadedAt: 1,
    ...patch,
  }
}

/** Only the two methods realignCloud touches. */
function fakeSystem(): PointCloudSystemAPI & { setAlignment: ReturnType<typeof vi.fn> } {
  return { setAlignment: vi.fn() } as unknown as PointCloudSystemAPI & { setAlignment: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  usePointCloudStore.setState({
    clouds: [], activeCloudId: null, panelOpen: false,
    display: { ...DEFAULT_DISPLAY }, epoch: 0,
  })
})

describe('realignCloud', () => {
  it('re-derives the transform and keeps the manual offset', async () => {
    usePointCloudStore.getState().addCloud(entry())
    const system = fakeSystem()

    const ok = await realignCloud('pc-1', { system, modelId: null, modelBounds: MODEL_BOUNDS })
    expect(ok).toBe(true)

    const cloud = usePointCloudStore.getState().clouds[0]
    // The derived half was recomputed against the model that is active now.
    expect(cloud.alignment!.origin).not.toEqual(NUDGED.origin)
    expect(cloud.alignment!.rung).toBe('local')
    // The half the user tuned survived it, untouched.
    expect(cloud.alignment!.offset).toEqual(NUDGED.offset)
    // And the scene was told, once.
    expect(system.setAlignment).toHaveBeenCalledOnce()
    expect(system.setAlignment).toHaveBeenCalledWith('pc-1', cloud.alignment)
  })

  it('records which model the cloud is now aligned against', async () => {
    usePointCloudStore.getState().addCloud(entry({ alignedToModelId: 'old-model' }))
    await realignCloud('pc-1', { system: fakeSystem(), modelId: null, modelBounds: MODEL_BOUNDS })
    expect(usePointCloudStore.getState().clouds[0].alignedToModelId).toBeNull()
  })

  it('refuses a cloud that is still parsing — its frame is not final yet', async () => {
    usePointCloudStore.getState().addCloud(entry({ status: 'parsing', frame: null }))
    const system = fakeSystem()
    expect(await realignCloud('pc-1', { system, modelId: null, modelBounds: MODEL_BOUNDS })).toBe(false)
    expect(system.setAlignment).not.toHaveBeenCalled()
  })

  it('refuses a cloud that failed to load', async () => {
    usePointCloudStore.getState().addCloud(entry({ status: 'error', errorKey: 'error.parseFailed' }))
    expect(await realignCloud('pc-1', { system: fakeSystem(), modelId: null, modelBounds: MODEL_BOUNDS }))
      .toBe(false)
  })

  it('is a no-op for an unknown cloud rather than throwing', async () => {
    expect(await realignCloud('nope', { system: fakeSystem(), modelId: null, modelBounds: MODEL_BOUNDS }))
      .toBe(false)
  })

  it('drops to the manual rung when there is no model to align against', async () => {
    usePointCloudStore.getState().addCloud(entry())
    await realignCloud('pc-1', { system: fakeSystem(), modelId: null, modelBounds: null })
    expect(usePointCloudStore.getState().clouds[0].alignment!.rung).toBe('manual')
  })
})

// ── The hang ──────────────────────────────────────────────────────────────────

describe('guardPostHeader', () => {
  it('does nothing when the work succeeds', async () => {
    const onFail = vi.fn()
    guardPostHeader(Promise.resolve(), onFail, 'test')
    await Promise.resolve()
    expect(onFail).not.toHaveBeenCalled()
  })

  it('settles the load when the work throws, instead of hanging it', async () => {
    // The bug this exists for. These callbacks run AFTER the header watchdog has
    // been cleared, so a throw inside one used to produce an unhandled rejection
    // and nothing else: finish() never ran, the promise never settled, the worker
    // was never terminated, and the cloud sat at status 'parsing' with a spinner
    // for the rest of the session. No error reached the user because no error
    // path ran.
    const onFail = vi.fn()
    guardPostHeader(Promise.reject(new Error('proj4 exploded')), onFail, 'alignment')
    await new Promise((r) => setTimeout(r, 0))
    expect(onFail).toHaveBeenCalledTimes(1)
  })

  it('swallows the rejection rather than leaving it unhandled', async () => {
    // An unhandled rejection is not cosmetic here: it reaches window.onerror and
    // any error reporting the host has wired up, reported as a crash when the
    // real event is a scan that could not be placed.
    const onFail = vi.fn()
    expect(() => guardPostHeader(Promise.reject(new Error('x')), onFail, 'test')).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(onFail).toHaveBeenCalled()
  })

  it('survives an onFail that itself throws', async () => {
    // finish() runs store updates and terminates a worker. If any of that throws,
    // the recovery path must not become a second unhandled rejection.
    const hostile = (): never => { throw new Error('finish blew up') }
    guardPostHeader(Promise.reject(new Error('x')), hostile, 'test')
    await new Promise((r) => setTimeout(r, 0))
    // Reaching here without an unhandled rejection is the assertion.
    expect(true).toBe(true)
  })
})
