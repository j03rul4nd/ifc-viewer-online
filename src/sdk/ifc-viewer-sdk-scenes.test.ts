// SDK 1.17: scenes (scene option, openScene, exportScene) and data layers.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IfcViewer, packScene, type SceneDocument } from './ifc-viewer-sdk'
import { decodeSceneLink, sceneLinkValue } from '../lib/scene-doc/scene-link'

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

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

type PostSpy = ReturnType<typeof spyPost>
const posted = (post: PostSpy): Array<Record<string, unknown>> => post.mock.calls.map((c) => c[0] as Record<string, unknown>)
const lastPosted = (post: PostSpy): Record<string, unknown> => posted(post)[posted(post).length - 1]

/** Answer the last query the SDK posted, as the viewer would. */
function answer(v: IfcViewer, post: PostSpy, data: unknown): Record<string, unknown> {
  const msg = lastPosted(post)
  emitFromIframe(v, { type: 'result', requestId: msg.requestId, ok: true, data })
  return msg
}

const DOC: SceneDocument = {
  format: 'ifc-viewer-scene', v: 1,
  meta: { title: 'Demo' },
  models: [{ url: '/models/a.ifc' }],
  layers: [{ preset: 'bicing' }],
  twin: null,
  view: { map: 'terrain' },
}

async function readyViewer(opts: ConstructorParameters<typeof IfcViewer>[1] = {}): Promise<{ v: IfcViewer; post: PostSpy }> {
  const v = new IfcViewer('#mount', { baseUrl: BASE, ...opts })
  const post = spyPost(v)
  emitFromIframe(v, { type: 'ready' })
  await v.whenReady()
  return { v, post }
}

describe('IfcViewer — scenes (1.17)', () => {
  beforeEach(mount)

  it('passes a scene through as ?scene=', () => {
    const v = new IfcViewer('#mount', { baseUrl: BASE, scene: 'https://h/demo.scene.json' })
    expect(new URL(v.iframe.src).searchParams.get('scene')).toBe('https://h/demo.scene.json')
    v.dispose()
  })

  it('packs a scene document the way the viewer unpacks it', async () => {
    const packed = await packScene(DOC)
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(JSON.parse(await decodeSceneLink(packed!))).toEqual(DOC)
  })

  it('refuses to pack a scene longer than a link', async () => {
    expect(await packScene(DOC, 10)).toBeNull()
  })

  it('openScene(url) reloads the frame on the scene, rejects waiting calls and resolves on the next ready', async () => {
    const { v } = await readyViewer({ ui: 'client' })
    const waiting = v.getLayers()
    const opened = v.openScene('https://h/other.scene.json')
    await expect(waiting).rejects.toThrow(/another scene/)
    expect(v.isReady).toBe(false)
    const u = new URL(v.iframe.src)
    expect(u.searchParams.get('scene')).toBe('https://h/other.scene.json')
    expect(u.searchParams.get('ui')).toBe('client')   // the other options stay
    let done = false
    void opened.then(() => { done = true })
    await tick()
    expect(done).toBe(false)
    emitFromIframe(v, { type: 'ready' })
    await opened
    expect(v.isReady).toBe(true)
    v.dispose()
  })

  it('openScene(document) carries it in the fragment, without a ?scene= URL', async () => {
    const { v } = await readyViewer({ scene: 'https://h/first.scene.json' })
    const opened = v.openScene(DOC)
    await vi.waitFor(() => expect(v.iframe.src).toContain('#scene='))
    const u = new URL(v.iframe.src)
    expect(u.searchParams.get('scene')).toBeNull()
    const value = sceneLinkValue(u.hash)
    expect(JSON.parse(await decodeSceneLink(value!))).toEqual(DOC)
    emitFromIframe(v, { type: 'ready' })
    await opened
    v.dispose()
  })

  it('openScene goes through a blank page when only the #fragment would change (browsers would not reload)', async () => {
    const { v } = await readyViewer()
    const first = v.openScene(DOC)
    await vi.waitFor(() => expect(v.iframe.src).toContain('#scene='))
    emitFromIframe(v, { type: 'ready' })
    await first
    const firstSrc = v.iframe.src
    // Record what the frame is pointed at, in order.
    const sets: string[] = []
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')!
    Object.defineProperty(v.iframe, 'src', {
      configurable: true,
      get() { return desc.get!.call(this) },
      set(x: string) { sets.push(x); desc.set!.call(this, x) },
    })
    const second = v.openScene({ ...DOC, meta: { title: 'Another' } })
    await vi.waitFor(() => expect(sets[0]).toBe('about:blank'))
    // jsdom may already have fired the blank page's load; fire it in case not.
    if (sets.length === 1) v.iframe.dispatchEvent(new Event('load'))
    expect(sets).toHaveLength(2)
    expect(sets[1]).toContain('#scene=')
    expect(sets[1]).not.toBe(firstSrc)
    emitFromIframe(v, { type: 'ready' })
    await second
    v.dispose()
  })

  it('openScene rejects what is not a scene document', async () => {
    const { v } = await readyViewer()
    await expect(v.openScene({ format: 'nope' } as unknown as SceneDocument)).rejects.toThrow(/not a scene document/)
    await expect(v.openScene('  ')).rejects.toThrow(/empty URL/)
    v.dispose()
  })

  it('exportScene asks the viewer for the scene with the given options', async () => {
    const { v, post } = await readyViewer()
    const p = v.exportScene({ title: 'Plaça', camera: false })
    await tick()
    const result = { scene: DOC, sources: [], link: 'https://app.test/#scene=abc', skippedModels: 1, secretsRemoved: 0 }
    const msg = answer(v, post, result)
    expect(msg.type).toBe('ifcviewer:get-scene')
    expect(msg.title).toBe('Plaça')
    expect(msg.camera).toBe(false)
    await expect(p).resolves.toEqual(result)
    v.dispose()
  })
})

describe('IfcViewer — data layers and twin (1.17)', () => {
  beforeEach(mount)

  it('sends each layer command with its arguments', async () => {
    const { v, post } = await readyViewer()
    const calls: Array<[() => Promise<unknown>, string, Record<string, unknown>]> = [
      [() => v.getLayerPresets(), 'ifcviewer:get-layer-presets', {}],
      [() => v.addLayer({ preset: 'bicing' }), 'ifcviewer:add-layer', { layer: { preset: 'bicing' } }],
      [() => v.addLayer({ url: 'https://h/x.geojson', live: 60 }), 'ifcviewer:add-layer', { layer: { url: 'https://h/x.geojson', live: 60 } }],
      [() => v.getLayers(), 'ifcviewer:get-layers', {}],
      [() => v.setLayerVisible('L1', false), 'ifcviewer:layer-visible', { id: 'L1', visible: false }],
      [() => v.frameLayer('L1'), 'ifcviewer:frame-layer', { id: 'L1' }],
      [() => v.removeLayer('L1'), 'ifcviewer:remove-layer', { id: 'L1' }],
      [() => v.getTwin(), 'ifcviewer:get-twin', {}],
    ]
    for (const [call, type, args] of calls) {
      const p = call()
      await tick()
      const msg = answer(v, post, null)
      expect(msg.type).toBe(type)
      expect(msg).toMatchObject(args)
      await p
    }
    v.dispose()
  })

  it('surfaces a viewer error as a rejection', async () => {
    const { v, post } = await readyViewer()
    const p = v.addLayer({ preset: 'nope' })
    await tick()
    emitFromIframe(v, { type: 'result', requestId: lastPosted(post).requestId, ok: false, error: 'Unknown preset "nope"' })
    await expect(p).rejects.toThrow(/Unknown preset/)
    v.dispose()
  })

  it('emits layer-feature-picked and alert without the message envelope', async () => {
    const { v } = await readyViewer()
    const picked = vi.fn()
    const alert = vi.fn()
    v.on('layer-feature-picked', picked)
    v.on('alert', alert)
    emitFromIframe(v, { type: 'layer-feature-picked', layerId: 'L1', layer: 'Bicing', featureIndex: 3, featureId: '65', geometry: 'point', lonLat: [2.17, 41.39], properties: { bikes: 3 } })
    emitFromIframe(v, { type: 'alert', at: 1, kind: 'start', from: 'twin', id: 'b1', name: 'Docks', ruleId: 'r', rule: 'Empty', count: 21, sample: ['65'] })
    expect(picked).toHaveBeenCalledWith({ layerId: 'L1', layer: 'Bicing', featureIndex: 3, featureId: '65', geometry: 'point', lonLat: [2.17, 41.39], properties: { bikes: 3 } })
    expect(alert.mock.calls[0][0]).toEqual({ at: 1, kind: 'start', from: 'twin', id: 'b1', name: 'Docks', ruleId: 'r', rule: 'Empty', count: 21, sample: ['65'] })
    v.dispose()
  })
})
