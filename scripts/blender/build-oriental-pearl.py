"""Drawing/photo-based Oriental Pearl reference IFC, not as-built.
blender --background --python scripts/blender/build-oriental-pearl.py -- public/models/oriental-pearl
"""
import os, sys, math, json, hashlib
import bpy
import numpy as np
from mathutils import Vector
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.validate
sys.path.insert(0, os.path.dirname(__file__))
import bonsai_kit as kit
import shanghai_georeference

OUT=os.path.abspath(sys.argv[sys.argv.index('--')+1]); os.makedirs(OUT,exist_ok=True)
for o in list(bpy.data.objects): bpy.data.objects.remove(o,do_unlink=True)
kit.deterministic_guids('oriental-pearl-reference-20260906')
f=ifcopenshell.api.run('project.create_file',version='IFC4')
api=lambda op,**kw: ifcopenshell.api.run(op,f,**kw)
project=api('root.create_entity',ifc_class='IfcProject',name='Oriental Pearl Tower / Torre Perla Oriental')
api('unit.assign_unit',units=[api('unit.add_si_unit',unit_type=t) for t in ['LENGTHUNIT','AREAUNIT','VOLUMEUNIT']])
context=api('context.add_context',context_type='Model')
body=api('context.add_context',context_type='Model',context_identifier='Body',target_view='MODEL_VIEW',parent=context)
site=api('root.create_entity',ifc_class='IfcSite',name='Lujiazui, Pudong â€” approximate site')
building=api('root.create_entity',ifc_class='IfcBuilding',name='Oriental Pearl â€” approximate reconstruction')
api('aggregate.assign_object',products=[site],relating_object=project)
api('aggregate.assign_object',products=[building],relating_object=site)
site_data=shanghai_georeference.apply(f,site,building,'oriental-pearl')
for obj in [site,building]: api('geometry.edit_object_placement',product=obj)
kit.add_pset(f,building,'ReferenceModelEvidence',{
 'Status':'Approximate reference reconstruction; not an official model, survey or structural design',
 'Architect':'Jiang Huancheng (Jia Huan Cheng in supplied reference)',
 'HeightMetres':468.,'PearlCount':11,'ReferenceLevels':25,
 'Source':'https://www.meet-in-shanghai.net/en/pudong-new-area/the-oriental-pearl-tv-tower-341119/',
 'GeometryBasis':'User-supplied section: lower sphere 68..118 m; upper sphere 250..295 m. Photographic form and structural cross-section.',
 'Uncertainty':'25 authored reference levels, not a verified floor schedule. Capsule geometry reconciles contradictory 342/351 m references approximately. Interior details indicative; plan alignment from OSM, not surveyed.'})

colors={'Concrete':(.69,.68,.63),'Silver':(.70,.74,.76),'PearlGlass':(.48,.16,.32),'RoseGlass':(.64,.27,.43),'DarkGlass':(.18,.27,.32),'Steel':(.29,.33,.36),'Stone':(.63,.61,.56),'Green':(.22,.37,.25),'White':(.86,.86,.80),'Red':(.57,.16,.21)}
materials={}
for name,c in colors.items():
 mat=api('material.add_material',name=name,category=name)
 style=api('style.add_style',name=name)
 api('style.add_surface_style',style=style,ifc_class='IfcSurfaceStyleRendering',attributes={'SurfaceColour':dict(zip(['Red','Green','Blue'],c)),'Transparency':0.,'ReflectanceMethod':'NOTDEFINED'})
 bm=bpy.data.materials.new(name); bm.diffuse_color=(*c,1); bm.use_nodes=True
 shader=bm.node_tree.nodes.get('Principled BSDF'); shader.inputs['Base Color'].default_value=(*c,1)
 shader.inputs['Metallic'].default_value=.45 if name in ['Silver','PearlGlass','RoseGlass'] else .05
 shader.inputs['Roughness'].default_value=.3 if 'Glass' in name else .55
 materials[name]=(mat,style,bm)

levels=[(0,'Museum / arrivals'),(9,'Museum mezzanine'),(18,'Restaurant platform'),(78,'Multimedia show'),(86,'Lower sphere technical'),(90,'Space City / observation'),(98,'Lower sphere recreation')]
levels += [(z,'Space Hotel â€” indicative suite level') for z in [132,156,180,204,228]]
levels += [(z,name) for z,name in [(253,'Upper sphere technical'),(257,'Upper sphere services'),(259,'Transparent observatory'),(263,'Sky Galleria'),(267,'Revolving restaurant'),(273,'Broadcasting / technical'),(280,'Broadcasting / technical'),(287,'Upper sphere technical'),(292,'Upper sphere crown')]]
levels += [(334,'Capsule services'),(340,'Capsule access'),(346,'Capsule gallery'),(351,'Space Capsule observatory')]
storeys={}
for z,name in levels:
 s=api('root.create_entity',ifc_class='IfcBuildingStorey',name=f'{z:03} m â€” {name}'); s.Elevation=float(z); s.CompositionType='ELEMENT'
 api('aggregate.assign_object',products=[s],relating_object=building)
 m=np.eye(4);m[2,3]=z;api('geometry.edit_object_placement',product=s,matrix=m);storeys[z]=s
 space=api('root.create_entity',ifc_class='IfcSpace',name=f'{z} m â€” {name} (indicative)')
 api('aggregate.assign_object',products=[space],relating_object=s);api('geometry.edit_object_placement',product=space,matrix=m)
 kit.add_pset(f,space,'Pset_SpaceCommon',{'Reference':f'OP-{z}','IsExternal':False})
 kit.add_pset(f,space,'ReferenceSpace',{'Use':name,'LayoutStatus':'Indicative, not measured','LevelMetres':float(z)})
kit.add_pset(f,building,'ReferenceFloorSchedule',{'Note':'3 base + 4 lower sphere + 5 intermediate + 9 upper sphere + 4 capsule. Inferred reference hierarchy, not verified 14/25 physical floors.'})

def ring(r,z,cx=0,cy=0,N=64): return [(cx+r*math.cos(2*math.pi*i/N),cy+r*math.sin(2*math.pi*i/N),z) for i in range(N)]
def loft(lo,hi):
 n=len(lo);return lo+hi,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
def cylinder(r,z,h,cx=0,cy=0,N=48): return loft(ring(r,z,cx,cy,N),ring(r,z+h,cx,cy,N))
def tube(a,b,r,N=24,r2=None):
 a=Vector(a); b=Vector(b); axis=(b-a).normalized(); side=axis.cross(Vector((0,0,1)))
 if side.length<.01:side=Vector((1,0,0))
 side.normalize();up=axis.cross(side).normalized()
 def cap(p,rad):return [tuple(p+rad*(side*math.cos(2*math.pi*i/N)+up*math.sin(2*math.pi*i/N))) for i in range(N)]
 return loft(cap(a,r),cap(b,r if r2 is None else r2))
def box(x,y,z,dx,dy,dz):
 return loft([(x,y,z),(x+dx,y,z),(x+dx,y+dy,z),(x,y+dy,z)],[(x,y,z+dz),(x+dx,y,z+dz),(x+dx,y+dy,z+dz),(x,y+dy,z+dz)])
elements=[];types={}
def add(cls,name,z,material,parts,pearl=None):
 e=api('root.create_entity',ifc_class=cls,name=name)
 e.Description='Approximate drawing/photo reconstruction. See ReferenceModelEvidence and docs/ORIENTAL_PEARL_RECONSTRUCTION.md.'
 api('spatial.assign_container',products=[e],relating_structure=storeys[z])
 api('geometry.edit_object_placement',product=e)
 key=(cls,material)
 if key not in types:
  types[key]=api('root.create_entity',ifc_class=cls+'Type',name=f'Reference {cls[3:]} â€” {material}',predefined_type='USERDEFINED')
  types[key].ElementType='Approximate reference component'
 api('type.assign_type',related_objects=[e],relating_type=types[key])
 verts=[];faces=[]
 for v,fac in parts:
  offset=len(verts);verts.extend(v);faces.extend([tuple(i+offset for i in face) for face in fac])
 rep=api('geometry.add_mesh_representation',context=body,vertices=[verts],faces=[faces])
 api('geometry.assign_representation',product=e,representation=rep)
 mat,style,bm=materials[material]
 api('style.assign_representation_styles',shape_representation=rep,styles=[style])
 api('material.assign_material',products=[e],type='IfcMaterial',material=mat)
 if pearl: kit.add_pset(f,e,'ReferencePearl',pearl)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(bm)
 elements.append(e);return e

def sphere(name,center,r,z,rz=None,glazed=True,N=64,M=24):
 # Closed wedge panels, individually triangulated; polar triangles avoid degenerate faces.
 cx,cy,cz=center;rz=rz or r
 verts=[(cx,cy,cz-rz)]
 for j in range(1,M):
  lat=-math.pi/2+math.pi*j/M
  for i in range(N):
   a=2*math.pi*i/N
   verts.append((cx+r*math.cos(lat)*math.cos(a),cy+r*math.cos(lat)*math.sin(a),cz+rz*math.sin(lat)))
 top=len(verts);verts.append((cx,cy,cz+rz))
 faces=[]
 for i in range(N):faces.append((0,1+(i+1)%N,1+i))
 for j in range(M-2):
  for i in range(N):
   a=1+j*N+i;b=1+j*N+(i+1)%N;c=a+N;d=b+N
   faces.extend([(a,b,d),(a,d,c)] if (j+i)%2 else [(a,b,c),(b,d,c)])
 for i in range(N):faces.append((top,1+(M-2)*N+i,1+(M-2)*N+(i+1)%N))
 buckets={};edge_set=set()
 for face in faces:
  relative=sum(verts[i][2]-cz for i in face)/3/rz
  mat=('PearlGlass' if relative<.32 else 'RoseGlass') if glazed and -.35<relative<.78 else 'Silver'
  buckets.setdefault(mat,[]).append(face)
  if mat in ['PearlGlass','RoseGlass']:
   for a,b in zip(face,face[1:]+face[:1]):edge_set.add(tuple(sorted((a,b))))
 for idx,(mat,fac) in enumerate(buckets.items()):
  add('IfcCurtainWall',name+' â€” '+mat,z,mat,[(verts,fac)],{'PearlId':name,'CenterZ':float(cz),'DiameterXY':float(2*r),'VerticalDiameter':float(2*rz),'AssumedGeometry':True})
 if edge_set:add('IfcMember',name+' triangular glazing lattice',z,'Silver',[tube(verts[a],verts[b],.065,N=6) for a,b in sorted(edge_set)])

def annulus(ro,ri,z,h,cx=0,cy=0,N=64):
 parts=[]
 outer=ring(ro,z,cx,cy,N);inner=ring(ri,z,cx,cy,N)
 for i in range(N):
  j=(i+1)%N;lo=[outer[i],outer[j],inner[j],inner[i]]
  parts.append(loft(lo,[(x,y,zz+h) for x,y,zz in lo]))
 return parts

# Museum podium, arrival platform and base tripod.
add('IfcSlab','Circular arrival plaza â€” indicative',0,'Stone',[cylinder(55,-.35,.35)])



add('IfcSlab','18 m restaurant platform',18,'Concrete',[cylinder(19,18,.5)])
add('IfcCurtainWall','18 m restaurant glazing',18,'DarkGlass',annulus(18.5,18.3,18.5,3.8))
add('IfcRoof','Restaurant canopy',18,'Silver',[cylinder(19,22.3,.35)])
axes=[]
for k in range(3):
 a=math.radians(90+120*k);u,v=math.cos(a),math.sin(a);cx,cy=10.8*u,10.8*v;axes.append((cx,cy))
 add('IfcColumn',f'Main concrete tube {k+1} â€” diameter 9 m',0,'Concrete',annulus(4.5,3.65,0,267,cx,cy,N=48))
 foot=(45*u,45*v,0);head=(cx,cy,68)
 add('IfcColumn',f'Inclined tripod leg {k+1} â€” diameter 7 m',0,'Concrete',[tube(foot,head,3.5,N=40)])
 c=tuple(foot[i]+(head[i]-foot[i])*.47 for i in range(3))
 sphere(f'Base pearl {k+1}',c,5.,0,glazed=False,N=32,M=16)
 add('IfcMember',f'Tripod brace {k+1}',0,'Concrete',[tube(c,(0,0,12),1.8,N=24)])
 # Fine joints on the exposed vertical columns.
 parts=[]
 for z in range(120,249,6):parts+=annulus(4.54,4.48,z,.055,cx,cy,N=32)
 add('IfcMember',f'Concrete tube {k+1} construction joints',98,'Silver',parts)
 # Lift shaft, no invented lift schedule or equipment specification.
 add('IfcMember',f'Lift guide rails in tube {k+1}',0,'Steel',[box(cx+dx,cy-1.5,0,.12,.12,267) for dx in [-1.5,1.5]])
 add('IfcTransportElement',f'Indicative lift cabin in tube {k+1}',0,'Silver',[box(cx-1.25,cy-1.25,1,2.5,2.5,2.8)])

sphere('Lower pearl â€” Space City',(0,0,93),25,78)
sphere('Upper pearl â€” observation and restaurant',(0,0,272.5),22.5,253)
for z in [132,156,180,204,228]:
 sphere(f'Hotel pearl {z} m',(0,0,z+1),6,z,N=40,M=16)
 add('IfcSlab',f'Hotel level {z} m â€” three radial links',z,'Silver',[tube((0,0,z),(cx,cy,z),1.1,N=8) for cx,cy in axes])
 add('IfcCurtainWall',f'Hotel viewing band {z} m',z,'PearlGlass',annulus(6.2,6,z,2.1,N=40))
 for k in range(4):
  a=k*math.pi/2
  x,y=4.8*math.cos(a),4.8*math.sin(a);nx,ny=-.07*math.sin(a),.07*math.cos(a)
  lo=[(nx,ny,z+.3),(x+nx,y+ny,z+.3),(x-nx,y-ny,z+.3),(-nx,-ny,z+.3)]
  add('IfcWall',f'Indicative hotel partition {z}/{k+1}',z,'Stone',[loft(list(reversed(lo)),[(xx,yy,zz+2.6) for xx,yy,zz in reversed(lo)])])

# Named observation floors and indicative infill stay within the sphere sections.
for z,name in levels:
 if z<78:continue
 if z<=98:rad=math.sqrt(25**2-(z-93)**2)-.45
 elif z<250:rad=5.5
 elif z<=292:rad=math.sqrt(22.5**2-(z-272.5)**2)-.45
 else:rad=7*math.sqrt(max(.1,1-((z-347)/14)**2))-.35
 add('IfcSlab',f'{z} m â€” {name} floor',z,'Concrete',[cylinder(rad,z,.3)])
 if z in [90,259,263,267]:
  add('IfcRailing',f'{z} m observation balustrade',z,'Silver',[tube(a,b,.05,N=6) for a,b in zip(ring(rad,z+1.4),ring(rad,z+1.4)[1:]+ring(rad,z+1.4)[:1])])
 if z==267:
  add('IfcSlab','Revolving restaurant annular deck â€” no mechanical simulation',z,'Stone',annulus(rad-.3,7,z+.3,.12))
  tables=[]
  for i in range(20):
   a=i*2*math.pi/20;x=(rad-3)*math.cos(a);y=(rad-3)*math.sin(a)
   tables.extend([cylinder(.15,z+.4,.7,x,y,N=12),cylinder(.7,z+1.1,.09,x,y,N=20)])
  add('IfcFurnishingElement','Restaurant tables â€” indicative arrangement',z,'Stone',tables)

# Lower observation gallery is a real annulus, not an opaque belt across the globe.
for z,rad in [(90,25.5),(259,19.5)]:
 add('IfcSlab',f'{z} m external observation ring',z,'Silver',annulus(rad,rad-2,z,.35))
 add('IfcCurtainWall',f'{z} m observation ring glazing',z,'DarkGlass',annulus(rad,rad-.12,z+.35,2.8))

add('IfcColumn','Central upper broadcast shaft',292,'Concrete',[tube((0,0,292),(0,0,337),3.3,N=48)])
for z in [299,323,334]:
 add('IfcSlab',f'Technical antenna access collar {z} m',292 if z<334 else 334,'Silver',annulus(5,3.3,z,.35))
sphere('Space Capsule â€” approximate elongated envelope',(0,0,347),7,334,rz=14,N=48,M=24)
# Mast starts at 350 m and terminates at 468 m. Rings and lattice sit below that top.
add('IfcMember','118 m broadcast antenna spine',351,'Steel',[tube((0,0,350),(0,0,420),1.5,N=24,r2=.75),tube((0,0,420),(0,0,468),.75,N=20,r2=.12)])
for z in range(362,468,4):
 rad=1.45 if z<420 else .65
 add('IfcMember',f'Broadcast antenna marker {z} m',351,'Red' if (z//4)%2 else 'White',[cylinder(rad,z,min(2.,468-z),N=20)])
 lattice=[]
 for k in range(3):
  a=k*2*math.pi/3;b=(k+1)*2*math.pi/3
  lattice.append(tube((rad*math.cos(a),rad*math.sin(a),z),(rad*math.cos(b),rad*math.sin(b),min(z+4,468)),.07,N=6))
 add('IfcMember',f'Antenna lattice bracing {z} m',351,'Silver',lattice)

import oriental_pearl_details
oriental_pearl_details.build(globals())

kit.sort_unordered_aggregates(f)
filename='SHA-IVO-ORIENTAL-PEARL-A-0001.ifc'
kit.set_header(f,filename,'IFC Viewer Online','IFC Viewer Online','2026-09-06T00:00:00')
f.header.file_name.originating_system='IfcOpenShell API / Blender â€” reference reconstruction'
path=os.path.join(OUT,filename)
with open(path,'w',encoding='utf-8',newline='\n') as stream:stream.write(f.to_string())
logger=ifcopenshell.validate.json_logger();ifcopenshell.validate.validate(f,logger,express_rules=True)
errors=[s for s in logger.statements if s['level']=='error']
report={'schema':f.schema,'elements':len(elements),'referenceLevels':len(levels),'pearls':11,'sizeBytes':os.path.getsize(path),'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest(),'expressErrors':len(errors),'errors':[str(e) for e in errors[:5]]}
with open(os.path.join(OUT,'validation.json'),'w') as stream:json.dump(report,stream,indent=2)
print(json.dumps(report),flush=True)
if errors:raise RuntimeError(str(errors[:3]))

scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32
scene.world.color=(.55,.60,.68);scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1100;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.5,-.5,-.4);bpy.context.object.data.energy=3
bpy.ops.object.camera_add(location=(570,-950,430));camera=bpy.context.object;scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=525;camera.data.clip_end=5000
camera.rotation_euler=(Vector((0,0,231))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(OUT,'oriental-pearl-preview.png');bpy.ops.render.render(write_still=True)
camera.location=(0,-1000,237);camera.rotation_euler=(Vector((0,0,234))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(OUT,'oriental-pearl-elevation.png');bpy.ops.render.render(write_still=True)
