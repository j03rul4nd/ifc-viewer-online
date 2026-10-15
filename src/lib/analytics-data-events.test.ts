// ─── analytics-data-events.test.ts ────────────────────────────────────────────
// The data-integration events respect the opt-out gate, and file counts are
// bucketed (INV-5: no names, sizes or exact counts leave the browser).

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), init: vi.fn(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn() },
}))

import posthog from 'posthog-js'
import {
  disableAnalytics,
  fileCountBucket,
  trackAddDataOpened,
  trackDataAdded,
  trackDataRefused,
} from './analytics'

beforeEach(() => {
  vi.mocked(posthog.capture).mockClear()
})

function fireAll(): void {
  trackAddDataOpened({ from: 'toolbar' })
  trackDataAdded({ kind: 'pointcloud', via: 'drop', files: '1' })
  trackDataRefused({ reason: 'e57', via: 'drop' })
}

describe('data integration events honour the opt-out gate', () => {
  it('never captures when analytics was not initialised', () => {
    fireAll()
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('never captures when the user opted out', () => {
    disableAnalytics()
    fireAll()
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})

describe('fileCountBucket', () => {
  it.each([[0, '1'], [1, '1'], [2, '2-5'], [5, '2-5'], [6, '6+'], [400, '6+']] as const)('%i → %s', (n, bucket) => {
    expect(fileCountBucket(n)).toBe(bucket)
  })
})
