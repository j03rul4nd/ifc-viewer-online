// Export the actual production mesh through Vite's TypeScript module pipeline.
import { createServer } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Vector3 } from 'three'
const out=path.resolve(process.argv[2] ?? '.tmp/shanghai-bridges')
await fs.mkdir(out,{recursive:true})
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'})
try {
  const {parseOsmFeatures}=await server.ssrLoadModule('/src/lib/geo/osm-features.ts')
  const {buildLinearLayer,solveSceneVertical}=await server.ssrLoadModule('/src/lib/geo/osm-scene.ts')
  const {latLonToNormalized,metresToNormalized}=await server.ssrLoadModule('/src/lib/geo/geo-math.ts')
  const data=JSON.parse(await fs.readFile('src/lib/geo/__fixtures__/shanghai-parks.json','utf8'))
  const access=JSON.parse(await fs.readFile('src/lib/geo/__fixtures__/shanghai-access.json','utf8'))
  data.elements=[...access.elements,...data.elements]
  const features=parseOsmFeatures(data),lat=31.24022,lon=121.49599
  const origin=latLonToNormalized(lat,lon),unit=metresToNormalized(lat)
  const opts={anchorLat:lat,anchorLon:lon,quality:'detailed'}
  opts.vertical=solveSceneVertical(features,opts)
  const built=buildLinearLayer(features,'road',opts),meshes=[]
  built.object.updateMatrixWorld(true)
  built.object.traverse(n=>{
    if(!n.isMesh) return
    const g=n.geometry.index?n.geometry.toNonIndexed():n.geometry
    const p=g.getAttribute('position'),c=g.getAttribute('color'),vertices=[],colors=[]
    for(let i=0;i<p.count;i++){
      const v=new Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(n.matrixWorld)
      vertices.push([(v.x-origin.nx)/unit,(v.y-origin.ny)/unit,v.z/unit])
      colors.push(c?[c.getX(i),c.getY(i),c.getZ(i),1]:[.5,.5,.5,1])
    }
    meshes.push({name:n.name||'Lujiazui roads',vertices,colors})
  })
  await fs.writeFile(path.join(out,'mesh.json'),JSON.stringify({meshes,origin:{lat,lon},note:'Production mesh; OSM reference reconstruction; illustrative railings and piers.'}))
  console.log(JSON.stringify({out,meshes:meshes.length,triangles:meshes.reduce((s,m)=>s+m.vertices.length/3,0)}))
} finally {await server.close()}
