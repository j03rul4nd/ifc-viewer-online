import { describe, it, expect } from 'vitest'
import { Mesh } from 'three'
import { buildBuildingsGeometry, type BuildingLike } from './building-mesh'
import { parseOsmFeatures, buildFeaturesQuery } from './osm-features'
import { buildLinearLayer } from './osm-scene'
import { metresToNormalized } from './geo-math'
import { roofPropAnchors } from './roof-props'

const lat=31.24,lon=121.50,unit=metresToNormalized(lat)
const point=(x:number,y:number)=>({lat:lat+y/111320,lon:lon+x/(111320*Math.cos(lat*Math.PI/180))})
const ring=(a:number,b:number)=>[point(a,a),point(b,a),point(b,b),point(a,b)]
const opts={anchorLat:lat,anchorLon:lon,localOrigin:true,detail:'detailed' as const,lit:true}
const building:BuildingLike={id:'test',ring:ring(0,20),height:{heightM:12,minHeightM:0,estimated:false},style:{roofShape:'flat',roofHeightM:0,roofTagged:true,use:'apartments'}}
function roofArea(b:BuildingLike):number {
  const g=buildBuildingsGeometry([b],opts)!.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal')
  let area=0
  for(let i=0;i<p.count;i+=3) if(n.getZ(i)>.9) {
    area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getY(i+2)-p.getY(i))-(p.getY(i+1)-p.getY(i))*(p.getX(i+2)-p.getX(i)))/2/unit**2
  }
  return area
}
describe('mapped urban fabric',()=>{
  it('leaves courtyard roofs open and builds inward-facing walls',()=>{
    const b={...building,holes:[ring(6,14)]}
    expect(roofArea(b)/roofArea(building)).toBeCloseTo((400-64)/400,4)
    const g=buildBuildingsGeometry([b],opts)!.geometry
    expect([...g.getAttribute('position').array].every(Number.isFinite)).toBe(true)
  })
  it('keeps the stated clearance below suspended building parts',()=>{
    const g=buildBuildingsGeometry([{...building,height:{...building.height,minHeightM:8}}],opts)!.geometry
    g.computeBoundingBox();expect(g.boundingBox!.min.z/unit).toBeCloseTo(8,4)
  })
  it('does not place rooftop equipment over a mapped courtyard',()=>{
    const b={...building,style:{...building.style!,use:'tower' as const}}
    expect(roofPropAnchors([b],opts).length).toBeGreaterThan(0)
    expect(roofPropAnchors([{...b,holes:[ring(.1,19.9)]}],opts)).toHaveLength(0)
  })
  it('retains centimetre precision at Shanghai longitude and typological facade variation',()=>{
    const built=buildBuildingsGeometry([building],opts)!,p=built.geometry.getAttribute('position')
    expect(built.origin).toBeDefined()
    let max=0;for(let i=0;i<p.count;i++)max=Math.max(max,Math.abs(p.getX(i)))
    expect(max/unit).toBeCloseTo(20,2)
    const office=buildBuildingsGeometry([{...building,style:{...building.style!,use:'tower'}}],opts)!
    expect(p.count).toBeGreaterThan(office.geometry.getAttribute('position').count)
    const glass=buildBuildingsGeometry([{...building,style:{...building.style!,wallMaterial:'glass'}}],opts)!
    expect(glass.geometry.getAttribute('position').count).toBe(office.geometry.getAttribute('position').count)
    const distant=buildBuildingsGeometry([building],{...opts,anchorLon:lon+.02})!
    expect(distant.geometry.getAttribute('position').count).toBeLessThan(p.count)
  })
  it('loads exact pavement polygons including holes instead of making perimeter ribbons',()=>{
    const closed=(r:ReturnType<typeof ring>)=>[...r,r[0]]
    const features=parseOsmFeatures({elements:[{type:'relation',id:123,tags:{type:'multipolygon','area:highway':'footway',surface:'paving_stones'},members:[
      {type:'way',ref:1,role:'outer',geometry:closed(ring(0,20))},
      {type:'way',ref:2,role:'inner',geometry:closed(ring(6,14))},
    ]}]})
    expect(features).toHaveLength(1);expect(features[0].widthM).toBeUndefined()
    expect(features[0].style.roadClass).toBe('pedestrian');expect(features[0].holes).toHaveLength(1)
    const layer=buildLinearLayer(features,'road',{...opts,quality:'detailed'})!
    let area=0
    layer.object.traverse(o=>{
      const g=(o as Mesh).geometry;if(!g)return
      const p=g.getAttribute('position')
      for(let i=0;i<p.count;i+=3)area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getY(i+2)-p.getY(i))-(p.getY(i+1)-p.getY(i))*(p.getX(i+2)-p.getX(i)))/2/unit**2
    })
    expect(area).toBeCloseTo(336,1)
    expect(buildFeaturesQuery({south:31.23,west:121.49,north:31.25,east:121.51})).toContain('["area:highway"]')
  })
})
