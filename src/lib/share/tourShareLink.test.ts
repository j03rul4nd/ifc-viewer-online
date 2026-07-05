// ─── Tests — shareable tour links (D-26) ───────────────────────────────────────

import { describe, it, expect } from 'vitest'
import type { Tour } from '../../types'
import {
  encodeTourPayload, decodeTourPayload, tourToPayload, payloadToTour,
  buildTourShareUrl, parseTourHash,
  MAX_SHARE_STEPS, MAX_SHARE_HIGHLIGHTS, MAX_SHARE_CAPTION, TOUR_SHARE_VERSION,
} from './tourShareLink'

function makeTour(stepCount = 2): Tour {
  return {
    id: 'tour-1',
    title: 'Recorrido de validación',
    createdFrom: 'auto',
    steps: Array.from({ length: stepCount }, (_, i) => ({
      id: `s${i}`,
      camera: {
        position: { x: 10.12345 + i, y: 5.5, z: -3.987 },
        target:   { x: 1.001, y: 2, z: 3 },
      },
      issueRuleId: 'RULE_EMPTY_NAME' as const,
      issueSeverity: 'warning' as const,
      issueCount: 12,
      caption: `Paso ${i}`,
      highlightedExpressIds: [1, 2, 3],
      modelId: 'model-x',
    })),
  }
}

describe('tour share codec roundtrip', () => {
  it('survives encode → decode → rebuild with 2-decimal cameras', () => {
    const tour = makeTour()
    const decoded = decodeTourPayload(encodeTourPayload(tourToPayload(tour, 'social')))
    expect(decoded).not.toBeNull()
    expect(decoded!.v).toBe(TOUR_SHARE_VERSION)
    expect(decoded!.tpl).toBe('social')
    expect(decoded!.t).toBe('Recorrido de validación')

    const rebuilt = payloadToTour(decoded!)
    expect(rebuilt.steps).toHaveLength(2)
    expect(rebuilt.steps[0].camera.position.x).toBeCloseTo(10.12, 2)
    expect(rebuilt.steps[0].camera.target).toEqual({ x: 1, y: 2, z: 3 })
    expect(rebuilt.steps[0].issueRuleId).toBe('RULE_EMPTY_NAME')
    expect(rebuilt.steps[0].issueSeverity).toBe('warning')
    expect(rebuilt.steps[0].issueCount).toBe(12)
    expect(rebuilt.steps[0].caption).toBe('Paso 0')
    expect(rebuilt.steps[0].highlightedExpressIds).toEqual([1, 2, 3])
    // modelId intentionally dropped in transit
    expect(rebuilt.steps[0].modelId).toBeUndefined()
  })

  it('handles non-ASCII captions (UTF-8-safe base64)', () => {
    const tour = makeTour(1)
    tour.steps[0].caption = 'Fachada — daños ☂ 中文'
    const rebuilt = payloadToTour(decodeTourPayload(encodeTourPayload(tourToPayload(tour)))!)
    expect(rebuilt.steps[0].caption).toBe('Fachada — daños ☂ 中文')
  })

  it('caps steps, highlights and caption length on encode', () => {
    const tour = makeTour(MAX_SHARE_STEPS + 10)
    tour.steps[0].highlightedExpressIds = Array.from({ length: 50 }, (_, i) => i + 1)
    tour.steps[0].caption = 'x'.repeat(500)
    const payload = tourToPayload(tour)
    expect(payload.steps).toHaveLength(MAX_SHARE_STEPS)
    expect(payload.steps[0].h).toHaveLength(MAX_SHARE_HIGHLIGHTS)
    expect(payload.steps[0].n!.length).toBe(MAX_SHARE_CAPTION)
  })

  it('rejects corrupt, wrong-version and malformed payloads', () => {
    expect(decodeTourPayload('not-base64!!!')).toBeNull()
    expect(decodeTourPayload(btoa('{"v":99,"steps":[]}'))).toBeNull()
    expect(decodeTourPayload(btoa('{"v":1,"steps":[]}'))).toBeNull()
    expect(decodeTourPayload(btoa('{"v":1,"steps":[{"c":[1,2,3]}]}'))).toBeNull() // camera must be 6 numbers
    expect(decodeTourPayload(btoa('{"v":1,"steps":[{"c":[1,2,3,4,5,"x"]}]}'))).toBeNull()
  })

  it('sanitizes hostile field types instead of trusting them', () => {
    const hostile = btoa(JSON.stringify({
      v: 1,
      t: 42,
      steps: [{ c: [0, 0, 0, 1, 1, 1], r: 'R'.repeat(200), k: -5, h: ['a', 3, -1, 7] }],
    }))
    const p = decodeTourPayload(hostile)
    expect(p).not.toBeNull()
    expect(p!.t).toBeUndefined()
    expect(p!.steps[0].r).toBeUndefined() // over-long ruleId dropped
    expect(p!.steps[0].k).toBeUndefined() // negative count dropped
    expect(p!.steps[0].h).toEqual([3, 7]) // only positive integers survive
  })
})

describe('buildTourShareUrl', () => {
  const base = 'https://www.ifcvieweronline.eu/'

  it('builds ?model + optional ui=client + #tour fragment', () => {
    const r = buildTourShareUrl(makeTour(), {
      modelUrls: ['https://host/a.ifc'], clientMode: true, templateId: 'client-walkthrough', appBase: base,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u = new URL(r.url)
    expect(u.searchParams.get('model')).toBe('https://host/a.ifc')
    expect(u.searchParams.get('ui')).toBe('client')
    const payload = parseTourHash(u.hash)
    expect(payload).not.toBeNull()
    expect(payload!.tpl).toBe('client-walkthrough')
    expect(payload!.steps).toHaveLength(2)
  })

  it('omits ui=client for the technical template', () => {
    const r = buildTourShareUrl(makeTour(), { modelUrls: ['https://host/a.ifc'], clientMode: false, appBase: base })
    expect(r.ok && !new URL(r.url).searchParams.has('ui')).toBe(true)
  })

  it('refuses honestly when the model has no public URL', () => {
    const r = buildTourShareUrl(makeTour(), { modelUrls: [], clientMode: false, appBase: base })
    expect(r).toEqual({ ok: false, reason: 'no-model-url' })
  })

  it('refuses when the URL would exceed the length guard', () => {
    const tour = makeTour(MAX_SHARE_STEPS)
    for (const s of tour.steps) {
      s.caption = 'δ'.repeat(MAX_SHARE_CAPTION) // multi-byte, worst case
      s.highlightedExpressIds = Array.from({ length: MAX_SHARE_HIGHLIGHTS }, (_, i) => 10_000_000 + i)
    }
    const r = buildTourShareUrl(tour, { modelUrls: ['https://host/a.ifc'], clientMode: false, appBase: base })
    expect(r).toEqual({ ok: false, reason: 'too-long' })
  })

  it('refuses an empty tour', () => {
    const r = buildTourShareUrl({ ...makeTour(0) }, { modelUrls: ['https://host/a.ifc'], clientMode: false, appBase: base })
    expect(r).toEqual({ ok: false, reason: 'empty-tour' })
  })
})

describe('parseTourHash', () => {
  it('returns null for foreign or empty hashes', () => {
    expect(parseTourHash('')).toBeNull()
    expect(parseTourHash('#report=abc')).toBeNull()
    expect(parseTourHash('#tour=')).toBeNull()
    expect(parseTourHash('#tour=%%%')).toBeNull()
  })
})
