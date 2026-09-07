import fs from 'node:fs'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url),w=require('web-ifc'),api=new w.IfcAPI()
await api.Init()
const id=api.OpenModel(new Uint8Array(fs.readFileSync('public/models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc')),{COORDINATE_TO_ORIGIN:false})
let meshes=0,triangles=0,crownHits=0,coreVoidHits=0,outerSectors=0,innerSkins=0
const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
function verticalHit(a,b,c,x,y){
 const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-10)return null
 const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d
 const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d
 if(u<0||v<0||u+v>1)return null
 return u*a[2]+v*b[2]+(1-u-v)*c[2]
}
api.StreamAllMeshes(id,mesh=>{
 const name=api.GetLine(id,mesh.expressID).Name?.value??''
 if(name.includes('outer skin A sector'))outerSectors++
 if(name.includes('inner skin B'))innerSkins++
 meshes++
 for(let j=0;j<mesh.geometries.size();j++){
  const pg=mesh.geometries.get(j),g=api.GetGeometry(id,pg.geometryExpressID),m=pg.flatTransformation
  const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()),ix=api.GetIndexArray(g.GetIndexData(),g.GetIndexDataSize()),points=[]
  if(!v.length||!ix.length)throw Error('Empty mesh '+name)
  for(let k=0;k<v.length;k+=6){
   const q=[0,1,2].map(r=>m[r]*v[k]+m[r+4]*v[k+1]+m[r+8]*v[k+2]+m[r+12]),p=[q[0],-q[2],q[1]];points.push(p)
   p.forEach((c,r)=>{if(!Number.isFinite(c))throw Error('Invalid vertex');min[r]=Math.min(min[r],c);max[r]=Math.max(max[r],c)})
  }
  for(let k=0;k<ix.length;k+=3){
   const a=points[ix[k]],b=points[ix[k+1]],c=points[ix[k+2]]
   if(Math.max(a[2],b[2],c[2])>592){const hit=verticalHit(a,b,c,0,0);if(hit!==null&&hit>592)crownHits++}
   if(name==='L009 circular floor with core void'&&verticalHit(a,b,c,8,8)!==null)coreVoidHits++
  }
  triangles+=ix.length/3;g.delete()
 }
})
const report={meshes,triangles,storeys:api.GetLineIDsWithType(id,w.IFCBUILDINGSTOREY).size(),spaces:api.GetLineIDsWithType(id,w.IFCSPACE).size(),outerSectors,innerSkins,crownHits,coreVoidHits,min,max,mapConversions:api.GetLineIDsWithType(id,w.IFCMAPCONVERSION).size()}
api.CloseModel(id);console.log(JSON.stringify(report,null,2))
if(report.storeys!==133||report.spaces!==133||meshes<1500||outerSectors!==384||innerSkins!==112||crownHits||coreVoidHits||Math.abs(max[2]-632)>.25||report.mapConversions!==1)throw Error('Shanghai Tower geometry validation failed')
fs.writeFileSync('public/models/shanghai-tower/geometry-validation.json',JSON.stringify(report,null,2)+'\n')
