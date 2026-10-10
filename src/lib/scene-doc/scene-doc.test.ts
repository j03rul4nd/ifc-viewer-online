import { describe, it, expect, afterEach } from 'vitest'
import {
  validateSceneDoc, parseSceneDoc, sceneToQuery, sceneSources, buildSceneDoc, isSceneDoc, SCENE_FORMAT,
} from './scene-doc'
import { encodeSceneLink, decodeSceneLink, sceneLinkValue, MAX_LINK_CHARS } from './scene-link'
import { backgroundToSpec, mapToSpec, portableModelUrl, roundVec } from './scene-capture'
import { bootScene, bootedScene, sceneBootFailure, resetSceneBoot, hasSceneInLocation } from './scene-boot'
import { parseAppUrlParams, setSceneParams } from '../url-params'
import { parseBackgroundSpec, settingsFromPreset } from '../scene/background'

const LAYER = {
  name: 'Bicing', visible: true, attribution: 'Bicing · Ajuntament de Barcelona',
  source: { type: 'url', url: 'https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json', format: 'geojson' },
  feed: { kind: 'gbfs', url: 'https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json', radiusM: 30000 },
  live: { enabled: true, intervalS: 30, animate: true, idField: null },
}

const SCENE = {
  format: SCENE_FORMAT, v: 1,
  meta: { title: 'Pl. Catalunya', notes: ['Asset values in the IFC are illustrative.'], place: { lat: 41.3874, lon: 2.1696 } },
  models: [{ url: '/models/bcn/hub.ifc', name: 'hub.ifc' }, { url: 'https://cdn.example/fountain.ifc' }],
  layers: [LAYER],
  twin: {
    sources: [{ id: 's1', name: 'Bicing status', url: 'https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/en/station_status', intervalS: 60, mapping: { listPath: 'data.stations', idField: 'station_id', timeField: 'last_reported' }, enabled: true }],
    bindings: [{ id: 'b1', name: 'Docks', sourceId: 's1', deviceId: '65', targets: [], rules: [], staleColor: null, staleAfterS: 0 }],
  },
  view: { map: 'terrain,buildings', background: 'paper', camera: { position: [10, 20, 30], target: [0, 0, 0] } },
}

describe('scene document · validation', () => {
  it('accepts a full scene and keeps every part', () => {
    const v = validateSceneDoc(SCENE)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.warnings).toEqual([])
    expect(v.doc.models).toHaveLength(2)
    expect(v.doc.layers).toHaveLength(1)
    expect(v.doc.twin?.bindings).toHaveLength(1)
    expect(v.doc.view.camera).toEqual({ position: [10, 20, 30], target: [0, 0, 0] })
  })

  it('refuses what is not a scene, a newer version, or a scene with nothing to show', () => {
    expect(validateSceneDoc({ format: 'ifc-viewer-data-layers', v: 1 }).ok).toBe(false)
    const newer = validateSceneDoc({ ...SCENE, v: 2 })
    expect(newer.ok).toBe(false)
    if (!newer.ok) expect(newer.errors[0]).toMatch(/version 2/)
    expect(validateSceneDoc({ ...SCENE, models: [], layers: [] }).ok).toBe(false)
    expect(parseSceneDoc('{not json').ok).toBe(false)
  })

  it('drops a broken part with a warning that names its path, and keeps the rest', () => {
    const v = validateSceneDoc({
      ...SCENE,
      models: [{ url: 'javascript:alert(1)' }, { url: '/ok.ifc' }],
      layers: [LAYER, { nope: true }],
      twin: { sources: SCENE.twin.sources, bindings: [...SCENE.twin.bindings, { id: 'b2', sourceId: 'ghost', deviceId: 'x', targets: [], rules: [] }] },
      view: { camera: { position: [1, 2], target: [0, 0, 0] }, map: 7 },
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.doc.models.map((m) => m.url)).toEqual(['/ok.ifc'])
    expect(v.doc.layers).toHaveLength(1)
    expect(v.doc.twin?.bindings).toHaveLength(1)
    expect(v.doc.view.camera).toBeUndefined()
    expect(v.warnings.join(' ')).toMatch(/models\[0\]\.url/)
    expect(v.warnings.join(' ')).toMatch(/layers\[1\]/)
    expect(v.warnings.join(' ')).toMatch(/view\.camera/)
    expect(v.warnings.join(' ')).toMatch(/view\.map/)
  })

  it('sniffs a scene file', () => {
    expect(isSceneDoc(JSON.stringify(SCENE, null, 2))).toBe(true)
    expect(isSceneDoc(JSON.stringify({ format: 'ifc-viewer-data-layers' }))).toBe(false)
  })
})

describe('scene document · the deep-link half', () => {
  afterEach(() => setSceneParams(null))

  it('becomes the parameters the app already reads', () => {
    const v = validateSceneDoc(SCENE)
    if (!v.ok) throw new Error('invalid')
    const q = sceneToQuery(v.doc)
    expect(q.getAll('model')).toEqual(['/models/bcn/hub.ifc', 'https://cdn.example/fountain.ifc'])
    expect(q.getAll('name')).toEqual(['hub.ifc', ''])
    expect(q.get('map')).toBe('terrain,buildings')
    expect(q.get('bg')).toBe('paper')
    expect(q.get('camera')).toBe('10,20,30,0,0,0')
    expect(q.get('view')).toBeNull()
  })

  it('merges UNDER the visitor’s own query: an explicit parameter wins', () => {
    const v = validateSceneDoc(SCENE)
    if (!v.ok) throw new Error('invalid')
    setSceneParams(sceneToQuery(v.doc))
    // parseAppUrlParams() reads window.location.search; jsdom's is empty here.
    const p = parseAppUrlParams()
    expect(p.modelUrls).toEqual(['/models/bcn/hub.ifc', 'https://cdn.example/fountain.ifc'])
    expect(p.map).toMatchObject({ enabled: true, terrain: true, buildings: true })
    expect(p.camera).toEqual({ position: [10, 20, 30], target: [0, 0, 0] })
    // An explicit string is parsed as given, never merged.
    expect(parseAppUrlParams('?bg=white').background?.preset).toBe('white')
  })

  it('carries the mapped features a scene hides, as ?hide= (only with the map)', () => {
    const v = validateSceneDoc({ ...SCENE, view: { ...SCENE.view, hide: ['w260395476', 'r12', 'not-an-id', 7] } })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.doc.view.hide).toEqual(['w260395476', 'r12'])
    expect(v.warnings.some((w) => w.startsWith('view.hide'))).toBe(true)
    expect(sceneToQuery(v.doc).get('hide')).toBe('w260395476,r12')
    const noMap = validateSceneDoc({ ...SCENE, view: { hide: ['w1'] } })
    expect(noMap.ok && sceneToQuery(noMap.doc).get('hide')).toBeNull()
    expect(parseAppUrlParams('?hide=w260395476,%20n5,x9,r').hideFeatures).toEqual(['w260395476', 'n5'])
    expect(parseAppUrlParams('').hideFeatures).toEqual([])
  })

  it('reads ?camera= on its own, and ignores a malformed one', () => {
    expect(parseAppUrlParams('?camera=1,2,3,4,5,6').camera).toEqual({ position: [1, 2, 3], target: [4, 5, 6] })
    expect(parseAppUrlParams('?camera=1,2,3').camera).toBeUndefined()
    expect(parseAppUrlParams('?camera=a,b,c,d,e,f').camera).toBeUndefined()
  })
})

describe('scene document · sources and building', () => {
  it('lists every source with its attribution, live ones flagged', () => {
    const v = validateSceneDoc(SCENE)
    if (!v.ok) throw new Error('invalid')
    const s = sceneSources(v.doc)
    expect(s.filter((x) => x.kind === 'model')).toHaveLength(2)
    const bicing = s.find((x) => x.kind === 'layer')!
    expect(bicing).toMatchObject({ name: 'Bicing', live: true, attribution: 'Bicing · Ajuntament de Barcelona' })
    expect(s.find((x) => x.kind === 'device')?.url).toMatch(/station_status/)
  })

  it('never writes device request headers, and drops an empty twin', () => {
    const doc = buildSceneDoc({
      meta: { title: 't' }, models: [{ url: '/a.ifc' }], layers: [],
      twin: { sources: [{ ...SCENE.twin.sources[0], headers: { Authorization: 'secret' } } as never], bindings: [] },
      view: {},
    })
    expect(JSON.stringify(doc)).not.toMatch(/secret|Authorization/)
    expect(buildSceneDoc({ meta: { title: 't' }, models: [{ url: '/a.ifc' }], layers: [], twin: { sources: [], bindings: [] }, view: {} }).twin).toBeNull()
  })
})

describe('scene link (#scene=)', () => {
  it('round-trips through deflate + base64url and stays small', async () => {
    const v = validateSceneDoc(SCENE)
    if (!v.ok) throw new Error('invalid')
    const packed = await encodeSceneLink(v.doc)
    expect(packed).not.toBeNull()
    expect(packed!.length).toBeLessThan(JSON.stringify(v.doc).length)
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/)
    const back = parseSceneDoc(await decodeSceneLink(packed!))
    expect(back.ok && back.doc).toEqual(v.doc)
  })

  it('refuses rather than produce a link that would break', async () => {
    const v = validateSceneDoc({ ...SCENE, layers: [{ ...LAYER, text: Array.from({ length: 30000 }, (_, i) => `${i}:${Math.sin(i)}`).join(',') }] })
    if (!v.ok) throw new Error('invalid')
    expect(await encodeSceneLink(v.doc)).toBeNull()
    expect(MAX_LINK_CHARS).toBeGreaterThan(1000)
  })

  it('finds the value in a hash', () => {
    expect(sceneLinkValue('#scene=abc_-1')).toBe('abc_-1')
    expect(sceneLinkValue('#tour=x&scene=Q9')).toBe('Q9')
    expect(sceneLinkValue('#report=x')).toBeNull()
  })
})

describe('scene boot', () => {
  afterEach(() => resetSceneBoot())

  it('boots a packed scene and contributes its parameters', async () => {
    const v = validateSceneDoc(SCENE)
    if (!v.ok) throw new Error('invalid')
    const packed = await encodeSceneLink(v.doc)
    const loc = { search: '', hash: `#scene=${packed}`, href: 'https://app.example/' }
    expect(hasSceneInLocation(loc)).toBe(true)
    const b = await bootScene(loc)
    expect(b?.doc.meta.title).toBe('Pl. Catalunya')
    expect(bootedScene()?.from).toBe('link')
    expect(parseAppUrlParams().modelUrls).toHaveLength(2)
  })

  it('a broken scene never blocks the app: it is reported instead', async () => {
    const r = await bootScene({ search: '?scene=ftp://nope', hash: '', href: 'https://app.example/' })
    expect(r).toBeNull()
    expect(sceneBootFailure()?.errors[0]).toMatch(/not an http/)
    expect(parseAppUrlParams().modelUrls).toEqual([])
  })
})

describe('scene capture', () => {
  it('writes the view back in the deep-link grammar (round trip)', () => {
    expect(backgroundToSpec(settingsFromPreset('studio'))).toBeUndefined()
    expect(backgroundToSpec(settingsFromPreset('paper'))).toBe('paper')
    const grad = parseBackgroundSpec('#dbeafe,#ffffff')!
    expect(parseBackgroundSpec(backgroundToSpec(grad)!)).toEqual(grad)
    expect(mapToSpec({ mapMode: 'off', terrainEnabled: true, buildingsEnabled: true })).toBeUndefined()
    expect(mapToSpec({ mapMode: 'on', terrainEnabled: false, buildingsEnabled: false })).toBe('1')
    expect(mapToSpec({ mapMode: 'on', terrainEnabled: true, buildingsEnabled: true, contextDetail: 'showcase' })).toBe('terrain,buildings,showcase')
  })

  it('keeps same-origin model URLs as paths, so a scene opens on any deployment', () => {
    expect(portableModelUrl('https://www.ifcvieweronline.eu/models/a.ifc?v=2', 'https://www.ifcvieweronline.eu')).toBe('/models/a.ifc?v=2')
    expect(portableModelUrl('https://cdn.example/a.ifc', 'https://www.ifcvieweronline.eu')).toBe('https://cdn.example/a.ifc')
    expect(roundVec({ x: 1.23456, y: -0.0004, z: 10 })).toEqual([1.235, -0, 10])
  })
})
