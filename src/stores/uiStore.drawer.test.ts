// The ifc-ui-drawer:v1 contract: one remembered drawer share, kept apart from
// the column flags.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const KEY = 'ifc-ui-drawer:v1'
const COLUMNS = 'ifc-ui-columns:v1'

type Store = {
  bottomDrawerRatio: number
  setBottomDrawerRatio: (r: number, o?: { persist?: boolean }) => void
}

async function freshStore() {
  vi.resetModules()
  const mod = await import('./uiStore')
  return mod.useUIStore as unknown as { getState: () => Store }
}

const realMatchMedia = window.matchMedia

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  window.matchMedia = realMatchMedia
})

describe('bottomDrawerRatio', () => {
  it('defaults to 40%', async () => {
    expect((await freshStore()).getState().bottomDrawerRatio).toBe(0.4)
  })

  it('persists and reads back', async () => {
    const store = await freshStore()
    store.getState().setBottomDrawerRatio(0.55)
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ ratio: 0.55 })
    expect((await freshStore()).getState().bottomDrawerRatio).toBe(0.55)
  })

  it('does not write with persist:false', async () => {
    const store = await freshStore()
    store.getState().setBottomDrawerRatio(0.3, { persist: false })
    expect(store.getState().bottomDrawerRatio).toBe(0.3)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('clamps and ignores non-finite input', async () => {
    const store = await freshStore()
    store.getState().setBottomDrawerRatio(2)
    expect(store.getState().bottomDrawerRatio).toBe(0.9)
    store.getState().setBottomDrawerRatio(-1)
    expect(store.getState().bottomDrawerRatio).toBe(0.1)
    store.getState().setBottomDrawerRatio(NaN)
    expect(store.getState().bottomDrawerRatio).toBe(0.1)
  })

  it('leaves the column flags untouched', async () => {
    const seeded = JSON.stringify({ tree: false, sidebar: true, validation: true })
    localStorage.setItem(COLUMNS, seeded)
    const store = await freshStore()
    store.getState().setBottomDrawerRatio(0.6)
    expect(localStorage.getItem(COLUMNS)).toBe(seeded)
    const raw = localStorage.getItem(KEY)!
    for (const k of ['tree', 'sidebar', 'validation']) expect(raw).not.toContain(k)
  })

  it('never writes on a phone', async () => {
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 767px)', media: q, onchange: null,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    const store = await freshStore()
    store.getState().setBottomDrawerRatio(0.6)
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})
