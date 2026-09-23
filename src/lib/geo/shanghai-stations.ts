import * as THREE from 'three'
import type { BuildingLike } from './building-mesh'

/** Identity AND location gate. Research and inference boundaries in the accompanying document. */
export function stationForm(b: BuildingLike): 'south'|'hongqiao'|'canopy'|null {
  const p=b.ring[0]
  if(!p) return null
  if(b.id==='w95115662' && Math.abs(p.lat-31.155)<.01 && Math.abs(p.lon-121.425)<.01) return 'south'
  if(Math.abs(p.lat-31.2)>.02 || Math.abs(p.lon-121.32)>.02) return null
  if(b.id==='w70364443') return 'hongqiao'
  if(b.id==='w558909169'||b.id==='w558909171') return 'canopy'
  return null
}

/** Outline-driven reference reconstruction, not surveyed structural steelwork. Z-up metres. */
export function stationGeometry(form: NonNullable<ReturnType<typeof stationForm>>, ring: THREE.Vector2[]): THREE.BufferGeometry {
  const positions:number[]=[], colors:number[]=[]
  const roof=[.72,.75,.76], glass=[.22,.36,.40], steel=[.55,.58,.60]
  const tri=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,t:number[])=>{for(const v of [a,b,c]){positions.push(v.x,v.y,v.z);colors.push(...t)}}
  const quad=(a:THREE.Vector3,b:THREE.Vector3,c:THREE.Vector3,d:THREE.Vector3,t:number[])=>{tri(a,b,c,t);tri(a,c,d,t)}
  const beam=(a:THREE.Vector3,b:THREE.Vector3,r:number)=>{
    const g=new THREE.CylinderGeometry(r,r,a.distanceTo(b),4).rotateX(Math.PI/2)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),b.clone().sub(a).normalize()))
    g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2)
    const p=g.toNonIndexed().getAttribute('position')
    for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));colors.push(...steel)}
    g.dispose()
  }
  const bounds=new THREE.Box2().setFromPoints(ring),center=bounds.getCenter(new THREE.Vector2())
  if(form==='south') {
    const radius=Math.min(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y)/2
    const z=(r:number)=>24+12*(1-r*r)
    const at=(i:number,r:number,h:number)=>new THREE.Vector3(center.x+Math.cos(i*Math.PI/64)*radius*r,center.y+Math.sin(i*Math.PI/64)*radius*r,h)
    for(let i=0;i<128;i++) {
      for(let j=0;j<12;j++) {
        const r=j/12,s=(j+1)/12
        quad(at(i,r,z(r)),at(i+1,r,z(r)),at(i+1,s,z(s)),at(i,s,z(s)),j%3===0?glass:roof)
      }
      quad(at(i,.91,0),at(i+1,.91,0),at(i+1,.91,23),at(i,.91,23),glass)
      if(i%4===0) {
        beam(at(i,.91,0),at(i,.91,24),.32)
        for(let j=1;j<12;j++) beam(at(i,j/12,z(j/12)+.25),at(i,(j+1)/12,z((j+1)/12)+.25),.18)
      }
    }
  } else {
    const top=form==='canopy'?10:30, bottom=form==='canopy'?9.35:9
    for(const face of THREE.ShapeUtils.triangulateShape(ring,[])) {
      const v=face.map(i=>new THREE.Vector3(ring[i].x,ring[i].y,top))
      tri(v[0],v[1],v[2],roof)
      tri(v[2].clone().setZ(top-.65),v[1].clone().setZ(top-.65),v[0].clone().setZ(top-.65),steel)
    }
    for(let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length],len=a.distanceTo(b)
      quad(new THREE.Vector3(a.x,a.y,bottom),new THREE.Vector3(b.x,b.y,bottom),new THREE.Vector3(b.x,b.y,top),new THREE.Vector3(a.x,a.y,top),form==='canopy'?roof:glass)
      const n=Math.ceil(len/18)
      for(let j=0;j<n;j++) {
        const p=a.clone().lerp(b,j/n)
        beam(new THREE.Vector3(p.x,p.y,0),new THREE.Vector3(p.x,p.y,top),form==='canopy'?.35:.5)
      }
    }
  }
  const g=new THREE.BufferGeometry()
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals()
  return g
}
