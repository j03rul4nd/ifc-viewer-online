import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { coverSourceRect, wrapLines, fitText, compactNumber, projectNameFromFile } from './draw'
import { DEFAULT_DECK, normaliseDeck, planDeck, visibleSlides, type DeckOptions } from './deck'
import { buildImagePdf, pageSizePt } from './pdf'
import { buildImagePptx, slideSizeEmu } from './pptx'
import { COVER_FORMATS, COVER_FORMAT_IDS, isDeckFormat, orientationOf, platformOf } from './formats'
import { COVER_TEMPLATES, COVER_TEMPLATE_IDS, TEMPLATE_CATEGORIES } from './templates'
import { contrastRatio } from './color'
import { COVER_PALETTES, paletteById } from './palettes'

// Monospace fake: every character is half the font size wide.
function fakeCtx() {
  const ctx = {
    font: '10px x',
    measureText(t: string) {
      const size = Number(/(\d+)px/.exec(ctx.font)?.[1] ?? 10)
      return { width: t.length * size * 0.5 } as TextMetrics
    },
  }
  return ctx
}

describe('coverSourceRect', () => {
  it('crops the sides of a wide source into a tall frame', () => {
    const r = coverSourceRect(1600, 900, 1080, 1920)
    expect(r.h).toBe(900)
    expect(r.w).toBeCloseTo(900 * (1080 / 1920))
    expect(r.x).toBeCloseTo((1600 - r.w) / 2)
  })
  it('pans and zooms around the user focus', () => {
    const r = coverSourceRect(2000, 1000, 1000, 1000, 0.5, 1, 2)
    expect(r.w).toBe(500)
    expect(r.h).toBe(500)
    expect(r.x).toBe(1500)
    expect(r.y).toBe(250)
    // Zoom is clamped: never below "fits", never absurd.
    expect(coverSourceRect(2000, 1000, 1000, 1000, 0.5, 0.5, 0.2).w).toBe(1000)
  })
  it('biases the vertical crop by focusY', () => {
    const top = coverSourceRect(1000, 1000, 1000, 500, 0)
    const mid = coverSourceRect(1000, 1000, 1000, 500, 0.5)
    expect(top.y).toBe(0)
    expect(mid.y).toBe(250)
  })
  it('survives a zero-size source', () => {
    expect(coverSourceRect(0, 0, 100, 100)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})

describe('text fitting', () => {
  it('wraps at the width and keeps explicit newlines', () => {
    const ctx = fakeCtx()
    ctx.font = '10px x' // 5 px per char
    expect(wrapLines(ctx, 'aaaa bbbb cccc', 50)).toEqual(['aaaa bbbb', 'cccc'])
    expect(wrapLines(ctx, 'one\ntwo', 500)).toEqual(['one', 'two'])
  })
  it('picks the largest size that fits the box', () => {
    const ctx = fakeCtx()
    const r = fitText(ctx, 'Torre Poblenou', (s) => `${s}px x`, { w: 400, h: 300 }, { maxSize: 200, minSize: 10, maxLines: 2 })
    expect(r.lines.length).toBeLessThanOrEqual(2)
    expect(r.lines.every((l) => l.length * r.size * 0.5 <= 400)).toBe(true)
    expect(r.size).toBeGreaterThan(40)
  })
  it('falls back to the minimum size instead of overflowing forever', () => {
    const ctx = fakeCtx()
    const r = fitText(ctx, 'x'.repeat(500), (s) => `${s}px x`, { w: 50, h: 20 }, { maxSize: 100, minSize: 8, maxLines: 1 })
    expect(r.size).toBe(8)
    expect(r.lines.length).toBe(1)
  })
})

describe('helpers', () => {
  it('compacts numbers', () => {
    expect(compactNumber(840)).toBe('840')
    expect(compactNumber(1480)).toBe('1.5k')
    expect(compactNumber(12480)).toBe('12k')
    expect(compactNumber(2_400_000)).toBe('2.4M')
  })
  it('derives a project name from a file name', () => {
    expect(projectNameFromFile('TORRE_poblenou-v3.ifc')).toBe('TORRE poblenou v3')
  })
})

describe('formats, palettes and templates', () => {
  it('every format has an orientation that matches its pixels', () => {
    expect(orientationOf(COVER_FORMATS.slide.width, COVER_FORMATS.slide.height)).toBe('landscape')
    expect(orientationOf(COVER_FORMATS.story.width, COVER_FORMATS.story.height)).toBe('portrait')
    expect(orientationOf(COVER_FORMATS.square.width, COVER_FORMATS.square.height)).toBe('square')
    expect(COVER_FORMAT_IDS.length).toBe(Object.keys(COVER_FORMATS).length)
  })
  it('every template names a palette that exists', () => {
    for (const id of COVER_TEMPLATE_IDS) {
      expect(COVER_TEMPLATES[id].id).toBe(id)
      expect(COVER_PALETTES.some((p) => p.id === COVER_TEMPLATES[id].defaultPalette)).toBe(true)
    }
    expect(paletteById('nope').id).toBe(COVER_PALETTES[0].id)
  })
  it('lists every template exactly once, filed in a known category', () => {
    expect(new Set(COVER_TEMPLATE_IDS).size).toBe(COVER_TEMPLATE_IDS.length)
    expect([...COVER_TEMPLATE_IDS].sort()).toEqual(Object.keys(COVER_TEMPLATES).sort())
    for (const id of COVER_TEMPLATE_IDS) expect(TEMPLATE_CATEGORIES).toContain(COVER_TEMPLATES[id].category)
  })
  it('every palette keeps its text at 7:1 and its accent readable', () => {
    for (const p of COVER_PALETTES) {
      expect(contrastRatio(p.fg, p.bg), `${p.id} fg`).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(p.accent, p.bg), `${p.id} accent`).toBeGreaterThanOrEqual(3.5)
      expect(contrastRatio(p.onAccent, p.accent), `${p.id} onAccent`).toBeGreaterThanOrEqual(4.5)
    }
    expect(new Set(COVER_PALETTES.map((p) => p.id)).size).toBe(COVER_PALETTES.length)
  })
  it('sizes the Pinterest pin at 2:3 and files social formats apart from print', () => {
    expect(COVER_FORMATS.pinterest.width / COVER_FORMATS.pinterest.height).toBeCloseTo(2 / 3)
    expect(COVER_FORMATS.pinlong.height / COVER_FORMATS.pinlong.width).toBeCloseTo(2.1)
    expect(isDeckFormat('boardh')).toBe(true)
    expect(isDeckFormat('pinterest')).toBe(false)
    expect(platformOf('pinlong')).toBe('pinterest')
    expect(platformOf('story')).toBe('instagram')
    expect(platformOf('slide')).toBe('linkedin')
  })
})

describe('planDeck', () => {
  const deck = (o: Partial<DeckOptions>): DeckOptions => ({ ...DEFAULT_DECK, ...o })
  it('cover, one view per shot, data, closing', () => {
    const plan = planDeck(['a', 'b', 'c'], deck({ views: true, data: true, closing: true }))
    expect(plan.map((p) => p.kind)).toEqual(['cover', 'view', 'view', 'view', 'data', 'closing'])
    expect(plan[2].shots[0]).toBe(1)
  })
  it('a cover-only deck is one slide', () => {
    expect(planDeck(['a', 'b', 'c', 'd'], deck({ views: false, data: false, closing: false }))).toHaveLength(1)
  })
  it('puts the project sheet and the statement right after the cover', () => {
    const plan = planDeck(['a'], deck({ project: true, statement: true }))
    expect(plan.slice(0, 3).map((p) => p.kind)).toEqual(['cover', 'project', 'statement'])
  })
  it('groups views into grids and keeps a lone remainder a full view', () => {
    const plan = planDeck(['a', 'b', 'c', 'd', 'e'], deck({ perSlide: 2, data: false, closing: false }))
    expect(plan.map((p) => p.kind)).toEqual(['cover', 'grid', 'grid', 'view'])
    expect(plan[1].shots).toEqual([0, 1])
    expect(plan[3].key).toBe('view:e')
  })
  it('keys slides by shot id, so hiding one survives a reorder', () => {
    const hidden = new Set(['view:b', 'data', 'cover'])
    const before = visibleSlides(planDeck(['a', 'b', 'c'], deck({})), hidden)
    const after = visibleSlides(planDeck(['c', 'b', 'a'], deck({})), hidden)
    expect(before.map((s) => s.key)).not.toContain('view:b')
    expect(after.map((s) => s.key)).not.toContain('view:b')
    // The cover never hides, whatever the set says.
    expect(after[0].kind).toBe('cover')
    expect(after.some((s) => s.kind === 'data')).toBe(false)
  })
  it('normalises stored options', () => {
    expect(normaliseDeck({ perSlide: 7 as never, views: 'yes' as never })).toEqual(DEFAULT_DECK)
  })
})

describe('buildImagePdf', () => {
  it('writes a PDF whose xref offsets point at their objects', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])
    const pdf = buildImagePdf([{ jpeg, width: 1920, height: 1080 }, { jpeg, width: 1920, height: 1080 }], 'Tést (x)')
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect((text.match(/\/Type \/Page /g) ?? []).length).toBe(2)
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(startxref, startxref + 4)).toBe('xref')
    const entries = text.slice(startxref).split('\n').filter((l) => / 00000 n $/.test(l))
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10))
      expect(text.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })
  it('sizes pages to the image ratio with A4 as the long side', () => {
    expect(pageSizePt(1080, 1920)).toEqual({ w: 473.63, h: 842 })
  })
})

describe('buildImagePptx', () => {
  it('packages one picture slide per image with consistent relationships', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const zip = unzipSync(buildImagePptx([{ image: png, ext: 'png' }, { image: png, ext: 'png', alt: 'A & B' }], 1920, 1080, 'Deck'))
    for (const p of ['[Content_Types].xml', 'ppt/presentation.xml', 'ppt/slides/slide2.xml', 'ppt/media/image2.png', 'ppt/theme/theme1.xml']) {
      expect(zip[p], p).toBeDefined()
    }
    const pres = strFromU8(zip['ppt/presentation.xml'])
    expect(pres).toContain(`cx="12192000" cy="${slideSizeEmu(1920, 1080).cy}"`)
    expect(strFromU8(zip['ppt/slides/slide2.xml'])).toContain('descr="A &amp; B"')
    expect(strFromU8(zip['[Content_Types].xml'])).toContain('/ppt/slides/slide2.xml')
  })
})
