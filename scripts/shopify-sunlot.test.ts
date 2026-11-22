// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _reset, applySun, bestFit, buildable, negatives, fitLot, footprintOf, footprintPoints, fromMetres, init, labelsOf, lengthText, locate, normDeg, onViewer, parseSite, rotatedBox, toMetres, LABELS,
// @ts-expect-error plain JS asset without types
} from '../integrations/shopify/app/extensions/ifc-plans/assets/ifcvo-sunlot.js'
import { FEATURE_TIERS, withTiers } from '../integrations/shopify/build-extension.mjs'

const EXT = path.resolve(__dirname, '../integrations/shopify/app/extensions/ifc-plans')
const block = fs.readFileSync(path.join(EXT, 'blocks/ifc-sun-lot.liquid'), 'utf8')
const schema = JSON.parse(/\{% schema %\}([\s\S]*?)\{% endschema %\}/.exec(block)![1])
const locale = JSON.parse(fs.readFileSync(path.join(EXT, 'locales/en.default.json'), 'utf8'))
const runtime = fs.readFileSync(path.join(EXT, 'assets/ifcvo.js'), 'utf8')

describe('units', () => {
  it('converts feet to metres and back', () => {
    expect(toMetres('10', 'ft')).toBeCloseTo(3.048)
    expect(toMetres(5, 'm')).toBe(5)
    expect(fromMetres(3.048, 'ft')).toBeCloseTo(10)
    expect(toMetres('', 'm')).toBeNull()
    expect(toMetres('-1', 'm')).toBeNull()
    expect(toMetres('abc', 'm')).toBeNull()
    expect(lengthText(3.048, 'ft')).toBe('10 ft')
    expect(lengthText(null)).toBe('—')
  })
  it('normalises degrees and parses sites', () => {
    expect(normDeg(-90)).toBe(270)
    expect(normDeg(720)).toBe(0)
    expect(parseSite('40.4', '-3.7')).toEqual({ lat: 40.4, lon: -3.7 })
    expect(parseSite('91', '0')).toBeNull()
    expect(parseSite('', '1')).toBeNull()
  })
})

describe('fit maths', () => {
  it('rotated box', () => {
    expect(rotatedBox(10, 6, 0)).toEqual({ w: 10, d: 6 })
    expect(rotatedBox(10, 6, 90)).toEqual({ w: 6, d: 10 })
    const b = rotatedBox(10, 6, 45)
    expect(b.w).toBeCloseTo(16 / Math.SQRT2)
    expect(b.d).toBeCloseTo(16 / Math.SQRT2)
  })
  it('setbacks shrink the buildable area', () => {
    expect(buildable({ width: 20, depth: 30, front: 5, side: 2, rear: 3 })).toEqual({ w: 16, d: 22 })
    expect(buildable({ width: 4, depth: 30, front: 0, side: 2, rear: 0 })).toBeNull()
    expect(buildable({ width: null, depth: 30 })).toBeNull()
  })
  it('fits with margins, and rotation can break the fit', () => {
    const lot = { width: 14, depth: 30, front: 5, side: 2, rear: 3 } // buildable 10 x 22
    const f = fitLot({ w: 8, d: 12 }, lot, 0)
    expect(f.fits).toBe(true)
    expect(f.marginSide).toBeCloseTo(1)
    expect(f.marginDepth).toBeCloseTo(10)
    const r = fitLot({ w: 8, d: 12 }, lot, 90) // 12 wide > 10
    expect(r.fits).toBe(false)
    expect(r.marginSide).toBeCloseTo(-1)
    expect(fitLot({ w: 10, d: 22 }, lot, 0).fits).toBe(true) // exact fit
    expect(fitLot({ w: 9, d: 9 }, lot, 45).fits).toBe(false) // diagonal ≈ 12.7
    expect(fitLot(null, lot, 0)).toBeNull()
  })
  it('negatives are reported, and both orientations are tried', () => {
    expect(negatives({ width: '10', side: '-1', rear: '' })).toEqual(['side'])
    const lot = { width: 14, depth: 30, front: 5, side: 2, rear: 3 }
    const t = bestFit({ w: 12, d: 8 }, lot, 0)
    expect(t).toMatchObject({ fits: true, turned: true, deg: 90 })
    expect(bestFit({ w: 8, d: 12 }, lot, 0)).toMatchObject({ fits: true, turned: false })
    expect(bestFit({ w: 30, d: 30 }, lot, 0)).toMatchObject({ fits: false, turned: false })
  })
  it('a lot typed in feet', () => {
    const ft = (v: number) => toMetres(v, 'ft')
    const lot = { width: ft(50), depth: ft(100), front: ft(20), side: ft(5), rear: ft(10) } // 40 x 70 ft
    expect(fitLot({ w: ft(40), d: ft(70) }, lot, 0).fits).toBe(true)
    expect(fitLot({ w: ft(41), d: ft(60) }, lot, 0).fits).toBe(false)
  })
  it('footprint is centred in the buildable area', () => {
    const pts = footprintPoints({ w: 4, d: 2 }, { width: 10, depth: 10, front: 0, side: 0, rear: 0 }, 0)
    expect(pts[0]).toEqual([3, 4])
    expect(pts[2]).toEqual([7, 6])
    expect(footprintOf({ dimensions: { w: 8, d: 12, h: 6 } })).toEqual({ w: 8, d: 12 })
    expect(footprintOf({ dimensions: { w: null, d: 12 } })).toBeNull()
  })
})

describe('block and gate', () => {
  it('is business, in the runtime copy, schema ≤ 25, labels in the locale', () => {
    expect(FEATURE_TIERS.sunlot).toBe('business')
    expect(withTiers(runtime)).toBe(runtime)
    expect(schema.settings.length).toBeLessThanOrEqual(25)
    for (const k of Object.keys(LABELS)) {
      expect(locale.ifcvo.sunlot[k]).toBe(LABELS[k])
      expect(block).toContain(`'ifcvo.sunlot.${k}' | t | json`)
    }
  })
  it('escapes every data attribute', () => {
    for (const m of block.matchAll(/data-[\w-]+="\{\{([^}]*)\}\}"/g)) {
      expect(m[1]).toMatch(/escape|show_sun|show_lot/)
    }
  })
})

function mount(attrs: Record<string, string> = {}): HTMLElement {
  const div = document.createElement('div')
  div.setAttribute('data-ifcvo-sunlot', '')
  for (const [k, v] of Object.entries({ units: 'm', 'lot-width': '14', 'lot-depth': '30', front: '5', side: '2', rear: '3', ...attrs })) div.setAttribute(`data-${k}`, v)
  div.innerHTML = '<div data-ifcvo-live></div>'
  document.body.append(div)
  return div
}

describe('DOM', () => {
  beforeEach(() => { _reset(); document.body.innerHTML = ''; (window as any).IFCVO = undefined })

  it('labelled inputs, verdict and an accessible SVG once the model loads', async () => {
    const root = mount({ lat: '40.4', lon: '-3.7' })
    init()
    for (const i of root.querySelectorAll('input, select')) expect(root.querySelector(`label[for="${i.id}"]`)).not.toBeNull()
    const viewer = { getProductData: vi.fn(async () => ({ elementCount: 5, dimensions: { w: 8, d: 12, h: 6 } })), setSolar: vi.fn(async () => ({})) }
    onViewer(new CustomEvent('ifcvo:viewer', { detail: { viewer } }))
    await vi.waitFor(() => expect(root.querySelector('[data-fits="true"]')).not.toBeNull())
    const svg = root.querySelector('svg')!
    expect(svg.querySelector('title')!.textContent).toBe(LABELS.diagram)
    expect(svg.getAttribute('aria-labelledby')).toContain(svg.querySelector('desc')!.id)
    const rot = root.querySelector<HTMLInputElement>('input[type="range"][max="359"]')!
    rot.value = '90'
    rot.dispatchEvent(new Event('input'))
    // 90° fails, so it tries 180° (fits) and says so.
    expect(root.querySelector('.ifcvo-sunlot-verdict')!.textContent).toContain('turned 90° (to 180°)')
    root.querySelector<HTMLButtonElement>('[data-ifcvo-swap]')!.click()
    expect(rot.value).toBe('180')
    expect(root.querySelector('.ifcvo-sunlot-verdict')!.textContent).toBe(LABELS.fits)
    const w = root.querySelector<HTMLInputElement>('input[id$="-side"]')!
    w.value = '-2'
    w.dispatchEvent(new Event('input'))
    expect(root.querySelector('[data-ifcvo-negative]')!.textContent).toBe('Values must be positive.')
    await vi.waitFor(() => expect(viewer.setSolar).toHaveBeenCalled())
    expect(viewer.setSolar.mock.calls[0][0]).toMatchObject({ active: true, date: '06-21', time: '12:00', location: { lat: 40.4, lon: -3.7 } })
  })

  it('switching units keeps the real lengths', () => {
    const root = mount()
    init()
    const unit = root.querySelector<HTMLSelectElement>('select')!
    unit.value = 'ft'
    unit.dispatchEvent(new Event('change'))
    expect(Number(root.querySelector<HTMLInputElement>('input[id$="-width"]')!.value)).toBeCloseTo(45.93, 1)
  })

  it('geolocation only on press, and fills the inputs', async () => {
    const root = mount()
    init()
    const geo = { getCurrentPosition: vi.fn((ok: any) => ok({ coords: { latitude: 51.5, longitude: -0.12 } })) }
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    locate(root, geo)
    expect(root.querySelector<HTMLInputElement>('input[id$="-lat"]')!.value).toBe('51.5')
    expect(root.querySelector('[role="status"]')!.textContent).toBe(LABELS.located)
    await applySun(root)
  })

  it('respects the plan gate and overrides', () => {
    const root = mount({ 'labels-override': 'fits=Cabe' })
    expect(labelsOf(root).fits).toBe('Cabe')
    ;(window as any).IFCVO = { gate: () => false }
    init()
    expect(root.querySelector('fieldset')).toBeNull()
  })
})
