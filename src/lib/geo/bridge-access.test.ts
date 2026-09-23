import {describe,it,expect} from 'vitest'
import * as THREE from 'three'
import fixture from './__fixtures__/shanghai-parks.json'
import access from './__fixtures__/shanghai-access.json'
import {parseOsmFeatures,buildFeaturesQuery} from './osm-features'
import {solveSceneVertical,buildLinearLayer} from './osm-scene'
import {accessPoint,connectedDeck,appendAccessFlight,appendAccessElevator,railingOutsideElevators} from './bridge-access'
import {metresToNormalized} from './geo-math'
import {buildRoadNetwork} from './road-network'

const features=parseOsmFeatures({elements:[...access.elements,...fixture.elements]})
const opts={anchorLat:31.24022,anchorLon:121.49599,quality:'detailed' as const}
const unit=metresToNormalized(opts.anchorLat)
const profiles=solveSceneVertical(features,opts)

describe('mapped Shanghai vertical access',()=>{
  it('keeps steps, conveying and elevator semantics and removes duplicate query results',()=>{
    expect(features.filter(f=>f.style.accessKind==='elevator')).toHaveLength(1)
    expect(features.find(f=>f.id==='w63127625')?.style.accessKind).toBe('stairs')
    expect(features.find(f=>f.id==='w166125936')?.style.accessKind).toBe('escalator')
    expect(new Set(features.map(f=>f.id)).size).toBe(features.length)
    expect(buildFeaturesQuery({south:31.23,west:121.49,north:31.25,east:121.51})).toContain('node["highway"="elevator"]')
  })
  it('connects mapped stairs to the ring and ground without changing the ring datum',()=>{
    const ring=profiles.get('w48876367')!
    expect(Math.max(...ring.elevationM)-Math.min(...ring.elevationM)).toBeLessThan(.01)
    for(const id of ['w63127625','w104441053','w104441056','w166125933','w166125934','w166125936']){
      const p=profiles.get(id)!
      expect(p,id).toBeDefined()
      expect(p.elevationM[0],id).toBeCloseTo(9)
      expect(p.elevationM[p.elevationM.length-1],id).toBeCloseTo(0)
      expect(p.elevationM[1],id).toBe(p.elevationM[0])
      expect(p.elevationM[p.elevationM.length-2],id).toBeCloseTo(0)
    }
  })
  it('locates the elevator on a mapped shared bridge vertex, not an arbitrary nearby segment',()=>{
    const f=features.find(f=>f.id==='n4470914092')!
    const p=accessPoint(f.point!)
    expect(connectedDeck(p,features,profiles,unit)?.sourceId).toBe('w104439072')
    expect(connectedDeck(p.clone().add(new THREE.Vector2(8*unit,0)),features,profiles,unit)).toBeNull()
  })
  it('keeps the bent approach of a mapped escalator flat',()=>{
    const f=features.find(f=>f.id==='w166125933')!
    const p=profiles.get(f.id)!
    const corner=accessPoint(f.ring![1])
    const i=p.points.findIndex(v=>v.distanceTo(corner)<unit*.01)
    expect(i).toBeGreaterThan(0)
    expect(p.elevationM[i]).toBeCloseTo(0)
    expect(p.elevationM[p.elevationM.length-1]).toBeCloseTo(0)
  })
  it('leaves lift access open in the handrail without deleting the rest of it',()=>{
    const pieces=railingOutsideElevators(new THREE.Vector3(-5,0,9),new THREE.Vector3(5,0,9),[new THREE.Vector2(0,0)],1.9)
    expect(pieces).toHaveLength(2)
    expect(pieces[0][1].x).toBeCloseTo(-1.9)
    expect(pieces[1][0].x).toBeCloseTo(1.9)
    expect(pieces.flat().every(p=>p.z===9)).toBe(true)
  })
  it('keeps the paths on two floors separate at the elevator coordinate',()=>{
    const way=(id:string,z:number,points:number[][])=>({id,points:points.map(p=>new THREE.Vector2(...p)),elevations:points.map(()=>z),halfWidth:1.5,tone:[.5,.5,.5] as [number,number,number]})
    const net=buildRoadNetwork([way('ground',0,[[-30,0],[0,0],[30,0]]),way('deck',9,[[0,-30],[0,0],[0,30]])],{snap:.3})
    expect(net.junctions).toHaveLength(0)
  })
  it.each([1,-1])('emits horizontal treads and vertical risers for direction %i',(sign)=>{
    const p:number[]=[],c:number[]=[]
    appendAccessFlight(p,c,new THREE.Vector2(0,1),new THREE.Vector2(12,1),new THREE.Vector2(0,-1),new THREE.Vector2(12,-1),sign>0?0:6,sign>0?6:0,1,'stairs')
    expect(p.every(Number.isFinite)).toBe(true)
    expect(c.length).toBe(p.length)
    let treads=0,risers=0
    for(let i=0;i<p.length;i+=9){
      const a=new THREE.Vector3(...p.slice(i,i+3)),b=new THREE.Vector3(...p.slice(i+3,i+6)),d=new THREE.Vector3(...p.slice(i+6,i+9))
      const normal=b.sub(a).cross(d.sub(a));if(normal.length()<.01)continue
      if(Math.abs(normal.z/normal.length())>.999)treads++
      if(Math.abs(normal.z/normal.length())<.001)risers++
    }
    expect(treads).toBeGreaterThan(60)
    expect(risers).toBeGreaterThan(60)
  })
  it('emits a shaft with two landings rather than a floating support',()=>{
    const p:number[]=[],c:number[]=[]
    appendAccessElevator(p,c,new THREE.Vector2(),new THREE.Vector2(1,0),0,7,1)
    const heights=p.filter((_,i)=>i%3===2)
    expect(Math.min(...heights)).toBeCloseTo(-.15)
    expect(Math.max(...heights)).toBeCloseTo(9.96)
    expect(p.every(Number.isFinite)).toBe(true)
  })
  it('uses opaque depth-writing material for access solids while retaining ground overlays',()=>{
    const layer=buildLinearLayer(features,'road',{...opts,vertical:profiles})!
    let solids=0
    layer.object.traverse(obj=>{
      const materials=(obj as THREE.Mesh).material
      if(!Array.isArray(materials))return
      expect(materials[0].depthWrite).toBe(false)
      expect(materials[1].depthWrite).toBe(true)
      expect(materials[1].transparent).toBe(false)
      expect((obj as THREE.Mesh).geometry.groups).toHaveLength(2)
      solids++
    })
    expect(solids).toBe(1)
  })
})
