// ─── model-staging ────────────────────────────────────────────────────────────
// How the IFC model is presented inside its city — the two things a product
// render does and a raw scene does not:
//
//   1. CONTACT SHADOW. A soft dark footprint where the model meets the ground
//      (the "ground occlusion" Mapbox draws under its buildings). Without it a
//      model reads as floating above the map however good the shadows are,
//      because a sun shadow falls to one side and the foot of the walls has
//      none. One quad with a blurred-rectangle texture: no post-processing,
//      no cost per frame.
//   2. FLOODLIGHT. At dusk and at night the city is carried by its windows —
//      and the model, lit only by a weak moon, was the darkest thing on
//      screen. A warm spot from the street side keeps it the most legible
//      object in the frame, which is the one rule every look must keep.
//
// The model's colours are never graded: they carry meaning (materials,
// validation highlights). The art direction acts on the context and the
// light, never on the model's own albedo.

import * as THREE from 'three'

export interface StagingBounds {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

export interface ContactShadowPlan {
  /** Quad size in metres (footprint + soft margin on each side). */
  width: number
  depth: number
  /** Soft margin, metres — how far the shade bleeds past the walls. */
  margin: number
}

/**
 * Size of the contact shadow for a model footprint. The margin grows with the
 * building (a tower's contact zone is wider than a kiosk's) but is capped: past
 * ~10 m it stops reading as contact and starts reading as a stain.
 */
export function planContactShadow(sizeX: number, sizeZ: number): ContactShadowPlan | null {
  if (!(sizeX > 0) || !(sizeZ > 0)) return null
  const margin = Math.min(10, Math.max(1.5, Math.max(sizeX, sizeZ) * 0.18))
  return { width: sizeX + 2 * margin, depth: sizeZ + 2 * margin, margin }
}

/** Texture: a blurred rectangle on transparent, inset by the margin's share. */
function contactTexture(plan: ContactShadowPlan): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const N = 256
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const g = canvas.getContext('2d')
  if (!g) return null
  const mx = (plan.margin / plan.width) * N
  const my = (plan.margin / plan.depth) * N
  g.filter = `blur(${Math.max(4, Math.min(mx, my) * 0.55)}px)`
  g.fillStyle = '#000'
  g.fillRect(mx * 0.75, my * 0.75, N - mx * 1.5, N - my * 1.5)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export interface ModelStaging {
  /** Re-fit to the model and ground; `ao` and `flood` come from the look. */
  update(bounds: StagingBounds | null, groundY: number, ao: number, flood: number, floodColor: string): void
  dispose(): void
}

export function createModelStaging(scene: THREE.Scene): ModelStaging {
  const group = new THREE.Group()
  group.name = 'geo-model-staging'
  scene.add(group)

  let shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  let shadowKey = ''

  const spot = new THREE.SpotLight(0xffc27a, 0, 0, 0.55, 0.85, 0)
  spot.name = 'geo-floodlight'
  spot.castShadow = false
  spot.visible = false
  group.add(spot)
  group.add(spot.target)

  function disposeShadow(): void {
    if (!shadow) return
    group.remove(shadow)
    shadow.geometry.dispose()
    shadow.material.map?.dispose()
    shadow.material.dispose()
    shadow = null
    shadowKey = ''
  }

  return {
    update(bounds, groundY, ao, flood, floodColor) {
      if (!bounds) { disposeShadow(); spot.visible = false; return }
      const { center: c, size: s } = bounds

      // ── contact shadow ──
      const plan = planContactShadow(s.x, s.z)
      if (!plan || ao <= 0) {
        disposeShadow()
      } else {
        const key = `${plan.width.toFixed(1)}x${plan.depth.toFixed(1)}`
        if (key !== shadowKey) {
          disposeShadow()
          const tex = contactTexture(plan)
          if (tex) {
            const mat = new THREE.MeshBasicMaterial({
              map: tex, color: 0x000000, transparent: true, depthWrite: false,
              // Over the tiles and the ground layers, under the model.
              polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
            })
            // The map is black on transparent: alpha does the shading.
            mat.alphaTest = 0
            shadow = new THREE.Mesh(new THREE.PlaneGeometry(plan.width, plan.depth), mat)
            shadow.name = 'geo-contact-shadow'
            shadow.rotation.x = -Math.PI / 2
            shadow.renderOrder = 6
            shadow.raycast = () => {} // never a pick target
            group.add(shadow)
            shadowKey = key
          }
        }
        if (shadow) {
          shadow.position.set(c.x, groundY + 0.03, c.z)
          // ao is 0.2–0.35 per finish; ×1.6 gives a contact shade that reads
          // without blackening the plot.
          shadow.material.opacity = Math.min(0.75, ao * 1.6)
        }
      }

      // ── floodlight ──
      spot.visible = flood > 0
      if (flood > 0) {
        const r = Math.max(s.x, s.z, s.y) * 1.3 + 10
        // From the street side (south-east, scene −Z is north), low: an
        // uplight, the way façades are actually lit at night.
        spot.position.set(c.x + r * 0.7, groundY + Math.max(4, s.y * 0.25), c.z + r * 0.7)
        spot.target.position.set(c.x, groundY + s.y * 0.55, c.z)
        spot.target.updateMatrixWorld()
        spot.color.set(floodColor)
        spot.intensity = flood
        // A REACH, not just a cone. With distance 0 the spot lit everything in
        // its cone down the street — a whole district washed orange at night
        // (seen in the app). Twice the light→model distance covers the model
        // and fades out right behind it.
        spot.distance = r * 2.2
        // Wide enough to wash the whole model from that distance, no wider.
        spot.angle = Math.min(1.0, Math.atan2(Math.max(s.x, s.z, s.y) * 0.75, r) + 0.12)
      }
    },

    dispose() {
      disposeShadow()
      group.remove(spot)
      group.remove(spot.target)
      spot.dispose()
      scene.remove(group)
    },
  }
}
