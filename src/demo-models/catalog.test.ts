// ─── demo catalogue ───────────────────────────────────────────────────────────
// The failure these guard against is quiet: a new demo with no capture falls back
// to a line drawing, and one with no title shows a raw key to every visitor.

import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEMO_DOMAINS, DEMO_GOALS, demoCatalog, foldText, formatDemoBytes, matchesQuery, recommendedDemos } from './catalog'

const all = demoCatalog({ maps: true, clouds: true, twins: true, base: '/' })
const LOCALES = ['en', 'es', 'ca', 'de', 'fr', 'it', 'pt', 'zh', 'ja', 'th']
const gallery = (lang: string) => JSON.parse(readFileSync(`src/locales/${lang}/landing.json`, 'utf8')).demoGallery

describe('demoCatalog', () => {
  it('has unique ids', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
  })

  it('gives every card a capture served from this origin', () => {
    for (const e of all) {
      expect(e.image.startsWith('/demo-thumbs/'), e.id).toBe(true)
      expect(existsSync(`public${e.image}`), e.image).toBe(true)
    }
  })

  it('leaves out what the build cannot open', () => {
    const bare = demoCatalog({ maps: false, clouds: false, twins: false, base: '/' })
    expect(bare.some((e) => e.kind !== 'set' || e.set.twin)).toBe(false)
    expect(recommendedDemos(bare).map((e) => e.id)).not.toContain('scene-barcelona-placa-catalunya')
    expect(recommendedDemos(bare)).toHaveLength(3)
  })

  it('recommends three light demos, so a first click is not a long wait', () => {
    const picks = recommendedDemos(all)
    expect(picks).toHaveLength(3)
    for (const e of picks) expect(e.sizeBytes ?? 0).toBeLessThan(5 * 1_048_576)
  })

  it('opens each scan with its own model, since a linked scan waits for one', () => {
    const scans = all.filter((e) => e.kind === 'cloud')
    expect(scans.map((e) => e.id).sort()).toEqual(['cloud-cras-feup-labs', 'cloud-poblenou-site-scan'])
    for (const e of scans) expect(e.kind === 'cloud' && /^\/\?model=.+&scan=/.test(e.href)).toBe(true)
  })
})

describe('demo gallery translations', () => {
  it.each(LOCALES)('%s has a title for every card and a label for every filter', (lang) => {
    const g = gallery(lang)
    for (const e of all) expect(g.items[e.id], e.id).toBeTruthy()
    for (const e of recommendedDemos(all)) expect(g.hints[e.id], e.id).toBeTruthy()
    for (const d of DEMO_DOMAINS) expect(g.domains[d], d).toBeTruthy()
    for (const goal of DEMO_GOALS) expect(g.goals[goal], goal).toBeTruthy()
  })

  it('carries the same keys in all ten', () => {
    const shape = (o: Record<string, unknown>): string[] => Object.entries(o)
      .flatMap(([k, v]) => (v && typeof v === 'object' ? shape(v as Record<string, unknown>).map((s) => `${k}.${s}`) : [k])).sort()
    const en = shape(gallery('en'))
    for (const lang of LOCALES) expect(shape(gallery(lang)), lang).toEqual(en)
  })

  it('keeps product jargon out of the titles and filters', () => {
    const banned = /digital twin|gemelo|lidar|\bmep\b|\bifc\b/i
    const g = gallery('en')
    for (const text of [...Object.values(g.items), ...Object.values(g.domains), ...Object.values(g.goals)]) {
      expect(text as string).not.toMatch(banned)
    }
  })
})

describe('search', () => {
  it('ignores accents and case', () => {
    expect(foldText('Dúplex')).toBe('duplex')
    expect(matchesQuery('Dúplex de dos plantas', 'DUPLEX')).toBe(true)
  })

  it('needs every word, in any order', () => {
    expect(matchesQuery('Torre de 16 plantas en Barcelona', 'barcelona torre')).toBe(true)
    expect(matchesQuery('Torre de 16 plantas', 'barcelona torre')).toBe(false)
  })

  it('treats an empty query as a match', () => {
    expect(matchesQuery('anything', '   ')).toBe(true)
  })
})

describe('formatDemoBytes', () => {
  it('uses KB below a megabyte and never rounds to zero', () => {
    expect(formatDemoBytes(9_696)).toBe('9 KB')
    expect(formatDemoBytes(100)).toBe('1 KB')
    expect(formatDemoBytes(2_380_763)).toBe('2.3 MB')
  })
})
