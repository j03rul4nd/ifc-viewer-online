"""Original Shanghai landscape kit. Z-up metres, one vertex-coloured mesh/asset.
Species-inspired silhouettes and furniture, not surveyed specimens or monuments.
blender -b --python-exit-code 1 --python scripts/blender/build-shanghai-park-props.py -- public/models/props/shanghai
"""
import bpy, math, random, os, sys, json
from mathutils import Vector

parts=[]
def mesh(name, verts, faces, color):
    m=bpy.data.meshes.new(name); m.from_pydata(verts, [], faces); m.update()
    o=bpy.data.objects.new(name,m); bpy.context.collection.objects.link(o)
    layer=m.color_attributes.new(name='Col',type='FLOAT_COLOR',domain='CORNER')
    for c in layer.data: c.color=(*color,1)
    parts.append(o); return o
def tube(a,b,r,color,r2=None,n=7):
    a,b=Vector(a),Vector(b); axis=(b-a).normalized()
    u=axis.cross(Vector((0,1,0))).normalized()
    if u.length<.1: u=axis.cross(Vector((1,0,0))).normalized()
    v=axis.cross(u); r2=r if r2 is None else r2
    verts=[tuple(p+(u*math.cos(i*2*math.pi/n)+v*math.sin(i*2*math.pi/n))*rad) for p,rad in [(a,r),(b,r2)] for i in range(n)]
    return mesh('stem',verts,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]+[tuple(reversed(range(n))),tuple(range(n,n*2))],color)
def box(x,y,z,w,d,h,col):
    vs=[(x+sx*w/2,y+sy*d/2,z+sz*h) for sz in [0,1] for sy in [-1,1] for sx in [-1,1]]
    return mesh('joinery',vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],col)
def crown(x,y,z,sx,sy,sz,col,rng):
    # Two staggered rings and irregular peaks avoid an icosphere silhouette.
    n=7; vs=[(x,y,z+sz)]
    for j in range(2):
        for i in range(n):
            t=(i+j*.35)*2*math.pi/n; s=rng.uniform(.82,1.12)
            vs.append((x+math.cos(t)*sx*s,y+math.sin(t)*sy*s,z+(1-2*j)*sz*.35))
    vs.append((x,y,z-sz)); faces=[]
    for i in range(n):
        k=(i+1)%n
        faces += [(0,1+i,1+k),(1+i,n+1+i,n+1+k,1+k),(n+1+k,n+1+i,2*n+1)]
    return mesh('foliage',vs,faces,col)
BARK=(.28,.22,.16); STONE=(.56,.57,.52); WOOD=(.33,.22,.13)
def tree(kind):
    rng=random.Random(kind); h=11 if kind=='metasequoia' else 9
    tube((0,0,0),(.15,0,h*.87),.28,BARK,.055,9)
    for j in range(9 if kind=='metasequoia' else 12):
        a=j*2.399; z=2+j*.52 if kind=='metasequoia' else 3+(j%4)*.7
        span=(h-z)*.34 if kind=='metasequoia' else rng.uniform(1.5,3)
        end=(math.cos(a)*span,math.sin(a)*span,z+1)
        tube((.08,0,z),end,.105,BARK,.025)
        for k in range(3):
            t=a+(k-1)*.55; rr=span*(.65+k*.18)
            x,y=math.cos(t)*rr, math.sin(t)*rr
            zz=z+1+k*.35
            color=(rng.uniform(.20,.30),rng.uniform(.36,.49),rng.uniform(.12,.23))
            if kind=='ginkgo': color=(.37,.49,.16)
            crown(x,y,zz,1 if kind!='metasequoia' else .8,.85,.7,color,rng)
            if kind=='willow':
                for s in range(3):
                    angle=t+s*.4
                    p=(x+math.cos(angle)*.5,y+math.sin(angle)*.5,zz)
                    q=(p[0]*1.08,p[1]*1.08,zz-2.1-rng.random())
                    tube(p,q,.075,(.31,.43,.19),.015,4)
    crown(.1,0,h-.55,.85,.8,.8,(.28,.42,.18),rng)
def shrub():
    rng=random.Random(45)
    for i in range(10):
        a=i*2.4;r=.65*math.sqrt(i/10)
        crown(math.cos(a)*r,math.sin(a)*r,.5,.42,.4,.5,(.20+i*.007,.34+i*.008,.13),rng)
def reed():
    rng=random.Random(30)
    for i in range(15):
        x,y=rng.uniform(-.45,.45),rng.uniform(-.45,.45); h=rng.uniform(.7,1.6)
        tube((x,y,0),(x+.12,y,h),.013,(.39,.46,.22),.006,4)
        mesh('leaf',[(x,y,.3),(x+.35,y+.07,h*.7),(x+.15,y,h*.85)],[(0,1,2)],(.26,.39,.16))
        if i%3==0: tube((x+.1,y,h*.78),(x+.12,y,h),.027,(.40,.30,.16),.015,5)
def bench():
    for x in [-.7,.7]:
        for y in [-.2,.2]: box(x,y,0,.07,.07,.45,STONE)
    for y in [-.22,-.11,0,.11,.22]: box(0,y,.45,1.9,.085,.065,WOOD)
    for z in [.64,.77,.9]: box(0,.26,z,1.9,.07,.085,WOOD)
    for x in [-.8,.8]: box(x,.26,.4,.055,.07,.61,STONE)
def lantern():
    tube((0,0,0),(0,0,2.8),.055,(.23,.25,.24),n=8)
    box(0,0,2.6,.32,.32,.42,(.87,.79,.57))
    box(0,0,3.02,.5,.5,.09,(.23,.25,.24))
    for x in [-.17,.17]:
        for y in [-.17,.17]: box(x,y,2.6,.025,.025,.43,(.23,.25,.24))
def pergola():
    for x in [-2,0,2]:
        for y in [-1.25,1.25]: box(x,y,0,.18,.18,2.8,STONE)
    for y in [-1.3,1.3]: box(0,y,2.8,4.7,.19,.22,WOOD)
    for i in range(12): box(-2.2+i*.4,0,3.02,.10,3.15,.12,WOOD)
def fountain():
    # Jets only; a mapped basin supplies its own outline in the map renderer.
    for i in range(9):
        a=i*math.tau/8; rr=0 if i==8 else .65
        x,y=math.cos(a)*rr,math.sin(a)*rr
        tube((x,y,0),(x,y,.12),.065,STONE,n=6)
        prev=(x,y,.12)
        for j in range(1,9):
            t=j/8; r=rr+t*.75; z=.12+math.sin(math.pi*t)*(1.5 if i<8 else 2.2)
            pt=(math.cos(a)*r,math.sin(a)*r,z)
            tube(prev,pt,.022,(.66,.85,.87),.016,4); prev=pt

out=sys.argv[-1]; os.makedirs(out,exist_ok=True); report={}
builders={**{'tree-'+k:(lambda k=k:tree(k)) for k in ['camphor','ginkgo','metasequoia','willow']},'shrub':shrub,'reed':reed,'bench':bench,'lantern':lantern,'pergola':pergola,'fountain-jets':fountain}
for name,build in builders.items():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False); parts.clear();build()
    bpy.ops.object.select_all(action='SELECT'); bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=parts[0]
    mat=bpy.data.materials.new(name);mat.use_nodes=True
    attr=mat.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Col'
    mat.node_tree.links.new(attr.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);o.data.materials.clear();o.data.materials.append(mat)
    o.data.calc_loop_triangles();tris=len(o.data.loop_triangles)
    assert tris<4000,(name,tris)
    path=os.path.join(out,name+'.glb')
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_yup=False,export_vertex_color='MATERIAL',export_cameras=False,export_lights=False)
    report[name]={'triangles':tris,'bytes':os.path.getsize(path)}
with open(os.path.join(out,'manifest.json'),'w') as f:json.dump(report,f,indent=2)
print(report)
