// T-322h v2 dev-store fixes: poster download never navigates, the setup panel
// collapse survives re-renders, and the wizard's 3D view needs a click to zoom.
import { afterEach, describe, expect, it, vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = Record<string, any>
const wizard = async (): Promise<Mod> => import(/* @vite-ignore */ '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-wizard.js')
const diag = async (): Promise<Mod> => import(/* @vite-ignore */ '../integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-diagnostics.js')

afterEach(() => {
  document.body.innerHTML = ''
  sessionStorage.clear()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).Shopify = undefined
})

describe('poster download (P1)', () => {
  it('uses a detached <a download> whose click never reaches the document', async () => {
    const m = await wizard()
    const create = vi.fn(() => 'blob:x')
    const revoke = vi.fn()
    const win = { URL: { createObjectURL: create, revokeObjectURL: revoke } }
    const docClicks = vi.fn()
    document.addEventListener('click', docClicks)
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    const a = m.downloadBlob(new Blob(['x']), 'p-poster.webp', { doc: document, win })
    expect(a.getAttribute('download')).toBe('p-poster.webp')
    expect(a.getAttribute('href')).toBe('blob:x')
    expect(a.isConnected).toBe(false)
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(docClicks).not.toHaveBeenCalled()
    clicked.mockRestore()
    document.removeEventListener('click', docClicks)
  })

  it('the wizard never sets location for the poster', async () => {
    const fs = await import('node:fs')
    const src = fs.readFileSync('integrations/shopify/app/extensions/ifc-viewer/assets/ifcvo-wizard.js', 'utf8')
    expect(src).not.toMatch(/location\s*(\.href)?\s*=|location\.assign|window\.open\(/)
  })
})

describe('wizard 3D view wheel guard (P3)', () => {
  it('covers the view until a click', async () => {
    const m = await wizard()
    const stage = document.createElement('div')
    document.body.append(stage)
    stage.append(m.wheelGuard(document))
    const cover = stage.querySelector('[data-ifcvo-wheel-guard]') as HTMLElement
    expect(cover).not.toBeNull()
    cover.click()
    expect(stage.querySelector('[data-ifcvo-wheel-guard]')).toBeNull()
  })
})

describe('setup panel collapse (P3)', () => {
  const page = () => {
    document.body.innerHTML = '<script type="application/json" data-ifcvo-diag>{"feature":"takeoff","block":"ifc-takeoff","ns":"bim","present":[],"missing":[],"any":false,"model":"","product":true}</script>'
  }
  const api = { FEATURE_TIERS: { takeoff: 'business' }, sdk: 'https://x/sdk/1.19.0/a.js', viewer: null }

  it('collapses, and stays collapsed after a re-render in the same tab', async () => {
    const m = await diag()
    page()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).Shopify = { designMode: true }
    let panel = await m.render(document, { api, force: true })
    const body = () => panel.querySelector('.ifcvo-diag-body') as HTMLElement
    const toggle = () => panel.querySelector('.ifcvo-diag-head button') as HTMLButtonElement
    expect(body().hidden).toBe(false)
    toggle().click()
    expect(body().hidden).toBe(true)
    expect(panel.hasAttribute('data-collapsed')).toBe(true)
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(sessionStorage.getItem(m.COLLAPSE_KEY)).toBe('1')
    panel = await m.render(document, { api, force: true })
    expect(body().hidden).toBe(true)
    toggle().click()
    expect(body().hidden).toBe(false)
    panel = await m.render(document, { api, force: true })
    expect(body().hidden).toBe(false)
  })
})
