import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { guessIcon, autoRules, resolveSymbol, singleSymbology, categoryFields, type Symbology } from './symbology'
import { flattenProperties, inferSchema } from '../twin/flatten-props'
import { buildVectorLayer, featureOfHit, DEFAULT_STYLE } from './vector-mesh'
import { parseGeoJson, projectLayer } from './geojson'
import { anchorFromPlacement } from '../geo/scene-anchor'
import { useTwinLinkStore, linksOf } from '../../stores/twinLinkStore'

describe('guessIcon', () => {
  it('reads what a value depicts, in several languages', () => {
    expect(guessIcon('Subestación eléctrica Les Corts')).toBe('power')
    expect(guessIcon('Sortida d’emergència')).toBe('exit')
    expect(guessIcon('Estació de Sants')).toBe('train')
    expect(guessIcon('Metro L3')).toBe('metro')
    expect(guessIcon('Notausgang')).toBe('exit')
    expect(guessIcon('CCTV-12')).toBe('camera')
    expect(guessIcon('random')).toBeNull()
  })
})

const rows = [
  { kind: 'station', name: 'Sants' },
  { kind: 'substation', name: 'SE Les Corts' },
  { kind: 'exit', name: 'Exit A' },
  { kind: 'exit', name: 'Exit B' },
  { kind: 'station', name: 'Clot' },
  { kind: 'station', name: 'Glòries' },
].map((p) => flattenProperties(p))

describe('autoRules / resolveSymbol', () => {
  const base = singleSymbology('#ff7a1a').fallback

  it('one rule per value, most frequent first, with a guessed icon', () => {
    const rules = autoRules(rows, 'kind', base)
    expect(rules.map((r) => r.value)).toEqual(['station', 'exit', 'substation'])
    expect(rules.map((r) => (r.symbol.kind === 'icon' ? r.symbol.icon : r.symbol.kind))).toEqual(['train', 'exit', 'power'])
    expect(new Set(rules.map((r) => r.color)).size).toBe(3)
  })

  it('resolves per feature, case-insensitively, hides unticked values and falls back', () => {
    const rules = autoRules(rows, 'kind', base)
    rules[1].visible = false // exits hidden
    const sym: Symbology = { field: 'kind', rules, fallback: { ...base, visible: true } }
    expect(resolveSymbol(flattenProperties({ kind: 'STATION' }), sym)?.ruleIndex).toBe(0)
    expect(resolveSymbol(flattenProperties({ kind: 'exit' }), sym)).toBeNull()
    expect(resolveSymbol(flattenProperties({ kind: 'depot' }), sym)?.ruleIndex).toBe(-1)
    expect(resolveSymbol(flattenProperties({}), sym)?.color).toBe(base.color)
  })

  it('offers category fields, not ids or measures', () => {
    const fields = categoryFields(inferSchema(rows)).map((f) => f.field)
    expect(fields[0]).toBe('kind')
  })
})

describe('buildVectorLayer with symbology', () => {
  const anchor = anchorFromPlacement(
    { lat: 41.38, lon: 2.17, rotationDeg: 0, heightOffsetM: 0, source: 'manual', confidence: 'high' }, { x: 0, z: 0 }, 0, 't')
  const parsed = parseGeoJson({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { kind: 'station' }, geometry: { type: 'Point', coordinates: [2.17, 41.38] } },
      { type: 'Feature', properties: { kind: 'substation' }, geometry: { type: 'Point', coordinates: [2.171, 41.38] } },
      { type: 'Feature', properties: { kind: 'exit' }, geometry: { type: 'Point', coordinates: [2.172, 41.38] } },
    ],
  })
  if (!parsed.ok) throw parsed.error
  const features = projectLayer(parsed.value, anchor, 'relative')

  it('draws each rule its own way and keeps picking by feature', () => {
    const template = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial())
    const built = buildVectorLayer({
      features, style: DEFAULT_STYLE, heightMode: 'relative', anchorY: 0, ground: () => 0,
      symbols: [
        { color: '#2fb7ff', symbol: { kind: 'icon', icon: 'train' }, sizeM: 6 },
        { color: '#ffd23f', symbol: { kind: 'model', assetId: 'sub' }, sizeM: 8 },
        null, // hidden by its rule
      ],
      assets: new Map([['sub', template]]),
      iconTexture: () => null, // headless: icons fall back to pins
    })
    expect(built.stats.points).toBe(2)
    // Two point groups (icon, model), each a zoom-aware holder.
    expect(built.group.children.filter((c) => c.name === 'vector-points-lod').length).toBe(2)
    let model: THREE.Object3D | null = null
    built.group.traverse((o) => { if (o.userData.sharedAsset && !model) model = o })
    expect(model).not.toBeNull()
    // The model is scaled so its largest side is sizeM and stands on the ground.
    const box = new THREE.Box3().setFromObject(model!)
    expect(box.max.y - box.min.y).toBeCloseTo(8, 3)
    expect(box.min.y).toBeCloseTo(0, 3)
    // Picking a model mesh resolves to feature 1.
    expect(featureOfHit({ object: model! } as unknown as THREE.Intersection)).toBe(1)
    // Bounds include the standing model's height.
    expect(built.bounds.max.y).toBeGreaterThanOrEqual(8 - 1e-6)
  })
})

describe('twinLinkStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useTwinLinkStore.setState({ links: [], linking: null })
  })

  it('links two entities once, in either direction, and persists them', () => {
    const a = { source: 'vector', key: 'vector::devices::DEV-1', label: 'Gate 3' }
    const b = { source: 'ifc', key: 'ifc::2O2Fr$t4X7Zf8NOew3FLOH', label: 'IfcDoor' }
    const s = useTwinLinkStore.getState()
    s.startLinking(a)
    s.addLink(a, b)
    s.addLink(b, a) // duplicate, reversed
    s.addUrl(a, 'https://example.org/sheet', 'Datasheet')
    const links = useTwinLinkStore.getState().links
    expect(links).toHaveLength(2)
    expect(useTwinLinkStore.getState().linking).toBeNull()
    expect(linksOf(links, b.key)).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('ifc-twin-links:v1')!).links).toHaveLength(2)
  })
})
