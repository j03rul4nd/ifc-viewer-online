// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { emptySession } from './defaults'
import { MIN_CALIBRATION_BYTES, bump, meanConvertMBps, recordPhase, recordWorkerEvent, updatePeakHeap } from './metrics'

const MB = 1024 * 1024

describe('recordPhase', () => {
  it('keeps a running mean of ms/MB per phase', () => {
    let s = emptySession()
    s = recordPhase(s, 'geometry', 1000, 10 * MB)   // 100 ms/MB
    expect(s.msPerMB.geometry).toBe(100)
    expect(s.msPerMBSamples.geometry).toBe(1)
    s = recordPhase(s, 'geometry', 4000, 20 * MB)   // 200 ms/MB
    expect(s.msPerMB.geometry).toBe(150)
    s = recordPhase(s, 'geometry', 1500, 10 * MB)   // 150 ms/MB
    expect(s.msPerMB.geometry).toBe(150)
    expect(s.msPerMBSamples.geometry).toBe(3)
    expect(s.msPerMB.attach).toBeUndefined()
  })

  it('ignores tiny files and nonsense durations, returning the same object', () => {
    const s = emptySession()
    expect(recordPhase(s, 'geometry', 300, MIN_CALIBRATION_BYTES - 1)).toBe(s)
    expect(recordPhase(s, 'geometry', -1, 10 * MB)).toBe(s)
    expect(recordPhase(s, 'geometry', NaN, 10 * MB)).toBe(s)
    expect(recordPhase(s, 'geometry', 10, MIN_CALIBRATION_BYTES)).not.toBe(s)
  })

  it('never mutates its input', () => {
    const s = emptySession()
    recordPhase(s, 'attach', 100, MB)
    expect(s.msPerMB).toEqual({})
  })
})

describe('counters', () => {
  it('bump adds and returns a new object; zero is a no-op', () => {
    const s = emptySession()
    const t = bump(s, 'jobsLoaded')
    expect(t.jobsLoaded).toBe(1)
    expect(s.jobsLoaded).toBe(0)
    expect(bump(t, 'bytesConverted', 5 * MB).bytesConverted).toBe(5 * MB)
    expect(bump(t, 'retries', 0)).toBe(t)
  })

  it('worker events map to their counters', () => {
    let s = emptySession()
    s = recordWorkerEvent(s, 'spawn')
    s = recordWorkerEvent(s, 'spawn')
    s = recordWorkerEvent(s, 'recycle')
    s = recordWorkerEvent(s, 'crash')
    expect([s.workerSpawns, s.workerRecycles, s.workerCrashes]).toEqual([2, 1, 1])
  })

  it('updatePeakHeap keeps the maximum', () => {
    const s = emptySession()
    const a = updatePeakHeap(s, 500)
    expect(a.peakHeapBytes).toBe(500)
    expect(updatePeakHeap(a, 400)).toBe(a)
    expect(updatePeakHeap(a, null)).toBe(a)
    expect(updatePeakHeap(a, 900).peakHeapBytes).toBe(900)
  })
})

describe('meanConvertMBps', () => {
  it('is null before any conversion and combines the convert phases', () => {
    let s = emptySession()
    expect(meanConvertMBps(s)).toBeNull()
    s = recordPhase(s, 'attach', 5000, 10 * MB)       // not a convert phase
    expect(meanConvertMBps(s)).toBeNull()
    s = recordPhase(s, 'geometry', 1500, 10 * MB)     // 150 ms/MB
    s = recordPhase(s, 'properties', 500, 10 * MB)    // 50 ms/MB
    expect(meanConvertMBps(s)).toBe(5)                // 1000 / 200
  })
})
