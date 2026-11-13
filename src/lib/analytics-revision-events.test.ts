// Revision compare events (rc_*) and the `revision-compare` flag: sent by name
// once analytics runs, counts/buckets/enums only (never a file name or a
// GlobalId), nothing after an opt-out, and the flag reads "on" whenever
// PostHog cannot answer.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(), init: vi.fn(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn(),
    isFeatureEnabled: vi.fn(), onFeatureFlags: vi.fn(() => () => {}),
  },
}))

import posthog from 'posthog-js'
import {
  countBucket, disableAnalytics, enableAnalytics, initAnalytics, isRevisionCompareEnabled, msBucket, onRevisionCompareFlag,
  trackRcChangeReviewed, trackRcDiffCompleted, trackRcExport, trackRcFeedbackSent, trackRcHelpClicked, trackRcOpened,
  trackRcOwnFilesDropped, trackRcTourCompleted, trackRcTourDismissed, trackRcTourStarted, trackRcTourStep,
} from './analytics'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Names that must never reach PostHog: the demo pair's files and GlobalIds.
const F8 = 'tests/fixtures/revision/F8'
const expected = JSON.parse(readFileSync(join(F8, 'expected.json'), 'utf8')) as { changes: Array<{ globalIdA?: string; globalIdB?: string }> }
const FORBIDDEN = [
  ...readdirSync(join(F8, 'a')), ...readdirSync(join(F8, 'b')),
  ...expected.changes.flatMap((c) => [c.globalIdA, c.globalIdB]).filter((x): x is string => !!x),
]

function fireAll(): void {
  trackRcOpened({ source: 'demo', ref: 'test' })
  trackRcDiffCompleted({ elements: 812, changes: 5, kinds: ['moved', 'added', 'reshaped', 'removed', 'properties_changed', 'moved'], guid_regenerated: false, ms: 1800 })
  trackRcTourStarted()
  trackRcTourStep({ step: 'local' })
  trackRcTourCompleted()
  trackRcTourDismissed({ step: 'views' })
  trackRcChangeReviewed({ state: 'affects_site' })
  trackRcExport({ format: 'bcf' })
  trackRcHelpClicked({ option: 'feedback' })
  trackRcFeedbackSent()
  trackRcOwnFilesDropped({ after_demo: true })
}

beforeAll(() => {
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
  vi.stubGlobal('location', { hostname: 'www.ifcvieweronline.eu' })
})
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
beforeEach(() => vi.mocked(posthog.capture).mockClear())

describe('revision compare flag before PostHog runs', () => {
  it('is on when PostHog never loaded (blocker, local, no key)', () => {
    expect(isRevisionCompareEnabled()).toBe(true)
    expect(posthog.isFeatureEnabled).not.toHaveBeenCalled()
    const cb = vi.fn()
    onRevisionCompareFlag(cb)()
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('rc_* events', () => {
  it('are sent by name once analytics runs', () => {
    initAnalytics()
    fireAll()
    expect(vi.mocked(posthog.capture).mock.calls.map((c) => c[0])).toEqual([
      'rc_opened', 'rc_diff_completed', 'rc_tour_started', 'rc_tour_step', 'rc_tour_completed', 'rc_tour_dismissed',
      'rc_change_reviewed', 'rc_export', 'rc_help_clicked', 'rc_feedback_sent', 'rc_own_files_dropped',
    ])
    expect(posthog.capture).toHaveBeenCalledWith('rc_opened', { source: 'demo', ref: 'test' })
    expect(posthog.capture).toHaveBeenCalledWith('rc_diff_completed', {
      elements_bucket: '201-1000', changes_bucket: '1-10',
      kinds: 'added,moved,properties_changed,removed,reshaped', guid_regenerated: false, ms_bucket: '0.5-2s',
    })
  })

  it('drop an empty ref', () => {
    trackRcOpened({ source: 'own', ref: '' })
    expect(posthog.capture).toHaveBeenLastCalledWith('rc_opened', { source: 'own' })
  })

  it('never carry a file name or a GlobalId', () => {
    fireAll()
    const sent = JSON.stringify(vi.mocked(posthog.capture).mock.calls)
    expect(FORBIDDEN.length).toBeGreaterThan(6)
    for (const s of FORBIDDEN) expect(sent).not.toContain(s)
    expect(sent).not.toMatch(/\.ifc/i)
    // Every value is a bucket, an enum, a boolean or the opaque ref.
    for (const [, props] of vi.mocked(posthog.capture).mock.calls) {
      for (const v of Object.values((props ?? {}) as Record<string, unknown>)) {
        expect(typeof v === 'boolean' || (typeof v === 'string' && v.length <= 64)).toBe(true)
      }
    }
  })

  it('stop after an opt-out', () => {
    disableAnalytics()
    fireAll()
    expect(posthog.capture).not.toHaveBeenCalled()
    enableAnalytics()
  })
})

describe('revision-compare flag', () => {
  it('hides only on an explicit false', () => {
    vi.mocked(posthog.isFeatureEnabled).mockReturnValueOnce(false)
    expect(isRevisionCompareEnabled()).toBe(false)
    vi.mocked(posthog.isFeatureEnabled).mockReturnValueOnce(true)
    expect(isRevisionCompareEnabled()).toBe(true)
    vi.mocked(posthog.isFeatureEnabled).mockReturnValueOnce(undefined)
    expect(isRevisionCompareEnabled()).toBe(true)
  })

  it('is on after an opt-out whatever the flag says', () => {
    disableAnalytics()
    vi.mocked(posthog.isFeatureEnabled).mockReturnValue(false)
    expect(isRevisionCompareEnabled()).toBe(true)
    vi.mocked(posthog.isFeatureEnabled).mockReset()
    enableAnalytics()
  })

  it('reports when the flags arrive', () => {
    const cb = vi.fn()
    onRevisionCompareFlag(cb)
    const listener = vi.mocked(posthog.onFeatureFlags).mock.calls.at(-1)?.[0] as () => void
    vi.mocked(posthog.isFeatureEnabled).mockReturnValueOnce(false)
    listener()
    expect(cb).toHaveBeenCalledWith(false)
  })
})

describe('buckets', () => {
  it('count and time', () => {
    expect([0, 5, 11, 200, 999, 5000, 20000].map(countBucket)).toEqual(['0', '1-10', '11-50', '51-200', '201-1000', '1001-10000', '10000+'])
    expect([100, 600, 3000, 30000, 90000].map(msBucket)).toEqual(['<0.5s', '0.5-2s', '2-10s', '10-60s', '60s+'])
  })
})
