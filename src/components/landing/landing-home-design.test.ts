// Pins the home page's look and its per-language SEO: plain token surfaces, no
// animated effect components, nothing under 13 px, one h1 that carries the
// searched term, both themes readable, and a full hreflang cluster per home.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { HOME_COPY, HOME_LANGS } from './home-copy'
import { pricingPath } from '../../lib/pricing/pricing-paths'
import { generateLangShells } from '../../../scripts/seo/generate-lang-shells'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
const SOURCES = ['src/components/Landing.tsx', 'src/components/landing/ProfilePaths.tsx'].map((p) => [p, read(p)] as const)

describe('home page design', () => {
  it('uses no animated background or text-effect components', () => {
    for (const [p, src] of SOURCES) {
      expect(src, p).not.toMatch(/from '\.{1,2}\/reactbits\/(?!CountUp)/)
      expect(src, p).not.toMatch(/framer-motion/)
    }
  })

  it('takes every colour from the theme tokens (no hex, rgb or gradients)', () => {
    for (const [p, src] of SOURCES) {
      expect(src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g) ?? [], p).toEqual([])
      expect(src.match(/rgba?\(/g) ?? [], p).toEqual([])
      expect(src.match(/(?:linear|radial)-gradient/g) ?? [], p).toEqual([])
    }
  })

  it('sets no text below 13 px', () => {
    for (const [p, src] of SOURCES) {
      const small = [...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1])).filter((n) => n < 13)
      expect(small, p).toEqual([])
    }
  })

  it('has exactly one h1, and it opens with the searched term in every language', () => {
    const h1s = SOURCES.reduce((n, [, src]) => n + (src.match(/<h1\b/g) ?? []).length, 0)
    expect(h1s).toBe(1)
    expect(read('src/components/Landing.tsx')).toMatch(/<h1[\s\S]*?\.kicker\}[\s\S]*?\.h1\}[\s\S]*?<\/h1>/)
    for (const l of HOME_LANGS) expect(HOME_COPY[l].kicker, l).toMatch(/IFC/)
  })
})

// ── Contrast in both themes ──────────────────────────────────────────────────
function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]))
}
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('home page contrast', () => {
  const css = read('src/index.css')
  const dark = tokens(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {'))))
  const light = { ...dark, ...tokens(css.slice(css.indexOf('.lp-light {'), css.indexOf('}', css.indexOf('.lp-light {')))) }

  for (const [name, t] of [['dark', dark], ['light', light]] as const) {
    it(`${name}: text tokens clear 4.5:1 on bg and surface`, () => {
      for (const fg of ['text', 'text-dim', 'text-faint', 'accent-2'])
        for (const bg of ['bg', 'surface']) expect(ratio(t[fg], t[bg]), `${name} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    })
    it(`${name}: white on the accent button clears 4.5:1`, () => {
      expect(ratio('#FFFFFF', t.accent)).toBeGreaterThanOrEqual(4.5)
    })
  }
})

// ── Per-language homes: canonical + hreflang + one translated h1 ─────────────
describe('localized home shells', () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'lang-shells-'))
  writeFileSync(path.join(dist, 'index.html'), read('index.html'))
  const res = generateLangShells(dist)

  it('writes every generated language cleanly', () => {
    expect(res.errors).toBe(0)
    expect(res.shells).toBeGreaterThanOrEqual(8)
  })

  for (const l of HOME_LANGS.filter((x) => x !== 'en' && x !== 'es')) {
    it(`/${l}/ is self-canonical, in its language, with the full cluster`, () => {
      const file = path.join(dist, l, 'index.html')
      expect(existsSync(file)).toBe(true)
      const html = readFileSync(file, 'utf8')
      expect(html).toContain(`<html lang="${l}"`)
      expect(html).toMatch(new RegExp(`rel="canonical" href="https://www\.ifcvieweronline\.eu/${l}/"`))
      const alts = [...html.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1])
      expect(new Set(alts)).toEqual(new Set([...HOME_LANGS, 'x-default']))
      const h1 = html.match(/<h1>([^<]*)<\/h1>/g) ?? []
      expect(h1.length).toBe(1)
      expect(h1[0]).toContain(HOME_COPY[l].kicker)
    })
  }
})

// ── Every page in a language points back to that language's home ────────────

describe('pricing pages link to the home in their own language', () => {
  for (const l of HOME_LANGS) {
    it(`${l}: logo, header button and footer go to ${l === 'en' ? '/' : `/${l}/`}`, () => {
      const home = l === 'en' ? '/' : `/${l}/`
      const html = read(path.join('public', pricingPath(l), 'index.html'))
      expect(html).toContain(`<a href="${home}" class="logo">`)
      expect(html).toContain(`<a href="${home}" class="btn btn-quiet" data-cta="header_open">`)
      if (l !== 'en') expect(html, 'no link to the English home').not.toMatch(/href="\/"/)
    })
  }
})
