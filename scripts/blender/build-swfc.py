"""SWFC reference reconstruction, metres, IFC4. Not an as-built model.

blender --background --python scripts/blender/build-swfc.py -- public/models/swfc
See docs/SWFC_RECONSTRUCTION.md for evidence and authored assumptions.
"""
import os
import sys
import math
import json
import hashlib
import bpy
import numpy as np
from mathutils import Vector
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.geom
import ifcopenshell.validate

sys.path.insert(0, os.path.dirname(__file__))
import bonsai_kit as kit
import shanghai_georeference

OUT = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
os.makedirs(OUT, exist_ok=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
kit.deterministic_guids('swfc-reference-20260906')
f = ifcopenshell.api.run('project.create_file', version='IFC4')
api = lambda use, **kw: ifcopenshell.api.run(use, f, **kw)
project = api('root.create_entity', ifc_class='IfcProject', name='Shanghai World Financial Center')
api('unit.assign_unit', units=[api('unit.add_si_unit', unit_type=t) for t in ['LENGTHUNIT','AREAUNIT','VOLUMEUNIT']])
context = api('context.add_context', context_type='Model')
body = api('context.add_context', context_type='Model', context_identifier='Body', target_view='MODEL_VIEW', parent=context)
site = api('root.create_entity', ifc_class='IfcSite', name='Pudong, Shanghai — approximate location')
building = api('root.create_entity', ifc_class='IfcBuilding', name='SWFC — reference reconstruction')
api('aggregate.assign_object', products=[site], relating_object=project)
api('aggregate.assign_object', products=[building], relating_object=site)
shanghai_georeference.apply(f,site,building,'swfc')
for obj in [site, building]:
    api('geometry.edit_object_placement', product=obj)
kit.add_pset(f, building, 'ReferenceModelEvidence', {
    'Status':'Approximate drawing-based reconstruction; not as-built or construction documentation',
    'Architect':'Kohn Pedersen Fox; East China Architectural Design & Research Institute',
    'HeightMetres':492., 'AboveGroundStoreys':101, 'BasementStoreys':3,
    'PrimarySource':'https://www.kpf.com/project/shanghai-world-financial-center',
    'DeveloperSource':'https://www.mori.co.jp/en/projects/swfc/',
    'Assumptions':'Interpolated floor heights, curved setbacks, facade grid, core, structure and interior layout. OSM-derived footprint centroid and orientation; unsurveyed ground datum.',
})

materials = {}
for name, color in {'Glass':(.30,.46,.55),'Silver':(.72,.77,.79),'Concrete':(.52,.54,.56),'Steel':(.23,.28,.32),'Stone':(.66,.64,.58),'Interior':(.78,.75,.68),'Landscape':(.24,.39,.25)}.items():
    mat = api('material.add_material', name=name, category=name.lower())
    style = api('style.add_style', name=name)
    api('style.add_surface_style', style=style, ifc_class='IfcSurfaceStyleRendering', attributes={'SurfaceColour':dict(zip(['Red','Green','Blue'],color)), 'Transparency':0., 'ReflectanceMethod':'NOTDEFINED'})
    bm = bpy.data.materials.new(name)
    bm.diffuse_color = (*color,1)
    bm.use_nodes=True
    shader=bm.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Metallic'].default_value=.55 if name in ['Glass','Silver'] else .05
    shader.inputs['Roughness'].default_value=.27 if name=='Glass' else .48
    materials[name]=(mat,style,bm)

def elevation(n):
    anchors=[(1,0.),(7,32.),(28,126.),(29,132.),(52,235.),(53,241.),(78,350.),(79,355.),(90,407.),(94,423.),(97,439.),(100,474.),(101,484.),(102,492.)]
    for (a,z),(b,w) in zip(anchors,anchors[1:]):
        if a<=n<=b: return z+(w-z)*(n-a)/(b-a)

def use(n):
    if n<1: return 'Parking / retail / plant'
    if n<3: return 'Entrance / retail'
    if n<6: return 'Conference / retail'
    if n in [6,78,101]: return 'Technical / transfer'
    if n in [28,29,52,53]: return 'Sky lobby'
    if n<79: return 'Office'
    if n<94: return 'Hotel'
    return 'Observatory / sky bridge'

storeys={}
for n in list(range(-3,0))+list(range(1,102)):
    z=4.5*n if n<0 else elevation(n)
    s=api('root.create_entity', ifc_class='IfcBuildingStorey', name=f'B{-n:02}' if n<0 else f'{n:03} — {use(n)}')
    s.Elevation=z
    s.CompositionType='ELEMENT'
    api('aggregate.assign_object',products=[s],relating_object=building)
    m=np.eye(4); m[2,3]=z
    api('geometry.edit_object_placement',product=s,matrix=m)
    storeys[n]=s

# In this local frame u follows the wide crown; v is perpendicular to the portal.
# The 58 m square is a diamond in this frame. Opposed curved cuts reduce v.
R=58/math.sqrt(2)
def depth(z): return max(1.65,R*(1-(max(0,z)/503.)**2))
def plate(z):
    d=min(R-.015,depth(z)); a=R-d
    return [(-R,0),(-a,-d),(a,-d),(R,0),(a,d),(-a,d)]

def clip(poly,axis,value,greater):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        ia=(a[axis]>=value) if greater else (a[axis]<=value)
        ib=(b[axis]>=value) if greater else (b[axis]<=value)
        if ia: out.append(a)
        if ia!=ib:
            t=(value-a[axis])/(b[axis]-a[axis])
            out.append(tuple(a[k]+t*(b[k]-a[k]) for k in range(2)))
    return out

def prism(lo,hi,z,w):
    assert len(lo)==len(hi) and len(lo)>=3
    n=len(lo)
    return [(x,y,z) for x,y in lo]+[(x,y,w) for x,y in hi], [tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]

elements=[]
def add(cls,name,n,material,parts):
    e=api('root.create_entity',ifc_class=cls,name=name)
    e.Description='Reference reconstruction; dimensions and details are indicative. See ReferenceModelEvidence.'
    api('spatial.assign_container',products=[e],relating_structure=storeys[n])
    api('geometry.edit_object_placement',product=e)
    vs=[p[0] for p in parts]; fs=[p[1] for p in parts]
    rep=api('geometry.add_mesh_representation',context=body,vertices=vs,faces=fs)
    api('geometry.assign_representation',product=e,representation=rep)
    mat,style,bm=materials[material]
    api('style.assign_representation_styles',shape_representation=rep,styles=[style])
    api('material.assign_material',products=[e],type='IfcMaterial',material=mat)
    verts=[]; faces=[]
    for v,fac in parts:
        offset=len(verts); verts.extend(v); faces.extend([tuple(i+offset for i in face) for face in fac])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(bm)
    elements.append(e)
    return e

def box(x,y,z,dx,dy,dz):
    p=[(x,y),(x+dx,y),(x+dx,y+dy),(x,y+dy)]
    return prism(p,p,z,z+dz)

def beam(a,b,width):
    a=Vector(a); b=Vector(b); direction=(b-a).normalized()
    side=direction.cross(Vector((0,0,1)))
    if side.length<.01: side=Vector((1,0,0))
    side.normalize(); up=direction.cross(side).normalized()
    corners=[side+up,-side+up,-side-up,side-up]
    verts=[tuple(p+c*width/2) for p in [a,b] for c in corners]
    return verts,[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]

for n in storeys:
    z=storeys[n].Elevation
    w=z+4.5 if n<0 else elevation(n+1)
    p=plate(z)
    if n<0:
        add('IfcSlab',f'B{-n} basement slab',n,'Concrete',[box(-65,-53,z,130,106,.55)])
        continue
    portal=440<=z<474
    if portal:
        half=23+(z-440)*7/34
        plates=[clip(p,0,-half,False),clip(p,0,half,True)]
    else: plates=[p]
    add('IfcSlab',f'{n:03} floor plate — {use(n)}',n,'Concrete',[prism(q,q,z,z+.32) for q in plates])
    kit.add_pset(f,elements[-1],'Pset_ReferenceFloor',{'Program':use(n),'Level':n,'ElevationApproximate':True})

    # Storey facade segments, split at both aperture boundaries.
    cuts=sorted(set([z,w]+[h for h in [440.,474.] if z<h<w]))
    glass=[]; bands=[]; mullions=[]
    for za,zb in zip(cuts,cuts[1:]):
        pa,pb=plate(za),plate(zb)
        if za>=440 and zb<=474:
            ha=23+(za-440)*7/34; hb=23+(zb-440)*7/34
            regions=[(clip(pa,0,-ha,False),clip(pb,0,-hb,False)),(clip(pa,0,ha,True),clip(pb,0,hb,True))]
        else: regions=[(pa,pb)]
        for qa,qb in regions:
            for i in range(len(qa)):
                j=(i+1)%len(qa)
                a,b=qa[i],qa[j]; c,d=qb[i],qb[j]
                # A thin solid panel follows each sloping facade plane.
                edge=Vector((b[0]-a[0],b[1]-a[1])); normal=Vector((-edge.y,edge.x)).normalized()*.10
                lo=[a,b,(b[0]+normal.x,b[1]+normal.y),(a[0]+normal.x,a[1]+normal.y)]
                hi=[c,d,(d[0]+normal.x,d[1]+normal.y),(c[0]+normal.x,c[1]+normal.y)]
                glass.append(prism(lo,hi,za,zb))
                bands.append(beam((*a,za+.16),(*b,za+.16),.16))
                count=max(1,math.ceil(edge.length/2.1))
                for k in range(count):
                    t=k/count
                    aa=tuple(a[h]+(b[h]-a[h])*t for h in range(2))
                    bb=tuple(c[h]+(d[h]-c[h])*t for h in range(2))
                    mullions.append(beam((*aa,za),(*bb,zb),.065))
    add('IfcCurtainWall',f'{n:03} silver-blue glazed envelope',n,'Glass',glass)
    add('IfcMember',f'{n:03} facade horizontal transoms',n,'Silver',bands)
    add('IfcMember',f'{n:03} facade vertical mullions',n,'Silver',mullions)
    # Central core contracts with the visible hotel section; shafts stop below portal.
    if n<=93:
        cx=12 if n<79 else 10
        cy=min(12,depth(w)-2)
        walls=[box(-cx,-cy,z,2*cx,.5,w-z),box(-cx,cy-.5,z,2*cx,.5,w-z),box(-cx,-cy,z,.5,2*cy,w-z),box(cx-.5,-cy,z,.5,2*cy,w-z)]
        add('IfcWall',f'{n:03} reinforced-concrete service core',n,'Concrete',walls)
        stairs=[]
        for step in range(24):
            flight=step//12; k=step%12
            stairs.append(box(-8+flight*3,-3+k*.25,z+step*(w-z)/24,2.4,.25,.15))
        add('IfcStairFlight',f'{n:03} indicative core escape stairs',n,'Stone',stairs)
        cols=[]
        for u in [-R+2.8,R-2.8]: cols.append(box(u-.65,-.65,z,1.3,1.3,w-z))
        for u in [-12,12]:
            for sign in [-1,1]:
                v=sign*min(depth(w)-1.3,R-abs(u)-1.3)
                cols.append(box(u-.6,v-.6,z,1.2,1.2,w-z))
        add('IfcColumn',f'{n:03} indicative composite perimeter columns',n,'Steel',cols)
    if 79<=n<=93:
        partitions=[]
        d=min(depth(w)-.6,11.8)
        for u in [-26,-21,-16,16,21,26]:
            if R-abs(u)>d:
                partitions.append(box(u,-d,z,.15,2*d,2.8))
        if partitions: add('IfcWall',f'{n:03} indicative hotel room partitions',n,'Interior',partitions)
    if n in [94,97,100]:
        add('IfcSlab',f'{n:03} observation sky bridge finish',n,'Stone',[prism(q,q,z+.32,z+.40) for q in plates])

# Portal edge rails track the actual void; crown cap never fills the opening.
for sign in [-1,1]:
    add('IfcBeam','Portal inclined jamb',97,'Silver',[beam((sign*23,side*depth(440),440),(sign*30,side*depth(474),474),.65) for side in [-1,1]])
add('IfcRoof','492 m crown roof',101,'Silver',[prism(plate(491.6),plate(492),491.6,492)])
# Low-rise podium and plaza are authored context, based on the supplied model view.
add('IfcSlab','Arrival plaza — indicative extent',1,'Stone',[box(-78,-66,-.35,156,132,.35)])
for x,y,dx,dy,h in [(-60,-45,28,80,13),(32,-45,28,80,10),(-32,-49,64,16,8)]:
    add('IfcBuildingElementProxy','Retail podium — indicative massing',1,'Stone',[box(x,y,0,dx,dy,h)])
    add('IfcRoof','Podium roof',3,'Silver',[box(x-.3,y-.3,h,dx+.6,dy+.6,.35)])
for side in [-1,1]:
    for x in range(-65,66,13):
        add('IfcGeographicElement','Plaza planting — indicative',1,'Landscape',[box(x,side*57,0,4,4,.6)])

kit.sort_unordered_aggregates(f)
kit.set_header(f,'SHA-IVO-SWFC-A-0001.ifc','IFC Viewer Online','IFC Viewer Online','2026-09-06T00:00:00')
f.header.file_name.originating_system='IfcOpenShell API / Blender — reference reconstruction'
path=os.path.join(OUT,'SHA-IVO-SWFC-A-0001.ifc')
with open(path,'w',encoding='utf-8',newline='\n') as stream: stream.write(f.to_string())
logger=ifcopenshell.validate.json_logger()
ifcopenshell.validate.validate(f,logger,express_rules=True)
errors=[s for s in logger.statements if s['level']=='error']
with open(os.path.join(OUT,'validation.json'),'w') as stream:
    json.dump({'elements':len(elements),'storeys':len(storeys),'schema':f.schema,'sizeBytes':os.path.getsize(path),'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest(),'expressErrors':len(errors),'errors':[str(e) for e in errors[:10]]},stream,indent=2)
print('SWFC IFC written',path,'elements',len(elements),'errors',len(errors),flush=True)
if errors: raise RuntimeError(str(errors[:3]))

# Render exactly the authored mesh geometry, without generated illustration.
for o in list(bpy.data.objects):
    if o.type in ['CAMERA','LIGHT']: bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.world.color=(.65,.68,.72)
scene.render.resolution_x=1100; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.object.light_add(type='SUN',location=(200,-300,650)); bpy.context.object.rotation_euler=(.4,-.5,-.4); bpy.context.object.data.energy=3
bpy.ops.object.camera_add(location=(650,-1250,640)); camera=bpy.context.object; scene.camera=camera
camera.data.type='ORTHO'; camera.data.ortho_scale=570; camera.data.clip_end=5000
camera.rotation_euler=(Vector((0,0,238))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(OUT,'swfc-preview.png'); bpy.ops.render.render(write_still=True)
camera.location=(0,-1300,265); camera.rotation_euler=(Vector((0,0,245))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(OUT,'swfc-elevation.png'); bpy.ops.render.render(write_still=True)
