import {createServer} from 'vite'
import fs from 'node:fs/promises'
import {Vector3,Matrix4,Mesh,MeshStandardMaterial} from 'three'
const district=process.argv[2]??'xintiandi';if(!['xintiandi','jingan','yuyuan'].includes(district))throw Error('Unknown district');
const out=`.tmp/shanghai-city/${district}`;await fs.mkdir(out,{recursive:true})
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {parseOsmFeatures}=await server.ssrLoadModule('/src/lib/geo/osm-features.ts')
 const {buildLinearLayer,buildSurfaceLayer,buildTreeLayer,solveSceneVertical}=await server.ssrLoadModule('/src/lib/geo/osm-scene.ts')
 const {buildBuildingsGeometry}=await server.ssrLoadModule('/src/lib/geo/building-mesh.ts')
 const {latLonToNormalized,metresToNormalized}=await server.ssrLoadModule('/src/lib/geo/geo-math.ts')
 const data=JSON.parse(await fs.readFile(`src/lib/geo/__fixtures__/shanghai-${district}.json`,'utf8'))
 const [lat,lon]=district==='jingan'?[31.22541,121.44073]:district==='yuyuan'?[31.22917,121.4875]:[31.218,121.4755];
 const features=parseOsmFeatures(data),origin=latLonToNormalized(lat,lon),unit=metresToNormalized(lat)
 const opts={anchorLat:lat,anchorLon:lon,quality:'detailed'};opts.vertical=solveSceneVertical(features,opts)
 const roots=[]
 for(const kind of ['road','rail']){const r=buildLinearLayer(features,kind,opts);if(r)roots.push(r.object)}
 for(const kind of ['green','water']){const r=buildSurfaceLayer(features,kind,opts);if(r)roots.push(r.object)}
 const built=buildBuildingsGeometry(features.filter(f=>f.kind==='building'&&f.ring),{...opts,detail:'detailed',lit:true,localOrigin:true})
 if(built){const m=new Mesh(built.geometry,new MeshStandardMaterial({vertexColors:true}));m.name='Shanghai buildings';m.position.set(built.origin.x,built.origin.y,0);roots.push(m)}
 const trees=buildTreeLayer(features,opts);if(trees)roots.push(trees.object)
 const {buildShanghaiParkDetails}=await server.ssrLoadModule('/src/lib/geo/shanghai-parks.ts')
 const parks=buildShanghaiParkDetails(features,{...opts,waterElevation:()=>.15*unit});if(parks)roots.push(parks.water,parks.green)
 const meshes=[]
 for(const root of roots){root.updateMatrixWorld(true);root.traverse(n=>{
  if(!n.isMesh)return
  const tint=n.material?.color??{r:1,g:1,b:1};
  const g=n.geometry.index?n.geometry.toNonIndexed():n.geometry,p=g.getAttribute('position'),c=g.getAttribute('color'),vertices=[],colors=[]
  for(let j=0;j<(n.isInstancedMesh?n.count:1);j++){
   const m=new Matrix4();if(n.isInstancedMesh)n.getMatrixAt(j,m);m.premultiply(n.matrixWorld)
   for(let i=0;i<p.count;i++){const v=new Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(m);vertices.push([(v.x-origin.nx)/unit,(v.y-origin.ny)/unit,v.z/unit]);colors.push(c?[c.getX(i),c.getY(i),c.getZ(i),1]:[tint.r,tint.g,tint.b,1])}
  }
  meshes.push({name:n.name||'Mapped surface',vertices,colors})
 })}
 await fs.writeFile(`${out}/mesh.json`,JSON.stringify({meshes,origin:{lat,lon},source:data.source,note:'OSM outlines and tags. Procedural windows and fallback heights are approximate.'}))
 console.log({out,buildings:built?.count,triangles:meshes.reduce((n,m)=>n+m.vertices.length/3,0)})
}finally{await server.close()}
