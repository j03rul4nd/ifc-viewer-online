import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import fixture from './__fixtures__/shanghai-parks.json'
import { parseOsmFeatures } from './osm-features'
import { shanghaiBridgeWidth } from './shanghai-bridges'
import { solveSceneVertical, buildLinearLayer } from './osm-scene'
import { metresToNormalized } from './geo-math'
import { appendBridgeRailing } from './bridge-railing'

describe('Lujiazui reference reconstruction', () => {
  it('widens only the identified Mingzhu ring, preserving explicit widths', () => {
    const features = parseOsmFeatures(fixture)
    expect(features.find(f => f.id === 'w48876367')?.widthM).toBe(8.5)
    const points = [{lat:31.2402,lon:121.4955}]
    expect(shanghaiBridgeWidth(48876367,{highway:'footway',bridge:'yes',width:'10'},points)).toBeUndefined()
    expect(shanghaiBridgeWidth(99,{highway:'footway',bridge:'yes'},points)).toBeUndefined()
    expect(shanghaiBridgeWidth(48876367,{highway:'footway',bridge:'yes'},[{lat:41,lon:2}])).toBeUndefined()
  })
  it('keeps the real closed ring level without a seam ramp or tunnel-induced extra floors', () => {
    const profiles = solveSceneVertical(parseOsmFeatures(fixture), {anchorLat:31.24,anchorLon:121.496,quality:'detailed'})
    const ring = profiles.get('w48876367')!
    expect(ring).toBeDefined()
    expect(Math.max(...ring.elevationM)-Math.min(...ring.elevationM)).toBeLessThan(.01)
    expect(Math.max(...ring.elevationM)).toBeLessThan(10)
    expect(Math.min(...ring.elevationM)).toBeGreaterThan(8)
    for (const id of ['w104439072','w104439075']) {
      expect(profiles.get(id)!.elevationM[0]).toBeCloseTo(9, 4)
    }
  })
  it('builds finite, open rail geometry at full handrail height', () => {
    const p:number[]=[], c:number[]=[]
    appendBridgeRailing(p,c,new THREE.Vector3(0,0,9),new THREE.Vector3(8,0,10),1,[.7,.7,.7])
    expect(p.every(Number.isFinite)).toBe(true)
    expect(p.length).toBe(c.length)
    expect(Math.max(...p.filter((_,i)=>i%3===2))).toBeCloseTo(11.1)
    expect(p.length / 9).toBeLessThan(150)
  })
  it('preserves centimetre handrails in the actual GPU mesh at Shanghai longitude', () => {
    const features = parseOsmFeatures(fixture).filter(f=>f.id==='w48876367')
    const opts = {anchorLat:31.24,anchorLon:121.496,quality:'detailed' as const}
    const layer = buildLinearLayer(features,'road',{...opts,vertical:solveSceneVertical(features,opts)})!
    const unit=metresToNormalized(opts.anchorLat)
    let railTriangles=0, collapsed=0
    layer.object.traverse(obj=>{
      const p=(obj as THREE.Mesh).geometry?.getAttribute('position')
      if(!p) return
      for(let i=0;i<p.count;i+=3){
        if(p.getZ(i)/unit<10.2 || p.getZ(i+1)/unit<10.2 || p.getZ(i+2)/unit<10.2) continue
        const a=new THREE.Vector3().fromBufferAttribute(p,i).divideScalar(unit)
        const b=new THREE.Vector3().fromBufferAttribute(p,i+1).divideScalar(unit)
        const c=new THREE.Vector3().fromBufferAttribute(p,i+2).divideScalar(unit)
        railTriangles++
        if(b.sub(a).cross(c.sub(a)).length()<1e-6) collapsed++
      }
    })
    expect(railTriangles).toBeGreaterThan(100)
    expect(collapsed/railTriangles).toBeLessThan(.01)
  })
})
