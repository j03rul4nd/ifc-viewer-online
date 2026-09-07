"""Render the saved IFC itself: envelope, structure and representative floor."""
import sys,os,math
import bpy,ifcopenshell,ifcopenshell.geom
from mathutils import Vector
folder=os.path.abspath(sys.argv[sys.argv.index('--')+1])
f=ifcopenshell.open(os.path.join(folder,'SHA-IVO-SHANGHAI-TOWER-A-0001.ifc'))
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
settings=ifcopenshell.geom.settings();settings.set(settings.USE_WORLD_COORDS,True)
materials={}
colors={'OuterGlass':(.42,.61,.69),'InnerGlass':(.22,.36,.42),'Silver':(.66,.72,.75),'Concrete':(.55,.55,.52),'Steel':(.26,.31,.34),'Stone':(.68,.66,.60),'White':(.81,.81,.76),'Green':(.23,.38,.24),'Dark':(.16,.19,.20)}
for name,color in colors.items():
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1)
 shader.inputs['Metallic'].default_value=.35 if 'Glass' in name or name=='Silver' else .05
 shader.inputs['Roughness'].default_value=.27 if 'Glass' in name else .55
 materials[name]=m
it=ifcopenshell.geom.iterator(settings,f,4)
if it.initialize():
 while True:
  shape=it.get();e=f.by_id(shape.id);v=shape.geometry.verts;ix=shape.geometry.faces
  me=bpy.data.meshes.new(e.Name);me.from_pydata([v[i:i+3] for i in range(0,len(v),3)],[],[ix[i:i+3] for i in range(0,len(ix),3)]);me.update()
  obj=bpy.data.objects.new(e.Name,me);bpy.context.collection.objects.link(obj)
  material=next((r.RelatingMaterial.Name for r in e.HasAssociations if r.is_a('IfcRelAssociatesMaterial') and r.RelatingMaterial.is_a('IfcMaterial')),'Concrete')
  obj.data.materials.append(materials[material])
  if not it.next():break
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world.use_nodes=True;bg=scene.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(.78,.82,.88,1);bg.inputs['Strength'].default_value=.65
scene.view_settings.view_transform='AgX';scene.render.resolution_x=1100;scene.render.resolution_y=1500;scene.render.resolution_percentage=100
bpy.ops.object.light_add(type='SUN');bpy.context.object.rotation_euler=(.5,-.5,-.5);bpy.context.object.data.energy=2.2
bpy.ops.object.camera_add(location=(850,-1200,520));camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=700;camera.data.clip_end=5000
camera.rotation_euler=(Vector((0,0,302))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=os.path.join(folder,'shanghai-tower-preview.png');bpy.ops.render.render(write_still=True)
for obj in bpy.data.objects:
 if obj.type=='MESH' and any(t in obj.name for t in ['outer skin','inner skin','facade mullions','facade transom','Crown open']):obj.hide_render=True
scene.render.filepath=os.path.join(folder,'shanghai-tower-structure.png');bpy.ops.render.render(write_still=True)
for obj in bpy.data.objects:
 if obj.type=='MESH':obj.hide_render=not obj.name.startswith('L009')
camera.location=(0,0,140);camera.rotation_euler=(0,0,0);camera.data.ortho_scale=125
scene.render.resolution_y=1100
scene.render.filepath=os.path.join(folder,'shanghai-tower-floor-009.png');bpy.ops.render.render(write_still=True)
