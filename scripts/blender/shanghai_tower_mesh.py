"""Geometry helpers bound to one IFC/Blender authoring context."""
import math
from mathutils import Vector
def bind(context):
 globals().update(context)
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
 e.Description='Approximate drawing/photo reconstruction. See ReferenceModelEvidence and docs/SHANGHAI_TOWER_RECONSTRUCTION.md.'
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
 if pearl: kit.add_pset(f,e,'ReferenceComponent',pearl)
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
 obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(bm)
 elements.append(e);return e

def annulus(ro,ri,z,h,cx=0,cy=0,N=64):
 parts=[]
 outer=ring(ro,z,cx,cy,N);inner=ring(ri,z,cx,cy,N)
 for i in range(N):
  j=(i+1)%N;lo=[outer[i],outer[j],inner[j],inner[i]]
  parts.append(loft(lo,[(x,y,zz+h) for x,y,zz in lo]))
 return parts

