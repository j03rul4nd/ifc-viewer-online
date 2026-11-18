"""Review the shipping map geometry in Blender; no duplicate bridge generator.
blender --background --python scripts/blender/render-shanghai-bridges.py -- .tmp/shanghai-bridges
"""
import bpy, json, sys, math, os
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
views=[('station',(530,-650,450),(0,0,12)),('tracks-section',(120,-200,90),(0,-70,1))]
if 'south' in str(out): views[0]=('station',(260,-330,220),(0,0,18))
cabmesh=next((m for m in data['meshes'] if m['name']=='osm-train-cabs'),None)
if cabmesh:
    centers=[]
    for i in range(0,len(cabmesh['vertices']),cabmesh['instanceVertices']):
        vs=cabmesh['vertices'][i:i+cabmesh['instanceVertices']]
        centers.append(Vector(tuple(sum(v[k] for v in vs)/len(vs) for k in range(3))))
    c=min(centers,key=lambda p:p.x*p.x+p.y*p.y)
    views.append(('train-section',tuple(c+Vector((28,-35,18))),tuple(c)))
for name,eye,target in views:
    for ob in bpy.data.objects:
        if ob.name.startswith('Station architecture'): ob.hide_render = 'section' in name
    camera.location=eye;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(out/f'{name}.png')
    if not os.environ.get('RAIL_RENDER_VIEW') or os.environ['RAIL_RENDER_VIEW']==name:
        bpy.ops.render.render(write_still=True)
for ob in bpy.data.objects: ob.hide_render=False
camera.location=views[0][1];camera.rotation_euler=(Vector(views[0][2])-camera.location).to_track_quat('-Z','Y').to_euler()
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.clip_end=10000
            area.spaces.active.shading.color_type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'shanghai-rail.blend'))
print('Saved railway review:',out)


