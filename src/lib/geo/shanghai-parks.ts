import * as THREE from 'three'
import { latLonToNormalized } from './geo-math'
import { createGroundFrame } from './ground-frame'
import { variate } from './feature-variation'
import { isShanghai } from './shanghai-region'
import { plantingClearance } from './planting-clearance'
import type { OsmFeature } from './osm-features'
import type { LayerMeshOptions } from './osm-scene'

type P = { x: number; y: number }
type Item = { name: string; x: number; y: number; z: number; yaw: number; scale: number }
/** One straight run of clipped hedge, in local metres. */
export type Hedge = { a: P; b: P; width: number; height: number; tone: readonly [number, number, number] }
/** Width of the stone coping on a lake's edge, m. */
const COPING_M = .5
/** The tall boundary hedge and the low path edging: width, height, run, gap. */
// Clipped privet and box are darker and glossier than the lawn they edge,
// which is what lets them read at all from a few hundred metres up.
export const HEDGE_TALL = { width: 1.2, height: 1.4, run: 14, gap: 3.5, tone: [.11, .24, .09] as const }
export const HEDGE_LOW = { width: .6, height: .6, run: 9, gap: 2.5, tone: [.15, .3, .1] as const }
/** Hedges are set this far into the ground: the lawn is drawn a hair above it
 * and pulled toward the eye (ground-depth-nudge), which hides a low base. */
const HEDGE_SINK_M = .3
type HedgeSpec = { width: number; height: number; run: number; gap: number; tone: readonly [number, number, number] }
/** A plaza mapped as a closed pedestrian area: it is paving, not a path to edge. */
function isPedestrianArea(f: OsmFeature): boolean {
  const r = f.ring
  return !!r && r.length > 3 && r[0].lat === r[r.length - 1].lat && r[0].lon === r[r.length - 1].lon
}

/**
 * Lay clipped hedge along a polyline (closed = a ring, offset INWARD by
 * `offset`; open = a path, offset to its left by `offset`, negative for the
 * right). Runs of `spec.run` m with `spec.gap` m openings; a run is cut where
 * `fits` fails, so a gate, a crossing path or a footprint opens the hedge.
 * `atGap` is called at each opening: the place for a flowering mound.
 */
export function hedgeAlong(
  line: readonly P[], closed: boolean, offset: number, id: string, fits: (p: P) => boolean,
  spec: HedgeSpec, out: Hedge[], atGap?: (p: P, id: string) => void,
): void {
  if (line.length < 2) return
  let sign = 1
  if (closed) {
    let area = 0
    for (let i = 0, j = line.length - 1; i < line.length; j = i++) area += (line[j].x - line[i].x) * (line[j].y + line[i].y)
    // Positive = counter-clockwise, whose left normal already points in.
    sign = area > 0 ? 1 : -1
  }
  const n = closed ? line.length : line.length - 1
  const step = 1.5
  for (let i = 0; i < n; i++) {
    const a = line[i], b = line[(i + 1) % line.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < spec.run * .4) continue
    // Left normal; for a ring, oriented to point inside.
    const nx = -(b.y - a.y) / len * sign, ny = (b.x - a.x) / len * sign
    const at = (d: number): P => ({ x: a.x + (b.x - a.x) * d / len + nx * offset, y: a.y + (b.y - a.y) * d / len + ny * offset })
    // Inset from the corners so neighbouring sides do not cross.
    const inset = Math.abs(offset) + spec.width
    let start: number | null = null
    const close = (end: number) => {
      if (start !== null && end - start >= 2) out.push({ a: at(start), b: at(end), width: spec.width, height: spec.height, tone: spec.tone })
      start = null
    }
    let d = inset, k = 0
    while (d <= len - inset) {
      const runEnd = Math.min(len - inset, d + spec.run)
      for (let s = d; s <= runEnd; s += step) {
        if (fits(at(s))) { if (start === null) start = s }
        else close(s - step / 2)
      }
      close(runEnd)
      const gapAt = runEnd + spec.gap / 2
      if (atGap && gapAt < len - inset && fits(at(gapAt))) atGap(at(gapAt), `${id}:${i}:${k}`)
      d = runEnd + spec.gap
      k++
    }
  }
}

/** All hedge runs as one mesh: boxes battered in toward a lighter clipped top. */
function hedgeMesh(hedges: readonly Hedge[], ground: (p: P) => number): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  for (const h of hedges) {
    const len = Math.hypot(h.b.x - h.a.x, h.b.y - h.a.y)
    const ux = (h.b.x - h.a.x) / len, uy = (h.b.y - h.a.y) / len
    const wx = -uy * h.width / 2, wy = ux * h.width / 2
    const za = ground(h.a) - HEDGE_SINK_M, zb = ground(h.b) - HEDGE_SINK_M
    const top = h.height + HEDGE_SINK_M
    const c = (p: P, s: number, z: number, t: number) => [p.x + wx * s * t, p.y + wy * s * t, z]
    const v = pos.length / 3
    const corners = [c(h.a, 1, za, 1), c(h.b, 1, zb, 1), c(h.b, -1, zb, 1), c(h.a, -1, za, 1),
      c(h.a, 1, za + top, .82), c(h.b, 1, zb + top, .82), c(h.b, -1, zb + top, .82), c(h.a, -1, za + top, .82)]
    for (let i = 0; i < 8; i++) {
      pos.push(...corners[i])
      // Shaded at the foot, sunlit on the clipped top.
      const k = i < 4 ? .62 : 1.12
      col.push(h.tone[0] * k, h.tone[1] * k, h.tone[2] * k)
    }
    for (const [p, q, r, s] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]]) idx.push(v + p, v + q, v + r, v + p, v + r, v + s)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere()
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .7, side: THREE.DoubleSide }))
}
export const PARK_DETAIL_BUDGET = 3200
export function inside(p: P, ring: readonly P[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit = !hit
  }
  return hit
}
/** A scholar's rock: a pitted, upright lump of limestone (deterministic). */
function taihuRock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(.55, 1)
  const a = g.getAttribute('position')
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i)
    const k = .72 + .38 * Math.abs(Math.sin(x * 7.1 + y * 5.3) * Math.cos(z * 6.7 - x * 2.9))
    a.setXYZ(i, x * k * .9, y * k * .75, (z * k + .55) * 1.25)
  }
  g.computeVertexNormals()
  return g
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
  const rows=features.filter(f=>f.ring?.length).map(f=>({f, ring:f.ring!.map(local), holes:(f.holes ?? []).map(r=>r.map(local))}))
  const parks=rows.filter(r=>r.f.kind==='green' && (r.f.style.cover==='park' || r.f.style.cover==='shrub'))
  const waters=rows.filter(r=>r.f.kind==='water')
  const roads=rows.filter(r=>r.f.kind==='road' && r.f.vertical?.structure!=='tunnel')
  const blockedGround=plantingClearance(features,local)
  const inPark=(p:P)=>parks.some(r=>inside(p,r.ring) && !r.holes.some(h=>inside(p,h)))
  const roadSegments=roads.filter(r=>r.f.widthM!==undefined).flatMap(r=>r.ring.slice(1).map((b,i)=>({a:r.ring[i],b,clearance:(r.f.widthM??2)/2})))
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
    r.ring.some(inPark))
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
        // A Shanghai park lake is edged in stone, not mud: a dressed granite
        // revetment standing ~0.4 m out of the water, capped by a coping the
        // lawn runs up to (Lujiazui Green, Century Park, Zhongshan Park).
        const n=edgeVerts.length/3
        if(n<24000){
          const top=Math.max(z+.4,ground(q)+.05), topP=Math.max(z+.4,ground(p)+.05)
          const cx=nx*COPING_M,cy=ny*COPING_M
          edgeVerts.push(p.x,p.y,z-.3,q.x,q.y,z-.3,q.x,q.y,top,p.x,p.y,topP,
            q.x+cx,q.y+cy,top,p.x+cx,p.y+cy,topP)
          edgeIndices.push(n,n+1,n+2,n,n+2,n+3,n+3,n+2,n+4,n+3,n+4,n+5)
        }
        const id=`${f.id}/${i}/${k}`
        // Reeds and irises in clumps at a few planted bays, not a fringe.
        const bay=variate(`${f.id}/${i}`,3)<.22
        if(bay && variate(id,0)>.3 && !excluded(outside,.3))add('green','reed',{x:p.x-nx*.6,y:p.y-ny*.6},z,variate(id,1)*6.28,.65+variate(id,2)*.55)
        // Ornamental (Taihu-style) rocks set into the edge here and there.
        else if(opts.scenery && variate(id,4)<.06 && !excluded(outside,.3))add('scenery','rock',{x:p.x+nx*.3,y:p.y+ny*.3},z-.1,variate(id,5)*6.28,.7+variate(id,6)*1.1)
      }
    }
  }
  if(edgeVerts.length){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(edgeVerts,3));geo.setIndex(edgeIndices);geo.computeVertexNormals()
    const bank=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xa8a497,roughness:.9,side:THREE.DoubleSide}));bank.name='mapped-lake-revetment';result.water.add(bank)
  }
  // THE CLIPPED HEDGE. What reads as "Shanghai park" from any distance is not
  // loose shrubbery but hedges cut square: a tall privet/boxwood band just
  // inside the park's edge, and low box edging along its paths, with flowering
  // azalea mounds where the hedge opens. Every piece respects buildings, water,
  // road widths and IFC footprints, so a gate or a path breaks the hedge.
  const hedges:Hedge[]=[]
  for(const {f,ring,holes} of parks.sort((a,b)=>a.f.id.localeCompare(b.f.id))){
    const fits=(p:P)=>Math.hypot(p.x,p.y)<=1600 && inside(p,ring) && !holes.some(h=>inside(p,h)) && !excluded(p,.8)
    hedgeAlong(ring,true,2.2,f.id,fits,HEDGE_TALL,hedges,(p,id)=>{
      if(variate(id,0)>.4)add('green','shrub',p,ground(p),variate(id,1)*6.28,.8+variate(id,2)*.6)
    })
  }
  for(const {f,ring} of roads.filter(r=>r.f.style.roadClass==='pedestrian' && r.f.widthM!==undefined && (!r.f.vertical || r.f.vertical.structure==='ground') && r.ring.length>=2 && !isPedestrianArea(r.f)).sort((a,b)=>a.f.id.localeCompare(b.f.id))){
    const off=(f.widthM??2)/2+.6
    const fits=(p:P)=>Math.hypot(p.x,p.y)<=1300 && inPark(p) && !excluded(p,.25)
    for(const side of [1,-1])hedgeAlong(ring,false,off*side,`${f.id}:${side}`,fits,HEDGE_LOW,hedges)
  }
  if(hedges.length){
    const mesh=hedgeMesh(hedges,ground);mesh.name='shanghai-hedges';result.green.add(mesh);result.counts.hedge=hedges.length
  }
  if(opts.scenery){
    for(const {f,ring} of roads.filter(r=>r.f.style.roadClass==='pedestrian' && r.f.widthM!==undefined && (!r.f.vertical || r.f.vertical.structure==='ground')).sort((a,b)=>a.f.id.localeCompare(b.f.id))){
      let run=0
      for(let i=1;i<ring.length;i++){
        const a=ring[i-1],b=ring[i],len=Math.hypot(b.x-a.x,b.y-a.y),yaw=Math.atan2(b.y-a.y,b.x-a.x)
        for(let d=(36-run%36)%36;d<len;d+=36){
          const p={x:a.x+Math.cos(yaw)*d-Math.sin(yaw)*((f.widthM??2)/2+1.5),y:a.y+Math.sin(yaw)*d+Math.cos(yaw)*((f.widthM??2)/2+1.5)}
          if(Math.hypot(p.x,p.y)>1300 || !inPark(p) || excluded(p,.3))continue
          const id=`${f.id}:${i}:${d}`;add('scenery',variate(id,1)>.45?'bench':'lantern',p,ground(p),yaw)

        }run+=len
      }
    }
  }
  for(const f of features.filter(f=>f.kind==='water' && f.style.waterKind==='fountain')){
    const ring=f.ring?.map(local)
    let p=f.point?local(f.point):ring?ring.reduce((s,p)=>({x:s.x+p.x/ring.length,y:s.y+p.y/ring.length}),{x:0,y:0}):null
    const holes=(f.holes ?? []).map(r=>r.map(local))
    const fits=(v:P)=>!!ring && inside(v,ring) && !holes.some(h=>inside(v,h))
    // Concave basins can have their vertex average outside the water.
    if(ring && p && !fits(p)) {
      const xs=ring.map(v=>v.x),ys=ring.map(v=>v.y)
      let best:P|null=null,bestClearance=0
      for(let i=1;i<20;i++)for(let j=1;j<20;j++){
        const v={x:Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*i/20,y:Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*j/20}
        if(!fits(v))continue
        const clearance=Math.min(...[ring,...holes].flatMap(r=>r.map((a,k)=>distance(v,a,r[(k+1)%r.length]))))
        if(clearance>bestClearance){best=v;bestClearance=clearance}
      }
      p=best
    }
    if(!p || Math.hypot(p.x,p.y)>1800 || opts.excludeAt?.(origin.nx+p.x*unit,origin.ny+p.y*unit))continue
    // Node locations have no surveyed basin size: jets are an illustrative symbol.
    const z=ring?opts.waterElevation(ring.map(p=>new THREE.Vector2(origin.nx+p.x*unit,origin.ny+p.y*unit)))/unit:ground(p)+.1
    const radius = ring ? Math.min(...[ring,...holes].flatMap(r=>r.map((a,i)=>distance(p!,a,r[(i+1)%r.length])))) : 3
    if(radius<.3)continue
    add('water','fountain-jets',p,z,0,Math.min(2,radius/1.5))
  }
  for(const layer of ['water','green','scenery'] as const){
    const names=[...new Set(items[layer].map(x=>x.name))]
    for(const name of names){
      const list=items[layer].filter(x=>x.name===name),asset=opts.assets?.get(`shanghai/${name}`)
      // Lightweight working-view foliage remains visible if the optional GLB fails.
      const geo=asset?.clone() ?? (name==='reed'?new THREE.ConeGeometry(.23,1.1,5).rotateX(Math.PI/2).translate(0,0,.55):name==='shrub'?new THREE.IcosahedronGeometry(.65,1).translate(0,0,.6):name==='rock'?taihuRock():null)
      if(!geo)continue
      const mat=new THREE.MeshStandardMaterial({vertexColors:!!geo.getAttribute('color'),color:asset?0xffffff:name==='reed'?0x688140:name==='rock'?0x9b978c:0x3d672e,roughness:.86})
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
