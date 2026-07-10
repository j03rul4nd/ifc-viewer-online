// ─── analytics-certify-events.test.ts ─────────────────────────────────────────
// T-F1-06 §12: the conformance funnel events respect the opt-out/GPC gate —
// with analytics disabled (or simply never initialised), posthog.capture is
// never invoked.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), init: vi.fn(), opt_out_capturing: vi.fn(), opt_in_capturing: vi.fn() },
}))

import posthog from 'posthog-js'
import {
  disableAnalytics,
  trackCertificateIssued,
  trackCertificateVerifiedView,
} from './analytics'

beforeEach(() => {
  vi.mocked(posthog.capture).mockClear()
})

describe('conformance funnel events honour the opt-out gate', () => {
  it('never captures when analytics was not initialised', () => {
    trackCertificateIssued({ deduplicated: false, rules_evaluated: 44, profile_kind: 'default' })
    trackCertificateVerifiedView({ signature_result: 'valid' })
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('never captures when the user opted out', () => {
    disableAnalytics()
    trackCertificateIssued({ deduplicated: true, rules_evaluated: 12, profile_kind: 'custom' })
    trackCertificateVerifiedView({ signature_result: 'invalid' })
    expect(posthog.capture).not.toHaveBeenCalled()
  })
})
