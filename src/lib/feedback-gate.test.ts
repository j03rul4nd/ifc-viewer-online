import { afterEach, describe, expect, it } from 'vitest'
import {
  AFTER_ANSWER_MS, askDue, changedSince, dismissPause, feedbackAllowed, hasPendingDraft, isEngaged, markSeen,
  noteAnswered, noteAsked, noteDismissed, noteFeedbackSignal, readSeen, readSignals, savePendingDraft,
  suggestedFeatures, takePendingDraft, updatesCheckDue, type FeedbackSurface,
} from './feedback-gate'

const viewer: FeedbackSurface = {
  route: 'viewer', embedded: false, embedParam: false, clientMode: false, tourPlaying: false, studioOpen: false, quiet: false,
}

afterEach(() => { localStorage.clear(); sessionStorage.clear() })

describe('feedbackAllowed', () => {
  it('allows the top-level full viewer', () => {
    expect(feedbackAllowed(viewer)).toBe(true)
  })
  it.each([
    ['inside any iframe (SDK, WordPress, Shopify, blog examples)', { embedded: true }],
    ['with ?embed=1 chrome', { embedParam: true }],
    ['while presenting to a client', { clientMode: true }],
    ['while a tour plays', { tourPlaying: true }],
    ['while a studio is open', { studioOpen: true }],
    ['with quiet chrome', { quiet: true }],
    ['outside the viewer', { route: 'landing' }],
  ])('never %s', (_, over) => {
    expect(feedbackAllowed({ ...viewer, ...over })).toBe(false)
  })
})

describe('usage signals', () => {
  it('keeps each signal once, in this session only', () => {
    noteFeedbackSignal('validated')
    noteFeedbackSignal('validated')
    noteFeedbackSignal('ids')
    expect(readSignals()).toEqual(['validated', 'ids'])
    expect(localStorage.length).toBe(0)
  })
  it('counts as engaged after validation plus one more action', () => {
    expect(isEngaged(['validated'])).toBe(false)
    expect(isEngaged(['exported'])).toBe(false)
    expect(isEngaged(['validated', 'exported'])).toBe(true)
  })
  it('suggests what fits what they did', () => {
    expect(suggestedFeatures(['large_file'])[0]).toBe('big_files')
    expect(suggestedFeatures(['validated', 'ids'])[0]).toBe('auto_check')
    expect(suggestedFeatures(['multi_model'])).toEqual(['versions', 'bcf_team', 'client_link'])
    expect(suggestedFeatures([])).toEqual(['client_link', 'versions', 'bcf_team'])
  })
})

describe('ask budget', () => {
  it('asks at most once per session', () => {
    expect(askDue()).toBe(true)
    noteAsked()
    expect(askDue()).toBe(false)
  })
  it('waits 30 days after an answer', () => {
    noteAnswered(0)
    sessionStorage.clear()
    expect(askDue(AFTER_ANSWER_MS - 1)).toBe(false)
    expect(askDue(AFTER_ANSWER_MS)).toBe(true)
  })
  it('backs off further after each dismissal', () => {
    expect(dismissPause(1)).toBe(7 * 86_400_000)
    expect(dismissPause(2)).toBe(14 * 86_400_000)
    expect(dismissPause(10)).toBe(90 * 86_400_000)
    noteDismissed(0)
    noteDismissed(0)
    expect(askDue(13 * 86_400_000)).toBe(false)
    expect(askDue(14 * 86_400_000)).toBe(true)
  })
})

describe('pending draft', () => {
  it('survives until taken, once', () => {
    const d = { feature: 'versions' as const, need: 'x', source: 'toolbar', frequency: 'daily' as const, today: '' as const, today_tool: '', payer: 'company' as const, role: '' as const, team: '' as const, beta: true, call: false, contact_ok: true }
    savePendingDraft(d)
    expect(hasPendingDraft()).toBe(true)
    expect(takePendingDraft()).toEqual(d)
    expect(takePendingDraft()).toBeNull()
  })
})

describe('closing the loop', () => {
  it('reports only what changed since last seen', () => {
    const a = { id: 'a', status: 'new', reply: '' }
    const b = { id: 'b', status: 'new', reply: '' }
    markSeen([a])
    expect(changedSince(readSeen(), [a, b])).toEqual([])
    const moved = { ...a, status: 'planned', reply: 'December' }
    expect(changedSince(readSeen(), [moved, b])).toEqual([moved])
  })
  it('checks only for users who have asked, and not too often', () => {
    expect(updatesCheckDue(1e12)).toBe(false)
    markSeen([{ id: 'a', status: 'new', reply: '' }])
    expect(updatesCheckDue(1e12)).toBe(true)
  })
})

describe('pending draft validation', () => {
  it('drops a draft with an unknown feature', () => {
    sessionStorage.setItem('ifc.feedback.pendingDraft', '{"feature":"rocket","need":""}')
    expect(takePendingDraft()).toBeNull()
  })
})
