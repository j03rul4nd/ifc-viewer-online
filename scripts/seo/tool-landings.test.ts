// Guards the copy behind scripts/seo/generate-tool-landings.mjs: every topic in
// every language, listings that fit what Google shows, and image names and
// alt text that can rank in Google Images.
import { describe, it, expect } from 'vitest'
import * as A from './tool-landings/content-a.mjs'
import * as B from './tool-landings/content-b.mjs'

const LANGS = ['en', 'es', 'de', 'fr', 'pt', 'it', 'ca', 'zh', 'ja', 'th']
const CONCEPTS = ['editor', 'classification', 'health'] as const
type Page = { slug: string; title: string; desc: string; shots: { file: string; alt: string; cap: string }[]; faq: string[][]; features: string[][] }
const page = (c: string, l: string): Page => (A.PAGES as any)[c]?.[l] ?? (B.PAGES as any)[c]?.[l]

describe('tool landings', () => {
  it('cover every topic in every language', () => {
    for (const c of CONCEPTS) for (const l of LANGS) expect(page(c, l), `${c}/${l}`).toBeTruthy()
    for (const l of LANGS) expect({ ...A.UI, ...B.UI }[l as 'en'], l).toBeTruthy()
  })
  it('fit the search listing (title ≤ 60, description ≤ 160)', () => {
    for (const c of CONCEPTS) for (const l of LANGS) {
      const p = page(c, l)
      expect([...p.title].length, `${c}/${l} title`).toBeLessThanOrEqual(60)
      expect([...p.desc].length, `${c}/${l} desc`).toBeLessThanOrEqual(160)
    }
  })
  it('have unique slugs and image files, localised slugs outside English', () => {
    const slugs = new Set<string>(), files = new Set<string>()
    for (const c of CONCEPTS) for (const l of LANGS) {
      const p = page(c, l)
      expect(slugs.has(p.slug), p.slug).toBe(false); slugs.add(p.slug)
      if (l !== 'en') expect(p.slug.startsWith(`${l}/`), p.slug).toBe(true)
      for (const s of p.shots) {
        expect(files.has(s.file), s.file).toBe(false); files.add(s.file)
        expect(s.file).toMatch(/^[a-z0-9-]+$/)
        expect(s.alt.length, `${s.file} alt`).toBeGreaterThan(15)
        expect(s.cap.length).toBeGreaterThan(10)
      }
    }
  })
  it('carry real content: six features and five questions each', () => {
    for (const c of CONCEPTS) for (const l of LANGS) {
      expect(page(c, l).features, `${c}/${l}`).toHaveLength(6)
      expect(page(c, l).faq, `${c}/${l}`).toHaveLength(5)
    }
  })
})

describe('TOOL_LANDINGS (app links) match the generated pages', () => {
  it('same path and label as the generator copy', async () => {
    const { TOOL_LANDINGS } = await import('../../src/lib/localized-landings')
    for (const c of CONCEPTS) for (const l of LANGS) {
      const link = (TOOL_LANDINGS as any)[l][c]
      expect(link.path, `${c}/${l}`).toBe(`${page(c, l).slug}/`)
      expect(link.label, `${c}/${l}`).toBe((page(c, l) as any).h1)
    }
  })
})
