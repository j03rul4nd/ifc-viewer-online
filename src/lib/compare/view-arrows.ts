// ─── compare/view-arrows.ts ───────────────────────────────────────────────────
// The arrow from where a moved element was (A) to where it is (B), with its
// dimension in mm, drawn in the viewer scene through the public drawingHost().
// Drawn on top (no depth test) so a move inside a wall is still seen.

import * as THREE from 'three'
import type { ViewerAPI } from '../viewer'
import { GROUP_COLOUR } from './revision-view'

const NAME = 'revision-compare-arrows'

function centre(b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }): THREE.Vector3 {
  return new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2)
}

function label(text: string, colour: string): THREE.Sprite {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')!
  ctx.font = '600 44px system-ui, sans-serif'
  const w = Math.ceil(ctx.measureText(text).width) + 36
  c.width = w; c.height = 72
  ctx.font = '600 44px system-ui, sans-serif'
  // theme-allow-color: label baked into a 3D texture, always dark for contrast
  ctx.fillStyle = 'rgba(14,14,18,0.88)'
  ctx.beginPath(); ctx.roundRect(0, 0, w, 72, 18); ctx.fill()
  ctx.strokeStyle = colour; ctx.lineWidth = 4; ctx.stroke()
  // theme-allow-color: white text on the dark label texture
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 18, 38)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.renderOrder = 1001
  s.userData.aspect = w / 72
  return s
}

export interface ArrowSpec {
  globalId: string
  from: { modelId: string; expressId: number }
  to: { modelId: string; expressId: number }
  /** Text of the dimension, e.g. "120 mm" (already localised by the caller). */
  text: string
}

export function clearArrows(v: ViewerAPI): void {
  const { scene, requestRender } = v.drawingHost()
  const old = scene.getObjectByName(NAME)
  if (!old) return
  old.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose?.()
    const mt = m.material as THREE.Material | THREE.Material[] | undefined
    for (const x of Array.isArray(mt) ? mt : mt ? [mt] : []) { (x as THREE.SpriteMaterial).map?.dispose(); x.dispose() }
  })
  scene.remove(old)
  requestRender()
}

/** Replace the arrows. `selected` gets a thicker arrow; the others stay thin. */
export async function drawArrows(v: ViewerAPI, specs: ArrowSpec[], selected: string | null): Promise<void> {
  const group = new THREE.Group()
  group.name = NAME
  const colour = new THREE.Color(GROUP_COLOUR.moved)
  for (const s of specs.slice(0, 400)) {
    const [ba, bb] = await Promise.all([v.getElementsBox([s.from.expressId], s.from.modelId), v.getElementsBox([s.to.expressId], s.to.modelId)])
    if (!ba || !bb) continue
    const p0 = centre(ba), p1 = centre(bb)
    const dir = p1.clone().sub(p0)
    const len = dir.length()
    if (len < 1e-4) continue
    dir.normalize()
    const on = s.globalId === selected
    const head = Math.min(Math.max(len * 0.25, 0.08), 0.6)
    const arrow = new THREE.ArrowHelper(dir, p0, len, colour, head, head * 0.6)
    for (const o of [arrow.line, arrow.cone]) {
      const m = o.material as THREE.Material
      m.depthTest = false; m.transparent = true; (m as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.7
      o.renderOrder = 1000
    }
    group.add(arrow)
    if (on) {
      const sp = label(s.text, GROUP_COLOUR.moved)
      const h = Math.max(0.25, Math.min(len * 0.5, 1.2))
      sp.scale.set(h * (sp.userData.aspect as number), h, 1)
      sp.position.copy(p0.clone().add(p1).multiplyScalar(0.5)).add(new THREE.Vector3(0, h * 0.9, 0))
      group.add(sp)
    }
  }
  clearArrows(v)
  const { scene, requestRender } = v.drawingHost()
  scene.add(group)
  requestRender()
}
