// The demand-measurement events (fake doors, requirements links) reach PostHog
// with their names once analytics runs, and never before or after an opt-out.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), init: vi.fn(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn() },
}))

import posthog from 'posthog-js'
import {
  disableAnalytics, initAnalytics,
  trackBatchFolderInterest, trackRequirementsLinkCreated, trackRequirementsLinkOpened, trackRequirementsVerdict,
  trackServerProcessingInterest, trackServerProcessingOffered,
} from './analytics'

function fireAll(): void {
  trackRequirementsLinkCreated({ has_score: true, has_ids: false, has_profile: false })
  trackRequirementsLinkOpened({ has_score: true, has_ids: false, valid: true })
  trackRequirementsVerdict({ pass: true, score_bucket: '80' })
  trackServerProcessingOffered({ file_size_mb: 250 })
  trackServerProcessingInterest({ file_size_mb: 250 })
  trackBatchFolderInterest({ file_count: 4, step: 'clicked' })
}

beforeAll(() => {
  vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')
  vi.stubGlobal('location', { hostname: 'www.ifcvieweronline.eu' })
})
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
beforeEach(() => vi.mocked(posthog.capture).mockClear())

describe('measurement events', () => {
  it('are sent by name once analytics runs', () => {
    initAnalytics()
    fireAll()
    expect(vi.mocked(posthog.capture).mock.calls.map((c) => c[0])).toEqual([
      'requirements_link_created', 'requirements_link_opened', 'requirements_verdict',
      'server_processing_offered', 'server_processing_interest', 'batch_folder_interest',
    ])
    expect(posthog.capture).toHaveBeenLastCalledWith('batch_folder_interest', { file_count: 4, step: 'clicked' })
  })

  it('stop after an opt-out', () => {
    disableAnalytics()
    fireAll()
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})
