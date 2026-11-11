import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import {
  COPY, LANGS, MIN_FONT_PX, THEMES, CHROME_CSS, literalColours, tokenizeDecls, applyDotGrid, DOT_GRID, applyChrome, chromeLinks, landingFiles, raiseSmallFonts, renderHeader, renderNextStep,
} from './landing-chrome'

const ROOT = path.resolve(__dirname, '..', '..')
const PUBLIC = path.join(ROOT, 'public')

// Routes produced at build time (dist only) or by the React app, so they are not in public/.
const GENERATED = [/^\/([a-z]{2}\/)?fix\/$/, /^\/([a-z]{2}\/)?blog\/$/, /^\/sign-up$/, /^\/([a-z]{2}\/)?(\?.*)?$/]

function linkExists(href: string): boolean {
  if (GENERATED.some((r) => r.test(href))) return true
  return existsSync(path.join(PUBLIC, href.split('?')[0], 'index.html'))
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe('landing chrome', () => {
  it('reads in order: header menu, then the page, then the next step, then the footer', () => {
    const page = '<html lang="es"><head><style>.a{font-size:11px}</style></head><body><header><a class="nav-cta">x</a></header><main><h1>H</h1></main><footer>f</footer></body></html>'
    const out = applyChrome(page)
    const order = ['class="lc-top"', '<h1>', 'class="lc-next"', '<footer'].map((s) => out.indexOf(s))
    expect(order.every((v) => v >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(out).toContain('Siguiente paso')
  })

  it('is idempotent, and every landing in public/ is already processed', () => {
    const files = landingFiles()
    expect(files.length).toBeGreaterThanOrEqual(120)
    for (const f of files) {
      const html = readFileSync(f, 'utf8')
      expect(applyChrome(html), path.relative(ROOT, f)).toBe(html)
      expect(html.match(/class="lc-top"/g)?.length, f).toBe(1)
      expect(html.match(/class="lc-next"/g)?.length, f).toBe(1)
    }
  })

  it('the first proof (the h1 and the hero) comes before the funnel block', () => {
    for (const f of landingFiles()) {
      const html = readFileSync(f, 'utf8')
      expect(html.indexOf('<h1'), f).toBeGreaterThan(0)
      expect(html.indexOf('<h1'), f).toBeLessThan(html.indexOf('class="lc-next"'))
    }
  })

  it('no text under 13 px in any landing stylesheet', () => {
    expect(raiseSmallFonts('a{font-size:11px}b{font-size:.7rem}c{font-size:14px}')).toBe('a{font-size: 13px}b{font-size: 13px}c{font-size:14px}')
    for (const f of landingFiles()) {
      const css = [...readFileSync(f, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('')
      for (const m of css.matchAll(/font-size:\s*([\d.]+)(px|rem)\b/g)) {
        const px = m[2] === 'rem' ? +m[1] * 16 : +m[1]
        expect(px, `${path.relative(ROOT, f)}: ${m[0]}`).toBeGreaterThanOrEqual(MIN_FONT_PX)
      }
    }
  })

  it('no text painted with a gradient is left visible', () => {
    for (const f of landingFiles()) {
      const html = readFileSync(f, 'utf8')
      if (/background-clip:\s*text/.test(html)) expect(html, f).toMatch(/-webkit-text-fill-color:currentColor!important/)
    }
  })

  it('colours live only in the token blocks, in every landing', () => {
    expect(literalColours(CHROME_CSS.replace(/<style[^>]*>/, '<style>'))).toEqual([])
    for (const f of landingFiles()) expect(literalColours(readFileSync(f, 'utf8')), path.relative(ROOT, f)).toEqual([])
    expect(tokenizeDecls('color:#55CAC3;border:1px solid rgba(255,255,255,0.06)')).toBe('color:var(--lc-accent-text);border:1px solid color-mix(in srgb,var(--lc-ink) 6%,transparent)')
    expect(tokenizeDecls('background:#0a8481;color:#fff')).toBe('background:var(--lc-accent);color:var(--lc-on-accent)')
  })

  it('the CSS that dot-grid.js injects follows the same rules', () => {
    const js = readFileSync(DOT_GRID, 'utf8')
    expect(applyDotGrid(js)).toBe(js)
    const css = js.slice(js.indexOf('function injectStyles()'), js.indexOf("document.createElement('style')"))
    expect(css.match(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi) ?? []).toEqual([])
    for (const m of css.matchAll(/font-size:\s*([\d.]+)px/g)) expect(+m[1]).toBeGreaterThanOrEqual(MIN_FONT_PX)
  })

  it('both themes pass AA: text roles on canvas and panel, white on the accent', () => {
    for (const [name, t] of Object.entries(THEMES)) {
      for (const fg of [t.text, t['text-2'], t['text-3'], t['accent-text'], t.ok, t.warn, t.danger]) {
        expect(contrast(fg, t.canvas), `${name} ${fg}`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(fg, t.panel), `${name} ${fg}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(t['on-accent'], t.accent), name).toBeGreaterThanOrEqual(4.5)
    }
    for (const m of CHROME_CSS.matchAll(/font-size:(\d+)px/g)) expect(+m[1]).toBeGreaterThanOrEqual(MIN_FONT_PX)
  })

  it('light and dark follow the system and the remembered choice, like /pricing/', () => {
    for (const f of landingFiles()) {
      const html = readFileSync(f, 'utf8'), head = html.slice(0, html.indexOf('</head>'))
      expect(head, f).toContain("localStorage.getItem('lp-theme')")
      expect(head, f).toContain('prefers-color-scheme: light')
      expect(head, f).toContain(':root[data-theme="light"]')
      expect(html.match(/data-lc-theme aria/g)?.length, f).toBe(1)
    }
  })

  it('one h1, a self canonical and a full hreflang set on every landing', () => {
    for (const f of landingFiles()) {
      const html = readFileSync(f, 'utf8'), rel = path.relative(ROOT, f)
      expect(html.match(/<h1\b/g)?.length, rel).toBe(1)
      const canon = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1]
      const route = '/' + path.relative(PUBLIC, path.dirname(f)).split(path.sep).join('/') + '/'
      expect(canon, rel).toBe(`https://www.ifcvieweronline.eu${route}`)
      const alts = [...html.matchAll(/hreflang="([^"]+)"\s+href="([^"]+)"/g)]
      expect(alts.length, rel).toBeGreaterThanOrEqual(2)
      expect(alts.some((a) => a[1] === 'x-default'), rel).toBe(true)
      expect(alts.some((a) => a[2] === canon), `${rel} lists itself`).toBe(true)
    }
  })

  it('the first screen is left-aligned, without the pill, glow or dot field', () => {
    expect(CHROME_CSS).toContain('section.hero{text-align:left!important;background:none!important}')
    expect(CHROME_CSS).toMatch(/section\.hero \.badge[^{]*\{[^}]*background:none!important;border:0!important/)
    for (const f of landingFiles()) expect(readFileSync(f, 'utf8'), f).toMatch(/<section class="hero">/)
  })

  it('no dead links in the header or the next step, in any language', () => {
    for (const l of LANGS) {
      const k = chromeLinks(l)
      for (const h of [...k.nav.map((n) => n.href), k.open, ...k.steps.filter((s) => s.startsWith('/'))]) expect(linkExists(h), `${l}: ${h}`).toBe(true)
      expect(renderHeader(l)).toContain(COPY[l].pricing)
      expect(renderNextStep(l)).toContain('/sign-up')
    }
  })

  it('no broken encoding left in any landing', () => {
    for (const f of landingFiles()) expect(readFileSync(f, 'utf8'), f).not.toMatch(/â€|â†|Â·/)
  })
})
