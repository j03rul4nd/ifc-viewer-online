import * as THREE from 'three'
import type { OsmFeature } from './osm-features'
import { latLonToNormalized } from './geo-math'
import { sampleProfile, type SolvedProfile } from './vertical-network'
import { appendBridgeRailing } from './bridge-railing'
import type { NumberSink } from './growable-array'

export function accessPoint(p: {lat:number;lon:number}): THREE.Vector2 {
  const q=latLonToNormalized(p.lat,p.lon)
  return new THREE.Vector2(q.nx,q.ny)
}

/** Only mapped shared vertices establish a deck connection, never proximity to
 * a random overhead segment. A shaft may join two levels at the same XY. */
export function connectedDeck(
  p: THREE.Vector2, features: ReadonlyArray<OsmFeature>,
  profiles: ReadonlyMap<string,SolvedProfile>, unit:number,
): {heightM:number;direction:THREE.Vector2;sourceId:string} | null {
  let found: ReturnType<typeof connectedDeck> = null
  for(const f of features){
    if(f.style.accessKind || !f.ring || f.functional!=='pedestrian') continue
    const profile=profiles.get(f.id)
    if(profile?.structure!=='bridge') continue
    for(let i=0;i<f.ring.length;i++){
      const v=accessPoint(f.ring[i])
      if(v.distanceTo(p)>.35*unit) continue
      const {elevationM,groundM}=sampleProfile(profile).sample(v.x,v.y)
      if(elevationM-groundM<.7) continue
      const neighbour=accessPoint(f.ring[i+1]??f.ring[i-1]??f.ring[i])
      if(!found || elevationM>found.heightM) found={heightM:elevationM,direction:neighbour.sub(v).normalize(),sourceId:f.id}
    }
  }
  return found
}

/** Stair rise is constrained by connected levels, not the maximum grade of a
 * walking ramp. Flat end landings and landings at mapped corners are explicit. */
export function solveAccessProfiles(
  features:ReadonlyArray<OsmFeature>, profiles:Map<string,SolvedProfile>, unit:number,
  ground:(x:number,y:number)=>number,
): void {
  for(const f of features){
    if(!f.ring || !['stairs','escalator'].includes(f.style.accessKind??'')) continue
    const path=f.ring.map(accessPoint)
    if(path.length<2) continue
    const lengths=[0]
    for(let i=1;i<path.length;i++) lengths.push(lengths[i-1]+path[i].distanceTo(path[i-1])/unit)
    if(lengths[lengths.length-1]<.1) continue
    const attached=path.map(p=>connectedDeck(p,features,profiles,unit))
    if(!attached.some(Boolean)) continue // No invented rise for unlocated stairs.
    const anchors=new Map<number,number>()
    anchors.set(0,attached[0]?.heightM??ground(path[0].x,path[0].y))
    const last=path.length-1
    anchors.set(last,attached[last]?.heightM??ground(path[last].x,path[last].y))
    attached.forEach((d,i)=>{if(d)anchors.set(i,d.heightM)})
    const indices=[...anchors.keys()].sort((a,b)=>a-b)
    const points:THREE.Vector2[]=[],stationM:number[]=[],elevationM:number[]=[]
    for(let a=0;a<indices.length-1;a++){
      const from=indices[a],to=indices[a+1],z0=anchors.get(from)!,z1=anchors.get(to)!
      const run:number[]=[],landing:number[]=[]
      for(let i=from;i<to;i++){
        const len=lengths[i+1]-lengths[i]
        landing.push(Math.min(1.2,len*.18))
        run.push(Math.max(.001,len-2*landing[landing.length-1]))
      }
      // A conveying way often includes a short bent approach. A moving stair
      // cannot bend in plan: put the rise on its longest straight flight and
      // keep the remaining mapped approach segments level.
      if(f.style.accessKind==='escalator'){
        const longest=run.indexOf(Math.max(...run))
        for(let i=0;i<run.length;i++) if(i!==longest)run[i]=0
      }
      const total=run.reduce((x,y)=>x+y,0)
      let climbed=0
      for(let i=from;i<to;i++){
        const k=i-from,len=lengths[i+1]-lengths[i]
        if(len<.001) continue
        for(const d of [0,landing[k],len-landing[k],len]){
          const station=lengths[i]+d
          if(stationM.length && Math.abs(station-stationM[stationM.length-1])<1e-7) continue
          points.push(path[i].clone().lerp(path[i+1],d/len))
          stationM.push(station)
          elevationM.push(z0+(z1-z0)*(climbed+Math.max(0,Math.min(run[k],d-landing[k])))/total)
        }
        climbed+=run[k]
      }
    }
    profiles.set(f.id,{wayId:f.id,points,stationM,elevationM,
      groundM:points.map(p=>ground(p.x,p.y)),phase:points.map(()=> 'ramp'),
      breakpoints:stationM.slice(1,-1),structure:'bridge',functional:'pedestrian',confidence:'inferred',relaxed:false})
  }
}

type RGB=[number,number,number]
/** Open the railing where a mapped lift enclosure meets a deck. Work in the
 * same local planar units as the deck; no gap is invented for unmapped lifts. */
export function railingOutsideElevators(
  a:THREE.Vector3,b:THREE.Vector3,centres:ReadonlyArray<THREE.Vector2>,radius:number,
):Array<[THREE.Vector3,THREE.Vector3]> {
  let intervals:Array<[number,number]>=[[0,1]]
  const dx=b.x-a.x,dy=b.y-a.y,A=dx*dx+dy*dy
  if(A<1e-30)return []
  for(const p of centres){
    const x=a.x-p.x,y=a.y-p.y,B=2*(x*dx+y*dy),C=x*x+y*y-radius*radius
    const discriminant=B*B-4*A*C
    if(discriminant<=0)continue
    const lo=(-B-Math.sqrt(discriminant))/(2*A),hi=(-B+Math.sqrt(discriminant))/(2*A)
    intervals=intervals.flatMap(([l,r])=>{
      if(hi<=l||lo>=r)return [[l,r] as [number,number]]
      const keep:Array<[number,number]>=[]
      if(lo>l)keep.push([l,Math.min(lo,r)])
      if(hi<r)keep.push([Math.max(hi,l),r])
      return keep
    })
  }
  return intervals.map(([l,r])=>[a.clone().lerp(b,l),a.clone().lerp(b,r)])
}
/** Treads/riser geometry in the shipping mesh, including a closed stringer. */
export function appendAccessFlight(
  positions:NumberSink,colors:NumberSink, left0:THREE.Vector2,left1:THREE.Vector2,
  right0:THREE.Vector2,right1:THREE.Vector2,z0:number,z1:number,unit:number,
  kind:'stairs'|'escalator', steps?:number,
):void {
  const base:RGB=kind==='stairs'?[.54,.52,.48]:[.34,.37,.39]
  const quad=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,tone:RGB)=>{
    for(const v of [a,b,c,a,c,d]){positions.push(v.x,v.y,v.z);colors.push(...tone)}
  }
  const at=(a:THREE.Vector2,b:THREE.Vector2,t:number,z:number)=>{const p=a.clone().lerp(b,t);return new THREE.Vector3(p.x,p.y,z)}
  const n=Math.abs(z1-z0)<.001*unit?1:Math.max(1,Math.min(256,steps??Math.ceil(Math.abs(z1-z0)/(.17*unit))))
  for(let i=0;i<n;i++){
    const t=i/n,u=(i+1)/n,z=z0+(z1-z0)*u,previous=z0+(z1-z0)*t
    const l=at(left0,left1,t,z),r=at(right0,right1,t,z),ln=at(left0,left1,u,z),rn=at(right0,right1,u,z)
    quad(l,ln,rn,r,base)
    quad(at(left0,left1,t,previous),l,r,at(right0,right1,t,previous),base.map(v=>v*.8) as RGB)
    // Narrow contrasting nosing on each tread, not a painted ramp.
    if(n>1){const v=Math.min(u,t+.025*unit/Math.max(left0.distanceTo(left1),unit*.01))
      quad(at(left0,left1,t,z+.002*unit),at(left0,left1,v,z+.002*unit),at(right0,right1,v,z+.002*unit),at(right0,right1,t,z+.002*unit),kind==='stairs'?[.72,.69,.60]:[.65,.56,.21])}
    const drop=.3*unit
    quad(l,at(left0,left1,t,previous-drop),at(left0,left1,u,z-drop),ln,base)
    quad(rn,at(right0,right1,u,z-drop),at(right0,right1,t,previous-drop),r,base)
  }
  quad(at(left0,left1,0,z0-.3*unit),at(right0,right1,0,z0-.3*unit),at(right0,right1,1,z1-.3*unit),at(left0,left1,1,z1-.3*unit),base)
  for(const [a,b] of [[left0,left1],[right0,right1]]){
    appendBridgeRailing(positions,colors,new THREE.Vector3(a.x,a.y,z0),new THREE.Vector3(b.x,b.y,z1),unit,kind==='stairs'?[.55,.58,.60]:[.12,.14,.15],1.1)
    if(kind==='escalator'){
      const l=new THREE.Vector3(a.x,a.y,z0+.16*unit),r=new THREE.Vector3(b.x,b.y,z1+.16*unit)
      quad(l,r,r.clone().add(new THREE.Vector3(0,0,.7*unit)),l.clone().add(new THREE.Vector3(0,0,.7*unit)),[.40,.53,.57])
    }
  }
}

/** A mapped elevator shaft: estimated enclosure dimensions, actual XY and
 * connected deck height. Frame and doors distinguish it from a support pier. */
export function appendAccessElevator(
  positions:NumberSink,colors:NumberSink,at:THREE.Vector2,direction:THREE.Vector2,
  groundZ:number,deckZ:number,unit:number,
):void{
  const forward=direction.lengthSq()>.1?direction.clone():new THREE.Vector2(1,0)
  const side=new THREE.Vector2(-forward.y,forward.x)
  const box=(cx:number,cy:number,z:number,w:number,d:number,h:number,tone:RGB)=>{
    const p=[]
    for(const dz of [0,h])for(const [x,y] of [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]]){
      const v=at.clone().addScaledVector(side,(cx+x)*unit).addScaledVector(forward,(cy+y)*unit)
      p.push(new THREE.Vector3(v.x,v.y,z+dz*unit))
    }
    for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])for(const i of [a,b,c,a,c,d]){positions.push(p[i].x,p[i].y,p[i].z);colors.push(...tone)}
  }
  const height=(deckZ-groundZ)/unit+2.8
  box(0,0,groundZ,2.5,2.8,height,[.34,.48,.53])
  for(const x of [-1.3,1.3])for(const y of [-1.45,1.45])box(x,y,groundZ,.12,.12,height,[.64,.67,.68])
  for(const z of [groundZ,deckZ,groundZ+height*unit])box(0,0,z,2.85,3.15,.16,[.55,.58,.6])
  for(const z of [groundZ,deckZ]){
    // Facing along the mapped path; entrance orientation is an inferred detail.
    box(0,1.43,z+.05*unit,1.35,.06,2.2,[.16,.20,.23])
    box(0,1.47,z+.05*unit,.035,.03,2.2,[.7,.72,.73])
    box(0,2,z-.15*unit,2.85,1.2,.15,[.55,.53,.49])
  }
}
