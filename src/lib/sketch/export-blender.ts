// ─── To Blender ───────────────────────────────────────────────────────────────
// Two doors. A `.py` keeps everything: one curve object per layer, colour as a
// material, pressure as the spline's radius; run it from Blender's Text Editor or
// with `blender --python`. An `.obj` keeps the 3D lines for anything that reads
// polylines. Sketch space is Y-up, Blender is Z-up: (x, y, z) -> (x, -z, y).

import { hexToRgb, strokeWidthAt } from './ribbon'
import type { SketchLayer } from './types'

const f = (v: number): string => (Math.round(v * 1e5) / 1e5).toString()

/** sRGB to linear, what Blender's material colours expect. */
const linear = (c: number): number => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

const pyString = (s: string): string => JSON.stringify(s)

/** `worldPerPixel`: the zoom the weights are converted at, so lines keep their look. */
export function exportBlenderScript(name: string, layers: readonly SketchLayer[], worldPerPixel: number): string {
  const data = layers.filter((l) => l.strokes.length > 0).map((l) => {
    const strokes = l.strokes.map((s) => {
      const pts: string[] = []
      for (let i = 0; i < s.points.length; i += 4) {
        const radius = (strokeWidthAt(s, s.points[i + 3]) * worldPerPixel) / 2
        pts.push(`(${f(s.points[i])},${f(-s.points[i + 2])},${f(s.points[i + 1])},${f(radius)})`)
      }
      const [r, g, b] = hexToRgb(s.color)
      return `((${f(linear(r))},${f(linear(g))},${f(linear(b))}),[${pts.join(',')}])`
    })
    return `(${pyString(l.name)},${l.visible ? 'True' : 'False'},[${strokes.join(',\n')}])`
  })
  return `# 3D sketch for Blender. Text Editor > Open > Run Script, or: blender --python this-file.py
import bpy

LAYERS = [
${data.join(',\n')}
]

collection = bpy.data.collections.new(${pyString(name)})
bpy.context.scene.collection.children.link(collection)
materials = {}

def material(color):
    if color not in materials:
        m = bpy.data.materials.new("sketch-%.3f-%.3f-%.3f" % color)
        m.diffuse_color = (*color, 1)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*color, 1)
        materials[color] = m
    return materials[color]

for layer_name, visible, strokes in LAYERS:
    curve = bpy.data.curves.new(layer_name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 1.0
    curve.bevel_resolution = 1
    curve.use_fill_caps = True
    for color, points in strokes:
        m = material(color)
        if m.name not in curve.materials:
            curve.materials.append(m)
        spline = curve.splines.new("POLY")
        spline.material_index = curve.materials.find(m.name)
        spline.points.add(len(points) - 1)
        for p, (x, y, z, radius) in zip(spline.points, points):
            p.co = (x, y, z, 1)
            p.radius = radius
    obj = bpy.data.objects.new(layer_name, curve)
    obj.hide_viewport = not visible
    obj.hide_render = not visible
    collection.objects.link(obj)
`
}

export function exportObj(layers: readonly SketchLayer[]): string {
  const out = ['# 3D sketch: polylines, one object per layer']
  let vertex = 1
  for (const layer of layers) {
    if (layer.strokes.length === 0) continue
    out.push(`o ${layer.name.replace(/\s+/g, '_') || 'layer'}`)
    for (const stroke of layer.strokes) {
      const n = stroke.points.length / 4
      if (n < 2) continue
      for (let i = 0; i < n; i++) out.push(`v ${f(stroke.points[i * 4])} ${f(stroke.points[i * 4 + 1])} ${f(stroke.points[i * 4 + 2])}`)
      out.push(`l ${Array.from({ length: n }, (_, i) => vertex + i).join(' ')}`)
      vertex += n
    }
  }
  return out.join('\n') + '\n'
}
