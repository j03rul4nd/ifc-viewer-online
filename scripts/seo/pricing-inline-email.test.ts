// The email field lives on each paid plan: the page posts {email, source, locale}
// to the capture Worker and reports focus / success / failure without the email.

import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { renderPricingPage } from './generate-pricing-pages'
import { PRICING_LANGS, pricingPath } from '../../src/lib/pricing/pricing-paths'
import { COPY } from './pricing/pricing-i18n'

const PAID = ['pro', 'team', 'developer', 'reception', 'enterprise']
const flush = () => new Promise((r) => setTimeout(r, 0))

function open(lang: 'en' | 'es', ok: boolean, query = '') {
  const events: { event: string; properties: Record<string, unknown> }[] = []
  const posts: Record<string, unknown>[] = []
  const dom = new JSDOM(renderPricingPage(lang), {
    url: `https://www.ifcvieweronline.eu${pricingPath(lang)}${query}`,
    runScripts: 'dangerously',
    beforeParse(win) {
      ;(win as unknown as { fetch: unknown }).fetch = (u: string, init?: { body?: string }) => {
        const body = init?.body ? JSON.parse(init.body) : {}
        if (String(u).includes('/i/v0/e/')) { events.push(body); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) }
        posts.push({ url: u, ...body })
        return Promise.resolve({ ok, json: () => Promise.resolve({ ok }) })
      }
      win.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof win.matchMedia
    },
  })
  return { dom, doc: dom.window.document, events, posts }
}

describe('inline email on paid plans', () => {
  it.each(PRICING_LANGS)('%s: every paid plan carries a labelled email form, no dialog', (lang) => {
    const doc = new JSDOM(renderPricingPage(lang)).window.document
    expect(doc.querySelector('dialog')).toBeNull()
    for (const p of PAID) {
      const form = doc.querySelector(`form.wl[data-plan="${p}"]`)
      expect(form, p).not.toBeNull()
      const input = form!.querySelector('input[type="email"]')!
      expect(form!.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(COPY[lang].dialog.email)
      expect(form!.querySelector('button[type="submit"]')).not.toBeNull()
    }
    expect(doc.querySelector('form.wl[data-plan="pro"] button')!.textContent).toBe(COPY[lang].cta.reserve)
    expect(doc.querySelector('form.wl[data-plan="free"]')).toBeNull()
  })

  it('posts the expected payload with the picked role, and reports success without the email', async () => {
    const { dom, doc, events, posts } = open('es', true, '?role=team')
    const form = doc.querySelector<HTMLFormElement>('form.wl[data-plan="team"]')!
    const input = form.querySelector('input')!
    input.dispatchEvent(new dom.window.Event('focus'))
    input.dispatchEvent(new dom.window.Event('focus'))
    input.value = 'a@b.com'
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
    await flush(); await flush(); await flush()
    expect(posts).toEqual([{ url: 'https://ifc-viewer-email-capture.joelbenitezdonari.workers.dev/subscribe', email: 'a@b.com', source: 'pricing:team:team', locale: 'es' }])
    expect(events.filter((e) => e.event === 'pricing_email_focus')).toHaveLength(1)
    expect(events.find((e) => e.event === 'pricing_email_focus')!.properties.plan).toBe('team')
    expect(events.find((e) => e.event === 'email_captured')!.properties.source).toBe('pricing:team:team')
    expect(JSON.stringify(events)).not.toContain('a@b.com')
    expect(form.classList.contains('done')).toBe(true)
    expect(form.querySelector('.msg')!.textContent).toBe(COPY.es.dialog.ok)
  })

  it('without a picked role the source says none; a failure is shown inline and tracked', async () => {
    const { dom, doc, events, posts } = open('en', false)
    const form = doc.querySelector<HTMLFormElement>('form.wl[data-plan="pro"]')!
    form.querySelector('input')!.value = 'x@y.io'
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }))
    await flush(); await flush(); await flush()
    expect(posts[0].source).toBe('pricing:pro:none')
    expect(form.querySelector('.msg')!.textContent).toBe(COPY.en.dialog.err)
    expect(form.querySelector('button')!.disabled).toBe(false)
    expect(events.find((e) => e.event === 'pricing_email_error')!.properties.plan).toBe('pro')
    expect(events.some((e) => e.event === 'email_captured')).toBe(false)
  })
})
