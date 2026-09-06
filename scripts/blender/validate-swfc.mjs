import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { IfcAPI, IFCBUILDINGSTOREY } = require('web-ifc')
const api = new IfcAPI()
await api.Init()
const file = path.resolve('public/models/swfc/SHA-IVO-SWFC-A-0001.ifc')
const id = api.OpenModel(new Uint8Array(fs.readFileSync(file)), { COORDINATE_TO_ORIGIN: false })
const floors = api.GetLineIDsWithType(id, IFCBUILDINGSTOREY).size()
let meshes=0, triangles=0, min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity]
let portalHits=0
// Ray from (0,-100,457) in IFC coordinates, through the portal centre.
const sub=(a,b)=>a.map((x,i)=>x-b[i])
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0)
function hit(a,b,c) {
  const origin=[0,-100,457], dir=[0,1,0], e1=sub(b,a),e2=sub(c,a),h=cross(dir,e2),det=dot(e1,h)
  if(Math.abs(det)<1e-8)return false
  const s=sub(origin,a),u=dot(s,h)/det
  if(u<0||u>1)return false
  const q=cross(s,e1),v=dot(dir,q)/det,t=dot(e2,q)/det
  return v>=0&&u+v<=1&&t>0
}
api.StreamAllMeshes(id, mesh=>{
  meshes++
  for(let j=0;j<mesh.geometries.size();j++){
    const placed=mesh.geometries.get(j),g=api.GetGeometry(id,placed.geometryExpressID)
    const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()),ix=api.GetIndexArray(g.GetIndexData(),g.GetIndexDataSize()),m=placed.flatTransformation
    const points=[]
    for(let k=0;k<v.length;k+=6){
      const raw=[0,1,2].map(r=>m[r]*v[k]+m[4+r]*v[k+1]+m[8+r]*v[k+2]+m[12+r])
      // web-ifc output is Y-up; recover IFC Z-up for geometric assertions.
      const p=[raw[0],-raw[2],raw[1]]
      points.push(p)
      for(let r=0;r<3;r++){min[r]=Math.min(min[r],p[r]);max[r]=Math.max(max[r],p[r])}
    }
    for(let k=0;k<ix.length;k+=3)if(hit(points[ix[k]],points[ix[k+1]],points[ix[k+2]]))portalHits++
    triangles+=ix.length/3
    g.delete()
  }
})
api.CloseModel(id)
const result={floors,meshes,triangles,min,max,portalHits}
console.log(JSON.stringify(result,null,2))
if(floors!==104||meshes<700||triangles<10000||Math.abs(max[2]-492)>.02||portalHits!==0)throw Error('SWFC geometry verification failed')
