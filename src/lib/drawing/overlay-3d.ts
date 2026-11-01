// ─── Drawings in the 3D scene ─────────────────────────────────────────────────
// A sheet laid flat in the model at a chosen height: as lines and, for a PDF,
// the page as a texture. It shares the scene with the IFC, the scans and the
// devices, so all of it reads against the drawing. Text stays in the 2D pane.

import * as THREE from 'three'
import { entityPolylines, toModel, type Drawing, type Layer } from './types'

interface Entry { key: unknown; group: THREE.Group }

export interface DrawingOverlay {
  sync(drawings: readonly Drawing[]): void
  dispose(): void
}

export function createDrawingOverlay(scene: THREE.Scene, requestRender: () => void): DrawingOverlay {
  const root = new THREE.Group()
  root.name = 'drawings-overlay'
  scene.add(root)
  const entries = new Map<string, Entry>()

  const free = (g: THREE.Group) => {
    g.traverse((o) => {
      const m = o as THREE.Mesh
      m.geometry?.dispose()
      const mat = m.material as THREE.Material & { map?: THREE.Texture | null } | undefined
      mat?.map?.dispose()
      mat?.dispose()
    })
    root.remove(g)
  }

  const build = (d: Drawing): THREE.Group => {
    const group = new THREE.Group()
    group.name = d.name
    const layers = new Map<string, Layer>(d.layers.map((l) => [l.name, l]))
    const pos: number[] = []
    const col: number[] = []
    const c = new THREE.Color()
    for (const e of d.entities) {
      const layer = layers.get(e.layer)
      if (layer && !layer.visible) continue
      c.set(e.color ?? layer?.color ?? '#ffffff')
      for (const pl of entityPolylines(e)) {
        const pts = pl.points.map((q) => toModel(d.placement, q))
        const n = pts.length
        for (let i = 0; i < (pl.closed ? n : n - 1); i++) {
          const a = pts[i]; const b = pts[(i + 1) % n]
          // Drawing space is IFC XY: scene x = x, scene z = −y.
          pos.push(a.x, d.elevation, -a.y, b.x, d.elevation, -b.y)
          col.push(c.r, c.g, c.b, c.r, c.g, c.b)
        }
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }))
      lines.frustumCulled = false
      group.add(lines)
    }
    if (d.page) {
      const tex = new THREE.TextureLoader().load(d.page.url, () => requestRender())
      tex.colorSpace = THREE.SRGBColorSpace
      const corner = (x: number, y: number) => { const q = toModel(d.placement, { x, y }); return [q.x, d.elevation - 0.005, -q.y] }
      const w = d.page.width; const h = d.page.height
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([...corner(0, 0), ...corner(w, 0), ...corner(w, h), ...corner(0, h)], 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2))
      g.setIndex([0, 1, 2, 0, 2, 3])
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }))
      mesh.frustumCulled = false
      group.add(mesh)
    }
    return group
  }

  return {
    sync(drawings) {
      const wanted = drawings.filter((d) => d.in3d && d.visible)
      const ids = new Set(wanted.map((d) => d.id))
      for (const [id, e] of entries) if (!ids.has(id)) { free(e.group); entries.delete(id) }
      for (const d of wanted) {
        const key = `${d.elevation}|${d.placement.scale}|${d.placement.rotation}|${d.placement.x}|${d.placement.y}`
        const stamp = [d.entities, d.layers, d.page, key]
        const old = entries.get(d.id)
        const same = old && (old.key as unknown[]).every((v, i) => v === stamp[i])
        if (same) continue
        if (old) free(old.group)
        const group = build(d)
        root.add(group)
        entries.set(d.id, { key: stamp, group })
      }
      requestRender()
    },
    dispose() {
      for (const e of entries.values()) free(e.group)
      entries.clear()
      scene.remove(root)
      requestRender()
    },
  }
}
