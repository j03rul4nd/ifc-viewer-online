// The pictures of the generated landings (tool landings, demo landings, twin
// builder ×10 languages): every page shows captures of the product, every file
// a page names is on disk in every rendition, and crawlers are told the same
// thing the page shows.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'fs'
import path from 'path'
import * as A from './tool-landings/content-a.mjs'
import * as B from './tool-landings/content-b.mjs'
import { PAGE_PATHS, IMAGES, LANGS as DEMO_LANGS } from './build-demo-landings'
import { BUILDER_PATHS, BUILDER_PICTURES, COPY as BUILDER_COPY } from './build-twin-builder-landings'
import { DIR, RETIRED, SHARED, TOOL_SIZE, SITE, filesOf, jpgPath, jpgUrl, webpWidths } from './landing-pictures.mjs'
import { readXmp } from './image-metadata'

const PUBLIC = path.resolve(__dirname, '../../public')
const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const CONCEPTS = ['editor', 'classification', 'health']

interface Pic { file: string; width: number; height: number; alt: string }
interface Landing { family: 'tool' | 'demo' | 'builder'; lang: string; route: string; pictures: Pic[] }

const toolPage = (c: string, l: string) => ((A.PAGES as any)[c][l] ?? (B.PAGES as any)[c][l]) as { slug: string; shots: { file: string; alt: string }[] }
const shared = (stem: string, alt: string): Pic => ({ file: stem, alt, ...(SHARED as Record<string, { width: number; height: number }>)[stem] })

const LANDINGS: Landing[] = [
  ...CONCEPTS.flatMap((c) => LANGS.map((l): Landing => ({
    family: 'tool', lang: l, route: `/${toolPage(c, l).slug}/`,
    pictures: toolPage(c, l).shots.map((s) => ({ file: s.file, alt: s.alt, ...TOOL_SIZE })),
  }))),
  ...PAGE_PATHS.map((p): Landing => {
    const L = DEMO_LANGS.find((x) => x.lang === p.lang)!
    return { family: 'demo', lang: p.lang, route: p.path, pictures: p.page.images.map((s) => shared(s, L.images[s].alt)) }
  }),
  ...BUILDER_PATHS.filter((p) => p.lang !== 'en').map((p): Landing => ({
    family: 'builder', lang: p.lang, route: p.path,
    pictures: (['agv', 'imports'] as const).map((k) => shared(BUILDER_PICTURES[k], BUILDER_COPY[p.lang][k].alt)),
  })),
]

const html = (l: Landing) => readFileSync(path.join(PUBLIC, l.route, 'index.html'), 'utf8')
const main = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'))
const imgs = (h: string) => [...h.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
/** Every path under images/landings/ a page names, anywhere in its HTML. */
const named = (h: string) => [...new Set([...h.matchAll(/images\/landings\/[a-z0-9-]+\.(?:jpg|webp)/g)].map((m) => m[0]))]

describe('pictures of the generated landings', () => {
  it('covers the three families in ten languages', () => {
    expect(LANDINGS.filter((l) => l.family === 'tool')).toHaveLength(30)
    expect(LANDINGS.filter((l) => l.family === 'demo')).toHaveLength(50)
    expect(LANDINGS.filter((l) => l.family === 'builder')).toHaveLength(9)
  })

  it('every landing shows at least one capture, drawn with its size and both formats', () => {
    for (const l of LANDINGS) {
      const body = main(html(l))
      expect(l.pictures.length, l.route).toBeGreaterThan(0)
      for (const p of l.pictures) {
        const tag = imgs(body).find((t) => attr(t, 'src') === jpgPath(p.file))
        expect(tag, `${l.route} shows ${p.file}`).toBeTruthy()
        expect(attr(tag!, 'width'), `${l.route} ${p.file}`).toBe(String(p.width))
        expect(attr(tag!, 'height'), `${l.route} ${p.file}`).toBe(String(p.height))
        for (const w of webpWidths(p.width)) expect(body, `${l.route} ${p.file} ${w}w`).toContain(`/${DIR}${p.file}-${w}.webp ${w}w`)
      }
    }
  })

  it('every file a page names exists, in every rendition', () => {
    for (const l of LANDINGS) {
      for (const rel of named(html(l))) expect(existsSync(path.join(PUBLIC, rel)), `${l.route} → ${rel}`).toBe(true)
      for (const p of l.pictures) for (const rel of filesOf(p.file, p.width)) expect(existsSync(path.join(PUBLIC, rel)), `${l.route} → ${rel}`).toBe(true)
    }
  })

  it('no landing uses the pictures these replaced, and the old files are gone', () => {
    for (const l of LANDINGS) expect(html(l), l.route).not.toMatch(RETIRED)
    expect(existsSync(path.join(PUBLIC, 'demos'))).toBe(false)
    // public/img/ keeps only what other pages use.
    const old = new Set(CONCEPTS.flatMap((c) => LANGS.flatMap((l) => toolPage(c, l).shots.map((s) => `${s.file}.jpg`))))
    for (const f of readdirSync(path.join(PUBLIC, 'img'))) expect(old.has(f), `public/img/${f}`).toBe(false)
    expect(Object.keys(IMAGES).sort()).toEqual(Object.keys(SHARED).filter((s) => !Object.values(BUILDER_PICTURES).includes(s as never)).sort())
  })

  it('alt text describes the picture, in the language of the page', () => {
    const english = new Map<string, string>()
    for (const l of LANDINGS.filter((x) => x.lang === 'en')) for (const p of l.pictures) english.set(p.file, p.alt)
    for (const l of LANDINGS) {
      const h = html(l), body = main(h)
      const h1 = unesc(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(h)![1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      for (const tag of imgs(body)) {
        const alt = unesc(attr(tag, 'alt') ?? '')
        expect([...alt].length, `${l.route}: ${tag}`).toBeGreaterThanOrEqual(l.lang === 'zh' || l.lang === 'ja' ? 12 : 30)
        expect(alt, l.route).not.toBe(h1)
      }
      for (const p of l.pictures) {
        expect(body, `${l.route} ${p.file}`).toContain(`alt="${p.alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)
        // A shared picture is described again in each language, not left in English.
        if (l.lang !== 'en' && english.has(p.file)) expect(p.alt, `${l.route} ${p.file}`).not.toBe(english.get(p.file))
        if (l.lang === 'zh') expect(p.alt, l.route).toMatch(/[一-鿿]/)
        if (l.lang === 'ja') expect(p.alt, l.route).toMatch(/[぀-ヿ]/)
        if (l.lang === 'th') expect(p.alt, l.route).toMatch(/[฀-๿]/)
      }
    }
  })

  it('the first picture loads at once and the rest when they are near', () => {
    for (const l of LANDINGS) {
      const tags = imgs(main(html(l)))
      const eager = tags.filter((t) => !/loading="lazy"/.test(t))
      // The builder pages open on text: both of their pictures are below the first screen.
      expect(eager.length, l.route).toBe(l.family === 'builder' ? 0 : 1)
      if (eager.length) {
        expect(attr(eager[0], 'src'), l.route).toBe(jpgPath(l.pictures[0].file))
        expect(eager[0], l.route).toContain('fetchpriority="high"')
      }
    }
  })

  it('og:image is the page’s own first capture', () => {
    for (const l of LANDINGS) {
      const h = html(l)
      expect(/property="og:image" content="([^"]+)"/.exec(h)?.[1], l.route).toBe(jpgUrl(l.pictures[0].file))
      expect(/property="og:image:width" content="(\d+)"/.exec(h)?.[1], l.route).toBe(String(l.pictures[0].width))
      expect(/property="og:image:height" content="(\d+)"/.exec(h)?.[1], l.route).toBe(String(l.pictures[0].height))
      expect(/name="twitter:image" content="([^"]+)"/.exec(h)?.[1], l.route).toBe(jpgUrl(l.pictures[0].file))
    }
  })

  it('JSON-LD lists every picture as an ImageObject with creator and licence', () => {
    for (const l of LANDINGS) {
      const nodes = [...html(l).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .flatMap((m) => { const o = JSON.parse(m[1]); return o['@graph'] ?? [o] })
        .filter((o: any) => o['@type'] === 'ImageObject')
      for (const p of l.pictures) {
        const node = nodes.find((n: any) => n.contentUrl === jpgUrl(p.file))
        expect(node, `${l.route} ${p.file}`).toBeTruthy()
        expect(node.name, l.route).toBe(p.alt)
        expect(node.width, l.route).toBe(p.width)
        expect(node.inLanguage, l.route).toBe(l.lang)
        expect(node.creator.name).toBe('IFC Viewer Online')
        expect(node.license).toBe(`${SITE}/terms/`)
        expect(node.creditText, `${l.route} ${p.file}`).toContain('IFC Viewer Online')
      }
      expect(nodes.filter((n: any) => n.representativeOfPage), l.route).toHaveLength(1)
    }
  })

  it('the sitemap lists every picture under its page', () => {
    const sitemap = readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8')
    for (const l of LANDINGS) {
      const at = sitemap.indexOf(`<loc>${SITE}${l.route}</loc>`)
      expect(at, l.route).toBeGreaterThan(0)
      const entry = sitemap.slice(at, sitemap.indexOf('</url>', at))
      for (const p of l.pictures) expect(entry, `${l.route} ${p.file}`).toContain(`<image:loc>${jpgUrl(p.file)}</image:loc>`)
      expect(entry, l.route).not.toMatch(RETIRED)
    }
  })

  it('each .jpg carries its rights and says it is a screen capture', () => {
    const seen = new Set<string>()
    for (const l of LANDINGS) for (const p of l.pictures) {
      if (seen.has(p.file)) continue
      seen.add(p.file)
      const file = readFileSync(path.join(PUBLIC, DIR, `${p.file}.jpg`))
      // JPEG, with the pixel size the pages state (SOF0/SOF2 marker).
      expect(file[0] === 0xff && file[1] === 0xd8, p.file).toBe(true)
      let i = 2, w = 0, h = 0
      while (i < file.length - 9) {
        if (file[i] !== 0xff) { i++; continue }
        const m = file[i + 1], len = file.readUInt16BE(i + 2)
        if (m === 0xc0 || m === 0xc2) { h = file.readUInt16BE(i + 5); w = file.readUInt16BE(i + 7); break }
        i += 2 + len
      }
      expect([w, h], p.file).toEqual([p.width, p.height])
      const xmp = readXmp(file) ?? ''
      expect(xmp, p.file).toContain('IFC Viewer Online')
      expect(xmp, p.file).toContain('screenCapture')
      expect(xmp, p.file).toContain(`${SITE}/terms/`)
    }
    expect(seen.size).toBe(60 + Object.keys(SHARED).length)
  })

  it('the pages carry no glow, pill, gradient or dot field of their own', () => {
    for (const l of LANDINGS) {
      const h = html(l)
      const own = [...h.matchAll(/<style(?![^>]*data-landing-chrome)[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
      expect(own, l.route).not.toMatch(/radial-gradient|linear-gradient|background-clip:\s*text|border-radius:\s*100px|box-shadow/)
      expect(h, l.route).not.toMatch(/data-dot-grid|seo\/dot-grid\.js/)
      // One column, read from the left: the hero is not centred.
      expect(/\.hero\s*\{[^}]*\}/.exec(own)?.[0] ?? '', l.route).not.toMatch(/text-align:\s*center/)
    }
  })
})
