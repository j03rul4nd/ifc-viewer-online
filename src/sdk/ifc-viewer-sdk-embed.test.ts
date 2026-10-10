// ─── SDK 1.17: catalogue objects in a host application ───────────────────────
// The wire side of what BESCOF-style hosts need: the `embed` preset and its
// options, validate() and its events, framing an element, and the pinned
// build finding the app from /sdk/<version>/.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IfcViewer, IfcViewerElement } from './ifc-viewer-sdk'
import { appBaseUrlFor } from './base-url'

const BASE = 'https://app.test/'

function mount(): void {
  document.body.innerHTML = '<div id="mount"></div>'
}

function spyPost(v: IfcViewer) {
  return vi.spyOn(v.iframe.contentWindow as Window, 'postMessage').mockImplementation(() => {})
}

function emitFromIframe(v: IfcViewer, data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', {
    data: { source: 'ifc-validator', ...data },
    source: v.iframe.contentWindow as Window,
  }))
}

type PostSpy = ReturnType<typeof spyPost>
function postsOfType(post: PostSpy, type: string): Record<string, unknown>[] {
  return post.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((m) => m?.type === type)
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

function params(v: IfcViewer): URLSearchParams {
  return new URL(v.iframe.src).searchParams
}

describe('SDK 1.17 — embed preset and options', () => {
  beforeEach(mount)

  it('is version 1.17.0', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    expect(v.version).toBe('1.17.0')
    v.dispose()
  })

  it("ui: 'embed' with toolbar / tools / autoFrame reach the iframe", () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, ui: 'embed', toolbar: false, tools: ['measure'], autoFrame: false, panels: ['properties'] })
    const q = params(v)
    expect(q.get('ui')).toBe('embed')
    expect(q.get('toolbar')).toBe('0')
    expect(q.get('tools')).toBe('measure')
    expect(q.get('autoframe')).toBe('0')
    expect(q.get('panels')).toBe('properties')
    v.dispose()
  })

  it('tools: [] is serialised as "no tools", and defaults add nothing', () => {
    const none = new IfcViewer('#mount', { baseUrl: BASE, ui: 'embed', tools: [] })
    expect(params(none).get('tools')).toBe('')
    none.dispose()
    mount()
    const plain = new IfcViewer('#mount', { baseUrl: BASE, ui: 'embed' })
    expect(params(plain).has('tools')).toBe(false)
    expect(params(plain).has('toolbar')).toBe(false)
    expect(params(plain).has('autoframe')).toBe(false) // auto-frame is the default
    plain.dispose()
  })

  it('the web component maps toolbar / tools / auto-frame attributes', () => {
    if (!customElements.get('ifc-viewer')) customElements.define('ifc-viewer', IfcViewerElement)
    document.body.innerHTML = `<ifc-viewer base-url="${BASE}" ui="embed" toolbar="false" tools="validate" auto-frame="false"></ifc-viewer>`
    const el = document.querySelector('ifc-viewer') as IfcViewerElement
    const q = new URL(el.viewer!.iframe.src).searchParams
    expect(q.get('ui')).toBe('embed')
    expect(q.get('toolbar')).toBe('0')
    expect(q.get('tools')).toBe('validate')
    expect(q.get('autoframe')).toBe('0')
    el.remove()
  })
})

describe('SDK 1.17 — validation', () => {
  beforeEach(mount)

  it('validate() asks the viewer and resolves with that model\'s result', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.validate('m1', { force: true })
    await tick(); await tick()
    const q = postsOfType(post, 'ifcviewer:validate')[0]
    expect(q).toMatchObject({ modelId: 'm1', force: true })
    const data = { modelId: 'm1', qualityScore: 92, errors: 0, warnings: 3, info: 1, total: 4, durationMs: 420 }
    emitFromIframe(v, { type: 'result', requestId: q.requestId, ok: true, data })
    await expect(p).resolves.toEqual(data)
    v.dispose()
  })

  it('validate() waits for loads still in flight, so add(); validate() needs no await between', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    void v.add('a.ifc', new Uint8Array([1, 2, 3]))
    const p = v.validate()
    await tick(); await tick()
    expect(postsOfType(post, 'ifcviewer:validate')).toHaveLength(0) // still loading
    const load = postsOfType(post, 'ifcviewer:load-bytes')[0]
    emitFromIframe(v, { type: 'model-loaded', requestId: load.requestId, modelId: 'm1', fileName: 'a.ifc', elementCount: 1, fromCache: false })
    await tick(); await tick()
    const q = postsOfType(post, 'ifcviewer:validate')[0]
    expect(q).toBeDefined()
    expect(q.modelId).toBeUndefined() // the active model
    emitFromIframe(v, { type: 'result', requestId: q.requestId, ok: false, error: 'No model is loaded — load one before validating.' })
    await expect(p).rejects.toThrow('No model is loaded')
    v.dispose()
  })

  it('getValidationStatus() is a query', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.getValidationStatus()
    await tick()
    const q = postsOfType(post, 'ifcviewer:get-validation-status')[0]
    const data = { status: 'running', modelId: 'm1', progress: 40, error: null, queued: 0 }
    emitFromIframe(v, { type: 'result', requestId: q.requestId, ok: true, data })
    await expect(p).resolves.toEqual(data)
    v.dispose()
  })

  it('re-emits validation-started / -completed / -failed', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const seen: string[] = []
    v.on('validation-started', (e) => seen.push(`started:${e.modelId}`))
    v.on('validation-completed', (e) => seen.push(`completed:${e.modelId}:${e.qualityScore}`))
    v.on('validation-failed', (e) => seen.push(`failed:${e.modelId}:${e.message}`))
    emitFromIframe(v, { type: 'validation-started', modelId: 'm1' })
    emitFromIframe(v, { type: 'validation-completed', modelId: 'm1', qualityScore: 100, errors: 0, warnings: 0, info: 2, total: 2 })
    emitFromIframe(v, { type: 'validation-failed', modelId: 'm2', message: 'boom' })
    expect(seen).toEqual(['started:m1', 'completed:m1:100', 'failed:m2:boom'])
    v.dispose()
  })

  it('getIssues() can filter by model', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    v.getIssues({ modelId: 'm2', severity: 'error' }).catch(() => undefined) // disposed below
    await tick()
    expect(postsOfType(post, 'ifcviewer:get-issues')[0]).toMatchObject({ modelId: 'm2', severity: 'error' })
    v.dispose()
  })
})

describe('SDK 1.17 — camera', () => {
  beforeEach(mount)

  it('frame(elementId, modelId) frames that element, from the current angle', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.frame(67, 'm1')
    await tick()
    const q = postsOfType(post, 'ifcviewer:view')[0]
    expect(q).toMatchObject({ elementId: 67, modelId: 'm1' })
    // no preset or fill imposed: the viewer keeps the angle and uses its margin
    expect(q.preset).toBeUndefined()
    expect(q.fill).toBeUndefined()
    emitFromIframe(v, { type: 'result', requestId: q.requestId, ok: true, data: { scope: 'element' } })
    await expect(p).resolves.toEqual({ scope: 'element' })
    v.dispose()
  })

  it('frame({ elementId, view }) passes the view; scene framing is unchanged', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    v.frame({ elementId: 5, view: 'front', fill: 0.6 }).catch(() => undefined)
    v.frame({ view: 'top' }).catch(() => undefined)
    await tick()
    const [el, scene] = postsOfType(post, 'ifcviewer:view')
    expect(el).toMatchObject({ elementId: 5, preset: 'front', fill: 0.6 })
    expect(scene).toMatchObject({ preset: 'top', fill: 0.85 })
    expect(scene.elementId).toBeUndefined()
    v.dispose()
  })

  it('setView() sends the named view as a command (no answer expected)', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    for (const view of ['front', 'back', 'left', 'right', 'top', 'iso'] as const) v.setView(view)
    await tick()
    const sent = postsOfType(post, 'ifcviewer:view')
    expect(sent.map((m) => m.preset)).toEqual(['front', 'back', 'left', 'right', 'top', 'iso'])
    expect(sent.every((m) => m.requestId === undefined)).toBe(true)
    v.dispose()
  })
})

describe('pinned build: the app above sdk/<version>/', () => {
  it('finds the app from the moving path and from the pinned one alike', () => {
    expect(appBaseUrlFor('https://www.ifcvieweronline.eu/sdk/ifc-viewer.es.js')).toBe('https://www.ifcvieweronline.eu/')
    expect(appBaseUrlFor('https://www.ifcvieweronline.eu/sdk/1.17.0/ifc-viewer.es.js')).toBe('https://www.ifcvieweronline.eu/')
    expect(appBaseUrlFor('https://www.ifcvieweronline.eu/sdk/1.18.0-rc.1/ifc-viewer.es.js')).toBe('https://www.ifcvieweronline.eu/')
  })

  it('keeps a base path, and does not mistake other folders for versions', () => {
    expect(appBaseUrlFor('https://cdn.host/viewer/sdk/1.17.0/ifc-viewer.es.js')).toBe('https://cdn.host/viewer/')
    expect(appBaseUrlFor('https://cdn.host/viewer/sdk/ifc-viewer.es.js')).toBe('https://cdn.host/viewer/')
    // a version-looking folder that is not under sdk/ is not the pinned layout
    expect(appBaseUrlFor('https://cdn.host/1.2.3/ifc-viewer.es.js')).toBe('https://cdn.host/')
    expect(appBaseUrlFor('https://cdn.host/sdk/es/ifc-viewer.es.js')).toBe('https://cdn.host/sdk/')
  })
})
