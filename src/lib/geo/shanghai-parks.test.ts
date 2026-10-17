import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import fixture from './__fixtures__/shanghai-parks.json'
import { parseOsmFeatures, buildFeaturesQuery } from './osm-features'
import { buildShanghaiParkDetails, PARK_DETAIL_BUDGET, hedgeAlong, HEDGE_TALL, HEDGE_LOW, inside, type Hedge } from './shanghai-parks'
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
  it('edges the parks and their paths in clipped hedge, and the lakes in stone',()=>{
    const result=buildShanghaiParkDetails(features,opts)!
    expect(result.counts.hedge).toBeGreaterThan(20)
    expect(result.green.getObjectByName('shanghai-hedges')).toBeTruthy()
    expect(result.water.getObjectByName('mapped-lake-revetment')).toBeTruthy()
    for(const g of [result.water,result.green,result.scenery])disposeLayer(g)
  })
})

describe('hedgeAlong',()=>{
  const square=[{x:0,y:0},{x:60,y:0},{x:60,y:60},{x:0,y:60}]
  it('runs inside a ring whichever way it winds, with openings',()=>{
    for(const ring of [square,[...square].reverse()]){
      const out:Hedge[]=[]
      hedgeAlong(ring,true,2,'r',()=>true,HEDGE_TALL,out)
      expect(out.length).toBeGreaterThan(8)
      for(const h of out){expect(inside(h.a,ring)).toBe(true);expect(inside(h.b,ring)).toBe(true)}
      const total=out.reduce((s,h)=>s+Math.hypot(h.b.x-h.a.x,h.b.y-h.a.y),0)
      expect(total).toBeLessThan(4*60*.9)
    }
  })
  it('breaks where the ground is taken, and edges both sides of a path',()=>{
    const out:Hedge[]=[]
    const path=[{x:0,y:0},{x:80,y:0}]
    for(const side of [1,-1])hedgeAlong(path,false,1.6*side,'p',p=>p.x<30||p.x>40,HEDGE_LOW,out)
    expect(out.some(h=>h.a.y>0)).toBe(true)
    expect(out.some(h=>h.a.y<0)).toBe(true)
    for(const h of out)expect(Math.min(h.a.x,h.b.x)>=40-1||Math.max(h.a.x,h.b.x)<=30+1).toBe(true)
  })
})
