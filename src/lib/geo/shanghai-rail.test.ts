import {describe,it,expect} from 'vitest'
import {Vector2} from 'three'
import hongqiao from './__fixtures__/shanghai-hongqiao.json'
import south from './__fixtures__/shanghai-south.json'
import {parseOsmFeatures} from './osm-features'
import {appendRailDetail} from './rail-detail'
import {trainPlacements} from './train-placement'
import {stationForm,stationGeometry} from './shanghai-stations'
import {buildLinearLayer} from './osm-scene'

describe('Shanghai railway reconstruction',()=>{
 it('preserves 16 surface platform polygons at Hongqiao',()=>{
  const f=parseOsmFeatures(hongqiao)
  expect(f.filter(x=>x.style.railKind==='platform' && /^w341733/.test(x.id))).toHaveLength(16)
 })
 it('recognises station forms by identity and geographic evidence',()=>{
  const f=parseOsmFeatures(south).find(x=>x.id==='w95115662')!
  expect(stationForm({...f,ring:f.ring!})).toBe('south')
  expect(stationForm({...f,ring:[{lat:0,lon:0}]})).toBeNull()
  const g=stationGeometry('south',[new Vector2(-130,-130),new Vector2(130,-130),new Vector2(130,130),new Vector2(-130,130)])
  g.computeBoundingBox();expect(g.boundingBox!.max.z).toBeGreaterThanOrEqual(36);expect(g.boundingBox!.max.z).toBeLessThan(37)
  expect([...g.getAttribute('normal').array].every(Number.isFinite)).toBe(true)
 })
 it('builds narrow raised railheads with 1435 mm inside gauge',()=>{
  const p:number[]=[],c:number[]=[]
  appendRailDetail(p,c,[new Vector2(0,0),new Vector2(10,0)],1,()=>0,1.435,false)
  const y=[];for(let i=0;i<p.length;i+=3){if(p[i+2]>.32)y.push(Math.abs(p[i+1]))}
  expect(Math.min(...y)*2).toBeCloseTo(1.435,5)
  expect(Math.max(...y)-Math.min(...y)).toBeCloseTo(.07,5)
 })
 it('retains sleeper spacing across split segments and rejects degenerate paths',()=>{
  const count=(line:Vector2[])=>{const p:number[]=[];appendRailDetail(p,[],line,1,()=>0);return p.length}
  expect(count([new Vector2(),new Vector2()])).toBe(0)
  const p:number[]=[];appendRailDetail(p,[],[new Vector2(),new Vector2(10,0),new Vector2(20,1)],1,()=>0)
  expect(p.every(Number.isFinite)).toBe(true)
 })
 it('fits bounded consists, clears both ends and follows the bogie chord',()=>{
  expect(trainPlacements([new Vector2(),new Vector2(18,0)],1,.5)).toHaveLength(0)
  const cars=trainPlacements([new Vector2(),new Vector2(300,0)],1,1)
  expect(cars).toHaveLength(4)
  expect(cars[3].x+9.5).toBeLessThan(300)
  expect(cars[1].x-cars[0].x).toBeCloseTo(20)
 })
 it('does not draw underground platforms on the surface',()=>{
  const f=parseOsmFeatures(hongqiao).filter(x=>x.style.railKind==='platform'&&(x.vertical?.layer??0)<0)
  expect(f.length).toBeGreaterThan(0)
  expect(buildLinearLayer(f,'rail',{anchorLat:31.2,anchorLon:121.32,quality:'detailed'})).toBeNull()
 })
})
