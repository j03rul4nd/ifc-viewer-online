"""Shanghai Tower: source-based architectural reconstruction, not as-built.
blender --background --python-exit-code 1 --python scripts/blender/build-shanghai-tower.py -- public/models/shanghai-tower
"""
import os, sys, math, json, hashlib
import bpy, numpy as np
from mathutils import Vector
import ifcopenshell, ifcopenshell.api, ifcopenshell.validate
sys.path.insert(0,os.path.dirname(__file__))
import bonsai_kit as kit
import shanghai_georeference
import shanghai_tower_mesh as mesh

OUT=os.path.abspath(sys.argv[sys.argv.index('--')+1]);os.makedirs(OUT,exist_ok=True)
for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
kit.deterministic_guids('shanghai-tower-reference-20260907')
f=ifcopenshell.api.run('project.create_file',version='IFC4')
api=lambda op,**kw:ifcopenshell.api.run(op,f,**kw)
project=api('root.create_entity',ifc_class='IfcProject',name='Shanghai Tower - Shanghai Zhongxin Dasha')
api('unit.assign_unit',units=[api('unit.add_si_unit',unit_type=t) for t in ['LENGTHUNIT','AREAUNIT','VOLUMEUNIT']])
context=api('context.add_context',context_type='Model')
body=api('context.add_context',context_type='Model',context_identifier='Body',target_view='MODEL_VIEW',parent=context)
site=api('root.create_entity',ifc_class='IfcSite',name='Lujiazui, Pudong, Shanghai')
building=api('root.create_entity',ifc_class='IfcBuilding',name='Shanghai Tower - approximate reference reconstruction')
api('aggregate.assign_object',products=[site],relating_object=project)
api('aggregate.assign_object',products=[building],relating_object=site)
for obj in [site,building]:api('geometry.edit_object_placement',product=obj)
site_data=shanghai_georeference.apply(f,site,building,'shanghai-tower')
kit.add_pset(f,building,'ReferenceModelEvidence',{
 'Status':'Drawing/photo-based reconstruction, not as-built, survey or structural design',
 'Architect':'Gensler','StructuralEngineer':'Thornton Tomasetti','HeightMetres':632.,
 'Source':'https://www.gensler.com/projects/shanghai-tower',
 'GeometrySource':'https://www.gensler.com/uploads/document/242/file/Shanghai_Tower_Facade_Design_Process_11_10_2011.pdf',
 'StructureSource':'https://www.thorntontomasetti.com/project/shanghai-tower',
 'FloorSchedule':'128 above-grade reference storeys plus five basement reference storeys; interpolated elevations, not measured floor schedule',
 'Assumptions':'Rounded arc transitions, podium tracing, core openings, interiors, crown cut and section sizes approximate. 2010 design geometry reconciled with user drawings.'})
materials={}
for name,color,trans in [('OuterGlass',(.42,.61,.69),.30),('InnerGlass',(.22,.36,.42),.12),('Silver',(.66,.72,.75),0.),('Concrete',(.55,.55,.52),0.),('Steel',(.26,.31,.34),0.),('Stone',(.68,.66,.60),0.),('White',(.81,.81,.76),0.),('Green',(.23,.38,.24),0.),('Dark',(.16,.19,.20),0.)]:
 mat=api('material.add_material',name=name,category=name)
 style=api('style.add_style',name=name)
 api('style.add_surface_style',style=style,ifc_class='IfcSurfaceStyleRendering',attributes={'SurfaceColour':dict(zip(['Red','Green','Blue'],color)),'Transparency':trans,'ReflectanceMethod':'NOTDEFINED'})
 bm=bpy.data.materials.new(name);bm.diffuse_color=(*color,1);bm.use_nodes=True
 shader=bm.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1)
 shader.inputs['Metallic'].default_value=.55 if name in ['OuterGlass','Silver'] else .12
 shader.inputs['Roughness'].default_value=.26 if 'Glass' in name else .48
 materials[name]=(mat,style,bm)

anchors=[(1,0.),(7,32.),(22,105.),(37,173.),(52,241.),(67,309.),(82,377.),(97,445.),(112,513.),(118,546.),(119,552.),(121,561.),(128,583.4),(129,587.)]
def elevation(n):
 if n<0:return n*4.5
 for (a,z),(b,w) in zip(anchors,anchors[1:]):
  if a<=n<=b:return z+(n-a)/(b-a)*(w-z)
def zone(n):
 return next((i+1 for i,end in enumerate([7,22,37,52,67,82,97,112,128]) if n<=end),9)
def use(n):
 if n<0:return 'Retail / parking / plant - reference'
 if n<=7:return 'Retail / conference / entrance'
 if n>=118:return 'Observation / cultural / technical'
 if n>=83:return 'Hotel / boutique office - reference zoning'
 return 'Office / sky lobby'
storeys={};floors=list(range(-5,0))+list(range(1,129))
for n in floors:
 s=api('root.create_entity',ifc_class='IfcBuildingStorey',name=f'B{-n}' if n<0 else f'{n:03} - Zone {zone(n)} - {use(n)}')
 s.Elevation=elevation(n);s.CompositionType='ELEMENT'
 api('aggregate.assign_object',products=[s],relating_object=building)
 m=np.eye(4);m[2,3]=elevation(n);api('geometry.edit_object_placement',product=s,matrix=m);storeys[n]=s
 sp=api('root.create_entity',ifc_class='IfcSpace',name=f'{n} - {use(n)}')
 api('aggregate.assign_object',products=[sp],relating_object=s);api('geometry.edit_object_placement',product=sp,matrix=m)
 kit.add_pset(f,sp,'ReferenceSpace',{'Use':use(n),'Zone':zone(n),'LayoutStatus':'Indicative, not surveyed','ElevationMetres':elevation(n)})
mesh.bind(globals());add=mesh.add;box=mesh.box;tube=mesh.tube;loft=mesh.loft;ring=mesh.ring;annulus=mesh.annulus;cylinder=mesh.cylinder

# Tangential-arc triangular profile: Gensler Figure 3 R1=88.830m, L4=47.565m.
# Circular intersections are softly filleted by one local smoothing pass.
N=144
raw=[]
for i in range(N):
 a=2*math.pi*i/N
 rad=min(47.565*math.cos(a-b)+math.sqrt(88.83**2-(47.565*math.sin(a-b))**2) for b in [0,2*math.pi/3,4*math.pi/3])
 raw.append(rad)
radii=[(raw[(i-1)%N]+2*raw[i]+raw[(i+1)%N])/4 for i in range(N)]
def scale(z):return math.exp(math.log(.535686)*max(-45.,min(z,632)-45.)/560.)
def twist(z):return math.radians(120)*max(0,min(1,(z-45.)/560.))
def outer(z):
 pts=[]
 for i,r in enumerate(radii):
  a=2*math.pi*i/N+twist(z)
  # A narrow recessed seam follows the plan's V-strike, not a surface diagrid.
  notch=.91 if i in [95,96] else 1
  pts.append((r*scale(z)*notch*math.cos(a),r*scale(z)*notch*math.sin(a),z))
 return pts
def strip(lo,hi):
 return lo+hi,[(i,(i+1)%len(lo),(i+1)%len(lo)+len(lo),i+len(lo)) for i in range(len(lo))]
zone_first=[1,8,23,38,53,68,83,98,113]
def inner_radius(n):
 start=zone_first[zone(n)-1]
 return min(38.8*scale(elevation(start)),min(radii)*scale(elevation(min(start+14,128)))-1.1)

# Local frame +X points toward the north-facing rounded apex. Podium follows site plan.
podium_trace=[(137,89),(189,82),(200,87),(374,88),(478,113),(483,174),(447,204),(427,166),(391,123),(362,112),(330,119),(290,153),(263,181),(250,228),(230,252),(186,256),(147,240)]
# User site plan: tower axis at approximately image (367,245); scale inferred
# from the tower envelope. Project +X is the northern apex; +Y points west.
podium=[((245-y)*.33,(367-x)*.33) for x,y in podium_trace]
if sum(x*podium[(i+1)%len(podium)][1]-podium[(i+1)%len(podium)][0]*y for i,(x,y) in enumerate(podium))<0:podium.reverse()
def prism(poly,z,h):return loft([(x,y,z) for x,y in poly],[(x,y,z+h) for x,y in poly])
plaza=[]
for cx,cy,start in [(72,84,0),(-72,84,90),(-72,-84,180),(72,-84,270)]:
 for i in range(13):
  a=math.radians(start+i*7.5);plaza.append((cx+16*math.cos(a),cy+16*math.sin(a)))
add('IfcSlab','Arrival plaza - rounded site-plan boundary, approximate',1,'Stone',[prism(plaza,-.3,.3)])
for n in range(-5,0):add('IfcSlab',f'Basement {n} slab - indicative',n,'Concrete',[box(-72,-68,elevation(n),144,136,.5)])
add('IfcFooting','Tower raft - indicative extent, 6 m depth',-5,'Concrete',[cylinder(52,-28.5,6,N=96)])
for n in range(1,6):
 z=elevation(n)
 add('IfcSlab',f'Podium L{n} floor',n,'Concrete',[prism(podium,z,.4)])
 lo=[(x,y,z+.4) for x,y in podium];hi=[(x,y,z+4.6) for x,y in podium]
 add('IfcCurtainWall',f'Podium L{n} facade',n,'InnerGlass',[strip(lo,hi)])
add('IfcRoof','Podium landscaped roof',5,'Stone',[prism(podium,27,.45)])

for n in range(1,129):
 z=elevation(n);w=elevation(n+1);r=inner_radius(n);h=w-z
 # A square core void remains clear in each annular office plate.
 core=13.716*max(.68,1-z/2000.)
 out=ring(r,z,N=96)
 inside=[]
 for x,y,_ in out:
  t=core/max(abs(x),abs(y));inside.append((x*t,y*t,z))
 parts=[]
 for i in range(96):
  j=(i+1)%96;lo=[out[i],out[j],inside[j],inside[i]];parts.append(loft(lo,[(x,y,zz+.28) for x,y,zz in lo]))
 add('IfcSlab',f'L{n:03} circular floor with core void',n,'Concrete',parts)
 # Inner curtain wall is cylindrical and upright within each vertical zone.
 if n<113:add('IfcCurtainWall',f'L{n:03} inner skin B',n,'InnerGlass',[strip(ring(r,z+.3,N=96),ring(r,w-.1,N=96))])
 lo=outer(z);hi=outer(w)
 # Three separately selectable sectors per storey make the envelope inspectable.
 for sector in range(3):
  ids=[(sector*48+i)%N for i in range(49)]
  v=[lo[i] for i in ids]+[hi[i] for i in ids]
  faces=[(i,i+1,i+50,i+49) for i in range(48)]
  add('IfcCurtainWall',f'L{n:03} outer skin A sector {sector+1}',n,'OuterGlass',[(v,faces)])
 add('IfcMember',f'L{n:03} facade mullions',n,'Silver',[tube(lo[i],hi[i],.035,N=4) for i in range(N)])
 add('IfcMember',f'L{n:03} facade transom',n,'Silver',[tube(lo[i],lo[(i+1)%N],.055,N=4) for i in range(N)])
 add('IfcBeam',f'L{n:03} facade support ring - diameter 356 mm',n,'Steel',[tube(lo[i],lo[(i+1)%N],.178,N=6) for i in range(N)])
 struts=[]
 for i in range(0,N,6):
  x,y,_=lo[i];d=math.hypot(x,y);struts.append(tube((x*r/d,y*r/d,z-.25),(x,y,z-.25),.1095,N=6))
 add('IfcMember',f'L{n:03} radial facade supports - diameter 219 mm',n,'Steel',struts)
 # Four independent core quadrants leave the cross-shaped circulation axis open.
 t=max(.55,1.15-z/1200.)
 walls=[]
 for sx in [-1,1]:
  for sy in [-1,1]:
   x0,x1=sorted([sx*2.1,sx*core]);y0,y1=sorted([sy*2.1,sy*core])
   walls += [box(x0,y0,z,x1-x0,t,h),box(x0,y1-t,z,x1-x0,t,h),box(x0,y0,z,t,y1-y0,h),box(x1-t,y0,z,t,y1-y0,h)]
 add('IfcWall',f'L{n:03} core quadrants - openings indicative',n,'Concrete',walls)
 # Lift banks follow the small-cell organization visible in the supplied L9 plan.
 # Positions/count are a reconstruction, not the building's elevator inventory.
 b=core/13.716;shaft_parts=[];lift_doors=[]
 cells=[(sx*x,y) for sx in [-1,1] for x,y in [(5,4.2),(9,4.2),(5,8.2),(9,8.2),(10,-4.5),(10,-9),(4.5,-4.5)]]
 for x,y in cells:
  x*=b;y*=b;dx=2.7*b;dy=2.9*b;t=.18
  shaft_parts += [box(x-dx/2,y-dy/2,z,t,dy,h),box(x+dx/2-t,y-dy/2,z,t,dy,h),box(x-dx/2,y+dy/2-t,z,dx,t,h)]
  jamb=(dx-1.15*b)/2
  shaft_parts += [box(x-dx/2,y-dy/2,z,jamb,t,h),box(x+dx/2-jamb,y-dy/2,z,jamb,t,h),box(x-dx/2+jamb,y-dy/2,z+2.35,dx-2*jamb,t,max(.1,h-2.35))]
  lift_doors += [box(x-.55*b,y-dy/2+.03,z+.28,.53*b,.07,2.05),box(x+.02*b,y-dy/2+.03,z+.28,.53*b,.07,2.05)]
 add('IfcWall',f'L{n:03} lift bank shaft partitions - indicative',n,'Concrete',shaft_parts)
 add('IfcDoor',f'L{n:03} paired lift landing doors - indicative',n,'Silver',lift_doors)
 # Eight paired major columns and four diagonal supplementary columns, per supplied plan.
 cols=[]
 for a in [j*math.pi/2+delta for j in range(4) for delta in [-.14,.14]]:
  rr=r-2.1;cx,cy=rr*math.cos(a),rr*math.sin(a);size=max(1.1,2.5-z/500)
  cols.append(box(cx-size/2,cy-size/2,z,size,size,h))
 add('IfcColumn',f'L{n:03} eight supercolumns - indicative sections',n,'Concrete',cols)
 add('IfcColumn',f'L{n:03} four diagonal columns',n,'Concrete',[box((r-2)*math.cos(a)-.7,(r-2)*math.sin(a)-.7,z,1.4,1.4,h) for a in [math.pi/4+j*math.pi/2 for j in range(4)]])
 # Stair flights and shaft details are inside the core, not solid blocks.
 stairs=[]
 for sx in [-1,1]:
  count=max(2,math.ceil(h/.18));half=math.ceil(count/2)
  for j in range(count):
   flight=0 if j<half else 1;step=j if flight==0 else count-j-1
   stairs.append(box(sx*6-1.4+flight*1.5,-core+2+step*.27,z+j*h/count,1.3,.28,.14))
  stairs.append(box(sx*6-1.4,-core+2+half*.27,z+half*h/count,2.8,1.3,.18))
 add('IfcStairFlight',f'L{n:03} core stair flights - schematic',n,'Stone',stairs)
 add('IfcSlab',f'L{n:03} core circulation cross',n,'Concrete',[box(-2,-core,z,4,2*core,.28),box(-core,-2,z,core-2,4,.28),box(2,-2,z,core-2,4,.28)])
 if 83<=n<=112:
  partitions=[];beds=[]
  for j in range(24):
   a=j*math.pi/12;u,v=math.cos(a),math.sin(a);rr=max(core*1.45,r-6)
   p=[(rr*u-.07*v,rr*v+.07*u,z+.28),(r*u-.07*v,r*v+.07*u,z+.28),(r*u+.07*v,r*v-.07*u,z+.28),(rr*u+.07*v,rr*v-.07*u,z+.28)]
   partitions.append(loft(list(reversed(p)),[(x,y,zz+min(2.7,h-.5)) for x,y,zz in reversed(p)]))
   b=a+math.pi/24;cx,cy=(r-3)*math.cos(b),(r-3)*math.sin(b)
   beds.append(box(cx-.75,cy-1,z+.35,1.5,2,.5))
  add('IfcWall',f'L{n:03} indicative hotel room partitions',n,'White',partitions)
  add('IfcFurnishingElement',f'L{n:03} indicative hotel beds',n,'White',beds)
 if n in zone_first or n in [118,119,121]:
  add('IfcDoor',f'L{n:03} core landing door set',n,'Silver',[box(x-1,-2.1,z+.3,2,.1,2.4) for x in [-7,7]])
 if n in zone_first:
  # The zone-base platform spans the entire atrium; upper office floors stop at skin B.
  atrium=[]
  for i in range(N):
   j=(i+1)%N;x,y,_=lo[i];xx,yy,_=lo[j];d=math.hypot(x,y);dd=math.hypot(xx,yy)
   base=[(r*x/d,r*y/d,z),(x,y,z),(xx,yy,z),(r*xx/dd,r*yy/dd,z)]
   atrium.append(loft(base,[(u,v,k+.35) for u,v,k in base]))
  add('IfcSlab',f'Zone {zone(n)} sky garden platform',n,'Stone',atrium)
  add('IfcRailing',f'Zone {zone(n)} garden rail',n,'Silver',[tube(a,b,.04,N=6) for a,b in zip(ring(r+.5,z+1.4),ring(r+.5,z+1.4)[1:]+ring(r+.5,z+1.4)[:1])])
  plants=[]
  for j in range(3):
   a=j*2*math.pi/3+twist(z);rr=r+2
   plants += [cylinder(1.1,z+.35,.65,rr*math.cos(a),rr*math.sin(a),N=12)]
  add('IfcFurnishingElement',f'Zone {zone(n)} planted garden beds',n,'Green',plants)
  # Two-storey belt trusses and radial outriggers match the structural concept.
  truss=[]
  for j in range(24):
   a=j*math.pi/12;b=(j+1)*math.pi/12
   p=(r*math.cos(a),r*math.sin(a),z);q=(r*math.cos(b),r*math.sin(b),z+2*h)
   truss += [tube(p,q,.25,N=8),tube((p[0],p[1],z+2*h),(q[0],q[1],z),.25,N=8)]
  add('IfcMember',f'Zone {zone(n)} two-storey belt truss',n,'Steel',truss)
  add('IfcMember',f'Zone {zone(n)} radial outrigger trusses',n,'Steel',[tube((core*math.cos(a),core*math.sin(a),z+2*h),((r-2)*math.cos(a),(r-2)*math.sin(a),z),.4,N=8) for a in [j*math.pi/4 for j in range(8)]])

# Crown: a real opening with a sloping upper edge, not a capped cylinder.
base_z=587.;top=outer(632.)
rim=[(x,y,605.+27.*(.5+.5*math.cos(2*math.pi*i/N))) for i,(x,y,_) in enumerate(top)]
lo=outer(base_z)
add('IfcCurtainWall','Crown open sloping glass enclosure',128,'OuterGlass',[strip(lo,rim)])
add('IfcMember','Crown sloping perimeter beam',128,'Silver',[tube(rim[i],rim[(i+1)%N],.18,N=8) for i in range(N)])
add('IfcMember','Crown upright ribs',128,'Silver',[tube(lo[i],rim[i],.075,N=6) for i in range(0,N,2)])
add('IfcMember','Crown triangulated support framing',128,'Steel',[tube(lo[i],rim[(i+12)%N],.24,N=8) for i in range(0,N,12)])
add('IfcSlab','Crown maintenance deck with central opening',128,'Steel',annulus(15,7,589,.4,N=64))
add('IfcBuildingElementProxy','Tuned mass damper - indicative envelope, no simulation',128,'Dark',[cylinder(4.5,578,4,N=48)])

kit.sort_unordered_aggregates(f)
filename='SHA-IVO-SHANGHAI-TOWER-A-0001.ifc';kit.set_header(f,filename,'IFC Viewer Online','IFC Viewer Online','2026-09-07T00:00:00')
path=os.path.join(OUT,filename)
with open(path,'w',encoding='utf-8',newline='\n') as stream:stream.write(f.to_string())
logger=ifcopenshell.validate.json_logger();ifcopenshell.validate.validate(f,logger,express_rules=True)
errors=[s for s in logger.statements if s['level']=='error']
report={'schema':f.schema,'elements':len(mesh.elements),'storeys':len(floors),'aboveGroundStoreys':128,'heightMetres':632.,'sizeBytes':os.path.getsize(path),'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest(),'expressErrors':len(errors),'errors':[str(e) for e in errors[:4]]}
with open(os.path.join(OUT,'validation.json'),'w') as stream:json.dump(report,stream,indent=2)
print(json.dumps(report),flush=True)
if errors:raise RuntimeError(str(errors[:2]))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world.color=(.65,.70,.75);scene.view_settings.view_transform='AgX'
scene.render.resolution_x=1100;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.4,-.5,-.5);bpy.context.object.data.energy=3
bpy.ops.object.camera_add(location=(850,-1200,520));camera=bpy.context.object;scene.camera=camera
camera.data.type='ORTHO';camera.data.ortho_scale=700;camera.data.clip_end=5000
camera.rotation_euler=(Vector((0,0,302))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(OUT,'shanghai-tower-preview.png');bpy.ops.render.render(write_still=True)
for obj in bpy.data.objects:
 if 'outer skin' in obj.name or 'facade mullions' in obj.name or 'facade transom' in obj.name:obj.hide_render=True
scene.render.filepath=os.path.join(OUT,'shanghai-tower-structure.png');bpy.ops.render.render(write_still=True)
