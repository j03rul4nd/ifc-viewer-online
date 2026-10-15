// ─── Tests — shareable tour links (D-26) ───────────────────────────────────────

import { describe, it, expect } from 'vitest'
import type { Tour } from '../../types'
import {
  encodeTourPayload, decodeTourPayload, tourToPayload, payloadToTour,
  buildTourShareUrl, parseTourHash,
  MAX_SHARE_STEPS, MAX_SHARE_HIGHLIGHTS, MAX_SHARE_CAPTION, MAX_SHARE_BODY, TOUR_SHARE_VERSION,
} from './tourShareLink'
import { parseAppUrlParams } from '../url-params'

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

describe('tour share codec · narration and analysis metric (b / am)', () => {
  it('carries a body and a metric through the round trip', () => {
    const tour = makeTour(2)
    tour.steps[0].body = '  Red is sun when it is warm: shade it. Blue is sun when it is cold: let it in.  '
    tour.steps[0].analysisMetric = 'passive'
    tour.steps[1].analysisMetric = 'irradiation'
    const payload = tourToPayload(tour)
    expect(payload.v).toBe(1) // additive keys, same version
    expect(payload.steps[0].b).toBe('Red is sun when it is warm: shade it. Blue is sun when it is cold: let it in.')
    expect(payload.steps[0].am).toBe('passive')
    const rebuilt = payloadToTour(decodeTourPayload(encodeTourPayload(payload))!)
    expect(rebuilt.steps[0].body).toBe('Red is sun when it is warm: shade it. Blue is sun when it is cold: let it in.')
    expect(rebuilt.steps[0].analysisMetric).toBe('passive')
    expect(rebuilt.steps[1].body).toBeUndefined()
    expect(rebuilt.steps[1].analysisMetric).toBe('irradiation')
  })

  it('caps the body and drops a blank one or an unknown metric on encode', () => {
    const tour = makeTour(2)
    tour.steps[0].body = 'y'.repeat(1000)
    tour.steps[1].body = '   '
    tour.steps[1].analysisMetric = 'glare'
    const payload = tourToPayload(tour)
    expect(payload.steps[0].b!.length).toBe(MAX_SHARE_BODY)
    expect(payload.steps[1].b).toBeUndefined()
    expect(payload.steps[1].am).toBeUndefined()
  })

  it('sanitizes hostile b / am values instead of trusting them', () => {
    const hostile = btoa(JSON.stringify({
      v: 1,
      steps: [
        { c: [0, 0, 0, 1, 1, 1], b: { html: '<img onerror=x>' }, am: 'constructor' },
        { c: [0, 0, 0, 1, 1, 1], b: 42, am: ['passive'] },
        { c: [0, 0, 0, 1, 1, 1], b: '   ', am: 'PASSIVE' },
        { c: [0, 0, 0, 1, 1, 1], b: 'z'.repeat(5000), am: 'skyView' },
      ],
    }))
    const p = decodeTourPayload(hostile)
    expect(p).not.toBeNull()
    for (const s of p!.steps.slice(0, 3)) {
      expect(s.b).toBeUndefined()
      expect(s.am).toBeUndefined()
    }
    expect(p!.steps[3].b!.length).toBe(MAX_SHARE_BODY)
    expect(p!.steps[3].am).toBe('skyView')
  })

  it('still decodes a link made before b / am existed', () => {
    // Built by hand in the old shape, exactly as an old build's encoder wrote it.
    const old = encodeTourPayload({ v: 1, t: 'Old tour', steps: [{ c: [1, 2, 3, 4, 5, 6], n: 'Hall', r: 'RULE_EMPTY_NAME', s: 'error', k: 3, h: [9] }] })
    const rebuilt = payloadToTour(parseTourHash(`#tour=${old}`)!)
    expect(rebuilt.title).toBe('Old tour')
    expect(rebuilt.steps[0]).toMatchObject({ caption: 'Hall', issueRuleId: 'RULE_EMPTY_NAME', issueSeverity: 'error', issueCount: 3, highlightedExpressIds: [9] })
    expect(rebuilt.steps[0].body).toBeUndefined()
    expect(rebuilt.steps[0].analysisMetric).toBeUndefined()
  })

  it('buildTourShareUrl carries them in the fragment', () => {
    const tour = makeTour(1)
    tour.steps[0].body = 'Winter sun on the south face.'
    tour.steps[0].analysisMetric = 'passive'
    const r = buildTourShareUrl(tour, { modelUrls: ['https://host/a.ifc'], clientMode: false, appBase: 'https://www.ifcvieweronline.eu/' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const step = parseTourHash(new URL(r.url).hash)!.steps[0]
    expect(step.b).toBe('Winter sun on the south face.')
    expect(step.am).toBe('passive')
  })
})

describe('tour share codec · mangled links', () => {
  // A payload whose standard base64 holds `+`, `/` and `=` padding, so every
  // mangling below has something to break.
  const payload = { v: 1, t: '>>>???', steps: [{ c: [1, 2, 3, 4, 5, 6], n: 'é>?~' }] }
  const b64 = encodeTourPayload(payload)

  it('the fixture really holds the characters that get mangled', () => {
    expect(b64).toMatch(/[+/]/)
    expect(b64).toMatch(/=$/)
  })

  it('accepts a percent-encoded fragment', () => {
    const encoded = encodeURIComponent(b64)
    expect(encoded).toContain('%')
    expect(parseTourHash(`#tour=${encoded}`)?.t).toBe('>>>???')
  })

  it('accepts base64url without padding', () => {
    const url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(parseTourHash(`#tour=${url}`)?.steps[0].n).toBe('é>?~')
  })

  it('accepts a + that became a space', () => {
    expect(decodeTourPayload(b64.replace(/\+/g, ' '))?.t).toBe('>>>???')
  })

  it('a broken percent sequence is still just an invalid link', () => {
    expect(parseTourHash('#tour=%E0%A4%A')).toBeNull()
    expect(decodeTourPayload(`${b64}%`)).toBeNull()
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

  it('carries the solar analysis and its site the walkthrough plays over', () => {
    const tour = makeTour()
    tour.steps[0].analysisMetric = 'passive'
    const r = buildTourShareUrl(tour, {
      modelUrls: ['https://host/a.ifc'], clientMode: false, appBase: base,
      analysis: { period: 'year', metric: 'passive', baseC: 18 }, site: { lat: 43.88, lon: -79.44 },
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const p = parseAppUrlParams(new URL(r.url).search)
    expect(p.analysis).toEqual({ period: 'year', metric: 'passive', baseC: 18 })
    expect(p.site).toEqual({ lat: 43.88, lon: -79.44 })
    expect(p.modelUrls).toEqual(['https://host/a.ifc'])
    // Without them the link stays as before.
    const plain = buildTourShareUrl(tour, { modelUrls: ['https://host/a.ifc'], clientMode: false, appBase: base })
    expect(plain.ok && new URL(plain.url).searchParams.has('analysis')).toBe(false)
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
