// ─── framed-shot ──────────────────────────────────────────────────────────────
// A report picture that does not depend on where the user left the camera: an
// aerial three-quarter view from the equator side (where the sun lights the
// façades), framing every loaded model, rendered off-screen through the shot
// renderer and handed back as a JPEG data URL. The on-screen view is restored.

import type { ViewerAPI } from '../viewer'
import { sunDirectionScene } from '../solar/sun-math'

const W = 1600
const H = 1000
const FOV = 32

export async function framedShot(viewer: ViewerAPI, lat: number, yawDeg: number): Promise<string | null> {
  const b = viewer.getModelBounds()
  if (!b) return null
  const radius = Math.max(5, Math.hypot(b.size.x, b.size.y, b.size.z) / 2)
  // From the south-south-east in the north (north-north-east in the south), 32° up.
  const d = sunDirectionScene(lat >= 0 ? 155 : 25, 32, (yawDeg * Math.PI) / 180)
  const dist = (radius / Math.sin(((FOV / 2) * Math.PI) / 180)) * 1.08
  const target = { x: b.center.x, y: b.center.y, z: b.center.z }
  const position = { x: target.x + d.x * dist, y: target.y + d.y * dist, z: target.z + d.z * dist }
  await viewer.beginShotRender(W, H)
  try {
    const canvas = await viewer.renderShotFrame({ position, target, fovDeg: FOV })
    return canvas.toDataURL('image/jpeg', 0.92)
  } catch {
    return null
  } finally {
    await viewer.endShotRender()
  }
}
