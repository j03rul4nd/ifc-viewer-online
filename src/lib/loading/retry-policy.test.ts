// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { abortError, classifyError, decideRetry, isAbortError } from './retry-policy'
import type { LoadError, LoadErrorCode } from './types'

function err(code: LoadErrorCode, over: Partial<LoadError> = {}): LoadError {
  return classifyError(Object.assign(new Error(code), { code, ...over }), 'geometry', over.attempt ?? 1)
}

describe('classifyError', () => {
  it('recognises aborts from any source', () => {
    expect(classifyError(new DOMException('x', 'AbortError'), 'download', 1).code).toBe('cancelled')
    const e = new Error('stop')
    e.name = 'AbortError'
    expect(classifyError(e, null, 1).code).toBe('cancelled')
    expect(isAbortError(abortError())).toBe(true)
    expect(classifyError(abortError(), 'attach', 2)).toMatchObject({ code: 'cancelled', attempt: 2, autoRetryable: false })
  })

  it('keeps an explicit code and its flags', () => {
    const e = classifyError({ code: 'parse', message: 'bad STEP' }, 'geometry', 1)
    expect(e).toEqual({ code: 'parse', message: 'bad STEP', phase: 'geometry', attempt: 1, autoRetryable: false, userRetryable: true })
    const explicit = classifyError({ code: 'http', message: '503', httpStatus: 503, retryAfterMs: 2500, phase: 'download' }, null, 2)
    expect(explicit).toMatchObject({ code: 'http', httpStatus: 503, retryAfterMs: 2500, phase: 'download', autoRetryable: true, attempt: 2 })
    expect(classifyError({ code: 'http', message: '404', httpStatus: 404 }, 'download', 1).autoRetryable).toBe(false)
    expect(classifyError({ code: 'scene', message: 'x', userRetryable: false }, 'attach', 1).userRetryable).toBe(false)
    // Not a LoadErrorCode → pattern matching instead.
    expect(classifyError({ code: 'ENOENT', message: 'x' }, null, 1).code).toBe('unknown')
  })

  it('network TypeErrors → network', () => {
    expect(classifyError(new TypeError('Failed to fetch'), 'download', 1).code).toBe('network')
    expect(classifyError(new TypeError('NetworkError when attempting to fetch resource.'), 'download', 1).code).toBe('network')
    expect(classifyError(new TypeError('Load failed'), 'download', 1).code).toBe('network')
    expect(classifyError(new TypeError('x is not a function'), 'setup', 1).code).toBe('unknown')
    expect(classifyError(new Error('Failed to fetch'), 'download', 1).code).toBe('unknown')
  })

  it('allocation failures → out-of-memory, whatever threw them', () => {
    for (const m of [
      'Aborted(OOM)', 'Cannot enlarge memory arrays', 'memory access out of bounds',
      'Array buffer allocation failed', 'out of memory', 'WebAssembly.Memory(): could not allocate memory: allocation failed',
    ]) {
      expect(classifyError(new Error(m), 'geometry', 1).code).toBe('out-of-memory')
    }
    expect(classifyError(new RangeError('Invalid array length'), 'serialize', 1).code).toBe('out-of-memory')
    expect(classifyError('RuntimeError: memory access out of bounds', 'geometry', 1).code).toBe('out-of-memory')
  })

  it('context loss → gpu; anything else → unknown', () => {
    expect(classifyError(new Error('WebGL: CONTEXT_LOST_WEBGL'), 'attach', 1).code).toBe('gpu')
    expect(classifyError(new Error('boom'), 'setup', 1)).toMatchObject({ code: 'unknown', userRetryable: true, autoRetryable: false })
    expect(classifyError(42, null, 1)).toMatchObject({ code: 'unknown', message: '42' })
    expect(classifyError(undefined, null, 1).code).toBe('unknown')
  })

  it('flags per the §9 table', () => {
    expect(err('invalid-file')).toMatchObject({ autoRetryable: false, userRetryable: false })
    expect(err('unsupported')).toMatchObject({ autoRetryable: false, userRetryable: false })
    expect(err('parse')).toMatchObject({ autoRetryable: false, userRetryable: true })
    expect(err('worker-crash')).toMatchObject({ autoRetryable: true, userRetryable: true })
    expect(err('out-of-memory')).toMatchObject({ autoRetryable: true, userRetryable: true })
    expect(err('network')).toMatchObject({ autoRetryable: true, userRetryable: true })
  })
})

describe('decideRetry — automatic', () => {
  it('backs off 1 s / 4 s for network and stops at the third attempt', () => {
    expect(decideRetry(err('network'), { attempt: 1 })).toMatchObject({ retry: true, delayMs: 1000, hints: {} })
    expect(decideRetry(err('network'), { attempt: 2 })).toMatchObject({ retry: true, delayMs: 4000 })
    expect(decideRetry(err('network'), { attempt: 3 }).retry).toBe(false)
    expect(decideRetry(err('network'), { attempt: 3, maxAttempts: 4 })).toMatchObject({ retry: true, delayMs: 10000 })
    expect(decideRetry(err('timeout'), { attempt: 1 }).retry).toBe(true)
  })

  it('honours Retry-After, capped at 30 s', () => {
    expect(decideRetry(err('http', { httpStatus: 429, retryAfterMs: 7000 }), { attempt: 1 }).delayMs).toBe(7000)
    expect(decideRetry(err('http', { httpStatus: 503, retryAfterMs: 120_000 }), { attempt: 1 }).delayMs).toBe(30_000)
  })

  it('retries http 5xx / 429 but not other 4xx', () => {
    expect(decideRetry(err('http', { httpStatus: 502 }), { attempt: 1 }).retry).toBe(true)
    expect(decideRetry(err('http', { httpStatus: 429 }), { attempt: 1 }).retry).toBe(true)
    expect(decideRetry(err('http', { httpStatus: 404 }), { attempt: 1 }).retry).toBe(false)
  })

  it('once-only remedies follow a first attempt only', () => {
    expect(decideRetry(err('worker-crash'), { attempt: 1 })).toMatchObject({ retry: true, delayMs: 0, hints: { freshWorker: true } })
    expect(decideRetry(err('worker-crash'), { attempt: 2 }).retry).toBe(false)
    expect(decideRetry(err('worker-init'), { attempt: 1 })).toMatchObject({ retry: true, delayMs: 2000, hints: { freshWorker: true } })
    expect(decideRetry(err('out-of-memory'), { attempt: 1 }))
      .toMatchObject({ retry: true, hints: { exclusive: true }, degradeConcurrency: true })
    expect(decideRetry(err('out-of-memory'), { attempt: 2 }).retry).toBe(false)
    expect(decideRetry(err('cache-corrupt'), { attempt: 1 })).toMatchObject({ retry: true, hints: { skipCache: true } })
  })

  it('scene is never retried automatically (a bad entry comes as cache-corrupt)', () => {
    expect(decideRetry(err('scene'), { attempt: 1, fromCache: true }).retry).toBe(false)
    expect(decideRetry(err('scene'), { attempt: 1 }).retry).toBe(false)
    expect(decideRetry(err('scene'), { attempt: 2, fromCache: true }).retry).toBe(false)
  })

  it('never retries content errors or cancellations automatically', () => {
    for (const code of ['parse', 'invalid-file', 'unsupported', 'cancelled', 'gpu', 'unknown'] as const) {
      expect(decideRetry(err(code), { attempt: 1 }).retry).toBe(false)
    }
  })

  it('an error marked not auto-retryable is not retried automatically, whatever its code; a manual retry still is', () => {
    // A scan's header timeout is the file, not the network.
    for (const code of ['timeout', 'network', 'worker-crash', 'worker-init', 'out-of-memory', 'cache-corrupt'] as const) {
      const e = err(code, { autoRetryable: false })
      expect(e.autoRetryable).toBe(false)
      expect(decideRetry(e, { attempt: 1 })).toMatchObject({ retry: false, degradeConcurrency: false })
      expect(decideRetry(e, { attempt: 1, manual: true }).retry).toBe(true)
    }
    expect(decideRetry(err('http', { httpStatus: 503, autoRetryable: false }), { attempt: 1 }).retry).toBe(false)
    // The table's own flag is untouched: classified from the code alone, a timeout still backs off.
    expect(decideRetry(err('timeout'), { attempt: 1 })).toMatchObject({ retry: true, delayMs: 1000 })
  })
})

describe('decideRetry — manual', () => {
  it('allows anything userRetryable, with the matching hint, at any attempt', () => {
    expect(decideRetry(err('parse'), { attempt: 7, manual: true })).toMatchObject({ retry: true, delayMs: 0, hints: { freshWorker: true } })
    expect(decideRetry(err('cache-corrupt'), { attempt: 3, manual: true }).hints).toEqual({ skipCache: true })
    expect(decideRetry(err('out-of-memory'), { attempt: 3, manual: true }).hints).toEqual({ exclusive: true })
    expect(decideRetry(err('network'), { attempt: 9, manual: true })).toMatchObject({ retry: true, delayMs: 0 })
  })

  it('scene and gpu skip the cache only when the failed attach came from it', () => {
    // A fresh conversion that failed to attach: the entry it just wrote is not
    // the suspect, and evicting it would re-parse the IFC on every Retry.
    expect(decideRetry(err('scene'), { attempt: 1, manual: true })).toMatchObject({ retry: true, hints: {} })
    expect(decideRetry(err('scene'), { attempt: 1, manual: true, fromCache: true }).hints).toEqual({})
    expect(decideRetry(err('gpu'), { attempt: 1, manual: true }).hints).toEqual({})
    expect(decideRetry(err('gpu'), { attempt: 1, manual: true, fromCache: true }).hints).toEqual({ skipCache: true })
  })

  it('allows cancelled, refuses what retrying cannot fix', () => {
    expect(decideRetry(err('cancelled'), { attempt: 1, manual: true }).retry).toBe(true)
    expect(decideRetry(err('invalid-file'), { attempt: 1, manual: true }).retry).toBe(false)
    expect(decideRetry(err('unsupported'), { attempt: 1, manual: true }).retry).toBe(false)
  })
})
