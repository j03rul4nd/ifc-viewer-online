// ─── bcf-viewpoint ────────────────────────────────────────────────────────────
// The one place a BCF viewpoint changes coordinate frame, and the one place a
// section cut becomes a BCF clipping plane and back.
//
// FRAMES. Inside the app (bcfStore, BcfPanel) a viewpoint is in SCENE axes —
// x east, y up, z south — because that is what viewer.getCameraViewpoint()
// returns and setCameraViewpoint() takes. A .bcfv file is in IFC world axes —
// X east, Y north, Z up — in BCF 2.1 and 3.0 alike, and that is how Solibri,
// BIMcollab, Navisworks and Revizto read it. The writer (bcf.ts) calls
// viewpointToBcf right before serialising, the parser (bcf-parser.worker)
// calls viewpointFromBcf right after reading, and nothing else converts. The
// axis swap itself is measure-math's toIfcAxes / fromIfcAxes.
//
// NOT CONVERTED, on purpose:
//   • The loader's coordination offset (viewer.getModelCoordination()). The IFC
//     converter keeps the file's datum (COORDINATE_TO_ORIGIN: false), so on the
//     normal load path the scene origin IS the IFC world origin and the offset
//     is zero. Only the direct loadIfc path asks the loader to coordinate; a
//     model loaded that way would export off by that offset.
//   • Per-model pivot transforms (a model moved or rotated in the app). A moved
//     model is drawn away from where its file puts it, and a federated scene
//     has no single pivot to undo. The viewpoint records the scene as drawn.
//   • Units: scene metres are BCF metres.
//
// CLIPPING PLANES. A section cut is a half-space: a point on the plane and the
// normal of the side it KEEPS (a three.js clipping plane keeps positive
// distance). BCF's <Direction> points the other way, to the side that is cut
// AWAY. BcfViewpoint.clippingPlanes follows BCF — `direction` is the cut-away
// side — and is in scene axes until it is written, like the camera.

import { fromIfcAxes, toIfcAxes } from './measure/measure-math'
import type { BcfClippingPlane, BcfViewpoint, Vec3Like } from '../types'

/** A section cut as the section system reports it: the side it keeps. */
export interface SectionHalfSpace {
  point: Vec3Like
  normal: Vec3Like
}

/** −0 → 0, so a converted vector compares and prints the way people expect. */
function tidy(v: Vec3Like): Vec3Like {
  return { x: v.x + 0, y: v.y + 0, z: v.z + 0 }
}

const negate = (v: Vec3Like): Vec3Like => tidy({ x: -v.x, y: -v.y, z: -v.z })

/**
 * The up vector of an unrolled camera looking along `dir`, in scene axes:
 * scene +y with the view direction taken out. Looking straight up or down
 * there is none, and north (scene −z) goes to the top of the screen, as on a
 * plan. The viewer's orbit controls never roll, so this is the up it has.
 */
export function sceneUpFor(dir: Vec3Like): Vec3Like {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len }
  const up = { x: -d.y * d.x, y: 1 - d.y * d.y, z: -d.y * d.z }
  const n = Math.hypot(up.x, up.y, up.z)
  if (n < 1e-9) return { x: 0, y: 0, z: -1 }
  return tidy({ x: up.x / n, y: up.y / n, z: up.z / n })
}

function mapFrame(vp: BcfViewpoint, f: (v: Vec3Like) => Vec3Like): BcfViewpoint {
  const out: BcfViewpoint = { ...vp }
  if (vp.cameraPosition) out.cameraPosition = tidy(f(vp.cameraPosition))
  if (vp.cameraDirection) out.cameraDirection = tidy(f(vp.cameraDirection))
  if (vp.cameraUp) out.cameraUp = tidy(f(vp.cameraUp))
  if (vp.clippingPlanes) {
    out.clippingPlanes = vp.clippingPlanes.map((p) => ({
      location: tidy(f(p.location)),
      direction: tidy(f(p.direction)),
    }))
  }
  return out
}

/** A scene-axes viewpoint → the IFC world axes a .bcfv is written in. */
export function viewpointToBcf(vp: BcfViewpoint): BcfViewpoint {
  // Viewpoints captured before the up vector was recorded still carry a
  // camera, and a camera without an up is not a camera to the writer.
  const withUp = vp.cameraDirection && !vp.cameraUp ? { ...vp, cameraUp: sceneUpFor(vp.cameraDirection) } : vp
  return mapFrame(withUp, toIfcAxes)
}

/** A viewpoint read from a .bcfv (IFC world axes) → scene axes. */
export function viewpointFromBcf(vp: BcfViewpoint): BcfViewpoint {
  return mapFrame(vp, fromIfcAxes)
}

/** Section cuts → BCF clipping planes (Direction = the side cut away). */
export function clippingPlanesFromCuts(cuts: readonly SectionHalfSpace[]): BcfClippingPlane[] {
  return cuts.map((c) => ({ location: tidy(c.point), direction: negate(c.normal) }))
}

/** BCF clipping planes → the half-spaces the section system keeps. */
export function cutsFromClippingPlanes(planes: readonly BcfClippingPlane[]): SectionHalfSpace[] {
  return planes.map((p) => ({ point: tidy(p.location), normal: negate(p.direction) }))
}
