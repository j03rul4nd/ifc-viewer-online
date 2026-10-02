// ─── The article kit (SDK v1.15) ──────────────────────────────────────────────
// lazy + poster, aspect ratio, pause off screen, background 'auto', turntable,
// full screen and bindSteps — the parts of the SDK a blog post is built from.
// jsdom has no IntersectionObserver: a fake one records what is observed and
// lets each test say what is on screen.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IfcViewer } from './ifc-viewer-sdk'

const BASE = 'https://app.test/'

class FakeIO {
  static all: FakeIO[] = []
  targets: Element[] = []
  constructor(public cb: IntersectionObserverCallback, public opts?: IntersectionObserverInit) { FakeIO.all.push(this) }
  observe(el: Element): void { this.targets.push(el) }
  disconnect(): void { this.targets = [] }
  unobserve(): void { /* unused */ }
  takeRecords(): IntersectionObserverEntry[] { return [] }
  /** Report `el` (default: every target) as on or off screen. */
  fire(visible: boolean, el?: Element): void {
    const targets = el ? [el] : this.targets
    this.cb(targets.map((target) => ({ target, isIntersecting: visible } as IntersectionObserverEntry)), this as unknown as IntersectionObserver)
  }
}

function mount(): HTMLElement {
  document.body.innerHTML = ''
  const el = document.createElement('div')
  el.id = 'mount'
  document.body.appendChild(el)
  return el
}

function spyPost(v: IfcViewer) {
  return vi.spyOn(v.iframe.contentWindow as Window, 'postMessage').mockImplementation(() => {})
}
function emitFromIframe(v: IfcViewer, data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data: { source: 'ifc-validator', ...data }, source: v.iframe.contentWindow as Window }))
}
const types = (post: ReturnType<typeof spyPost>): unknown[] => post.mock.calls.map((c) => (c[0] as { type?: unknown }).type)
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('IfcViewer article kit', () => {
  beforeEach(() => {
    mount()
    FakeIO.all = []
    vi.stubGlobal('IntersectionObserver', FakeIO)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('lazy: a poster with a button, and no viewer until it is pressed', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, lazy: true, poster: '/p.jpg', posterTitle: 'Pavilion', launchLabel: 'Open' })
    expect(v.iframe.getAttribute('src')).toBeNull()
    expect(v.isActive).toBe(false)
    const btn = v.box!.querySelector('button')!
    expect(btn.textContent).toBe('Open')
    expect(v.box!.textContent).toContain('Pavilion')
    btn.click()
    expect(v.isActive).toBe(true)
    expect(new URL(v.iframe.src).origin).toBe('https://app.test')
    v.dispose()
  })

  it("lazy: 'visible' boots when the figure nears the screen", () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, lazy: 'visible' })
    const io = FakeIO.all.find((o) => o.opts?.rootMargin === '300px 0px')!
    io.fire(false)
    expect(v.isActive).toBe(false)
    io.fire(true)
    expect(v.isActive).toBe(true)
    v.dispose()
  })

  it('lazy: calls made before boot wait, and their clock only starts at boot', async () => {
    vi.useFakeTimers()
    const v = new IfcViewer('#mount', { baseUrl: BASE, lazy: true })
    const p = v.getStats()
    let settled = false
    p.then(() => { settled = true }, () => { settled = true })
    await vi.advanceTimersByTimeAsync(60_000)           // well past the 30 s request timeout
    expect(settled).toBe(false)
    v.activate()
    // jsdom swaps the frame's window when it navigates; a browser keeps the proxy.
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    await vi.advanceTimersByTimeAsync(0)
    expect(types(post)).toContain('ifcviewer:get-stats')
    v.dispose()
  })

  it('the poster goes once a model is in', async () => {
    vi.useFakeTimers()
    const v = new IfcViewer('#mount', { baseUrl: BASE, poster: '/p.jpg', model: 'https://cdn.test/a.ifc' })
    expect(v.box!.querySelector('.ifcv-poster')).not.toBeNull()
    emitFromIframe(v, { type: 'model-loaded', modelId: 'm', fileName: 'a.ifc' })
    await vi.advanceTimersByTimeAsync(500)
    expect(v.box!.querySelector('.ifcv-poster')).toBeNull()
    v.dispose()
  })

  it('aspectRatio sizes one box for poster and viewer; without the kit the iframe goes in bare', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, aspectRatio: '16/10' })
    expect(v.box!.style.aspectRatio).toBe('16/10')
    expect(v.iframe.parentElement).toBe(v.box)
    v.dispose()
    const bare = new IfcViewer('#mount', { baseUrl: BASE })
    expect(bare.box).toBeNull()
    expect(bare.iframe.parentElement?.id).toBe('mount')
    bare.dispose()
  })

  it("pauseOffscreen: the article preset stops painting off screen and resumes on it", async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, ui: 'article' })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    await tick()
    const io = FakeIO.all[FakeIO.all.length - 1]
    io.fire(false)
    io.fire(true)
    const paused = post.mock.calls.map((c) => c[0] as { type?: string; paused?: boolean }).filter((m) => m.type === 'ifcviewer:set-paused')
    expect(paused.map((m) => m.paused)).toEqual([true, false])
    v.dispose()
  })

  it("background 'auto' reads the page: paper on light, studio on dark", () => {
    document.body.style.backgroundColor = 'rgb(250, 250, 250)'
    const light = new IfcViewer('#mount', { baseUrl: BASE, background: 'auto' })
    expect(new URL(light.iframe.src).searchParams.get('bg')).toBe('paper')
    light.dispose()
    mount()
    document.body.style.backgroundColor = 'rgb(12, 12, 16)'
    const dark = new IfcViewer('#mount', { baseUrl: BASE, background: 'auto' })
    expect(new URL(dark.iframe.src).searchParams.get('bg')).toBe('studio')
    dark.dispose()
    document.body.style.backgroundColor = ''
  })

  it('turntable and view go on the URL', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, ui: 'article', turntable: true, view: 'top', fill: 0.7 })
    const q = new URL(v.iframe.src).searchParams
    expect(q.get('turntable')).toBe('1')
    expect(q.get('view')).toBe('top')
    expect(q.get('fill')).toBe('0.7')
    v.dispose()
  })

  it('fullscreenButton draws an expand button in the corner', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, fullscreenButton: true })
    expect(v.box!.querySelector('button[aria-label="Full screen"]')).not.toBeNull()
    v.dispose()
  })

  it('bindSteps applies the step whose paragraph crosses the middle', async () => {
    const a = document.createElement('p'); a.id = 'a'; document.body.appendChild(a)
    const b = document.createElement('p'); b.id = 'b'; document.body.appendChild(b)
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    await tick()
    const run = vi.fn()
    v.bindSteps([
      { el: '#a', isolate: 'IfcWall' },
      { el: b, isolate: null, run },
    ])
    await tick()
    expect(post.mock.calls.some((c) => (c[0] as { type?: string; ifcType?: string }).type === 'ifcviewer:isolate' && (c[0] as { ifcType?: string }).ifcType === 'IfcWall')).toBe(true)
    const io = FakeIO.all[FakeIO.all.length - 1]
    expect(io.opts?.rootMargin).toBe('-45% 0px -45% 0px')
    io.fire(true, b)
    await tick()
    expect(run).toHaveBeenCalledWith(v)
    v.dispose()
  })
})
