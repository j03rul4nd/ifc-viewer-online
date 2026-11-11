// The pricing page's own cookieless analytics: every event of one page view
// carries the same $session_id (a UUIDv7, kept in memory only), and the view
// itself is counted as pricing_viewed.

import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderPricingPage } from './generate-pricing-pages'

interface Sent { event: string; distinct_id: string; properties: Record<string, unknown> }

function open(url: string): { dom: JSDOM; sent: Sent[] } {
  const sent: Sent[] = []
  const dom = new JSDOM(renderPricingPage('en'), {
    url,
    runScripts: 'dangerously',
    beforeParse(win) {
      ;(win as unknown as { fetch: unknown }).fetch = (u: string, init?: { body?: string }) => {
        if (String(u).includes('/i/v0/e/') && init?.body) sent.push(JSON.parse(init.body) as Sent)
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
      }
      win.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof win.matchMedia
    },
  })
  return { dom, sent }
}

const UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('pricing page analytics', () => {
  it('counts the view and ties every event of the visit to one session', () => {
    const { dom, sent } = open('https://www.ifcvieweronline.eu/pricing/?role=receive')
    const doc = dom.window.document

    const viewed = sent.find((e) => e.event === 'pricing_viewed')
    expect(viewed?.properties.role).toBe('receive')

    const role = doc.querySelector<HTMLInputElement>('.pick input[value="solo"]')!
    role.checked = true
    role.dispatchEvent(new dom.window.Event('change'))
    doc.querySelector<HTMLElement>('[data-plan]')!.click()
    doc.querySelector<HTMLElement>('[data-cta]')!.click()

    for (const name of ['$pageview', 'pricing_viewed', 'pricing_role_picked', 'pricing_intent', 'pricing_cta_clicked']) {
      expect(sent.map((e) => e.event), name).toContain(name)
    }
    const session = sent[0].properties.$session_id as string
    expect(session).toMatch(UUID7)
    for (const e of sent) {
      expect(e.properties.$session_id, e.event).toBe(session)
      expect(e.properties.visit_id, e.event).toBe(session)
      expect(e.distinct_id).toBe(session)
      expect(e.properties.$process_person_profile).toBe(false)
    }
    // The UUIDv7 starts with the time of the view.
    expect(Math.abs(parseInt(session.replace(/-/g, '').slice(0, 12), 16) - Date.now())).toBeLessThan(60_000)
  })

  it('a new view is a new session, and nothing is stored', () => {
    const a = open('https://www.ifcvieweronline.eu/pricing/')
    const b = open('https://www.ifcvieweronline.eu/pricing/')
    expect(a.sent[0].properties.$session_id).not.toBe(b.sent[0].properties.$session_id)
    expect(a.dom.window.document.cookie).toBe('')
    expect(a.dom.window.localStorage.length).toBe(0)
    expect(a.sent.find((e) => e.event === 'pricing_viewed')?.properties.role).toBeNull()
  })
})
