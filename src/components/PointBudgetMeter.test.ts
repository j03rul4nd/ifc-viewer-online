// The resident-point budget meter: what it says (and to assistive tech) at
// each level, the reserved part apart from the uploaded one, and its hint.
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '../i18n/config'
import PointBudgetMeter from './PointBudgetMeter'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const format = (n: number): string => (n >= 1_000_000 ? `${n / 1_000_000} M` : n >= 1_000 ? `${n / 1_000} k` : String(n))
const t = i18n.getFixedT('en', 'pointcloud')

let host: HTMLDivElement | null = null
let root: Root | null = null
function mount(resident: number, reserved: number, max = 20_000_000): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(createElement(PointBudgetMeter, { resident, reserved, max, t, format })) })
  return host
}
const meterOf = (el: HTMLElement): HTMLElement => el.querySelector('[role="meter"]') as HTMLElement

beforeAll(async () => {
  await i18n.loadNamespaces('pointcloud')
})

afterEach(() => {
  if (root) act(() => root!.unmount())
  host?.remove()
  root = null
  host = null
})

describe('PointBudgetMeter', () => {
  it('says what is used, to the eye and to assistive tech', () => {
    const el = mount(2_000_000, 0)
    const m = meterOf(el)
    expect(m.getAttribute('aria-valuenow')).toBe('2000000')
    expect(m.getAttribute('aria-valuemax')).toBe('20000000')
    expect(m.getAttribute('aria-valuetext')).toBe(t('status.budget', { used: '2 M', max: '20 M' }))
    expect(el.textContent).toContain(t('status.budget', { used: '2 M', max: '20 M' }))
    expect(m.firstElementChild?.className).not.toContain('amber')
    // Nothing reserved: one part, and no reserved line.
    expect(m.children).toHaveLength(1)
    expect(el.textContent).not.toContain(t('status.budgetReserved', { reserved: '0' }).replace('0', ''))
  })

  it('from 90 % the text says "nearly full" too, not only the colour; at the cap it says "full"', () => {
    const near = mount(18_500_000, 0)
    expect(meterOf(near).getAttribute('aria-valuetext')).toBe(t('status.budgetNearlyFull', { used: '18.5 M', max: '20 M' }))
    expect(meterOf(near).firstElementChild?.className).toContain('amber')
    act(() => root!.unmount()); host!.remove(); root = null
    const full = mount(20_000_000, 0)
    expect(meterOf(full).getAttribute('aria-valuetext')).toBe(t('status.budgetFull', { used: '20 M', max: '20 M' }))
  })

  it('shows what scans still loading have reserved apart from what is uploaded', () => {
    const el = mount(50_000, 19_950_000)
    const m = meterOf(el)
    const parts = [...m.children] as HTMLElement[]
    expect(parts).toHaveLength(2)
    expect(parts[1].dataset.part).toBe('reserved')
    // A tiny text scan promised the rest is not "nearly full".
    expect(m.getAttribute('aria-valuetext')).toContain(t('status.budget', { used: '50 k', max: '20 M' }))
    expect(m.getAttribute('aria-valuetext')).toContain(t('status.budgetReserved', { reserved: '19.95 M' }))
  })

  it('its hint opens from a button a keyboard or a finger can reach', () => {
    const el = mount(1_000, 0)
    const button = el.querySelector('button') as HTMLButtonElement
    const hint = el.querySelector('p') as HTMLParagraphElement
    expect(button.getAttribute('aria-label')).toBe(t('status.budgetAbout'))
    expect(button.getAttribute('aria-controls')).toBe(hint.id)
    expect(hint.hidden).toBe(true)
    act(() => button.click())
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toBe(t('status.budgetHint'))
  })
})
