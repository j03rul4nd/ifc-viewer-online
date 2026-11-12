// Guards the solution pages written by generate-solution-landings.ts
// (/for-contractors/ and /for-engineering/ × ten languages): the files in
// public/ are what the generator writes, every language is a full
// translation, nothing about another vendor is said without a dated source,
// the paid plans read as previews, and the pages link to and from pricing,
// the menu and the three preview-feature posts.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { COPY, ctaHref, page, pagePath, pageUrl, render, SITEMAP_START, postPath } from './generate-solution-landings'
import { FLOW, HERO, IMAGE_DIR, LANGS, POSTS, SLUGS, SOLUTIONS, SOURCES, VENDORS } from './solution-landings/pages'
import type { Lang, Solution } from './solution-landings/types'
import { chromeLinks, landingFiles } from './landing-chrome'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'

const PUBLIC = resolve(__dirname, '../../public')
const lf = (s: string) => s.replace(/\r\n/g, '\n')
const each = (fn: (s: Solution, l: Lang) => void) => { for (const s of SOLUTIONS) for (const l of LANGS) fn(s, l) }
const file = (s: Solution, l: Lang) => join(PUBLIC, SLUGS[s][l], 'index.html')

function shape(v: unknown): unknown {
  if (typeof v === 'string') return ''
  if (Array.isArray(v)) return v.map(shape)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'kind' || k === 'sources' || k === 'faqSources' ? x : shape(x)]))
  return v
}
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(strings)
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings)
  return []
}

describe('solution landings: pages on disk', () => {
  it('are exactly what the generator writes', { timeout: 60_000 }, () => {
    each((s, l) => {
      expect(existsSync(file(s, l)), file(s, l)).toBe(true)
      expect(lf(readFileSync(file(s, l), 'utf8')), `${s}/${l}: run npx tsx scripts/seo/generate-solution-landings.ts`).toBe(lf(render(s, l)))
    })
  })
  it('are picked up by landing-chrome', () => {
    const files = new Set(landingFiles().map((p) => p.split('\\').join('/')))
    each((s, l) => expect(files.has(file(s, l).split('\\').join('/')), `${s}/${l}`).toBe(true))
  })
  it('have unique paths, English ones as doc 24 names them', () => {
    expect(SLUGS.contractors.en).toBe('for-contractors')
    expect(SLUGS.engineering.en).toBe('for-engineering')
    each((s, l) => { if (l !== 'en') expect(SLUGS[s][l].startsWith(`${l}/`)).toBe(true) })
    expect(new Set(SOLUTIONS.flatMap((s) => LANGS.map((l) => SLUGS[s][l]))).size).toBe(SOLUTIONS.length * LANGS.length)
  })
  it('ship every capture as jpg and webp', () => {
    for (const s of SOLUTIONS) for (const shot of [HERO[s], ...FLOW[s]]) {
      expect(existsSync(join(PUBLIC, IMAGE_DIR, `${shot.file}.jpg`)), shot.file).toBe(true)
      for (const w of shot.webp) expect(existsSync(join(PUBLIC, IMAGE_DIR, `${shot.file}-${w}.webp`)), `${shot.file}-${w}`).toBe(true)
    }
  })
  it('are in the sitemap and llms.txt', () => {
    const sm = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8'), llms = readFileSync(join(PUBLIC, 'llms.txt'), 'utf8')
    expect(sm.split(SITEMAP_START).length).toBe(2)
    each((s, l) => expect(sm.includes(`<loc>${pageUrl(s, l)}</loc>`), `${s}/${l}`).toBe(true))
    for (const s of SOLUTIONS) expect(llms.includes(pageUrl(s, 'en'))).toBe(true)
  })
})

describe('solution landings: copy', () => {
  it('is a full translation of English', () => {
    each((s, l) => expect(shape(page(s, l)), `${s}/${l}`).toEqual(shape(page(s, 'en'))))
    for (const l of LANGS) expect(Object.keys(COPY[l].ui).sort(), l).toEqual(Object.keys(COPY.en.ui).sort())
  })
  it('is actually translated', () => {
    each((s, l) => { if (l !== 'en') expect(page(s, l).lead, `${s}/${l}`).not.toBe(page(s, 'en').lead) })
  })
  it('fits the search result', () => {
    each((s, l) => {
      expect([...page(s, l).title].length, `${s}/${l} title`).toBeLessThanOrEqual(60)
      expect([...page(s, l).desc].length, `${s}/${l} desc`).toBeLessThanOrEqual(160)
    })
  })
  it('has one flow step per capture', () => {
    each((s, l) => {
      const flow = page(s, l).sections.find((x) => x.kind === 'flow')
      expect(flow && flow.kind === 'flow' && flow.steps.length, `${s}/${l}`).toBe(FLOW[s].length)
    })
  })
  it('names another vendor only where the section lists its sources', () => {
    each((s, l) => {
      const p = page(s, l)
      for (const t of strings([p.title, p.desc, p.kicker, p.h1, p.lead, p.note, p.hero, p.bottom])) expect(VENDORS.test(t), `${s}/${l}: ${t}`).toBe(false)
      for (const sec of p.sections) {
        const has = 'sources' in sec && !!sec.sources?.length
        if (!has) for (const t of strings(sec)) expect(VENDORS.test(t), `${s}/${l} ${sec.label}: ${t}`).toBe(false)
      }
      if (strings(p.faq).some((t) => VENDORS.test(t))) expect(p.faqSources?.length, `${s}/${l} faq`).toBeGreaterThan(0)
    })
  })
  it('prints the day each source was read', () => {
    for (const k of Object.keys(SOURCES) as (keyof typeof SOURCES)[]) expect(SOURCES[k].read).toMatch(/^2026-\d\d-\d\d$/)
    each((s, l) => {
      const html = readFileSync(file(s, l), 'utf8')
      for (const sec of page(s, l).sections) if ('sources' in sec && sec.sources) for (const k of sec.sources) {
        expect(html.includes(SOURCES[k].url), `${s}/${l} ${k}`).toBe(true)
        expect(html.includes(`datetime="${SOURCES[k].read}"`), `${s}/${l} ${k}`).toBe(true)
      }
    })
  })
  it('never mentions artificial intelligence', () => {
    each((s, l) => {
      const html = readFileSync(file(s, l), 'utf8').replace(/<[^>]+>/g, ' ')
      expect(html, `${s}/${l}`).not.toMatch(/\bAI\b|\bIA\b|\bKI\b/)
      expect(html, `${s}/${l}`).not.toMatch(/artificial|künstlich|人工智能|人工知能|ปัญญาประดิษฐ์/i)
    })
  })
})

describe('solution landings: nothing looks available before it is', () => {
  it('says preview in the first screen and on every flow step', () => {
    each((s, l) => {
      const html = readFileSync(file(s, l), 'utf8')
      const hero = html.slice(html.indexOf('<section class="hero">'), html.indexOf('</section>', html.indexOf('<section class="hero">')))
      expect(hero.includes('preview-note'), `${s}/${l}`).toBe(true)
      expect(html.split('<p class="tag">').length - 1, `${s}/${l}`).toBe(FLOW[s].length)
    })
  })
  it('sends to the plan on pricing, not to a sign-up or checkout', () => {
    each((s, l) => {
      const html = readFileSync(file(s, l), 'utf8')
      expect(html.includes(`href="${ctaHref(s, l)}" class="btn"`), `${s}/${l}`).toBe(true)
      expect(html, `${s}/${l}`).not.toMatch(/checkout|stripe/i)
    })
    expect(ctaHref('contractors', 'en')).toBe('/pricing/?role=receive')
    expect(ctaHref('engineering', 'es')).toBe(`${pricingPath('es')}?role=team`)
  })
})

describe('solution landings: links', () => {
  it('link to the three preview posts, pricing and each other', () => {
    each((s, l) => {
      const html = readFileSync(file(s, l), 'utf8')
      for (const k of Object.keys(POSTS) as (keyof typeof POSTS)[]) {
        expect(html.includes(`href="${postPath(k, l)}"`), `${s}/${l} ${k}`).toBe(true)
      }
      expect(html.includes(`href="${pricingPath(l)}"`), `${s}/${l}`).toBe(true)
      for (const o of SOLUTIONS) expect(html.includes(`href="${pagePath(o, l)}"`), `${s}/${l} → ${o}`).toBe(true)
    })
  })
  it('are in the shared menu of every landing', () => {
    for (const l of LANGS) expect(chromeLinks(l).nav.map((n) => n.href), l).toContain(pagePath('contractors', l))
  })
  it('are linked from the pricing page and the preview posts', () => {
    for (const l of LANGS) {
      const pr = readFileSync(join(PUBLIC, pricingPath(l).slice(1), 'index.html'), 'utf8')
      for (const s of SOLUTIONS) expect(pr.includes(`href="${pagePath(s, l)}"`), `pricing ${l} → ${s}`).toBe(true)
    }
    const posts = readFileSync(resolve(__dirname, '../../src/lib/blog-preview-features-en.ts'), 'utf8')
    for (const s of SOLUTIONS) expect(posts.includes(`/${SLUGS[s].en}/`), `post → ${s}`).toBe(true)
  })
})
