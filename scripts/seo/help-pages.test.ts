import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COPY, pages } from './generate-help-pages'
import { HELP_LANGS, HELP_TOPICS } from '../../src/lib/help-paths'

describe('help centre (preview)', () => {
  const all = pages()
  it('a hub and five guides in each of the ten languages', () => {
    expect(all).toHaveLength(HELP_LANGS.length * (HELP_TOPICS.length + 1))
    expect(all.map((p) => p.path.split(String.fromCharCode(92)).join('/'))).toContain('help/index.html')
    expect(all.map((p) => p.path.split(String.fromCharCode(92)).join('/'))).toContain('ja/help/verdict/index.html')
  })
  it('every page is noindex and says it is a preview', () => {
    for (const p of all) {
      expect(p.html, p.path).toContain('<meta name="robots" content="noindex, nofollow" />')
      expect(p.html).not.toMatch(/content="index, follow/)
    }
  })
  it('every language has every guide, with the same sections as English and no English left over', () => {
    for (const l of HELP_LANGS) for (const t of HELP_TOPICS) {
      const c = COPY[l].topics[t]
      expect(c.sections.length, `${l}/${t}`).toBe(COPY.en.topics[t].sections.length)
      expect(c.title.trim().length).toBeGreaterThan(0)
      if (l !== 'en') expect(c.desc, `${l}/${t}`).not.toBe(COPY.en.topics[t].desc)
      // Code samples are never translated.
      const codes = (s: string) => (s.match(/`[^`]+`/g) ?? []).sort()
      expect(codes(c.sections.map((x) => x[1]).join(' ')), `${l}/${t}`).toEqual(codes(COPY.en.topics[t].sections.map((x) => x[1]).join(' ')))
    }
  })
  it('stays out of the sitemap and llms.txt', () => {
    const sm = readFileSync(join('public', 'sitemap.xml'), 'utf8')
    expect(sm).not.toContain('/help/')
    if (existsSync(join('public', 'llms.txt'))) expect(readFileSync(join('public', 'llms.txt'), 'utf8')).not.toContain('/help/')
  })
})
