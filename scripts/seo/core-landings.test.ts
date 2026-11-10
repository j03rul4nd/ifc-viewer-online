// Guards the six landing families written by generate-core-landings.ts
// (validator, cloud, on-premise, Solibri alternative, WebChecker alternative,
// Mac): the files in public/ are what the generator writes, every language of
// every family exists with its pictures, nothing is said about Solibri or
// Flinker without a dated source next to it, and the numbers quoted about our
// own validator are the ones in the code.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  COPY, imgUrl, linkTarget, page, pagePath, pageTitle, pageUrl, render, renderRaw, sitemapBlock, SITEMAP_START, updateSitemap,
} from './generate-core-landings'
import { COMPARED_ON, FAMILIES, FAMILY_SHOTS, IMAGE_DIR, KEPT_TITLES, LANGS, SHOTS, SLUGS, SOURCES } from './core-landings/pages'
import type { Family, Lang, PageCopy, Section } from './core-landings/types'
import { readXmp } from './image-metadata'
import { landingFiles, literalColours } from './landing-chrome'
import { DEFAULT_RULES, RULE_COUNT } from '../../src/types'
import { SOLIBRI_SLUG, VALIDATOR_SLUG } from '../../src/lib/localized-landings'

const PUBLIC = resolve(__dirname, '../../public')
const lf = (s: string) => s.replace(/\r\n/g, '\n')
const each = (fn: (f: Family, l: Lang) => void) => { for (const f of FAMILIES) for (const l of LANGS) fn(f, l) }
const VENDOR = /solibri|flinker/i
const text = (html: string) => html.replace(/<[^>]+>/g, ' ')

/** Every string of a page's copy, with where it sits. */
function strings(v: unknown, path = ''): [string, string][] {
  if (typeof v === 'string') return [[path, v]]
  if (Array.isArray(v)) return v.flatMap((x, i) => strings(x, `${path}[${i}]`))
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => strings(x, `${path}.${k}`))
  return []
}
/** The structure of a value with its strings blanked: equal shapes mean a complete translation. */
function shape(v: unknown): unknown {
  if (typeof v === 'string') return ''
  if (Array.isArray(v)) return v.map(shape)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'kind' || k === 'sources' ? x : shape(x)]))
  return v
}

describe('core landings: pages on disk', () => {
  it('are exactly what the generator writes', () => {
    each((f, l) => {
      const file = join(PUBLIC, SLUGS[f][l], 'index.html')
      expect(existsSync(file), file).toBe(true)
      expect(lf(readFileSync(file, 'utf8')), `${f}/${l}: run npx tsx scripts/seo/generate-core-landings.ts`).toBe(lf(render(f, l)))
    })
  })
  it('are picked up by landing-chrome, which leaves them unchanged', () => {
    const files = new Set(landingFiles().map((p) => p.split('\\').join('/')))
    each((f, l) => expect(files.has(join(PUBLIC, SLUGS[f][l], 'index.html').split('\\').join('/')), `${f}/${l}`).toBe(true))
  })
  it('keep the URLs the pages already had, and the app links to them', () => {
    expect(SLUGS.validator.en).toBe('ifc-validator')
    expect(SLUGS.solibri.en).toBe('solibri-alternative')
    expect(SLUGS.cloud.en).toBe('cloud-ifc-validator')
    expect(SLUGS.webchecker.en).toBe('solibri-webchecker-alternative')
    expect(SLUGS.onprem.en).toBe('on-premise-ifc-validator')
    expect(SLUGS.mac.en).toBe('ifc-viewer-mac')
    for (const l of LANGS) {
      if (l === 'en') continue
      expect(SLUGS.validator[l]).toBe(`${l}/${VALIDATOR_SLUG[l]}`)
      expect(SLUGS.solibri[l]).toBe(`${l}/${SOLIBRI_SLUG[l]}`)
      for (const f of FAMILIES) expect(SLUGS[f][l].startsWith(`${l}/`), `${f}/${l}`).toBe(true)
    }
    expect(new Set(FAMILIES.flatMap((f) => LANGS.map((l) => SLUGS[f][l]))).size).toBe(FAMILIES.length * LANGS.length)
  })
  it('keep the titles that were already in the index', () => {
    each((f, l) => { if (KEPT_TITLES[f][l]) expect(pageTitle(f, l)).toBe(KEPT_TITLES[f][l]) })
  })
})

describe('core landings: every language of every family', () => {
  it('is a full translation: same sections, rows, questions and sources as English', () => {
    each((f, l) => expect(shape(page(f, l)), `${f}/${l}`).toEqual(shape(page(f, 'en'))))
    for (const l of LANGS) expect(Object.keys(COPY[l].ui).sort(), l).toEqual(Object.keys(COPY.en.ui).sort())
  })
  it('is actually translated', () => {
    each((f, l) => {
      if (l === 'en') return
      const p = page(f, l), e = page(f, 'en')
      expect(p.lead, `${f}/${l} lead`).not.toBe(e.lead)
      expect(p.shots[0].alt, `${f}/${l} alt`).not.toBe(e.shots[0].alt)
      expect(p.shots[1].alt, `${f}/${l} alt`).not.toBe(e.shots[1].alt)
      expect(p.faq.map((x) => x[1]).join(), `${f}/${l} faq`).not.toBe(e.faq.map((x) => x[1]).join())
    })
  })
  it('fits the search listing (title ≤ 60, description ≤ 160) and has no empty string', () => {
    each((f, l) => {
      expect([...pageTitle(f, l)].length, `${f}/${l} title`).toBeLessThanOrEqual(60)
      expect([...page(f, l).desc].length, `${f}/${l} desc "${page(f, l).desc}"`).toBeLessThanOrEqual(160)
      for (const [where, s] of strings(page(f, l))) if (!where.endsWith('.cta2') && !where.endsWith('.head[0]')) expect(s.trim().length, `${f}/${l}${where}`).toBeGreaterThan(0)
    })
  })
  it('has one h1, a canonical and the full hreflang cluster of its family', () => {
    each((f, l) => {
      const html = render(f, l)
      expect(html.match(/<h1[\s>]/g)?.length, `${f}/${l}`).toBe(1)
      expect(html).toContain(`<html lang="${l}">`)
      expect(html).toContain(`<link rel="canonical" href="${pageUrl(f, l)}" />`)
      const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]])
      expect(alts).toEqual([...LANGS.map((x) => [x, pageUrl(f, x)]), ['x-default', pageUrl(f, 'en')]])
    })
  })
  it('links only to pages that exist', () => {
    each((f, l) => {
      const html = render(f, l)
      for (const m of html.matchAll(/href="(\/[^"#?]*)"/g)) {
        const href = m[1]
        if (/^\/(sign-up|privacy|terms)\/?$/.test(href) || href === '/' || /\.(css|ico|svg|png|js)$/.test(href)) continue
        // The blog and the fix guides are written at build time, not committed.
        if (/^\/([a-z]{2}\/)?(blog|fix)\//.test(href)) continue
        // The language homes are written by generate-lang-shells.ts at build time.
        if (/^\/[a-z]{2}\/$/.test(href)) continue
        const target = /\.[a-z0-9]+$/.test(href) ? join(PUBLIC, href) : join(PUBLIC, href, 'index.html')
        expect(existsSync(target), `${f}/${l} → ${href}`).toBe(true)
      }
    })
  })
  it('resolves every [text](key) link', () => {
    each((f, l) => {
      for (const [where, s] of strings(page(f, l))) {
        for (const m of s.matchAll(/\[[^\]]+\]\(([^)]*)\)/g)) expect(linkTarget(m[1], l), `${f}/${l}${where}: ${m[0]}`).toBeTruthy()
      }
    })
  })
  it('uses colour tokens only', () => {
    each((f, l) => expect(literalColours(render(f, l)), `${f}/${l}`).toEqual([]))
  })
})

describe('core landings: pictures', () => {
  it('ships each capture as an indexed .jpg with rights metadata and two .webp renditions', () => {
    for (const s of Object.values(SHOTS)) {
      const jpg = join(PUBLIC, IMAGE_DIR, `${s.file}.jpg`)
      expect(existsSync(jpg), jpg).toBe(true)
      for (const w of s.webp) expect(existsSync(join(PUBLIC, IMAGE_DIR, `${s.file}-${w}.webp`)), `${s.file}-${w}.webp`).toBe(true)
      expect(s.file).toMatch(/^[a-z0-9-]+$/)
      const xmp = readXmp(readFileSync(jpg))
      expect(xmp, `${s.file}.jpg has no XMP`).toBeTruthy()
      expect(xmp).toContain('IFC Viewer Online')
      expect(xmp).toContain('/terms/')
      expect(xmp).toContain('screenCapture')
    }
  })
  it('states both pictures on every page: img with size and translated alt, webp srcset, ImageObject, og:image', () => {
    each((f, l) => {
      const html = render(f, l), p = page(f, l)
      FAMILY_SHOTS[f].forEach((id, i) => {
        const s = SHOTS[id], alt = p.shots[i].alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        expect(html, `${f}/${l} img ${id}`).toContain(`<img src="/${IMAGE_DIR}${s.file}.jpg" width="${s.width}" height="${s.height}" alt="${alt}"`)
        expect(html).toContain(`/${IMAGE_DIR}${s.file}-${s.webp[1]}.webp ${s.webp[1]}w`)
        expect(p.shots[i].alt.length, `${f}/${l} alt`).toBeGreaterThan(30)
        expect(p.shots[i].cap.length, `${f}/${l} caption`).toBeGreaterThan(20)
      })
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1])
      const images = ld['@graph'].filter((n: { '@type': string }) => n['@type'] === 'ImageObject')
      expect(images.map((n: { contentUrl: string }) => n.contentUrl)).toEqual(FAMILY_SHOTS[f].map((id) => imgUrl(SHOTS[id])))
      expect(images[0].name).toBe(p.shots[0].alt)
      expect(images[0].license).toMatch(/\/terms\/$/)
      expect(html).toContain(`<meta property="og:image" content="${imgUrl(SHOTS[FAMILY_SHOTS[f][0]])}" />`)
    })
  })
  it('lists every page and its pictures once in the sitemap', () => {
    const xml = readFileSync(join(PUBLIC, 'sitemap.xml'), 'utf8')
    expect(lf(xml)).toContain(lf(`${SITEMAP_START}\n${sitemapBlock()}`))
    expect(lf(updateSitemap(xml))).toBe(lf(xml))
    each((f, l) => {
      expect(xml.split(`<loc>${pageUrl(f, l)}</loc>`).length - 1, `${f}/${l}`).toBe(1)
    })
    for (const f of FAMILIES) for (const id of FAMILY_SHOTS[f]) expect(xml).toContain(`<image:loc>${imgUrl(SHOTS[id])}</image:loc>`)
  })
})

describe('core landings: statements about Solibri and Flinker', () => {
  const vendorsOf = (s: string) => (['solibri', 'flinker'] as const).filter((v) => new RegExp(v, 'i').test(s))

  it('every section that names a competitor carries its sources and the date they were read', () => {
    each((f, l) => {
      const html = renderRaw(f, l)
      const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'))
      for (const sec of main.split(/(?=<section )/).filter((x) => x.startsWith('<section '))) {
        const body = text(sec.replace(/<p class="src"[\s\S]*?<\/p>/g, '').replace(/<ul class="related">[\s\S]*?<\/ul>/, ''))
        const named = vendorsOf(body)
        if (!named.length) continue
        // The closing call to action only repeats the page's own name.
        if (sec.startsWith('<section class="bottom"')) continue
        const note = /<p class="src" data-vendors="([^"]*)">([\s\S]*?)<\/p>/.exec(sec)
        expect(note, `${f}/${l}: a section names ${named.join(', ')} without a source note:\n${body.trim().slice(0, 160)}`).toBeTruthy()
        for (const v of named) {
          expect(note![1].split(' '), `${f}/${l}: no ${v} source`).toContain(v)
          expect(note![2]).toMatch(v === 'solibri' ? /href="https:\/\/www\.solibri\.com\// : /href="https:\/\/flinker\.app\//)
        }
        expect(note![2]).toContain(`<time datetime="${COMPARED_ON}">${COMPARED_ON}</time>`)
      }
    })
  })
  it('every answer that names a competitor cites the page and the date inside the answer (it travels alone in search results)', () => {
    each((f, l) => {
      for (const [q, a] of page(f, l).faq) {
        if (!/€|\d{2,}/.test(a) || !VENDOR.test(a)) continue
        expect(a, `${f}/${l}: "${q}"`).toMatch(/(solibri\.com|flinker\.app)\S*[^)]*\b2026-11-10\b/)
      }
    })
  })
  it('quotes the same vendor figures in every language', () => {
    // Prices, token counts and limits read on the vendors' pages: a translation may not change them.
    const figures = (p: PageCopy) => strings(p.sections.filter((s: Section) => 'sources' in s && s.sources?.length))
      .flatMap(([, s]) => s.match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => n.replace(/[.,\s]/g, '')).sort().join(' ')
    each((f, l) => expect(figures(page(f, l)), `${f}/${l}`).toBe(figures(page(f, 'en'))))
  })
  it('sources are the vendors\' own sites and a real date', () => {
    for (const s of Object.values(SOURCES)) expect(s.url).toMatch(s.vendor === 'solibri' ? /^https:\/\/www\.solibri\.com\// : /^https:\/\/flinker\.app\//)
    expect(COMPARED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('does not repeat the claims that were out of date', () => {
    each((f, l) => {
      const body = text(render(f, l))
      expect(body, `${f}/${l}`).not.toMatch(/contact sales|non-commercial|~500 MB|Solibri Model Checker/i)
    })
  })
})

describe('core landings: numbers about our own validator', () => {
  const on = Object.entries(DEFAULT_RULES).filter(([k, v]) => k.startsWith('RULE_') && v === true).length
  it('match the code: rule count and rules on by default', () => {
    expect(RULE_COUNT).toBe(44)
    expect(on).toBe(25)
    const p = page('validator', 'en')
    const scope = JSON.stringify(p.sections[0])
    expect(scope).toContain(`${RULE_COUNT} rules`)
    expect(scope).toContain(`${on} run by default`)
    expect(scope).toContain(`the other ${RULE_COUNT - on}`)
  })
  it('never promise what the app does not do', () => {
    each((f, l) => {
      const body = text(render(f, l))
      // No offline mode, a 2 GB limit, no PDF export of the validation.
      expect(body, `${f}/${l}`).not.toMatch(/works offline|no file[- ]size limit|unlimited file/i)
    })
    for (const f of FAMILIES) {
      const body = text(render(f, 'en'))
      if (f !== 'onprem') expect(body, f).toMatch(/2 GB/)
    }
  })
})

describe('core landings: paths', () => {
  it('pagePath is the slug between slashes', () => {
    expect(pagePath('mac', 'es')).toBe('/es/visor-ifc-mac/')
    expect(pagePath('validator', 'en')).toBe('/ifc-validator/')
  })
})
