"""Review the shipping map geometry in Blender; no duplicate bridge generator.
blender --background --python scripts/blender/render-shanghai-bridges.py -- .tmp/shanghai-bridges
"""
import bpy, json, sys, math
from pathlib import Path
from mathutils import Vector

out = Path(sys.argv[sys.argv.index('--')+1]).resolve()
data = json.loads((out/'mesh.json').read_text())
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
material = bpy.data.materials.new('Map surface colors')
material.use_nodes = True
nodes = material.node_tree.nodes
shader = nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value = .68
attribute = nodes.new('ShaderNodeVertexColor')
attribute.layer_name = 'Color'
material.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color'])
for item in data['meshes']:
    verts, colors = [], []
    for i in range(0,len(item['vertices']),3):
        tri = item['vertices'][i:i+3]
        if all(abs(v[0])>650 or abs(v[1])>650 for v in tri): continue
        verts.extend(tri)
        colors.extend(item['colors'][i:i+3])
    mesh = bpy.data.meshes.new(item['name'])
    mesh.from_pydata(verts,[],[(i,i+1,i+2) for i in range(0,len(verts),3)])
    mesh.update()
    color = mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT')
    color.data.foreach_set('color',[v for c in colors for v in c])
    obj = bpy.data.objects.new(item['name'],mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
bpy.ops.mesh.primitive_plane_add(size=4000,location=(0,0,-.1))
ground = bpy.context.object
ground.name='Neutral review ground (not imagery)'
mat=bpy.data.materials.new('Neutral ground');mat.diffuse_color=(.32,.39,.36,1)
ground.data.materials.append(mat)
bpy.ops.object.light_add(type='SUN',location=(0,0,200))
sun=bpy.context.object;sun.rotation_euler=(math.radians(25),math.radians(-30),math.radians(-25));sun.data.energy=2.5;sun.data.angle=.12
bpy.ops.object.camera_add()
camera=bpy.context.object;bpy.context.scene.camera=camera
camera.data.lens=45
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=24
scene.cycles.use_denoising=True
scene.world.color=(.3,.3,.3)
scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
views=[('ring',(140,-170,125),(0,0,7)),('connections',(150,-150,65),(55,-35,8)),('street',(80,-95,14),(0,0,9)),('stairs',(25,-125,35),(-25,-60,4)),('elevator',(416,-110,23),(391,-75,4))]
for name,eye,target in views:
    camera.location=eye;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'{name}.png')
    bpy.ops.render.render(write_still=True)
camera.location=views[0][1];camera.rotation_euler=(Vector(views[0][2])-camera.location).to_track_quat('-Z','Y').to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.clip_end=10000
            area.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'shanghai-bridges.blend'))
print('Saved shipping mesh and five review renders:',out)
