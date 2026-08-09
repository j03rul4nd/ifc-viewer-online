import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IfcViewer, IfcViewerElement } from './ifc-viewer-sdk'

const BASE = 'https://app.test/'

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

/** Dispatch a message as if it came from the viewer's iframe. */
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
function lastRequestId(post: PostSpy): string {
  const loads = post.mock.calls.map((c) => c[0] as Record<string, unknown>)
    .filter((m) => typeof m?.requestId === 'string')
  const id = loads[loads.length - 1]?.requestId
  if (typeof id !== 'string') throw new Error('no requestId was posted')
  return id
}

/** Flush microtasks + the macrotask queue (load chain + whenReady chains). */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('IfcViewer SDK', () => {
  beforeEach(() => { mount() })

  it('throws when the mount target is missing', () => {
    expect(() => new IfcViewer('#nope', { baseUrl: BASE })).toThrow()
  })

  it('mounts an iframe with embed params from options', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, ui: 'kiosk', validate: false, panel: true, lang: 'es' })
    const u = new URL(v.iframe.src)
    expect(u.origin + u.pathname).toBe(BASE)
    expect(u.searchParams.get('embed')).toBe('1')
    expect(u.searchParams.get('ui')).toBe('kiosk')
    expect(u.searchParams.get('validate')).toBe('0')
    expect(u.searchParams.get('panel')).toBe('1')
    expect(u.searchParams.get('lang')).toBe('es')
    v.dispose()
  })

  it('omits default params (minimal preset, validate on)', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const u = new URL(v.iframe.src)
    expect(u.searchParams.get('embed')).toBe('1')
    expect(u.searchParams.get('ui')).toBeNull()
    expect(u.searchParams.get('validate')).toBeNull()
    v.dispose()
  })

  it('tracks readiness via isReady / whenReady / on(ready)', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const onReady = vi.fn()
    v.on('ready', onReady)
    expect(v.isReady).toBe(false)
    const ready = v.whenReady()
    emitFromIframe(v, { type: 'ready' })
    await ready
    expect(v.isReady).toBe(true)
    expect(onReady).toHaveBeenCalledTimes(1)
    v.dispose()
  })

  it('posts targeted origin (app origin), not "*"', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    v.fit()
    await tick()
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'ifcviewer:fit' }), 'https://app.test', [])
    v.dispose()
  })

  it('add() posts transferable bytes (with requestId) and resolves on matching model-loaded', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const buf = new Uint8Array([1, 2, 3, 4]).buffer
    const p = v.add('model.ifc', buf)
    await tick()

    const load = postsOfType(post, 'ifcviewer:load-bytes')[0]
    expect(load).toMatchObject({ name: 'model.ifc' })
    expect(typeof load.requestId).toBe('string')
    // transfer list carried the buffer
    const call = post.mock.calls.find((c) => (c[0] as Record<string, unknown>).type === 'ifcviewer:load-bytes')!
    const transfer = (call as unknown as unknown[])[2] as Transferable[]
    expect(transfer.length).toBe(1)

    emitFromIframe(v, { type: 'model-loaded', requestId: load.requestId, modelId: 'm', fileName: 'model.ifc', elementCount: 42, fromCache: false })
    await expect(p).resolves.toMatchObject({ elementCount: 42, fileName: 'model.ifc' })
    v.dispose()
  })

  it('add() rejects on a matching model-error', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.add('bad.ifc', new Uint8Array([0]).buffer)
    await tick()
    emitFromIframe(v, { type: 'model-error', requestId: lastRequestId(post), message: 'boom' })
    await expect(p).rejects.toThrow('boom')
    v.dispose()
  })

  it('ignores model-loaded events whose requestId does not match (app-initiated loads)', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.add('m.ifc', new Uint8Array([1]).buffer)
    await tick()
    const onLoaded = vi.fn()
    v.on('model-loaded', onLoaded)

    let settled = false
    void p.then(() => { settled = true }, () => { settled = true })

    // No requestId (e.g. a URL-param load inside the iframe) → event fires, promise stays pending.
    emitFromIframe(v, { type: 'model-loaded', modelId: 'x', fileName: 'other.ifc', elementCount: 1, fromCache: false })
    await tick()
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    // The matching one resolves it.
    emitFromIframe(v, { type: 'model-loaded', requestId: lastRequestId(post), modelId: 'm', fileName: 'm.ifc', elementCount: 9, fromCache: false })
    await expect(p).resolves.toMatchObject({ elementCount: 9 })
    v.dispose()
  })

  it('add() rejects on timeout', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, loadTimeout: 30 })
    spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.add('m.ifc', new Uint8Array([1]).buffer)
    await expect(p).rejects.toThrow(/timed out/i)
    v.dispose()
  })

  it('serializes loads — second only posts after the first settles', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const p1 = v.add('a.ifc', new Uint8Array([1]).buffer)
    const p2 = v.add('b.ifc', new Uint8Array([2]).buffer)
    await tick()
    expect(postsOfType(post, 'ifcviewer:load-bytes')).toHaveLength(1) // only A so far

    emitFromIframe(v, { type: 'model-loaded', requestId: lastRequestId(post), modelId: 'a', fileName: 'a.ifc', elementCount: 1, fromCache: false })
    await p1
    await tick()
    const loads = postsOfType(post, 'ifcviewer:load-bytes')
    expect(loads).toHaveLength(2) // B posted after A settled
    expect(loads[1]).toMatchObject({ name: 'b.ifc' })

    emitFromIframe(v, { type: 'model-loaded', requestId: lastRequestId(post), modelId: 'b', fileName: 'b.ifc', elementCount: 2, fromCache: false })
    await expect(p2).resolves.toMatchObject({ fileName: 'b.ifc' })
    v.dispose()
  })

  it('queues fire-and-forget commands until ready, then flushes', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    v.select(1234)
    await tick()
    expect(post).not.toHaveBeenCalled()
    emitFromIframe(v, { type: 'ready' })
    await tick()
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'ifcviewer:select', expressId: 1234 }), 'https://app.test', [])
    v.dispose()
  })

  it('exposes setView / setLanguage / clear / isolate commands', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    v.setView('top')
    v.setLanguage('de')
    v.clear()
    v.isolate('IfcWall')
    await tick()
    expect(postsOfType(post, 'ifcviewer:view')[0]).toMatchObject({ preset: 'top' })
    expect(postsOfType(post, 'ifcviewer:set-language')[0]).toMatchObject({ lang: 'de' })
    expect(postsOfType(post, 'ifcviewer:clear')).toHaveLength(1)
    expect(postsOfType(post, 'ifcviewer:isolate')[0]).toMatchObject({ ifcType: 'IfcWall' })
    v.dispose()
  })

  it('forwards element-selected and model-progress events', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const onSel = vi.fn()
    const onProg = vi.fn()
    v.on('element-selected', onSel)
    v.on('model-progress', onProg)
    emitFromIframe(v, { type: 'element-selected', expressId: 7, modelId: 'm', ifcType: 'IFCWALL', name: 'Wall' })
    emitFromIframe(v, { type: 'model-progress', percent: 55, phase: 'parsing' })
    expect(onSel).toHaveBeenCalledWith(expect.objectContaining({ expressId: 7 }))
    expect(onProg).toHaveBeenCalledWith(expect.objectContaining({ percent: 55, phase: 'parsing' }))
    v.dispose()
  })

  it('advertises supported languages via ready payload + getLanguages()', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    // Before ready: falls back to the bundled list.
    expect(v.getLanguages()).toContain('en')
    expect(v.getLanguages()).toContain('ja')
    let readyPayload: { languages: string[] } | null = null
    v.on('ready', (e) => { readyPayload = e })
    emitFromIframe(v, { type: 'ready', languages: ['en', 'es', 'fr'] })
    expect(readyPayload).toEqual({ languages: ['en', 'es', 'fr'] })
    expect(v.getLanguages()).toEqual(['en', 'es', 'fr'])
    v.dispose()
  })

  it('exposes static language metadata', () => {
    expect(IfcViewer.SUPPORTED_LANGUAGES).toContain('de')
    expect(IfcViewer.LANGUAGES.find((l) => l.code === 'zh')?.label).toBe('中文')
  })

  it('showAll() posts the show-all command', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    v.showAll()
    await tick()
    expect(postsOfType(post, 'ifcviewer:show-all')).toHaveLength(1)
    v.dispose()
  })

  it('forwards validation-completed events (Health Score)', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const onVal = vi.fn()
    v.on('validation-completed', onVal)
    emitFromIframe(v, { type: 'validation-completed', qualityScore: 78, errors: 3, warnings: 5, info: 2 })
    expect(onVal).toHaveBeenCalledWith(expect.objectContaining({ qualityScore: 78, errors: 3 }))
    v.dispose()
  })

  it('getModels() sends a query and resolves with the result payload', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.getModels()
    await tick()
    const q = postsOfType(post, 'ifcviewer:get-models')[0]
    expect(typeof q.requestId).toBe('string')
    const data = [{ id: 'm1', fileName: 'a.ifc', elementCount: 5 }]
    emitFromIframe(v, { type: 'result', requestId: q.requestId, ok: true, data })
    await expect(p).resolves.toEqual(data)
    v.dispose()
  })

  it('getElement() resolves with element data; failed result rejects', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p1 = v.getElement(123, 'm1')
    await tick()
    const q1 = postsOfType(post, 'ifcviewer:get-element')[0]
    expect(q1).toMatchObject({ expressId: 123, modelId: 'm1' })
    emitFromIframe(v, { type: 'result', requestId: q1.requestId, ok: true, data: { name: 'Wall', globalId: 'X' } })
    await expect(p1).resolves.toMatchObject({ name: 'Wall' })

    const p2 = v.getElement(999)
    await tick()
    const q2 = postsOfType(post, 'ifcviewer:get-element')[1]
    emitFromIframe(v, { type: 'result', requestId: q2.requestId, ok: false, error: 'not found' })
    await expect(p2).rejects.toThrow('not found')
    v.dispose()
  })

  it('screenshot() resolves with a data URL', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.screenshot()
    await tick()
    const q = postsOfType(post, 'ifcviewer:screenshot')[0]
    emitFromIframe(v, { type: 'result', requestId: q.requestId, ok: true, data: 'data:image/png;base64,AAA' })
    await expect(p).resolves.toMatch(/^data:image\/png/)
    v.dispose()
  })

  it('exposes removeModel / hideElements / showElements / setCamera commands', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    v.removeModel('m1')
    v.hideElements([1, 2], 'm1')
    v.showElements([3])
    v.setCamera({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 })
    await tick()
    expect(postsOfType(post, 'ifcviewer:remove-model')[0]).toMatchObject({ modelId: 'm1' })
    expect(postsOfType(post, 'ifcviewer:hide-elements')[0]).toMatchObject({ expressIds: [1, 2], modelId: 'm1' })
    expect(postsOfType(post, 'ifcviewer:show-elements')[0]).toMatchObject({ expressIds: [3] })
    expect(postsOfType(post, 'ifcviewer:camera')[0]).toMatchObject({ position: { x: 1, y: 2, z: 3 } })
    v.dispose()
  })

  it('getStats() and getIssues() resolve with dashboard data', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const ps = v.getStats()
    const pi = v.getIssues({ severity: 'error', limit: 10 })
    await tick()
    const qs = postsOfType(post, 'ifcviewer:get-stats')[0]
    const qi = postsOfType(post, 'ifcviewer:get-issues')[0]
    expect(qi).toMatchObject({ severity: 'error', limit: 10 })

    emitFromIframe(v, { type: 'result', requestId: qs.requestId, ok: true, data: { elementCount: 7, models: [] } })
    emitFromIframe(v, { type: 'result', requestId: qi.requestId, ok: true, data: { qualityScore: 80, total: 1, issues: [{ ruleId: 'R', severity: 'error', expressId: 5 }] } })
    await expect(ps).resolves.toMatchObject({ elementCount: 7 })
    await expect(pi).resolves.toMatchObject({ qualityScore: 80, issues: [{ ruleId: 'R' }] })
    v.dispose()
  })

  it('serializes accent into the iframe src', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, accent: '#22c55e' })
    expect(new URL(v.iframe.src).searchParams.get('accent')).toBe('22c55e')
    v.dispose()
  })

  it('IfcViewer.create() resolves once the viewer is ready', async () => {
    const p = IfcViewer.create('#mount', { baseUrl: BASE })
    await tick()
    const iframe = document.querySelector<HTMLIFrameElement>('#mount iframe')!
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'ifc-validator', type: 'ready' }, source: iframe.contentWindow as Window }))
    const v = await p
    expect(v.isReady).toBe(true)
    v.dispose()
  })

  describe('<ifc-viewer> custom element', () => {
    it('is auto-registered on import', () => {
      expect(customElements.get('ifc-viewer')).toBe(IfcViewerElement)
    })

    it('maps attributes to options and exposes .viewer', () => {
      const el = document.createElement('ifc-viewer') as IfcViewerElement
      el.setAttribute('ui', 'kiosk')
      el.setAttribute('lang', 'es')
      el.setAttribute('accent', '#22c55e')
      el.setAttribute('base-url', BASE)
      document.body.appendChild(el)
      const u = new URL(el.viewer!.iframe.src)
      expect(u.searchParams.get('ui')).toBe('kiosk')
      expect(u.searchParams.get('lang')).toBe('es')
      expect(u.searchParams.get('accent')).toBe('22c55e')
      el.remove()
      expect(el.viewer).toBeNull()
    })

    it('forwards viewer events as DOM CustomEvents', () => {
      const el = document.createElement('ifc-viewer') as IfcViewerElement
      el.setAttribute('base-url', BASE)
      document.body.appendChild(el)
      const onReady = vi.fn()
      el.addEventListener('ifcviewer:ready', onReady)
      const iframe = el.querySelector('iframe') as HTMLIFrameElement
      window.dispatchEvent(new MessageEvent('message', { data: { source: 'ifc-validator', type: 'ready', languages: ['en'] }, source: iframe.contentWindow as Window }))
      expect(onReady).toHaveBeenCalled()
      el.remove()
    })
  })

  it('dispose() rejects pending queries', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.getModels()
    await tick()
    v.dispose()
    await expect(p).rejects.toThrow(/disposed/i)
  })

  it('off() unsubscribes a listener', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const cb = vi.fn()
    v.on('ready', cb)
    v.off('ready', cb)
    emitFromIframe(v, { type: 'ready' })
    expect(cb).not.toHaveBeenCalled()
    v.dispose()
  })

  it('ignores messages from other sources / namespaces', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const onReady = vi.fn()
    v.on('ready', onReady)
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'ifc-validator', type: 'ready' }, source: window }))
    emitFromIframe(v, { source: 'someone-else', type: 'ready' } as never)
    expect(onReady).not.toHaveBeenCalled()
    v.dispose()
  })

  it('invokes constructor callbacks and auto-loads the `model` option', async () => {
    const onReady = vi.fn()
    const v = new IfcViewer('#mount', { baseUrl: BASE, onReady, model: 'https://h/a.ifc' })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    await tick()
    expect(onReady).toHaveBeenCalled()
    expect(postsOfType(post, 'ifcviewer:load')[0]).toMatchObject({ url: 'https://h/a.ifc' })
    v.dispose()
  })

  it('dispose() removes the iframe and rejects pending loads', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    spyPost(v)
    emitFromIframe(v, { type: 'ready' })
    const p = v.add('m.ifc', new Uint8Array([1]).buffer)
    await tick()
    v.dispose()
    await expect(p).rejects.toThrow(/disposed/i)
    expect(document.getElementById('mount')?.querySelector('iframe')).toBeNull()
  })
})

describe('IfcViewer — point clouds', () => {
  it('addPointCloud transfers the buffer instead of copying it', async () => {
    // A scan can be gigabytes. Copying it across postMessage would double the
    // memory and can simply fail, so the buffer must ride the transfer list.
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const buf = new Uint8Array([1, 2, 3, 4]).buffer
    // dispose() rejects anything still pending; swallow it rather than
    // leaving an unhandled rejection that fails an unrelated test file.
    v.addPointCloud('site.laz', buf).catch(() => {})
    await tick()

    const call = post.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).type === 'ifcviewer:add-pointcloud',
    )!
    expect(call).toBeTruthy()
    expect((call[0] as Record<string, unknown>).name).toBe('site.laz')
    // postMessage's typed overload stops at two params; the transfer list is
    // the third argument the spy actually recorded.
    const transfer = (call as unknown as unknown[])[2] as Transferable[]
    expect(transfer).toHaveLength(1)
    v.dispose()
  })

  it('resolves addPointCloud with the cloud id the app reports', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const p = v.addPointCloud('site.las', new Uint8Array([1]).buffer)
    await tick()
    const req = postsOfType(post, 'ifcviewer:add-pointcloud')[0]
    emitFromIframe(v, {
      type: 'result', requestId: req.requestId, ok: true, data: { cloudId: 'pc-1' },
    })
    await expect(p).resolves.toBe('pc-1')
    v.dispose()
  })

  it('rejects with the app reason when point clouds are not enabled', async () => {
    // The build flag can be off. A host must get a reason, not a hang.
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const p = v.fitPointCloud()
    await tick()
    const req = postsOfType(post, 'ifcviewer:fit-pointcloud')[0]
    emitFromIframe(v, {
      type: 'result', requestId: req.requestId, ok: false,
      error: 'Point clouds are not enabled in this build',
    })
    await expect(p).rejects.toThrow('not enabled')
    v.dispose()
  })

  it('listPointClouds unwraps the clouds array', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    const p = v.listPointClouds()
    await tick()
    const req = postsOfType(post, 'ifcviewer:get-pointclouds')[0]
    emitFromIframe(v, {
      type: 'result', requestId: req.requestId, ok: true,
      data: { clouds: [{ id: 'pc-1', fileName: 'a.laz', pointCount: 100, declaredCount: 500, truncated: true }] },
    })
    const clouds = await p
    expect(clouds).toHaveLength(1)
    // The two counts stay distinct: pointCount is what is resident, declaredCount
    // what the file holds. Collapsing them would understate a truncated survey.
    expect(clouds[0].pointCount).toBe(100)
    expect(clouds[0].declaredCount).toBe(500)
    expect(clouds[0].truncated).toBe(true)
    v.dispose()
  })

  it('forwards pointcloud-picked with the file coordinates intact', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const onPick = vi.fn()
    v.on('pointcloud-picked', onPick)
    emitFromIframe(v, {
      type: 'pointcloud-picked',
      cloudId: 'pc-1',
      position: { x: 1, y: 2, z: 3 },
      sourcePosition: { x: 639928.39, y: 485161.45, z: 86.38 },
      classification: 2, intensity: 130, distance: 12.5,
    })
    // sourcePosition is the number a survey record already holds — it must
    // survive the bridge unrounded.
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      sourcePosition: { x: 639928.39, y: 485161.45, z: 86.38 },
      classification: 2,
    }))
    v.dispose()
  })

  it('sends display settings and the render budget together', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    // dispose() rejects anything still pending; swallow it rather than
    // leaving an unhandled rejection that fails an unrelated test file.
    v.setPointCloudDisplay({ colorMode: 'classification', pointSize: 4 }, 2_000_000).catch(() => {})
    await tick()
    expect(postsOfType(post, 'ifcviewer:pointcloud-display')[0]).toMatchObject({
      display: { colorMode: 'classification', pointSize: 4 },
      renderBudget: 2_000_000,
    })
    v.dispose()
  })

  it('arms inspect by default and can disarm it', async () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE })
    const post = spyPost(v)
    emitFromIframe(v, { type: 'ready' })

    // dispose() rejects anything still pending; swallow it rather than
    // leaving an unhandled rejection that fails an unrelated test file.
    v.inspectPointCloud().catch(() => {})
    // dispose() rejects anything still pending; swallow it rather than
    // leaving an unhandled rejection that fails an unrelated test file.
    v.inspectPointCloud(false).catch(() => {})
    await tick()
    const sent = postsOfType(post, 'ifcviewer:inspect-pointcloud')
    expect(sent[0].inspect).toBe(true)
    expect(sent[1].inspect).toBe(false)
    v.dispose()
  })
})
