import { describe, it, expect } from 'vitest'
import { clientScoreTier, clientScoreColor, scoreIsHeadlineWorthy, CLIENT_SCORE_THRESHOLDS } from './clientScore'

describe('clientScoreTier', () => {
  it('maps scores to tiers at the documented boundaries', () => {
    expect(clientScoreTier(100)).toBe('verified')
    expect(clientScoreTier(CLIENT_SCORE_THRESHOLDS.verified)).toBe('verified')
    expect(clientScoreTier(CLIENT_SCORE_THRESHOLDS.verified - 1)).toBe('attention')
    expect(clientScoreTier(CLIENT_SCORE_THRESHOLDS.attention)).toBe('attention')
    expect(clientScoreTier(CLIENT_SCORE_THRESHOLDS.attention - 1)).toBe('review')
    expect(clientScoreTier(0)).toBe('review')
  })

  it('every tier has a colour', () => {
    for (const tier of ['verified', 'attention', 'review'] as const) {
      expect(clientScoreColor(tier)).toBeTruthy()
    }
  })
})

describe('scoreIsHeadlineWorthy (LinkedIn honesty rule, D-26)', () => {
  it('allows headlining at or above the attention threshold', () => {
    expect(scoreIsHeadlineWorthy(96)).toBe(true)
    expect(scoreIsHeadlineWorthy(CLIENT_SCORE_THRESHOLDS.attention)).toBe(true)
  })

  it('refuses below the threshold or without a score', () => {
    expect(scoreIsHeadlineWorthy(CLIENT_SCORE_THRESHOLDS.attention - 1)).toBe(false)
    expect(scoreIsHeadlineWorthy(null)).toBe(false)
    expect(scoreIsHeadlineWorthy(undefined)).toBe(false)
  })
})
