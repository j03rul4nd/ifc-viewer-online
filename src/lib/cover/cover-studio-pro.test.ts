import { describe, it, expect } from 'vitest'
import { GRADE_PRESETS, GRADE_PRESET_IDS, NEUTRAL_GRADE, gradePixels, hasTone, normaliseGrade, presetOf, toneCurve, toneKey } from './grade'
import { contrastRatio, derivePalette, ensureContrast, extractSwatches, hexToRgb, mix, paletteFromSwatches, relativeLuminance, rgbToHex } from './color'
import { AUTO_FACT_IDS, DEFAULT_AUTO_FACTS, autoFacts, customFacts, mergeFacts, type AutoFactId } from './facts'
import { buildCaption, hashtags, toTag, type CaptionInput } from './caption'
import { qrMatrix } from './qr'
import { RECIPES, RECIPE_IDS, missingSteps } from './recipes'
import { LIGHTS, LIGHT_IDS, resolveLight } from './lighting'
import { DEFAULT_DESIGN, activeDesign, normaliseDesign, withDesign } from './design'
import { COVER_TEMPLATES } from './templates'
import { COVER_FORMATS } from './formats'
import { LOOKS } from './looks'
import type { CoverStats } from './types'

function solid(w: number, h: number, rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255 }
  return { data, width: w, height: h }
}

describe('photo finish', () => {
  it('the neutral grade leaves pixels untouched', () => {
    const im = solid(4, 4, [120, 80, 40])
    gradePixels(im, NEUTRAL_GRADE)
    expect([...im.data.slice(0, 3)]).toEqual([120, 80, 40])
    expect(hasTone(NEUTRAL_GRADE)).toBe(false)
  })
  it('tone curves are monotonic, so no setting inverts a gradient', () => {
    for (const id of GRADE_PRESET_IDS) {
      for (const c of [0, 1, 2] as const) {
        const lut = toneCurve(GRADE_PRESETS[id], c)
        for (let v = 1; v < 256; v++) expect(lut[v], `${id}/${c}@${v}`).toBeGreaterThanOrEqual(lut[v - 1])
      }
    }
  })
  it('warmth pushes red up and blue down', () => {
    const im = solid(1, 1, [128, 128, 128])
    gradePixels(im, { ...NEUTRAL_GRADE, warmth: 1 })
    expect(im.data[0]).toBeGreaterThan(128)
    expect(im.data[2]).toBeLessThan(128)
  })
  it('fade lifts pure black off the floor (matte print)', () => {
    const im = solid(1, 1, [0, 0, 0])
    gradePixels(im, { ...NEUTRAL_GRADE, fade: 1 })
    expect(im.data[0]).toBeGreaterThan(30)
  })
  it('black & white removes the colour', () => {
    const im = solid(1, 1, [200, 40, 40])
    gradePixels(im, GRADE_PRESETS.bw)
    expect(Math.abs(im.data[0] - im.data[1])).toBeLessThanOrEqual(1)
    expect(Math.abs(im.data[1] - im.data[2])).toBeLessThanOrEqual(1)
  })
  it('recognises presets and keys only what changes pixels', () => {
    expect(presetOf(GRADE_PRESETS.film)).toBe('film')
    expect(presetOf({ ...GRADE_PRESETS.film, grain: 0.9 })).toBeNull()
    expect(toneKey({ ...GRADE_PRESETS.film, grain: 0.9 })).toBe(toneKey(GRADE_PRESETS.film))
  })
  it('normalises stored settings', () => {
    expect(normaliseGrade({ exposure: 9, fade: -1, grain: Number.NaN } as never)).toEqual({ ...NEUTRAL_GRADE, exposure: 1 })
  })
})

describe('colour', () => {
  it('round-trips hex and knows the WCAG extremes', () => {
    expect(rgbToHex(hexToRgb('#1c1b18'))).toBe('#1C1B18')
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1)
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080')
  })
  it('ensureContrast darkens an accent on paper until it reads, keeping its hue', () => {
    const c = ensureContrast('#F2C14E', '#FFFFFF', 3)
    expect(contrastRatio(c, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    const [r, g, b] = hexToRgb(c)
    expect(r).toBeGreaterThan(b)
    expect(g).toBeGreaterThan(b)
  })
  it('a custom palette always has legible text, whatever was picked', () => {
    const p = derivePalette({ bg: '#F4E9DD', fg: '#E0D5C8', accent: '#C9A227' })
    expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(p.onAccent, p.accent)).toBeGreaterThanOrEqual(3)
    expect(derivePalette({ bg: 'nope', fg: '', accent: '#zzz' }).bg).toBe('#F1ECE3')
  })
  it('extracts the distinct colours of a picture, not five shades of its backdrop', () => {
    // 80 % backdrop grey, 15 % terracotta, 5 % sage — a render.
    const w = 100, h = 100
    const data = new Uint8ClampedArray(w * h * 4)
    for (let p = 0; p < w * h; p++) {
      const c = p < 8000 ? [236 + (p % 5), 234, 230] : p < 9500 ? [181, 83, 44] : [120, 150, 110]
      data.set([...c, 255], p * 4)
    }
    const sw = extractSwatches({ data, width: w, height: h }, 3)
    expect(sw).toHaveLength(3)
    const near = (hex: string, rgb: number[]) => hexToRgb(hex).every((v, i) => Math.abs(v - rgb[i]) < 20)
    expect(sw.some((c) => near(c, [181, 83, 44]))).toBe(true)
    expect(sw.some((c) => near(c, [120, 150, 110]))).toBe(true)
    // Sorted light to dark.
    expect(relativeLuminance(sw[0])).toBeGreaterThanOrEqual(relativeLuminance(sw[2]))
  })
  it('turns the samples into a legible palette, light or dark', () => {
    const sw = ['#EDE7DD', '#C9B79C', '#B5532C', '#4A5A48', '#1E1C19']
    const light = paletteFromSwatches(sw)
    const dark = paletteFromSwatches(sw, true)
    expect(relativeLuminance(light.bg)).toBeGreaterThan(0.6)
    expect(relativeLuminance(dark.bg)).toBeLessThan(0.05)
    for (const p of [light, dark]) {
      expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(7)
      expect(contrastRatio(p.accent, p.bg)).toBeGreaterThanOrEqual(3)
    }
    // The accent comes from the colourful sample.
    expect(hexToRgb(light.accent)[0]).toBeGreaterThan(hexToRgb(light.accent)[2])
  })
})

const STATS: CoverStats = { elements: 1874, categories: 14, models: 2, score: 92, topCategories: [] }
const LABELS = { storeys: 'Storeys', height: 'Height', size: 'Footprint', elements: 'Elements', score: 'Health Score' } satisfies Record<AutoFactId, string>
const BOX = { min: { x: 0, y: 0, z: 0 }, max: { x: 42.4, y: 32.35, z: 18.2 } }

describe('facts', () => {
  it('measures the model and prints nothing it cannot measure', () => {
    const f = autoFacts({ storeys: 8, box: BOX }, STATS, { ...DEFAULT_AUTO_FACTS, size: true }, LABELS, 'en-US', true)
    expect(f).toEqual([
      { label: 'Storeys', value: '8' },
      { label: 'Height', value: '32 m' },
      { label: 'Footprint', value: '42 × 18 m' },
      { label: 'Elements', value: '1,874' },
      { label: 'Health Score', value: '92/100' },
    ])
    const none = autoFacts({ storeys: null, box: null }, { ...STATS, elements: 0, score: null }, DEFAULT_AUTO_FACTS, LABELS, 'en-US', true)
    expect(none).toEqual([])
  })
  it('hides the score when the user does, and drops sub-metre "buildings"', () => {
    const f = autoFacts({ storeys: 1, box: { min: BOX.min, max: { x: 0.3, y: 0.4, z: 0.2 } } }, STATS, { ...DEFAULT_AUTO_FACTS, size: true }, LABELS, 'en-US', false)
    expect(f.map((x) => x.label)).toEqual(['Storeys', 'Elements'])
  })
  it('localises numbers', () => {
    const f = autoFacts({ storeys: null, box: { min: BOX.min, max: { ...BOX.max, y: 12.34 } } }, STATS, { ...DEFAULT_AUTO_FACTS, elements: false, score: false }, LABELS, 'es-ES', true)
    expect(f[0].value).toBe('12,3 m')
  })
  it('keeps the user lines first, drops half-empty rows and duplicates', () => {
    const custom = customFacts([{ label: ' Built area ', value: '12,400 m²' }, { label: 'Status', value: '' }, { label: 'Height', value: '33 m' }])
    expect(custom).toHaveLength(2)
    const merged = mergeFacts(custom, [{ label: 'height', value: '32 m' }, { label: 'Storeys', value: '8' }])
    expect(merged.map((f) => `${f.label}=${f.value}`)).toEqual(['Built area=12,400 m²', 'Height=33 m', 'Storeys=8'])
    expect(AUTO_FACT_IDS).toHaveLength(Object.keys(DEFAULT_AUTO_FACTS).length)
  })
})

const INPUT: CaptionInput = {
  title: 'Torre Poblenou', subtitle: 'Mixed-use tower', location: 'Poblenou, Barcelona', studio: 'Estudi Nord',
  client: 'Ajuntament', concept: 'A tower that steps back to give the street its sky.', tagline: '', website: 'https://estudinord.cat',
  facts: [{ label: 'Storeys', value: '8' }, { label: 'Height', value: '32 m' }],
}
const S = { by: (s: string) => `By ${s}`, for: (c: string) => `For ${c}` }

describe('caption', () => {
  it('tags are ASCII, deduplicated and capped per platform', () => {
    expect(toTag('Sant Martí de Provençals')).toBe('santmartideprovencals')
    const li = hashtags(INPUT, 'linkedin')
    expect(li.length).toBeLessThanOrEqual(5)
    const ig = hashtags(INPUT, 'instagram')
    expect(ig).toContain('#barcelona')
    expect(new Set(ig).size).toBe(ig.length)
    expect(ig.every((t) => /^#[a-z0-9]+$/.test(t))).toBe(true)
  })
  it('writes the post from the cover fields, never inventing any', () => {
    const c = buildCaption(INPUT, 'linkedin', S)
    expect(c.startsWith('Torre Poblenou — Poblenou, Barcelona')).toBe(true)
    expect(c).toContain('▪ Storeys: 8')
    expect(c).toContain('By Estudi Nord · For Ajuntament')
    expect(c).toContain('https://estudinord.cat')
    const bare = buildCaption({ ...INPUT, studio: '', client: '', concept: '', facts: [], website: '', subtitle: '', location: '' }, 'linkedin', S)
    expect(bare.split('\n')[0]).toBe('Torre Poblenou')
  })
  it('keeps a Pinterest description within its 500 characters', () => {
    const long = buildCaption({ ...INPUT, concept: 'word '.repeat(300) }, 'pinterest', S)
    expect(long.length).toBeLessThanOrEqual(500)
  })
})

describe('qr', () => {
  it('encodes a URL into a square module matrix', () => {
    const m = qrMatrix('https://ifcvieweronline.eu')
    expect(m).not.toBeNull()
    expect(m!.length).toBeGreaterThanOrEqual(21)
    expect(m!.every((row) => row.length === m!.length)).toBe(true)
    // Finder pattern: the top-left corner module is dark.
    expect(m![0][0]).toBe(true)
    expect(qrMatrix('   ')).toBeNull()
  })
})

describe('recipes and light', () => {
  it('every recipe points at a real template, format, look and light', () => {
    for (const id of RECIPE_IDS) {
      const r = RECIPES[id]
      expect(r.id).toBe(id)
      expect(COVER_TEMPLATES[r.template], id).toBeDefined()
      expect(COVER_FORMATS[r.format], id).toBeDefined()
      if (r.light) expect(LIGHTS[r.light]).toBeDefined()
      for (const s of r.steps) if (s.kind !== 'plans') expect(LOOKS[s.look], `${id} look`).toBeDefined()
      expect(r.steps.length).toBeGreaterThan(0)
    }
  })
  it('only runs the captures a layout is missing', () => {
    expect(missingSteps(RECIPES.board, 1, 4)).toHaveLength(3)
    expect(missingSteps(RECIPES.board, 6, 4)).toHaveLength(0)
  })
  it('turns the sun without touching the rest of the light', () => {
    expect(resolveLight('studio', 90)).toBeNull()
    const g = resolveLight('golden', -30)!
    expect(g.azimuth).toBe(330)
    expect(g.keyIntensity).toBe(LIGHTS.golden.light!.keyIntensity)
    for (const id of LIGHT_IDS) expect(LIGHTS[id].id).toBe(id)
  })
})

describe('design layer', () => {
  it('is only active inside a render, and always restored', () => {
    const d = normaliseDesign({ type: 'technical', titleCase: 'upper' })
    expect(activeDesign()).toBe(DEFAULT_DESIGN)
    expect(() => withDesign(d, () => { expect(activeDesign().type).toBe('technical'); throw new Error('x') })).toThrow('x')
    expect(activeDesign()).toBe(DEFAULT_DESIGN)
  })
  it('normalises stored designs', () => {
    const d = normaliseDesign({ type: 'comic' as never, titleScale: 9, texture: 'marble' as never, showScore: undefined })
    expect(d.type).toBe('template')
    expect(d.titleScale).toBe(1.4)
    expect(d.texture).toBe('none')
    expect(d.showScore).toBe(true)
    expect(d.showQr).toBe(false)
  })
})
