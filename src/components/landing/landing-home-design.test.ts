// Pins the home page's look and its per-language SEO: plain token surfaces, no
// animated effect components, nothing under 13 px, one h1 that carries the
// searched term, both themes readable, and a full hreflang cluster per home.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { HOME_COPY, HOME_LANGS } from './home-copy'
import { HOME_GUIDE, HOME_LANGUAGE_NAMES, guideHref } from './home-guide'
import { SHOWCASE_COPY } from './home-showcase'
import { TOOL_LANDINGS, validatorPath } from '../../lib/localized-landings'
import { pricingPath } from '../../lib/pricing/pricing-paths'
import { homePictures } from '../../../scripts/seo/home-images'
import { generateLangShells } from '../../../scripts/seo/generate-lang-shells'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
const SOURCES = ['src/components/Landing.tsx', 'src/components/landing/ProfilePaths.tsx', 'src/components/landing/HomeShowcase.tsx', 'src/components/landing/HomeGuide.tsx'].map((p) => [p, read(p)] as const)

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
    expect(res.shells).toBe(HOME_LANGS.length - 1)
  })

  for (const l of HOME_LANGS.filter((x) => x !== 'en')) {
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

  const shell = (l: string) => readFileSync(path.join(dist, l, 'index.html'), 'utf8')
  const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const text = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // ── /es/: generated like the rest since 2026-11-10 ─────────────────────────
  describe('/es/ is the same home as the other nine', () => {
    const html = shell('es')

    it('has no hand-written page left to shadow it', () => {
      // Vite copies public/ into dist/ first; a file here would be overwritten
      // at build and served as-is in development.
      expect(existsSync(path.join(ROOT, 'public', 'es', 'index.html'))).toBe(false)
    })

    it('keeps the title and description that earn its clicks', () => {
      expect(html).toContain('<title>Visor IFC Online — Gratis, Sin Instalación, en tu Navegador</title>')
      expect(html).toContain('content="Abre un IFC en el navegador y obtén un Health Score de 0 a 100 en menos de 30 segundos. Sin cuenta, sin subir nada, sin instalar."')
    })

    it('opens its one h1 with «Visor IFC gratis online»', () => {
      const h1 = html.match(/<h1>([^<]*)<\/h1>/g) ?? []
      expect(h1).toHaveLength(1)
      expect(h1[0]?.startsWith('<h1>Visor IFC gratis online')).toBe(true)
    })

    it('states the hero capture and the three of «El visor en acción», with Spanish alt text', () => {
      const pics = homePictures('es')
      expect(pics).toHaveLength(4)
      expect(SHOWCASE_COPY.es.label).toBe('El visor en acción')
      for (const p of pics) {
        expect(html).toContain(`<img src="${p.url}" alt="${attr(p.alt)}"`)
        expect(html).toContain(`"contentUrl":"${p.url}"`)
      }
      expect(html).toContain('"primaryImageOfPage"')
      expect(html.match(/rel="preload" as="image"/g)).toHaveLength(2)
    })

    it('carries the comparison with Solibri and Flinker', () => {
      const c = SHOWCASE_COPY.es.compare
      expect(html).toContain(`<h2>${text(c.title)}</h2>`)
      expect(html).toContain('<th scope="col">Solibri</th><th scope="col">Flinker</th>')
      expect(html).toContain(text(c.rows.price.solibri))
      expect(html).toContain(text(c.rows.price.flinker))
    })

    it('links every Spanish landing the hand-written page linked', () => {
      const SITE = 'https://www.ifcvieweronline.eu'
      for (const href of [validatorPath('es'), ...Object.values(TOOL_LANDINGS.es).map((t) => t.path)]) {
        expect(html, href).toContain(`href="${SITE}/${href}"`)
        expect(existsSync(path.join(ROOT, 'public', href, 'index.html')), href).toBe(true)
      }
    })
  })

  // ── «Open an IFC file», in the words each country searches with ────────────
  describe('the «open an IFC file» answers', () => {
    it('are written for Spanish, German and French, around the searched terms', () => {
      expect(Object.keys(HOME_GUIDE).sort()).toEqual(['de', 'es', 'fr'])
      const said = (l: 'es' | 'de' | 'fr') => { const g = HOME_GUIDE[l]!; return [g.title, g.intro, ...g.items.flatMap((i) => [i.q, i.a])].join(' ').toLowerCase() }
      for (const term of ['ifc-datei öffnen', 'kostenlos', 'online', 'ifc viewer', 'auf deutsch']) expect(said('de'), term).toContain(term)
      for (const term of ['ouvrir un fichier ifc', 'visionneuse ifc', 'lecteur ifc', 'gratuit', 'en ligne', 'logiciel']) expect(said('fr'), term).toContain(term)
      for (const term of ['abrir un archivo ifc', 'visor ifc', 'gratis', 'online', 'programa']) expect(said('es'), term).toContain(term)
    })

    for (const l of ['es', 'de', 'fr'] as const) {
      it(`${l}: every answer says something to do, and its link leads to a page that exists`, () => {
        const g = HOME_GUIDE[l]!
        expect(g.items.length).toBeGreaterThanOrEqual(3)
        for (const i of g.items) {
          expect(i.q.trim().endsWith('?'), i.q).toBe(true)
          expect(i.a.length, i.q).toBeGreaterThan(120)
          if (i.link) expect(existsSync(path.join(ROOT, 'public', guideHref(l, i.link.to), 'index.html')), i.link.to).toBe(true)
        }
        // The quoted button is the one the page shows.
        const button = JSON.parse(read(`src/locales/${l}/landing.json`)).actions.openAnIfc as string
        expect(g.items[0].a).toContain(button)
      })

      it(`${l}: the shell states them as text, and as questions in its JSON-LD`, () => {
        const html = shell(l)
        const g = HOME_GUIDE[l]!
        expect(html).toContain(`<h2>${text(g.title)}</h2>`)
        for (const i of g.items) {
          expect(html, i.q).toContain(`<h3>${text(i.q)}</h3>`)
          expect(html, i.q).toContain(text(i.a))
          expect(html, i.q).toContain(`"name":${JSON.stringify(i.q)}`)
        }
      })
    }

    it('a language without them gets no empty block', () => {
      expect(shell('ja')).not.toContain('<section><h2></h2>')
      expect(shell('ja')).not.toContain('undefined')
    })

    it('the page renders them from the same data, after the three paths', () => {
      const src = read('src/components/Landing.tsx')
      expect(src.indexOf('<HomeGuideSection')).toBeGreaterThan(src.indexOf('<ProfilePaths'))
      expect(read('src/components/landing/HomeGuide.tsx')).toContain('HOME_GUIDE[')
    })
  })

  // ── The homes link each other ──────────────────────────────────────────────
  describe('links between the ten homes', () => {
    it('every shell links all ten, each named in its own language', () => {
      for (const l of HOME_LANGS.filter((x) => x !== 'en')) {
        const html = shell(l)
        for (const to of HOME_LANGS) {
          const href = `https://www.ifcvieweronline.eu${to === 'en' ? '/' : `/${to}/`}`
          expect(html, `${l} → ${to}`).toContain(`<a href="${href}" hreflang="${to}" lang="${to}">${HOME_LANGUAGE_NAMES[to]}: `)
        }
      }
    })

    it('the page renders them as plain links in its footer', () => {
      const src = read('src/components/Landing.tsx')
      expect(src.indexOf('<HomeLanguages')).toBeGreaterThan(src.indexOf('</footer>'))
      const comp = read('src/components/landing/HomeGuide.tsx')
      expect(comp).toMatch(/HOME_LANGS\.map\(\(l\) => \([\s\S]*?<a\s+href=\{/)
      expect(comp).toContain('hrefLang={l}')
    })

    it('the sitemap lists the whole cluster on the two hand-kept home entries', () => {
      const xml = read('public/sitemap.xml')
      for (const loc of ['https://www.ifcvieweronline.eu/', 'https://www.ifcvieweronline.eu/es/']) {
        const at = xml.indexOf(`<loc>${loc}</loc>`)
        expect(at, loc).toBeGreaterThan(0)
        const alts = [...xml.slice(at, xml.indexOf('</url>', at)).matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1])
        expect(new Set(alts), loc).toEqual(new Set([...HOME_LANGS, 'x-default']))
        expect(alts).toHaveLength(HOME_LANGS.length + 1)
      }
    })
  })
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
