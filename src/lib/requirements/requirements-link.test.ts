import { describe, it, expect } from 'vitest'
import {
  buildRequirementsUrl, decodeRequirements, encodeRequirements, evaluateRequirements,
  requirementsFromHash, sanitizeRequirements, MAX_REQ_TITLE, REQUIREMENTS_LINK_VERSION,
  type RequirementsPayload,
} from './requirements-link'

const IDS = '<?xml version="1.0"?><ids xmlns="http://standards.buildingsmart.org/IDS"><info><title>Doors</title></info><specifications/></ids>'
const base: RequirementsPayload = { v: REQUIREMENTS_LINK_VERSION, t: 'Modelo de estructuras · fase 2', i: 'Construcciones Pérez', s: 80, p: 'quality', x: IDS, xn: 'doors.ids' }

describe('requirements link codec', () => {
  it('round-trips a full payload, accents included', async () => {
    expect(await decodeRequirements(await encodeRequirements(base))).toEqual(base)
  })

  it('compresses (z prefix) and the result is shorter than plain JSON for an IDS', async () => {
    const big = { ...base, x: IDS.repeat(40) }
    const enc = await encodeRequirements(big)
    expect(enc[0]).toBe('z')
    expect(enc.length).toBeLessThan(JSON.stringify(big).length)
  })

  it('accepts a percent-encoded fragment', async () => {
    const enc = await encodeRequirements(base)
    expect(await decodeRequirements(encodeURIComponent(enc))).toEqual(base)
  })

  it('rejects garbage, unknown prefixes and other versions', async () => {
    expect(await decodeRequirements('znot-base64!!')).toBeNull()
    expect(await decodeRequirements('qabc')).toBeNull()
    expect(sanitizeRequirements({ ...base, v: 2 })).toBeNull()
  })

  it('needs a title and at least one requirement', () => {
    expect(sanitizeRequirements({ v: 1, t: '  ', s: 50 })).toBeNull()
    expect(sanitizeRequirements({ v: 1, t: 'x' })).toBeNull()
    expect(sanitizeRequirements({ v: 1, t: 'x', p: 'quality' })).toBeNull()
  })

  it('clamps the score, drops unknown profiles and trims long text', () => {
    const r = sanitizeRequirements({ v: 1, t: 'a'.repeat(500), s: 140.6, p: 'evil' })!
    expect(r.s).toBe(100)
    expect(r.p).toBeUndefined()
    expect(r.t.length).toBe(MAX_REQ_TITLE)
  })
})

describe('buildRequirementsUrl', () => {
  it('puts the payload in the fragment, never in the query', async () => {
    const r = await buildRequirementsUrl('https://www.ifcvieweronline.eu/?model=x#old', base)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const u = new URL(r.url)
    expect(u.search).toBe('?req=1')
    const enc = requirementsFromHash(u.hash)!
    expect(await decodeRequirements(enc)).toEqual(base)
  })

  it('refuses a link with no requirement', async () => {
    expect(await buildRequirementsUrl('https://a.test/', { v: 1, t: 'x' })).toEqual({ ok: false, reason: 'no-requirement' })
  })
})

describe('evaluateRequirements', () => {
  it('is pending until every result is in', () => {
    expect(evaluateRequirements({ s: 80, x: IDS }, { score: 90, ids: null }).state).toBe('pending')
  })
  it('passes when the score reaches the minimum and no spec fails', () => {
    const v = evaluateRequirements({ s: 80, x: IDS }, { score: 80, ids: { passedSpecs: 3, failedSpecs: 0, totalSpecs: 4 } })
    expect(v.state).toBe('pass')
    expect(v.score).toEqual({ state: 'pass', value: 80, min: 80 })
  })
  it('fails as soon as one known check fails, even with another pending', () => {
    expect(evaluateRequirements({ s: 80, x: IDS }, { score: 79, ids: null }).state).toBe('fail')
    expect(evaluateRequirements({ x: IDS }, { score: null, ids: { passedSpecs: 1, failedSpecs: 1, totalSpecs: 2 } }).state).toBe('fail')
  })
})
