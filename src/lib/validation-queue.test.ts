// ─── validation-queue: auto-validation and the SDK's validate() ──────────────
// The bug this pins: `validate: true` never validated. The hook closure that
// ran after a load had decided "no model" at an earlier render; nothing ran,
// nothing was reported, and a host waited for validation-completed forever.
// The queue reads everything when the run starts, runs one at a time, and
// always settles — with the model's own result or with a reason.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ValidationResult } from '../types'

const h = vi.hoisted(() => ({
  models: new Map<string, { bytes: ArrayBuffer | null }>(),
  runs: [] as string[],
  behaviour: new Map<string, 'ok' | 'error' | 'cancel'>(),
}))

vi.mock('./model-registry', () => ({
  modelRegistry: {
    get: (id: string) => (h.models.has(id) ? { modelId: id } : undefined),
    getBuffer: (id: string) => h.models.get(id)?.bytes ?? null,
  },
}))

vi.mock('./validator', async () => {
  const { useValidationStore } = await import('../stores/validationStore')
  return {
    runValidation: vi.fn(async (id: string) => {
      h.runs.push(`start:${id}`)
      useValidationStore.setState({ validationStatus: 'running', progress: 10 })
      await new Promise((r) => setTimeout(r, 5))
      const how = h.behaviour.get(id) ?? 'ok'
      if (how === 'error') {
        useValidationStore.setState({ validationStatus: 'error', validationError: 'Worker crashed while checking rule X' })
        throw new Error('worker error')
      }
      if (how === 'cancel') {
        useValidationStore.setState({ validationStatus: 'cancelled' })
        throw new Error('cancelled')
      }
      const result = resultFor(id)
      useValidationStore.setState((s) => ({
        validationStatus: 'complete', result,
        cachedResultsByModel: { ...s.cachedResultsByModel, [id]: result },
      }))
      h.runs.push(`end:${id}`)
    }),
  }
})

function resultFor(id: string, score = id === 'b' ? 80 : 100): ValidationResult {
  return {
    issues: [], durationMs: 5, qualityScore: score,
    stats: { total: 1, errors: 0, warnings: 1, info: 0, byRule: {} },
  } as ValidationResult
}

const { queueValidation, getValidationQueueState, __resetValidationQueue, ValidationRunError } = await import('./validation-queue')
const { useValidationStore } = await import('../stores/validationStore')
const { useSceneStore } = await import('../stores/sceneStore')

function scene(ids: string[], active: string | null = ids[0] ?? null): void {
  h.models.clear()
  for (const id of ids) h.models.set(id, { bytes: new ArrayBuffer(128) })
  useSceneStore.setState({ models: ids.map((id) => ({ id, fileName: `${id}.ifc` })) as never, activeModelId: active })
}

beforeEach(() => {
  __resetValidationQueue()
  h.runs.length = 0
  h.behaviour.clear()
  useValidationStore.setState({ validationStatus: 'idle', validationError: null, result: null, cachedResultsByModel: {}, progress: 0 })
  scene([])
})

describe('queueValidation', () => {
  it('validates the active model and resolves with that model\'s own result', async () => {
    scene(['a', 'b'], 'b')
    const r = await queueValidation()
    expect(r.modelId).toBe('b')
    expect(r.result.qualityScore).toBe(80)
  })

  it('runs one at a time, in the order asked', async () => {
    scene(['a', 'b'])
    const [ra, rb] = await Promise.all([queueValidation('a'), queueValidation('b')])
    expect(h.runs).toEqual(['start:a', 'end:a', 'start:b', 'end:b'])
    expect([ra.modelId, rb.modelId]).toEqual(['a', 'b'])
  })

  it('waits for a validation a person started instead of starting over it', async () => {
    scene(['a'])
    useValidationStore.setState({ validationStatus: 'running' })
    const p = queueValidation('a')
    await new Promise((r) => setTimeout(r, 10))
    expect(h.runs).toEqual([])
    useValidationStore.setState({ validationStatus: 'complete' })
    await p
    expect(h.runs).toEqual(['start:a', 'end:a'])
  })

  it('says why it could not run — and the queue carries on', async () => {
    await expect(queueValidation()).rejects.toThrow(/No model is loaded/)
    scene(['a'])
    await expect(queueValidation('zzz')).rejects.toThrow(/No model with id "zzz"/)
    h.models.set('a', { bytes: null })
    await expect(queueValidation('a')).rejects.toThrow(/IFC data of "a" is not available/)
    scene(['a'])
    await expect(queueValidation('a')).resolves.toMatchObject({ modelId: 'a' })
  })

  it('reports the validator\'s own failure and a cancellation, as ValidationRunError', async () => {
    scene(['a', 'b'])
    h.behaviour.set('a', 'error')
    h.behaviour.set('b', 'cancel')
    const ea = await queueValidation('a').catch((e: unknown) => e)
    expect(ea).toBeInstanceOf(ValidationRunError)
    expect((ea as InstanceType<typeof ValidationRunError>).message).toBe('Worker crashed while checking rule X')
    expect((ea as InstanceType<typeof ValidationRunError>).modelId).toBe('a')
    await expect(queueValidation('b')).rejects.toThrow('Validation was cancelled')
  })
})

describe('getValidationQueueState', () => {
  it('idle → running → done', async () => {
    scene(['a'])
    expect(getValidationQueueState()).toMatchObject({ status: 'idle', modelId: null, progress: 0 })
    const p = queueValidation('a')
    await new Promise((r) => setTimeout(r, 1))
    expect(getValidationQueueState()).toMatchObject({ status: 'running', modelId: 'a', progress: 10 })
    await p
    expect(getValidationQueueState()).toMatchObject({ status: 'done', modelId: 'a', progress: 100, error: null })
  })

  it('error until a newer result replaces the one the failure followed', async () => {
    scene(['a'])
    await queueValidation('a')
    h.models.set('a', { bytes: null })
    await queueValidation('a').catch(() => undefined)
    expect(getValidationQueueState()).toMatchObject({ status: 'error', modelId: 'a' })
    expect(getValidationQueueState().error).toMatch(/not available/)
    // a run the visitor starts later (outside the queue) replaces the result
    useValidationStore.setState({ result: resultFor('a', 90), validationStatus: 'complete' })
    expect(getValidationQueueState()).toMatchObject({ status: 'done', error: null })
  })
})
