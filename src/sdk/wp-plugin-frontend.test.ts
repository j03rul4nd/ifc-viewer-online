// The WordPress plugin's bundled frontend.js, run in jsdom.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const code = readFileSync(resolve(__dirname, '../../integrations/wordpress/bimo-ifc-viewer/frontend.js'), 'utf8')
const ORIGIN = 'https://www.ifcvieweronline.eu'

let listeners: Array<(e: MessageEvent) => void> = []

function boot(html: string): void {
  listeners.forEach((l) => window.removeEventListener('message', l))
  listeners = []
  document.body.innerHTML = html
  delete (window as { BimoIFC?: unknown }).BimoIFC
  const add = window.addEventListener.bind(window)
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, l: (e: MessageEvent) => void, o?: unknown) => {
    if (type === 'message') listeners.push(l)
    add(type, l as EventListener, o as AddEventListenerOptions)
  }) as typeof window.addEventListener)
  new Function(code)()
  spy.mockRestore()
}

function fromViewer(frame: HTMLIFrameElement, data: Record<string, unknown>, origin = ORIGIN): void {
  window.dispatchEvent(new MessageEvent('message', { data: { source: 'ifc-validator', ...data }, origin, source: frame.contentWindow }))
}

describe('Bimo IFC Viewer frontend.js', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('re-dispatches viewer events as bimo-ifc:<event> and fills the opted-in form field', () => {
    boot(`<div class="ifcvo-embed" data-ifcvo-form-field="#el"><iframe src="about:blank"></iframe></div><input id="el">`)
    const wrap = document.querySelector('.ifcvo-embed') as HTMLElement
    const frame = wrap.querySelector('iframe') as HTMLIFrameElement
    const seen = vi.fn()
    const changed = vi.fn()
    wrap.addEventListener('bimo-ifc:element-selected', (e) => seen((e as CustomEvent).detail))
    document.getElementById('el')!.addEventListener('change', changed)
    fromViewer(frame, { type: 'element-selected', name: 'Door D-01', globalId: '2O2Fr$t4X7Zf8NOew3FLOH', ifcType: 'IFCDOOR' })
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ name: 'Door D-01' }))
    expect((document.getElementById('el') as HTMLInputElement).value).toBe('Door D-01 (2O2Fr$t4X7Zf8NOew3FLOH)')
    expect(changed).toHaveBeenCalled()
  })

  it('ignores messages from any other origin', () => {
    boot(`<div class="ifcvo-embed" data-ifcvo-form-field="#el"><iframe></iframe></div><input id="el">`)
    const wrap = document.querySelector('.ifcvo-embed') as HTMLElement
    const seen = vi.fn()
    wrap.addEventListener('bimo-ifc:element-selected', seen)
    fromViewer(wrap.querySelector('iframe')!, { type: 'element-selected', name: 'x' }, 'https://evil.example')
    expect(seen).not.toHaveBeenCalled()
    expect((document.getElementById('el') as HTMLInputElement).value).toBe('')
  })

  it('does not touch a form field without the opt-in attribute', () => {
    boot(`<div class="ifcvo-embed"><iframe></iframe></div><input id="el">`)
    fromViewer(document.querySelector('iframe')!, { type: 'element-selected', name: 'x', globalId: 'y' })
    expect((document.getElementById('el') as HTMLInputElement).value).toBe('')
  })

  it('pushes to dataLayer only when opted in, without names', () => {
    const w = window as unknown as { dataLayer?: unknown[] }
    w.dataLayer = []
    boot(`<div class="ifcvo-embed" data-ifcvo-datalayer="1"><iframe></iframe></div>`)
    fromViewer(document.querySelector('iframe')!, { type: 'element-selected', name: 'Secret', ifcType: 'IFCWALL' })
    expect(w.dataLayer).toEqual([{ event: 'bimo_ifc_element_selected', ifc_type: 'IFCWALL' }])
    boot(`<div class="ifcvo-embed"><iframe></iframe></div>`)
    w.dataLayer = []
    fromViewer(document.querySelector('iframe')!, { type: 'model-loaded' })
    expect(w.dataLayer).toEqual([])
  })

  it('click to load swaps the poster for the iframe', () => {
    boot(`<div class="ifcvo-embed" data-ifcvo-load="click" data-ifcvo-src="${ORIGIN}/?embed=1&model=x" data-ifcvo-height="480" data-ifcvo-title="T"><div class="ifcvo-poster"><button class="ifcvo-launch">Load</button></div></div>`)
    expect(document.querySelector('iframe')).toBeNull()
    ;(document.querySelector('.ifcvo-launch') as HTMLButtonElement).click()
    const frame = document.querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe(`${ORIGIN}/?embed=1&model=x`)
    expect(frame.getAttribute('height')).toBe('480')
    expect(document.querySelector('.ifcvo-poster')).toBeNull()
  })

  it('BimoIFC.get queues commands until ready + model loaded, then posts to the viewer origin only', () => {
    boot(`<div class="ifcvo-embed" id="v"><iframe></iframe></div>`)
    const frame = document.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    const v = (window as unknown as { BimoIFC: { get(el: string): { select(g: string): void; setView(v: string): void } | null } }).BimoIFC.get('#v')!
    v.select('2O2Fr$t4X7Zf8NOew3FLOH')
    expect(post).not.toHaveBeenCalled()
    fromViewer(frame, { type: 'ready' })
    fromViewer(frame, { type: 'model-loaded' })
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'ifcviewer:select', globalId: '2O2Fr$t4X7Zf8NOew3FLOH' }), ORIGIN)
    v.setView('top')
    expect(post).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'ifcviewer:view', preset: 'top' }), ORIGIN)
  })

  it('a step drives the viewer above it when it scrolls into the middle', () => {
    let cb: ((entries: Array<{ isIntersecting: boolean; target: Element }>) => void) | null = null
    vi.stubGlobal('IntersectionObserver', class { constructor(f: typeof cb) { cb = f } observe(): void {} disconnect(): void {} })
    boot(`<div class="ifcvo-embed"><iframe></iframe></div><div class="ifcvo-step" data-view="front" data-isolate="IfcWall">Walls</div>`)
    const frame = document.querySelector('iframe')!
    const post = vi.spyOn(frame.contentWindow!, 'postMessage')
    fromViewer(frame, { type: 'ready' })
    fromViewer(frame, { type: 'model-loaded' })
    cb!([{ isIntersecting: true, target: document.querySelector('.ifcvo-step')! }])
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'ifcviewer:isolate', ifcType: 'IfcWall', frame: false }), ORIGIN)
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'ifcviewer:view', preset: 'front' }), ORIGIN)
    vi.unstubAllGlobals()
  })
})
