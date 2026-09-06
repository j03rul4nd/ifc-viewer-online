import fs from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
const w=require('web-ifc'),api=new w.IfcAPI()
await api.Init()
const id=api.OpenModel(new Uint8Array(fs.readFileSync('public/models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc')),{COORDINATE_TO_ORIGIN:false})
const count=type=>api.GetLineIDsWithType(id,type).size()
const pearls=new Set(),properties=api.GetLineIDsWithType(id,w.IFCPROPERTYSINGLEVALUE)
for(let i=0;i<properties.size();i++){
 const p=api.GetLine(id,properties.get(i))
 if(p.Name.value==='PearlId')pearls.add(p.NominalValue.value)
}
const columns=api.GetLineIDsWithType(id,w.IFCCOLUMN);let vertical=0,inclined=0
for(let i=0;i<columns.size();i++){
 const name=api.GetLine(id,columns.get(i)).Name.value
 if(name.startsWith('Main concrete tube'))vertical++
 if(name.startsWith('Inclined tripod leg'))inclined++
}
let meshes=0,triangles=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
api.StreamAllMeshes(id,mesh=>{
 meshes++
 for(let j=0;j<mesh.geometries.size();j++){
  const pg=mesh.geometries.get(j),g=api.GetGeometry(id,pg.geometryExpressID)
  const v=api.GetVertexArray(g.GetVertexData(),g.GetVertexDataSize()),ix=api.GetIndexArray(g.GetIndexData(),g.GetIndexDataSize()),m=pg.flatTransformation
  if(v.length===0||ix.length===0)throw Error(`Empty geometry ${mesh.expressID}`)
  for(let k=0;k<v.length;k+=6){
   const raw=[0,1,2].map(r=>m[r]*v[k]+m[4+r]*v[k+1]+m[8+r]*v[k+2]+m[12+r]),p=[raw[0],-raw[2],raw[1]]
   for(let r=0;r<3;r++){
    if(!Number.isFinite(p[r]))throw Error('Nonfinite coordinate')
    min[r]=Math.min(min[r],p[r]);max[r]=Math.max(max[r],p[r])
   }
  }
  triangles+=ix.length/3;g.delete()
 }
})
const result={storeys:count(w.IFCBUILDINGSTOREY),spaces:count(w.IFCSPACE),pearls:[...pearls],vertical,inclined,meshes,triangles,min,max}
api.CloseModel(id);console.log(JSON.stringify(result,null,2))
if(result.storeys!==25||result.spaces!==25||pearls.size!==11||vertical!==3||inclined!==3||meshes<150||triangles<10000||Math.abs(max[2]-468)>.1)throw Error('Oriental Pearl verification failed')
