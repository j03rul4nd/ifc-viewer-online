import { describe, expect, it } from 'vitest'
import { renderIssue, withUtm } from './render'
import { AUDIENCES, SAMPLE_FACTS, TEMPLATES_V3, factsFrom, nameOf, purposeOf, samplePublication } from './templates'
import { CONTENT, RECORDER } from './content'
import { BLOCK_NAMES, UI } from './Studio'
import { LABELS, LABEL_KEYS, LANGS } from './labels'
import { NEUTRALS, contrast, palette, readableOn } from './tokens'

const BASE = 'https://www.ifcvieweronline.eu'
const render = (id: string, lang = 'es', scheme: 'auto' | 'light' | 'dark' = 'auto') => {
  const t = TEMPLATES_V3.find((x) => x.id === id)!
  const pub = samplePublication(lang)
  return renderIssue(t.build({ lang, pub, base: BASE }), pub, { lang, scheme, unsubscribeUrl: `${BASE}/u/abc` })
}

describe('editorial templates', () => {
  it('ten templates, every audience covered', () => {
    expect(TEMPLATES_V3).toHaveLength(10)
    expect(new Set(TEMPLATES_V3.map((t) => t.id)).size).toBe(10)
    for (const a of AUDIENCES) expect(TEMPLATES_V3.some((t) => t.audience === a)).toBe(true)
  })

  for (const t of TEMPLATES_V3) {
    describe(t.id, () => {
      for (const lang of ['es', 'en']) {
        it(`${lang}: html snapshot`, () => expect(render(t.id, lang).html).toMatchSnapshot())
        it(`${lang}: plain text snapshot`, () => expect(render(t.id, lang).text).toMatchSnapshot())
      }
      it('stays under Gmail’s 102 KB clip', () => {
        for (const s of ['auto', 'light', 'dark'] as const) expect(new TextEncoder().encode(render(t.id, "es", s).html).length).toBeLessThan(102 * 1024)
      })
      it('is mail-safe: presentation tables, alt on images, preheader, unsubscribe, no tracking pixel, no script', () => {
        const { html, text, preheader } = render(t.id)
        expect(html).not.toMatch(/<table(?![^>]*role="presentation")/)
        for (const img of html.match(/<img[^>]*>/g) ?? []) expect(img).toMatch(/alt="[^"]+".*width="\d+".*height="\d+"|width="\d+".*height="\d+".*alt="[^"]+"/)
        expect(html).not.toMatch(/width="1" height="1"/)
        expect(html).not.toMatch(/<script/i)
        expect(html).toContain(preheader.slice(0, 20))
        expect(html).toContain('/u/abc')
        expect(text).toContain('/u/abc')
        expect(html).toContain('<!--[if mso]>')
        expect(html).toContain('prefers-color-scheme:dark')
      })
      it('says who it is for and what to do', () => {
        const { html, text } = render(t.id)
        expect(html).toContain('Para')
        expect(text).toMatch(/Para: /)
        expect(text.length).toBeGreaterThan(300)
      })
    })
  }

  it('forced schemes differ and carry no media query', () => {
    const l = render('weekly', 'es', 'light').html, d = render('weekly', 'es', 'dark').html
    expect(l).not.toBe(d)
    expect(d).not.toContain('prefers-color-scheme')
    expect(d).toContain(NEUTRALS.dark.paper)
  })

  it('hidden blocks are left out of html and text', () => {
    const t = TEMPLATES_V3[0], pub = samplePublication('es')
    const issue = t.build({ lang: 'es', pub, base: BASE })
    const cta = issue.blocks.find((b) => b.k === 'cta')!
    cta.hidden = true
    const r = renderIssue(issue, pub, { lang: 'es', unsubscribeUrl: 'x' })
    expect(r.html).not.toContain('Abrir federado P05')
    expect(r.text).not.toContain('Abrir federado P05')
  })

  it('escapes what people type', () => {
    const t = TEMPLATES_V3[0], pub = { ...samplePublication('es'), name: '<script>alert(1)</script>' }
    const r = renderIssue(t.build({ lang: 'es', pub, base: BASE }), pub, { lang: 'es', unsubscribeUrl: 'x' })
    expect(r.html).not.toContain('<script>alert')
  })

  it('adds UTM only when asked, keeps hashes', () => {
    expect(withUtm('https://x.eu/a?b=1#t=2', { source: 'mail', medium: 'email', campaign: 's46' })).toBe('https://x.eu/a?b=1&utm_source=mail&utm_medium=email&utm_campaign=s46#t=2')
    expect(withUtm('https://x.eu/a')).toBe('https://x.eu/a')
    const pub = samplePublication('es'), t = TEMPLATES_V3[0]
    const r = renderIssue(t.build({ lang: 'es', pub, base: BASE }), pub, { lang: 'es', unsubscribeUrl: 'u', utm: { source: 'llv', medium: 'email', campaign: 'w46' } })
    expect(r.html).toContain('utm_campaign=w46')
    expect(r.html).not.toMatch(/\/u\?utm/)
  })

  it('fills figures from workspace data', () => {
    const f = factsFrom({ health: [70, 75], clashes: [{ open: 40 }, { open: 30 }], issues: { opened: 5, closed: 9 }, milestones: [{ name: 'A', date: '1', done: true }, { name: 'B', date: '2', done: false }] })
    expect(f).toMatchObject({ health: 75, healthPrev: 70, clashesOpen: 30, clashesPrev: 40, bcfNew: 5, bcfClosed: 9 })
    expect(f.milestones!.map((m) => m.state)).toEqual(['done', 'next'])
    const pub = samplePublication('es')
    const r = renderIssue(TEMPLATES_V3[0].build({ lang: 'es', pub, base: BASE, facts: f }), pub, { lang: 'es', unsubscribeUrl: 'u' })
    expect(r.subject).toContain('30 colisiones')
    expect(SAMPLE_FACTS.health).toBe(82)
  })
})

describe('labels', () => {
  for (const l of LANGS) it(`${l} has every label`, () => {
    for (const k of LABEL_KEYS) expect(LABELS[l][k], `${l}.${k}`).toBeTruthy()
  })
  it('renders in every language', () => {
    for (const l of LANGS) expect(render('weekly', l).html).toContain(LABELS[l].to)
  })
})

describe('contrast (WCAG 2.2 AA)', () => {
  for (const s of ['light', 'dark'] as const) it(`${s}: text roles pass 4.5:1 on paper`, () => {
    const p = palette(s)
    for (const r of ['ink', 'dim', 'faint', 'accent', 'ok', 'warn', 'danger'] as const) expect(contrast(p[r], p.paper), `${s}.${r}`).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.onFill, p.fill)).toBeGreaterThanOrEqual(4.5)
  })
  it('a pale brand accent is darkened until it reads', () => {
    const c = readableOn('#ffe066', '#fbfaf7')
    expect(contrast(c, '#fbfaf7')).toBeGreaterThanOrEqual(4.5)
    const p = palette('light', '#ffe066')
    expect(contrast(p.onFill, p.fill)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('template content in ten languages', () => {
  // Every English key the templates and the Studio use, collected the same way
  // scripts/mail/extract-content.mjs does.
  const collect = () => {
    RECORDER.keys = new Map()
    const pub = samplePublication('en')
    for (const t of TEMPLATES_V3) { t.build({ lang: 'en', pub, base: BASE }); nameOf(t, 'en'); purposeOf(t, 'en') }
    const keys = new Set(RECORDER.keys.keys())
    RECORDER.keys = null
    for (const k of Object.keys(UI.en) as (keyof typeof UI.en)[]) keys.add(UI.en[k])
    for (const v of Object.values(BLOCK_NAMES)) keys.add(v.en)
    return [...keys]
  }
  const keys = collect()
  const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join()
  it('finds the texts', () => expect(keys.length).toBeGreaterThan(200))
  for (const [lang, dict] of Object.entries(CONTENT)) {
    it(`${lang}: every text translated, same placeholders, nothing extra`, () => {
      expect(Object.keys(dict).sort()).toEqual([...keys].sort())
      for (const k of keys) {
        expect(dict[k], `${lang}: ${k}`).toBeTruthy()
        expect(ph(dict[k]), `${lang}: ${k}`).toBe(ph(k))
      }
    })
    it(`${lang}: every template renders in its language`, () => {
      for (const t of TEMPLATES_V3) {
        const pub = samplePublication(lang)
        const r = renderIssue(t.build({ lang, pub, base: BASE }), pub, { lang, unsubscribeUrl: 'u' })
        expect(r.html).not.toMatch(/\{\{\w+\}\}/)
        const enPub = samplePublication('en')
        expect(r.subject, `${lang}: ${t.id}`).not.toBe(t.build({ lang: 'en', pub: enPub, base: BASE }).subject)
      }
    })
  }
})
