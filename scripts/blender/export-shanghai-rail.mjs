import {createServer} from 'vite'
import fs from 'node:fs/promises'
import {Vector3,Matrix4,Mesh,MeshStandardMaterial} from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
const name=process.argv[2]??'hongqiao',out=`.tmp/shanghai-rail/${name}`
await fs.mkdir(out,{recursive:true})
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {parseOsmFeatures}=await server.ssrLoadModule('/src/lib/geo/osm-features.ts')
 const {buildLinearLayer,solveSceneVertical}=await server.ssrLoadModule('/src/lib/geo/osm-scene.ts')
 const {buildBuildingsGeometry}=await server.ssrLoadModule('/src/lib/geo/building-mesh.ts')
 const {buildVehicleLayer}=await server.ssrLoadModule('/src/lib/geo/props-scene.ts')
 const {latLonToNormalized,metresToNormalized}=await server.ssrLoadModule('/src/lib/geo/geo-math.ts')
 const fixture=JSON.parse(await fs.readFile(`src/lib/geo/__fixtures__/shanghai-${name}.json`,'utf8'))
 const features=parseOsmFeatures(fixture),lat=name==='south'?31.1551:31.2001,lon=name==='south'?121.4248:121.3205
 const origin=latLonToNormalized(lat,lon),unit=metresToNormalized(lat),assets=new Map()
 for(const id of ['train-carriage','train-cab','catenary-mast']) {
   const bytes=await fs.readFile(`public/models/props/${id}.glb`)
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
   gltf.scene.updateMatrixWorld(true)
   gltf.scene.traverse(n=>{if(n.isMesh) assets.set(id,n.geometry.clone().applyMatrix4(n.matrixWorld))})
 }
 const opts={anchorLat:lat,anchorLon:lon,quality:'detailed',assets};opts.vertical=solveSceneVertical(features,opts)
 const objects=[],rail=buildLinearLayer(features,'rail',opts),props=buildVehicleLayer(features.filter(f=>f.kind==='rail'),opts)
 if(rail)objects.push(rail.object)
 if(props)objects.push(props.object)
 const buildings=features.filter(f=>f.kind==='building'&&f.ring)
 const built=buildBuildingsGeometry(buildings,{...opts,detail:'detailed',lit:true})
 if(built)objects.push(new Mesh(built.geometry,new MeshStandardMaterial({vertexColors:true})))
 const meshes=[]
 for(const root of objects) {
 root.updateMatrixWorld(true)
 root.traverse(n=>{
 if(!n.isMesh)return
 const g=n.geometry.index?n.geometry.toNonIndexed():n.geometry,p=g.getAttribute('position'),c=g.getAttribute('color'),vertices=[],colors=[]
 for(let instance=0;instance<(n.isInstancedMesh?n.count:1);instance++){
   const m=new Matrix4();if(n.isInstancedMesh)n.getMatrixAt(instance,m);m.premultiply(n.matrixWorld)
   for(let i=0;i<p.count;i++){
     const v=new Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(m)
     vertices.push([(v.x-origin.nx)/unit,(v.y-origin.ny)/unit,v.z/unit]);colors.push(c?[c.getX(i),c.getY(i),c.getZ(i),1]:[.4,.4,.4,1])
   }
 }
 meshes.push({name:n.name||'Station architecture',vertices,colors,instanceVertices:p.count})
 })}
 await fs.writeFile(`${out}/mesh.json`,JSON.stringify({meshes,origin:{lat,lon},note:'OSM outlines. Reference reconstruction. Train positions decorative.'}))
 console.log({out,features:features.length,triangles:meshes.reduce((s,m)=>s+m.vertices.length/3,0),trains:props?.counts})
} finally {await server.close()}
