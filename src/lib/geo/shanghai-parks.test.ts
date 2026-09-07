import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import fixture from './__fixtures__/shanghai-parks.json'
import { parseOsmFeatures, buildFeaturesQuery } from './osm-features'
import { buildShanghaiParkDetails, PARK_DETAIL_BUDGET } from './shanghai-parks'
import { SHANGHAI_PARK_ASSETS } from './props-assets'
import { metresToNormalized } from './geo-math'
import { disposeLayer } from './osm-scene'

const features=parseOsmFeatures(fixture)
const opts={anchorLat:31.239,anchorLon:121.499,quality:'detailed' as const,
  assets:new Map(SHANGHAI_PARK_ASSETS.map(n=>[`shanghai/${n}`,new THREE.BoxGeometry(1,1,1)])),
  waterElevation:()=>.15*metresToNormalized(31.239)}
describe('Shanghai mapped parks',()=>{
  it('retains all nine point fountains and the mapped basin; does not turn lakes into fountains',()=>{
    const fountains=features.filter(f=>f.style.waterKind==='fountain')
    expect(fountains.filter(f=>f.point)).toHaveLength(9)
    expect(fountains.filter(f=>f.ring)).toHaveLength(1)
    expect(features.find(f=>f.id==='w40779542')?.name).toBe('陆家嘴绿地')
    expect(buildFeaturesQuery({south:31.23,west:121.49,north:31.25,east:121.51})).toContain('"amenity"="fountain"')
  })
  it('adds no regional objects in Barcelona or simple mode',()=>{
    expect(buildShanghaiParkDetails(features,{...opts,anchorLat:41.38,anchorLon:2.17})).toBeNull()
    expect(buildShanghaiParkDetails(features,{...opts,quality:'simple'})).toBeNull()
  })
  it('keeps mesh budgets and maps fountains even when decorative scenery is off',()=>{
    const result=buildShanghaiParkDetails(features,opts)!
    expect(result.counts['reed']).toBeGreaterThan(0)
    expect(result.counts['shrub']).toBeGreaterThan(0)
    expect(result.counts['fountain-jets']).toBeGreaterThan(0)
    expect(result.scenery.children).toHaveLength(0)
    expect(Object.values(result.counts).reduce((s,n)=>s+n,0)).toBeLessThanOrEqual(PARK_DETAIL_BUDGET)
    for(const group of [result.water,result.green,result.scenery]){
      group.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)expect(Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)})
      disposeLayer(group)
    }
  })
  it('respects the IFC footprint for planting and furniture, and never adds jets to untagged water',()=>{
    const result=buildShanghaiParkDetails(features.filter(f=>f.style.waterKind!=='fountain'),{...opts,scenery:true,excludeAt:()=>true})!
    expect(Object.values(result.counts).reduce((s,n)=>s+n,0)).toBe(0)
    for(const g of [result.water,result.green,result.scenery])disposeLayer(g)
  })
  it('rebuilds deterministically and falls back if the optional GLBs cannot load',()=>{
    const a=buildShanghaiParkDetails(features,opts)!,b=buildShanghaiParkDetails([...features].reverse(),opts)!
    expect(a.counts).toEqual(b.counts)
    const fallback=buildShanghaiParkDetails(features,{...opts,assets:null})!
    expect(fallback.green.children.length).toBeGreaterThan(0)
    for(const r of [a,b,fallback])for(const g of [r.water,r.green,r.scenery])disposeLayer(g)
  })
})
