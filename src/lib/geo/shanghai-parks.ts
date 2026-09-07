import * as THREE from 'three'
import { latLonToNormalized } from './geo-math'
import { createGroundFrame } from './ground-frame'
import { variate } from './feature-variation'
import { isShanghai } from './shanghai-region'
import { buildKeepOut } from './tree-seeding'
import type { OsmFeature } from './osm-features'
import type { LayerMeshOptions } from './osm-scene'

type P = { x: number; y: number }
type Item = { name: string; x: number; y: number; z: number; yaw: number; scale: number }
export const PARK_DETAIL_BUDGET = 3200
export function inside(p: P, ring: readonly P[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit = !hit
  }
  return hit
}
function distance(p: P, a: P, b: P): number {
  const dx=b.x-a.x, dy=b.y-a.y, t=Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)))
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)
}

/** Geometry follows mapped shorelines and paths. Planting/furniture are illustrative.
 * Separate outputs inherit the existing water, vegetation and scenery switches.
 */
export function buildShanghaiParkDetails(features: readonly OsmFeature[], opts: LayerMeshOptions & {
  scenery?: boolean; waterElevation: (ring: THREE.Vector2[]) => number
}): { water: THREE.Group; green: THREE.Group; scenery: THREE.Group; counts: Record<string, number> } | null {
  if (!isShanghai(opts.anchorLat, opts.anchorLon) || opts.quality !== 'detailed') return null
  const frame=createGroundFrame(opts), unit=frame.mToN
  const origin=latLonToNormalized(opts.anchorLat,opts.anchorLon!)
  const local=(p: {lat:number;lon:number}): P => {const n=latLonToNormalized(p.lat,p.lon);return {x:(n.nx-origin.nx)/unit,y:(n.ny-origin.ny)/unit}}
  const rows=features.filter(f=>f.ring?.length).map(f=>({f, ring:f.ring!.map(local)}))
  const parks=rows.filter(r=>r.f.kind==='green' && (r.f.style.cover==='park' || r.f.style.cover==='shrub'))
  const waters=rows.filter(r=>r.f.kind==='water')
  const buildings=rows.filter(r=>r.f.kind==='building')
  const roads=rows.filter(r=>r.f.kind==='road')
  const blockedGround=buildKeepOut([...buildings,...waters].map(r=>r.ring))
  const roadSegments=roads.flatMap(r=>r.ring.slice(1).map((b,i)=>({a:r.ring[i],b,clearance:(r.f.widthM??2)/2})))
  const ground=(p:P)=>frame.groundZ(origin.nx+p.x*unit,origin.ny+p.y*unit)/unit
  const excluded=(p:P,margin=1)=>opts.excludeAt?.(origin.nx+p.x*unit,origin.ny+p.y*unit) ||
    blockedGround(p.x,p.y) || roadSegments.some(({a,b,clearance})=>{
      const r=clearance+margin
      return p.x>=Math.min(a.x,b.x)-r && p.x<=Math.max(a.x,b.x)+r &&
        p.y>=Math.min(a.y,b.y)-r && p.y<=Math.max(a.y,b.y)+r && distance(p,a,b)<r
    })
  const result={water:new THREE.Group(),green:new THREE.Group(),scenery:new THREE.Group(),counts:{} as Record<string,number>}
  for(const [name,g] of [['water',result.water],['green',result.green],['scenery',result.scenery]] as const){
    g.name=`shanghai-park-${name}`;g.position.set(origin.nx,origin.ny,0);g.scale.setScalar(unit)
  }
  const items: Record<'water'|'green'|'scenery',Item[]>={water:[],green:[],scenery:[]}
  const add=(layer:keyof typeof items,name:string,p:P,z:number,yaw=0,scale=1)=>{
    if(items.water.length+items.green.length+items.scenery.length>=PARK_DETAIL_BUDGET)return
    items[layer].push({name,...p,z,yaw,scale})
  }
  const edgeVerts:number[]=[], edgeIndices:number[]=[]
  // Nearer small park lakes earn shore detail. A district-spanning river does not.
  const lakes=waters.filter(r=>r.f.style.waterKind!=='river' && !r.f.isSea &&
    r.ring.some(p=>parks.some(park=>inside(p,park.ring))))
    .sort((a,b)=>Math.min(...a.ring.map(p=>Math.hypot(p.x,p.y)))-Math.min(...b.ring.map(p=>Math.hypot(p.x,p.y))) || a.f.id.localeCompare(b.f.id))
  for(const {f,ring} of lakes){
    if(ring.length<3 || Math.max(...ring.map(p=>Math.hypot(p.x,p.y)))>2500)continue
    const z=opts.waterElevation(ring.map(p=>new THREE.Vector2(origin.nx+p.x*unit,origin.ny+p.y*unit)))/unit
    let perimeter=0
    for(let i=0;i<ring.length;i++)perimeter+=Math.hypot(ring[(i+1)%ring.length].x-ring[i].x,ring[(i+1)%ring.length].y-ring[i].y)
    if(perimeter>2200)continue
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b.x-a.x,b.y-a.y)
      if(len<.1)continue
      let nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len
      const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2}
      if(inside({x:mid.x+nx*.2,y:mid.y+ny*.2},ring)){nx=-nx;ny=-ny}
      const steps=Math.ceil(len/3)
      for(let k=0;k<steps;k++){
        const p={x:a.x+(b.x-a.x)*k/steps,y:a.y+(b.y-a.y)*k/steps}
        const q={x:a.x+(b.x-a.x)*(k+1)/steps,y:a.y+(b.y-a.y)*(k+1)/steps}
        const outside={x:p.x+nx*.8,y:p.y+ny*.8}
        // A low bank meets the same flat datum as the water, then the land.
        const n=edgeVerts.length/3
        if(n<24000){
          edgeVerts.push(p.x,p.y,z-.08,q.x,q.y,z-.08,q.x+nx*.6,q.y+ny*.6,Math.max(z+.12,ground(q)+.06),outside.x,outside.y,Math.max(z+.12,ground(outside)+.06))
          edgeIndices.push(n,n+1,n+2,n,n+2,n+3)
        }
        const id=`${f.id}/${i}/${k}`
        if(variate(id,0)>.45 && !excluded(outside,.3))add('green','reed',outside,ground(outside),variate(id,1)*6.28,.65+variate(id,2)*.55)
      }
    }
  }
  if(edgeVerts.length){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(edgeVerts,3));geo.setIndex(edgeIndices);geo.computeVertexNormals()
    const bank=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x807e66,roughness:.96,side:THREE.DoubleSide}));bank.name='mapped-lake-bank';result.water.add(bank)
  }
  // Border planting respects every building, water polygon, road width and IFC footprint.
  for(const {f,ring} of parks.sort((a,b)=>a.f.id.localeCompare(b.f.id))){
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b.x-a.x,b.y-a.y)
      if(len<1)continue
      for(let k=0;k<len;k+=7){
        const id=`${f.id}:border:${i}:${k}`,p={x:a.x+(b.x-a.x)*k/len,y:a.y+(b.y-a.y)*k/len}
        const nx=-(b.y-a.y)/len,ny=(b.x-a.x)/len
        const sign=inside({x:p.x+nx,y:p.y+ny},ring)?1:-1
        p.x+=nx*sign*2;p.y+=ny*sign*2
        if(Math.hypot(p.x,p.y)>1600 || !inside(p,ring) || excluded(p,1))continue
        if(variate(id,0)>.32)add('green','shrub',p,ground(p),variate(id,1)*6.28,.7+variate(id,2)*.9)
      }
    }
  }
  if(opts.scenery){
    for(const {f,ring} of roads.filter(r=>r.f.style.roadClass==='pedestrian').sort((a,b)=>a.f.id.localeCompare(b.f.id))){
      let run=0
      for(let i=1;i<ring.length;i++){
        const a=ring[i-1],b=ring[i],len=Math.hypot(b.x-a.x,b.y-a.y),yaw=Math.atan2(b.y-a.y,b.x-a.x)
        for(let d=(36-run%36)%36;d<len;d+=36){
          const p={x:a.x+Math.cos(yaw)*d-Math.sin(yaw)*((f.widthM??2)/2+1.5),y:a.y+Math.sin(yaw)*d+Math.cos(yaw)*((f.widthM??2)/2+1.5)}
          if(Math.hypot(p.x,p.y)>1300 || !parks.some(r=>inside(p,r.ring)) || excluded(p,.3))continue
          const id=`${f.id}:${i}:${d}`;add('scenery',variate(id,1)>.45?'bench':'lantern',p,ground(p),yaw)
          if (variate(id,3)<.045 && items.scenery.filter(x=>x.name==='pergola').length<6) {
            const centre={x:p.x-Math.sin(yaw)*4,y:p.y+Math.cos(yaw)*4}
            const samples=[centre,...[-2.6,2.6].flatMap(x=>[-1.9,1.9].map(y=>({x:centre.x+x*Math.cos(yaw)-y*Math.sin(yaw),y:centre.y+x*Math.sin(yaw)+y*Math.cos(yaw)})))]
            if(samples.every(v=>parks.some(r=>inside(v,r.ring))&&!excluded(v,.4)))add('scenery','pergola',centre,ground(centre),yaw)
          }
        }run+=len
      }
    }
  }
  for(const f of features.filter(f=>f.kind==='water' && f.style.waterKind==='fountain')){
    const ring=f.ring?.map(local)
    const p=f.point?local(f.point):ring?ring.reduce((s,p)=>({x:s.x+p.x/ring.length,y:s.y+p.y/ring.length}),{x:0,y:0}):null
    if(!p || Math.hypot(p.x,p.y)>1800 || opts.excludeAt?.(origin.nx+p.x*unit,origin.ny+p.y*unit))continue
    // Node locations have no surveyed basin size: jets are an illustrative symbol.
    const z=ring?opts.waterElevation(ring.map(p=>new THREE.Vector2(origin.nx+p.x*unit,origin.ny+p.y*unit)))/unit:ground(p)+.1
    const radius = ring ? Math.min(...ring.map(v=>Math.hypot(v.x-p.x,v.y-p.y))) : 3
    add('water','fountain-jets',p,z,0,Math.max(.35,Math.min(2,radius/1.5)))
  }
  for(const layer of ['water','green','scenery'] as const){
    const names=[...new Set(items[layer].map(x=>x.name))]
    for(const name of names){
      const list=items[layer].filter(x=>x.name===name),asset=opts.assets?.get(`shanghai/${name}`)
      // Lightweight working-view foliage remains visible if the optional GLB fails.
      const geo=asset?.clone() ?? (name==='reed'?new THREE.ConeGeometry(.23,1.1,5).rotateX(Math.PI/2).translate(0,0,.55):name==='shrub'?new THREE.IcosahedronGeometry(.65,1).translate(0,0,.6):null)
      if(!geo)continue
      const mat=new THREE.MeshStandardMaterial({vertexColors:!!geo.getAttribute('color'),color:asset?0xffffff:name==='reed'?0x688140:0x3d672e,roughness:.86})
      if (name === 'fountain-jets') {
        const time={value:0};mat.roughness=.18;mat.transparent=true;mat.opacity=.82
        mat.userData.animated=true;mat.userData.uniforms={uTime:time}
        mat.onBeforeCompile=shader=>{
          shader.uniforms.uParkTime=time
          shader.vertexShader='uniform float uParkTime;\n'+shader.vertexShader
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z *= 0.96 + 0.04 * sin(uParkTime * 2.2 + position.z * 4.0);')
        }
        mat.customProgramCacheKey=()=> 'shanghai-fountain-r1'
      }
      const mesh=new THREE.InstancedMesh(geo,mat,list.length);mesh.name=`shanghai-${name}`
      const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),s=new THREE.Vector3()
      list.forEach((p,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,0,1),p.yaw);pos.set(p.x,p.y,p.z);s.setScalar(p.scale);mesh.setMatrixAt(i,m.compose(pos,q,s))})
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();result[layer].add(mesh);result.counts[name]=list.length
    }
  }
  return result
}
