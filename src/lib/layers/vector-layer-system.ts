// ─── vector-layer-system ──────────────────────────────────────────────────────
// Owns the three.js side of vector layers: one group per layer under a single
// root in the viewer's scene. Lazy chunk, created by viewer.getVectorLayers().
//
// Where the ground is comes from the caller (viewer.mapGroundAt → geo-system's
// ground frame), so this module knows nothing about maps or terrain.

import * as THREE from 'three'
import { buildVectorLayer, disposeVectorLayer, featureOfHit, updateLayerLod, animateFlow, type BuildInput, type BuiltLayer } from './vector-mesh'
import { iconTexture, assetTemplates } from './vector-assets'


export interface VectorLayerContext {
  scene: THREE.Scene
  frameBox(min: THREE.Vector3, max: THREE.Vector3): void
  getActiveCamera(): THREE.Camera
  getCanvas(): HTMLCanvasElement | null
  /** Slide the orbit target (and the camera with it) to a point, keeping the view. */
  moveTarget?(x: number, y: number, z: number): void
}

/**
 * Where moved points WERE, as an offset from where they are now (scene
 * metres), by feature index. The new geometry is built at the new position and
 * then drawn shifted by the offset, easing to zero — one rebuild per refresh,
 * smooth motion in between.
 */
export interface PointTween {
  deltas: Map<number, { dx: number; dz: number }>
  durationMs: number
}

export interface VectorPick {
  layerId: string
  featureIndex: number
  featureId: string
  point: { x: number; y: number; z: number }
  distance: number
}

export interface VectorLayerSystemAPI {
  /** Build (or rebuild) one layer. Returns its stats, or null if it drew nothing. */
  render(id: string, input: BuildInput, visible: boolean, tween?: PointTween): BuiltLayer['stats'] | null
  setVisible(id: string, visible: boolean): void
  remove(id: string): void
  frame(id: string): boolean
  /** The nearest visible feature under a screen point (client px), or null. */
  pick(clientX: number, clientY: number): VectorPick | null
  /** Draw one feature again on top, brighter and wider. Null clears it. */
  setHighlight(input: BuildInput | null): void
  /** Told whenever a layer's aggregate comes on or off screen (the legend follows). */
  setLodListener(fn: ((id: string, aggregateOn: boolean, range: { min: number; max: number } | null) => void) | null): void
  /** Pulsing rings over a layer's alerting features (scene points). Empty clears them. */
  setAlertMarks(id: string, points: Array<{ x: number; y: number; z: number }>, color: string): void
  /** Keep the view on a moving feature: the camera slides with it, angle and distance kept. */
  followTo(p: { x: number; y: number; z: number }): void
  /** Move the camera to the highlighted feature. False when nothing is highlighted. */
  frameHighlight(): boolean
  /** Frame any scene box with the same oblique rule. */
  frameBox(min: { x: number; y: number; z: number }, max: { x: number; y: number; z: number }): void
  dispose(): void
}

export function createVectorLayerSystem(ctx: VectorLayerContext): VectorLayerSystemAPI {
  const root = new THREE.Group()
  root.name = 'vector-layers'
  ctx.scene.add(root)
  // QA hook (dev builds only): the one way to inspect what was actually built
  // from the page — a module imported from the console is a different instance.
  if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__ifcVectorLayers = root
  const layers = new Map<string, { group: THREE.Group; bounds: THREE.Box3; stopTween?: () => void }>()
  let highlight: THREE.Group | null = null

  // ── Zoom bands, per frame ──
  // Only does work when the camera moved (or a layer was rebuilt): crossing a
  // band flips visibility; standing still costs one vector compare.
  const lastCam = new THREE.Vector3(Infinity, Infinity, Infinity)
  let lodDirty = true
  let lodListener: ((id: string, aggregateOn: boolean, range: { min: number; max: number } | null) => void) | null = null
  const lastAgg = new Map<string, boolean>()
  const aggRange = (g: THREE.Object3D): { min: number; max: number } | null => {
    const a = g.children.find((c) => c.userData.isAggregate)
    const r = a?.userData.range as { min: number; max: number } | undefined
    return r && Number.isFinite(r.min) ? r : null
  }
  // ── Alert rings: one sprite per alerting feature, pulsing on screen ──
  const alertMarks = new Map<string, THREE.Group>()
  let ringTex: THREE.Texture | null | undefined
  const ringTexture = (): THREE.Texture | null => {
    if (ringTex !== undefined) return ringTex
    ringTex = null
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const g = c.getContext('2d')
      if (g) {
        g.strokeStyle = '#ffffff'; g.lineWidth = 6
        g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke()
        ringTex = new THREE.CanvasTexture(c)
        ringTex.colorSpace = THREE.SRGBColorSpace
      }
    } catch { /* headless */ }
    return ringTex
  }
  const clearMarks = (id: string): void => {
    const g = alertMarks.get(id)
    if (!g) return
    g.traverse((o) => { if ((o as THREE.Sprite).isSprite) ((o as THREE.Sprite).material as THREE.Material).dispose() })
    g.removeFromParent()
    alertMarks.delete(id)
  }
  let pulse = 0

  let raf = 0
  let lastT = performance.now()
  const lodFrame = (): void => {
    raf = requestAnimationFrame(lodFrame)
    const now = performance.now()
    const dt = Math.min(0.1, (now - lastT) / 1000)
    lastT = now
    if (layers.size === 0) return
    // Alert rings breathe: 1.2 s period, growing and fading.
    if (alertMarks.size) {
      pulse = (pulse + dt / 1.2) % 1
      for (const [id, g] of alertMarks) {
        g.visible = layers.get(id)?.group.visible ?? false
        for (const c of g.children) {
          const sp = c as THREE.Sprite
          ;(sp.material as THREE.SpriteMaterial).opacity = 1 - pulse * 0.85
          sp.userData.px = 26 + pulse * 26
        }
      }
    }
    // Flow chevrons move every frame, camera or not.
    for (const l of layers.values()) if (l.group.visible) animateFlow(l.group, dt)
    const cam = ctx.getActiveCamera().getWorldPosition(new THREE.Vector3())
    if (!lodDirty && cam.distanceToSquared(lastCam) < 0.25) return
    lastCam.copy(cam)
    lodDirty = false
    for (const [id, l] of layers) {
      const on = l.group.visible ? updateLayerLod(l.group, cam, l.bounds) : false
      if (lastAgg.get(id) !== on) {
        lastAgg.set(id, on)
        lodListener?.(id, on, aggRange(l.group))
      }
    }
  }
  raf = requestAnimationFrame(lodFrame)

  /** Animate moved points of one built layer. Returns a canceller. */
  function startTween(group: THREE.Group, tween: PointTween): (() => void) | undefined {
    if (tween.deltas.size === 0 || tween.durationMs <= 0) return undefined
    const insts: Array<{ mesh: THREE.InstancedMesh; base: Float32Array; feats: Int32Array }> = []
    const objs: Array<{ o: THREE.Object3D; base: THREE.Vector3; d: { dx: number; dz: number } }> = []
    group.traverse((o) => {
      const im = o as THREE.InstancedMesh
      if (im.isInstancedMesh && im.userData.instanceFeature) {
        insts.push({ mesh: im, base: Float32Array.from(im.instanceMatrix.array as Float32Array), feats: im.userData.instanceFeature as Int32Array })
        return
      }
      const fi = o.userData.feature
      if (typeof fi === 'number') {
        const d = tween.deltas.get(fi)
        if (d) objs.push({ o, base: o.position.clone(), d })
      }
    })
    if (insts.length === 0 && objs.length === 0) return undefined
    let raf = 0
    const t0 = performance.now()
    const frame = (now: number): void => {
      const u = Math.min(1, (now - t0) / tween.durationMs)
      const k = 1 - (u * u * (3 - 2 * u)) // smoothstep, 1 → 0
      for (const { mesh, base, feats } of insts) {
        const arr = mesh.instanceMatrix.array as Float32Array
        for (let i = 0; i < feats.length; i++) {
          const d = tween.deltas.get(feats[i])
          if (!d) continue
          // Column-major 4×4: translation lives at 12, 13, 14.
          arr[i * 16 + 12] = base[i * 16 + 12] + d.dx * k
          arr[i * 16 + 14] = base[i * 16 + 14] + d.dz * k
        }
        mesh.instanceMatrix.needsUpdate = true
      }
      for (const { o, base, d } of objs) o.position.set(base.x + d.dx * k, base.y, base.z + d.dz * k)
      if (u < 1) raf = requestAnimationFrame(frame)
    }
    frame(t0)
    return () => {
      cancelAnimationFrame(raf)
      // Land everything at its final place, whatever the clock said.
      for (const { mesh, base } of insts) { (mesh.instanceMatrix.array as Float32Array).set(base); mesh.instanceMatrix.needsUpdate = true }
      for (const { o, base } of objs) o.position.copy(base)
    }
  }

  function remove(id: string): void {
    const l = layers.get(id)
    if (!l) return
    l.stopTween?.()
    disposeVectorLayer(l.group)
    layers.delete(id)
  }

  return {
    render(id, input, visible, tween) {
      remove(id)
      const built = buildVectorLayer({ ...input, iconTexture, assets: assetTemplates() })
      if (built.group.children.length === 0) return null
      built.group.visible = visible
      built.group.userData.vectorLayerId = id
      root.add(built.group)
      layers.set(id, { group: built.group, bounds: built.bounds, stopTween: tween ? startTween(built.group, tween) : undefined })
      lodDirty = true
      // A rebuild can change the range even when on/off did not: re-announce.
      lastAgg.delete(id)
      return built.stats
    },
    setVisible(id, visible) {
      const l = layers.get(id)
      if (l) l.group.visible = visible
      lodDirty = true
    },
    // A deleted layer takes its alert rings with it (render() rebuilds through
    // the inner remove and must keep them).
    remove(id) {
      remove(id)
      clearMarks(id)
    },
    frame(id) {
      const l = layers.get(id)
      if (!l || l.bounds.isEmpty()) return false
      // A flat route has no height: give the box some so the camera fit works.
      const min = l.bounds.min.clone(), max = l.bounds.max.clone()
      const pad = Math.max(5, (max.x - min.x + max.z - min.z) * 0.05)
      min.y -= pad; max.y += pad
      ctx.frameBox(min, max)
      return true
    },
    pick(clientX, clientY) {
      const canvas = ctx.getCanvas()
      if (!canvas || layers.size === 0) return null
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      const ray = new THREE.Raycaster()
      ray.setFromCamera(ndc, ctx.getActiveCamera())
      const targets = [...layers.values()].filter((l) => l.group.visible).map((l) => l.group)
      // Points live on a pixel-sized sprite; give the ray a few px of slack.
      ray.params.Points = { threshold: 2 }
      for (const hit of ray.intersectObjects(targets, true)) {
        // three's raycaster ignores `visible`: a symbol hidden by its zoom band
        // must not be clickable.
        let hidden = false
        for (let a: THREE.Object3D | null = hit.object; a; a = a.parent) if (!a.visible) { hidden = true; break }
        if (hidden) continue
        let o: THREE.Object3D | null = hit.object
        while (o && o.userData.vectorLayerId === undefined) o = o.parent
        if (!o) continue
        const fi = featureOfHit(hit)
        if (fi < 0) continue
        const ids = o.userData.featureIds as string[] | undefined
        return {
          layerId: o.userData.vectorLayerId as string,
          featureIndex: fi,
          featureId: ids?.[fi] ?? String(fi),
          point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
          distance: hit.distance,
        }
      }
      return null
    },
    setLodListener(fn) { lodListener = fn; lastAgg.clear(); lodDirty = true },
    frameHighlight() {
      if (!highlight) return false
      // Not setFromObject: the dot buffer of a point group is pre-allocated
      // with zeros, and counting it boxes "origin → feature" — the camera then
      // framed half the city instead of the one station.
      const box = new THREE.Box3()
      highlight.updateMatrixWorld(true)
      highlight.traverse((o) => {
        if ((o as THREE.Points).isPoints) return
        if ((o as THREE.Sprite).isSprite) { box.expandByPoint(o.getWorldPosition(new THREE.Vector3())); return }
        if ((o as THREE.Mesh).isMesh) box.expandByObject(o, false)
      })
      if (box.isEmpty()) return false
      // A single sensor is a point: frame the 60 m around it, not a 2 m sphere.
      const pad = Math.max(0, 30 - Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2)
      box.expandByVector(new THREE.Vector3(pad, Math.min(pad, 10), pad))
      ctx.frameBox(box.min, box.max)
      return true
    },
    followTo(p) {
      ctx.moveTarget?.(p.x, p.y, p.z)
    },
    frameBox(min, max) {
      ctx.frameBox(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, max.y, max.z))
    },
    setAlertMarks(id, points, color) {
      clearMarks(id)
      const tex = ringTexture()
      if (!points.length || !tex) return
      const g = new THREE.Group()
      g.name = 'vector-alerts'
      const col = new THREE.Color(color)
      for (const p of points) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, color: col, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
          sizeAttenuation: false,
        }))
        sp.position.set(p.x, p.y, p.z)
        sp.renderOrder = 1000
        sp.userData.px = 26
        // Fixed pixel size (like icons), read per frame so the pulse shows.
        sp.onBeforeRender = (renderer, _scene, camera) => {
          const el = (renderer as unknown as { domElement?: HTMLCanvasElement }).domElement
          const k = (2 * (sp.userData.px as number)) / ((el?.clientHeight || 600) * (camera.projectionMatrix.elements[5] || 1))
          sp.scale.set(k, k, 1)
        }
        g.add(sp)
      }
      const host = layers.get(id)
      g.visible = host ? host.group.visible : true
      alertMarks.set(id, g)
      root.add(g)
    },
    setHighlight(input) {
      if (highlight) { disposeVectorLayer(highlight); highlight = null }
      if (!input) return
      const built = buildVectorLayer({ ...input, iconTexture, assets: assetTemplates() })
      if (built.group.children.length === 0) return
      // Always on top: a picked route under a zone fill must still read.
      built.group.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined
        if (m) { m.depthTest = false; m.transparent = true }
        o.renderOrder = 999
      })
      built.group.name = 'vector-highlight'
      highlight = built.group
      root.add(highlight)
    },
    dispose() {
      cancelAnimationFrame(raf)
      for (const id of [...alertMarks.keys()]) clearMarks(id)
      if (highlight) { disposeVectorLayer(highlight); highlight = null }
      for (const id of [...layers.keys()]) remove(id)
      root.removeFromParent()
    },
  }
}
