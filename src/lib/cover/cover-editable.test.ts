import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { applyFilter, luminance, sobel } from './filters'
import { LOOKS, LOOK_IDS, resolveInkPaper, resolveSceneLook } from './looks'
import { groupRuns, parseColor, parseFont, recordText, type TextRun } from './text-layer'
import { buildImagePptx, fitBlocksToFaces, textShapesXml } from './pptx'
import { FONT_MONO, FONT_SANS, FONT_SERIF } from './draw'
import { coverStats, isPhysicalCategory } from './stats'

function img(w: number, h: number, px: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const v = px(x, y)
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
  }
  return { data, width: w, height: h }
}

describe('filters', () => {
  it('sobel finds a vertical edge and nothing in flat areas', () => {
    const im = img(8, 8, (x) => (x < 4 ? 0 : 255))
    const e = sobel(luminance(im), 8, 8)
    expect(e[3 * 8 + 3]).toBeCloseTo(1)
    expect(e[3 * 8 + 1]).toBe(0)
  })
  it('line drawing puts ink on edges and paper elsewhere', () => {
    const im = img(8, 8, (x) => (x < 4 ? 200 : 255))
    applyFilter(im, 'lines', { ink: '#000000', paper: '#ffffff', tint: 0 })
    expect(im.data[(3 * 8 + 3) * 4]).toBe(0)
    expect(im.data[(3 * 8 + 1) * 4]).toBe(255)
  })
  it('duotone maps black to ink and white to paper', () => {
    const im = img(2, 1, (x) => (x === 0 ? 0 : 255))
    applyFilter(im, 'duotone', { ink: '#102030', paper: '#F0E0D0' })
    expect([...im.data.slice(0, 3)]).toEqual([0x10, 0x20, 0x30])
    expect([...im.data.slice(4, 7)]).toEqual([0xf0, 0xe0, 0xd0])
  })
  it('grain is deterministic', () => {
    const a = img(16, 16, () => 128)
    const b = img(16, 16, () => 128)
    applyFilter(a, 'mono', { ink: '#000', paper: '#fff', grain: 1 })
    applyFilter(b, 'mono', { ink: '#000', paper: '#fff', grain: 1 })
    expect([...a.data]).toEqual([...b.data])
  })
})

describe('looks', () => {
  it('every look id has a definition', () => {
    for (const id of LOOK_IDS) expect(LOOKS[id].id).toBe(id)
  })
  it('resolves palette colours and softens x-ray without a focus', () => {
    const pal = { fg: '#111111', bg: '#EEEEEE', accent: '#FF5500' }
    expect(resolveSceneLook(LOOKS.spotlight, pal, true).focusColor).toBe('#FF5500')
    const x = resolveSceneLook(LOOKS.xray, pal, false)
    expect(x.baseOpacity).toBeGreaterThan(LOOKS.xray.scene.baseOpacity)
    expect(x.focusColor).toBeNull()
  })
})

describe('text layer', () => {
  it('parses the fonts the templates use', () => {
    expect(parseFont(`600 96px ${FONT_SANS}`)).toEqual({ size: 96, family: 'sans', weight: 600, italic: false })
    expect(parseFont(`italic 400 40px ${FONT_SERIF}`)).toMatchObject({ family: 'serif', italic: true })
    expect(parseFont(`500 20px ${FONT_MONO}`).family).toBe('mono')
  })
  it('parses hex and rgba colours', () => {
    expect(parseColor('#abc')).toEqual({ color: '#AABBCC', alpha: 1 })
    expect(parseColor('rgba(246,244,239,0.6)')).toEqual({ color: '#F6F4EF', alpha: 0.6 })
  })
  it('records fillText instead of drawing it, then restores the context', () => {
    let drawn = 0
    const ctx = {
      font: `600 50px ${FONT_SANS}`, fillStyle: '#ffffff', textAlign: 'left', globalAlpha: 1, letterSpacing: '2px',
      fillText: () => { drawn++ },
      measureText: (t: string) => ({ width: t.length * 25 }),
      getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    } as unknown as CanvasRenderingContext2D
    const runs = recordText(ctx, () => { ctx.fillText('Hello', 10, 60); ctx.fillText('  ', 0, 0) })
    expect(drawn).toBe(0)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ text: 'Hello', x: 10, y: 60, width: 125, size: 50, tracking: 2 })
    ctx.fillText('x', 0, 0)
    expect(drawn).toBe(1)
  })
  it('merges evenly spaced lines of one paragraph, not neighbours', () => {
    const base: Omit<TextRun, 'text' | 'y'> = { x: 10, width: 100, size: 40, family: 'serif', weight: 400, italic: false, color: '#000000', alpha: 1, align: 'left', tracking: 0 }
    const blocks = groupRuns([
      { ...base, text: 'Torre', y: 100 },
      { ...base, text: 'Poblenou', y: 138 },
      { ...base, text: 'Badalona', y: 176 },
      { ...base, text: 'Label', y: 300, size: 12, family: 'mono' },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].lines).toEqual(['Torre', 'Poblenou', 'Badalona'])
    expect(blocks[0].lineHeight).toBe(38)
  })
})

describe('editable pptx', () => {
  const block = {
    lines: ['Torre', 'Poblenou & co'], x: 960, y: 500, width: 400, size: 96, lineHeight: 90,
    family: 'sans' as const, weight: 600, italic: false, color: '#F6F4EF', alpha: 0.6, align: 'center' as const, tracking: -3,
  }
  it('writes a text box per block with size, colour, alpha and alignment', () => {
    const xml = textShapesXml([block], 1920, 12192000)
    expect(xml).toContain('txBox="1"')
    expect(xml).toContain('algn="ctr"')
    // 12 192 000 EMU = 960 pt across 1920 px → 0.5 pt/px → 96 px = 48 pt.
    expect(xml).toContain('sz="4800"')
    expect(xml).toContain('<a:srgbClr val="F6F4EF"><a:alpha val="60000"/>')
    expect(xml).toContain('Poblenou &amp; co')
    expect((xml.match(/<a:p>/g) ?? []).length).toBe(2)
  })
  it('puts the text shapes on the slide after the picture', () => {
    const zip = unzipSync(buildImagePptx([{ image: new Uint8Array([1]), ext: 'png', texts: [block] }], 1920, 1080, 'Deck', 'es-ES'))
    const slide = strFromU8(zip['ppt/slides/slide1.xml'])
    expect(slide.indexOf('<p:pic>')).toBeLessThan(slide.indexOf('txBox="1"'))
    expect(slide).toContain('lang="es-ES"')
  })
})

describe('cover stats', () => {
  it('counts built elements only, not property sets or openings', () => {
    expect(isPhysicalCategory('IFCWALLSTANDARDCASE')).toBe(true)
    expect(isPhysicalCategory('IFCFLOWSEGMENT')).toBe(true)
    expect(isPhysicalCategory('IFCPROPERTYSINGLEVALUE')).toBe(false)
    expect(isPhysicalCategory('IFCOPENINGELEMENT')).toBe(false)
    const s = coverStats([{ categories: [
      { id: 'IFCWALL', label: 'Walls', count: 40 },
      { id: 'IFCPROPERTYSET', label: 'Propertyset', count: 900 },
      { id: 'IFCOPENINGELEMENT', label: 'Openings', count: 12 },
      { id: 'IFCSLAB', label: 'Slabs', count: 10 },
    ] }], 87.4)
    expect(s).toMatchObject({ elements: 50, categories: 2, score: 87 })
    expect(s.topCategories[0]).toEqual({ label: 'Walls', count: 40 })
  })
})

describe('duotone ink order', () => {
  it('keeps ink the darker colour on a dark palette', () => {
    const dark = { fg: '#F2EFE8', bg: '#0E0E0C', accent: '#D4FF3A' }
    expect(resolveInkPaper(LOOKS.duotone, dark)).toEqual({ ink: '#0E0E0C', paper: '#F2EFE8' })
  })
})

describe('fitBlocksToFaces', () => {
  it('shrinks a block whose substitute face runs wider, and leaves fitting ones alone', () => {
    const base = { x: 0, y: 0, lineHeight: 50, weight: 400, italic: false, color: '#000000', alpha: 1, align: 'left' as const, tracking: 0 }
    const wide = { ...base, lines: ['Torre'], width: 100, size: 40, family: 'serif' as const }
    const fits = { ...base, lines: ['Ok'], width: 100, size: 40, family: 'sans' as const }
    const [a, b] = fitBlocksToFaces([wide, fits], (_t, face) => (face === 'Georgia' ? 130 : 90))
    expect(a.size).toBeCloseTo(40 * (100 / 130))
    expect(b).toBe(fits)
  })
})
