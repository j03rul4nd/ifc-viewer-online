import { describe, it, expect } from 'vitest'
import { buildSurfaceLayer, disposeLayer } from './osm-scene'
import { parseOsmFeatures, type OsmFeature } from './osm-features'
import { latLonToNormalized, metresToNormalized } from './geo-math'
import { buildShanghaiParkDetails } from './shanghai-parks'
import yuyuan from './__fixtures__/shanghai-yuyuan.json'
import jingan from './__fixtures__/shanghai-jingan.json'
const lat=31.24,lon=121.5,unit=metresToNormalized(lat),origin=latLonToNormalized(lat,lon)
const point=(x:number,y:number)=>({lat:lat+y/111320,lon:lon+x/(111320*Math.cos(lat*Math.PI/180))})
const ring=(a:number,b:number)=>[point(a,a),point(b,a),point(b,b),point(a,b)]
const feature:OsmFeature={id:'park',kind:'green',height:{heightM:0,minHeightM:0,estimated:false},ring:ring(0,100),holes:[ring(20,80)],style:{roofShape:'flat',roofHeightM:0,cover:'park'}}
describe('park topology and Shanghai references',()=>{
  for(const quality of ['simple','detailed'] as const)for(const kind of ['green','water'] as const)it(`${quality} ${kind} leaves mapped holes empty`,()=>{
    const result=buildSurfaceLayer([{...feature,kind}],kind,{anchorLat:lat,anchorLon:lon,quality})!
    const g=result.object.geometry,p=g.getAttribute('position'),idx=g.index
    const n=idx?.count??p.count
    for(let i=0;i<n;i+=3){
      const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k)
      const x=(ids.reduce((s,j)=>s+p.getX(j),0)/3-origin.nx)/unit
      const y=(ids.reduce((s,j)=>s+p.getY(j),0)/3-origin.ny)/unit
      expect(x>22&&x<78&&y>22&&y<78).toBe(false)
    }
    disposeLayer(result.object)
  })
  it('does not decorate a park covered by a mapped paved square',()=>{
    const plaza:OsmFeature={...feature,id:'plaza',kind:'road',holes:undefined,style:{roofShape:'flat',roofHeightM:0,roadClass:'pedestrian'}}
    const result=buildShanghaiParkDetails([feature,plaza],{anchorLat:lat,anchorLon:lon,quality:'detailed',scenery:true,waterElevation:()=>0})!
    expect(result.green.children).toHaveLength(0)
    expect(result.scenery.children).toHaveLength(0)
  })
  it('preserves Yuyuan mansards and does not extrude the entire Jing’an religious site',()=>{
    const yu=parseOsmFeatures(yuyuan),ji=parseOsmFeatures(jingan)
    expect(yu.filter(f=>f.kind==='building'&&f.style.roofShape==='mansard').length).toBeGreaterThan(10)
    expect(yu.find(f=>f.id==='w228035340')?.style.roofShape).toBe('gabled')
    expect(ji.find(f=>f.id==='w13981430')?.kind).not.toBe('building')
    expect(ji.find(f=>f.id==='w1246090668')?.kind).toBe('building')
  })
})
