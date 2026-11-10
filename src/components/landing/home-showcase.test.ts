// Pins the home page's pictures: they are captures of the viewer, the files
// exist in every rendition the page asks for, every language describes them,
// the links beside them lead somewhere, and what a crawler is told (noscript,
// JSON-LD, sitemap, share image) is the same list the page renders.
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { HOME_COPY, HOME_LANGS } from './home-copy'
import {
  COMPARED_ON, COMPARE_ROWS, HERO_IMAGE, HERO_MOBILE, HERO_SCENE_QUERY, HOME_IMAGE_DIR, SHOT_IMAGES, SHOT_ORDER,
  SHOWCASE_COPY, examplesPath,
} from './home-showcase'
import { validatorPath, solibriPath } from '../../lib/localized-landings'
import { addHomeImagesToSitemap, homePictures, injectHomeImages } from '../../../scripts/seo/home-images'
import { generateLangShells } from '../../../scripts/seo/generate-lang-shells'
import { readXmp } from '../../../scripts/seo/image-metadata'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const pub = (p: string) => path.join(ROOT, 'public', p)
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
const IMAGES = [HERO_IMAGE, ...SHOT_ORDER.map((id) => SHOT_IMAGES[id])]

/** Pixel size of a JPEG, from its start-of-frame segment. */
function jpegSize(file: Buffer): { width: number; height: number } {
  let at = 2
  while (at < file.length) {
    const marker = file[at + 1]
    const len = file.readUInt16BE(at + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { height: file.readUInt16BE(at + 5), width: file.readUInt16BE(at + 7) }
    at += 2 + len
  }
  throw new Error('no SOF segment')
}

describe('home page pictures: the files', () => {
  it('every picture has its indexed .jpg at the stated size, and each .webp rendition', () => {
    for (const img of IMAGES) {
      const jpg = pub(`${HOME_IMAGE_DIR}${img.file}.jpg`)
      expect(existsSync(jpg), img.file).toBe(true)
      expect(jpegSize(readFileSync(jpg)), img.file).toEqual({ width: img.width, height: img.height })
      for (const w of img.webp) expect(existsSync(pub(`${HOME_IMAGE_DIR}${img.file}-${w}.webp`)), `${img.file}-${w}`).toBe(true)
    }
    expect(existsSync(pub(`${HOME_IMAGE_DIR}${HERO_MOBILE.file}`))).toBe(true)
  })

  it('the .jpg names who made it and says it is a screen capture', () => {
    for (const img of IMAGES) {
      const xmp = readXmp(readFileSync(pub(`${HOME_IMAGE_DIR}${img.file}.jpg`)))
      expect(xmp, img.file).toContain('IFC Viewer Online')
      expect(xmp, img.file).toContain('OpenStreetMap')
      expect(xmp, img.file).toContain('digitalsourcetype/screenCapture')
    }
  })

  it('file names say what the picture shows', () => {
    for (const img of IMAGES) expect(img.file).toMatch(/^[a-z0-9-]*ifc[a-z0-9-]*$/)
  })

  it('the scene behind the first picture opens models that ship with the site', () => {
    const models = new URLSearchParams(HERO_SCENE_QUERY).get('model')!.split(',')
    expect(models.length).toBe(3)
    for (const m of models) expect(existsSync(pub(m)), m).toBe(true)
  })

  it('the share image is one of the captures and exists', () => {
    const og = read('index.html').match(/property="og:image" content="https:\/\/www\.ifcvieweronline\.eu\/([^"]+)"/)![1]
    expect(og.startsWith(HOME_IMAGE_DIR)).toBe(true)
    expect(jpegSize(readFileSync(pub(og)))).toEqual({ width: 1200, height: 630 })
  })
})

describe('home page pictures: every language', () => {
  for (const l of HOME_LANGS) {
    it(`${l}: alt text, captions and the comparison are written`, () => {
      const c = SHOWCASE_COPY[l]
      for (const s of [c.heroAlt, c.heroCaption, c.heroCaptionPanel, c.heroOpen, c.label, c.title, c.sub, c.illustration]) expect(s.trim()).not.toBe('')
      expect(c.heroAlt).toMatch(/IFC/)
      for (const id of SHOT_ORDER) {
        const s = c.shots[id]
        for (const v of [s.title, s.body, s.alt, s.cta]) expect(v.trim(), id).not.toBe('')
        expect(s.alt, id).toMatch(/IFC/)
        // An alt describes the picture; it is not the heading over again.
        expect(s.alt, id).not.toBe(s.title)
      }
      // The numbers the validation capture shows are the numbers the text quotes.
      expect(c.shots.validation.body).toMatch(/77/)
      expect(c.shots.validation.body).toMatch(/610/)
      expect(c.shots.validation.body).toMatch(/423/)
      for (const r of COMPARE_ROWS) for (const k of ['label', 'us', 'solibri', 'flinker'] as const) expect(c.compare.rows[r][k].trim(), `${r}.${k}`).not.toBe('')
      // Competitors' prices as they publish them, and the day they were read.
      expect(c.compare.rows.price.solibri.replace(/[\s.,]/g, '')).toMatch(/99.*2772/)
      expect(c.compare.note).toContain('solibri.com/pricing')
      expect(c.compare.note).toContain('flinker.app')
      const [y, , d] = COMPARED_ON.split('-')
      expect(c.compare.note).toContain(y)
      expect(c.compare.note).toContain(String(Number(d)))
    })

    it(`${l}: the links beside the pictures lead to pages that exist`, () => {
      expect(existsSync(pub(path.join(examplesPath(l), 'index.html'))), examplesPath(l)).toBe(true)
      expect(existsSync(pub(path.join(validatorPath(l), 'index.html'))), validatorPath(l)).toBe(true)
      expect(existsSync(pub(path.join(solibriPath(l), 'index.html'))), solibriPath(l)).toBe(true)
    })
  }

  it('the georeferencing article the aerial picture links to is a published post', () => {
    expect(read('src/components/Landing.tsx')).toContain('ifc-coordinates-georeferencing/')
    expect(read('src/lib/blog-posts.ts')).toContain("slug: 'ifc-coordinates-georeferencing'")
    for (const l of HOME_LANGS.filter((x) => x !== 'en')) expect(read(`src/lib/blog-i18n/${l}.ts`), l).toContain('ifc-coordinates-georeferencing')
  })
})

describe('home page: where the pictures sit', () => {
  const src = read('src/components/Landing.tsx')

  it('opens with the capture of the viewer, inside the header', () => {
    const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'))
    expect(header).toContain('<HeroFigure')
    expect(header).not.toContain('<HeroPreview')
  })

  it('keeps the generated picture, lower down and labelled as an illustration', () => {
    const at = src.lastIndexOf('<HeroPreview')
    expect(at).toBeGreaterThan(src.indexOf('id="features"'))
    expect(src.slice(at, at + 600)).toContain('.illustration}')
    expect(src).toMatch(/alt="Illustration:/)
  })

  it('shows the captures and the comparison before the three paths', () => {
    const order = ['<ShowcaseSection', '<CompareSection', '<ProfilePaths'].map((t) => src.indexOf(t))
    expect(order.every((n) => n > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('only the first picture loads eagerly', () => {
    const comp = read('src/components/landing/HomeShowcase.tsx')
    expect(comp.match(/fetchpriority: 'high'/g)).toHaveLength(1)
    expect(comp.match(/loading="lazy"/g)).toHaveLength(1)
  })
})

describe('home page pictures: what a crawler is told', () => {
  it('lists the same four pictures, in page order, in every language', () => {
    for (const l of HOME_LANGS) {
      const pics = homePictures(l)
      expect(pics.map((p) => p.image)).toEqual(IMAGES)
      expect(pics[0].alt).toBe(SHOWCASE_COPY[l].heroAlt)
    }
  })

  it('adds preload, JSON-LD and noscript figures to the English home once', () => {
    const once = injectHomeImages(read('index.html'))
    expect(injectHomeImages(once)).toBe(once)
    for (const p of homePictures('en')) {
      expect(once).toContain(`<img src="${p.url}"`)
      expect(once).toContain(`"contentUrl":"${p.url}"`)
    }
    expect(once.match(/rel="preload" as="image"/g)).toHaveLength(2)
    expect(once).toContain('"acquireLicensePage"')
    // The untouched template stays free of them: other generators copy it.
    expect(read('index.html')).not.toContain('rel="preload" as="image"')
  })

  it('adds the pictures to each home entry of the sitemap, once', () => {
    const xml = read('public/sitemap.xml')
    const out = addHomeImagesToSitemap(xml, ['en', 'es'])
    expect(addHomeImagesToSitemap(out, ['en', 'es'])).toBe(out)
    expect(out.match(/<image:image>/g)!.length - (xml.match(/<image:image>/g) ?? []).length).toBe(8)
    const en = out.slice(out.indexOf('<loc>https://www.ifcvieweronline.eu/</loc>'))
    expect(en.slice(0, en.indexOf('</url>'))).toContain(`${HERO_IMAGE.file}.jpg`)
  })

  it('gives each language shell its pictures with alt text in that language', () => {
    const dist = mkdtempSync(path.join(tmpdir(), 'home-pictures-'))
    writeFileSync(path.join(dist, 'index.html'), read('index.html'))
    expect(generateLangShells(dist).errors).toBe(0)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    for (const l of ['de', 'fr', 'ja'] as const) {
      const html = readFileSync(path.join(dist, l, 'index.html'), 'utf8')
      expect(html, l).toContain(`alt="${esc(SHOWCASE_COPY[l].heroAlt)}"`)
      expect(html, l).toContain('"primaryImageOfPage"')
      expect(html.match(/rel="preload" as="image"/g), l).toHaveLength(2)
      expect(html, l).toContain(`property="og:image:alt" content="${esc(SHOWCASE_COPY[l].shots.skyline.alt)}"`)
      expect(html, l).toContain(HOME_COPY[l].kicker)
    }
  })
})
