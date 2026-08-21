// ─── pavilion-lidar-replay ───────────────────────────────────────────────────
// A deterministic temporal scan authored from the exact dimension table used
// by scripts/blender/build-video-demo.py. It is deliberately labelled simulated
// in the UI: this proves the playback/rendering/IFC workflow without claiming a
// physical sensor was connected.

import type {
  DynamicPointFrame, PointCloudAlignment, SourceFrame,
} from '../lib/pointcloud/pc-types'

export const PAVILION_LIDAR_REPLAY_ID = 'operations-pavilion-lidar-replay'
export const PAVILION_LIDAR_DURATION_MS = 16_000
export const PAVILION_LIDAR_FRAME_RATE = 12

const WIDTH = 18
const DEPTH = 12
const FLOOR_DEPTH = 0.25
const COLUMN = 0.42
const COLUMN_HEIGHT = 4.6
const BEAM_DEPTH = 0.38
const ROOF_Z = COLUMN_HEIGHT + BEAM_DEPTH
const ROOF_DEPTH = 0.22
const GRID_X = [-8, 0, 8] as const
const GRID_Z = [-5, 5] as const
const RADIUS = 16
const SENSOR_POINTS = 420

interface Catalogue {
  positions: Float32Array
  colors: Uint8Array
  intensity: Uint8Array
  classification: Uint8Array
  capturePhase: Float32Array
  count: number
}

export interface PavilionLidarReplaySource {
  readonly capacity: number
  readonly basePointCount: number
  readonly sourceFrame: SourceFrame
  sample(timestampMs: number, sequence: number): DynamicPointFrame
}

export interface PavilionModelBounds {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

/**
 * Map the authored pavilion origin onto the IFC's actual scene bounds.
 *
 * The IFC loader is free to rebase geometry for float precision. Assuming that
 * its local (0,0,0) survived import made a paired demo drift by exactly that
 * rebase. X/Z therefore follow the measured bounds centre and Y follows the top
 * of the 250 mm floor slab, which is where the generated returns define y=0.
 */
export function pavilionReplayAlignment(bounds: PavilionModelBounds | null): PointCloudAlignment {
  const floorY = bounds ? bounds.center.y - bounds.size.y / 2 + FLOOR_DEPTH : 0
  return {
    rung: bounds ? 'local' : 'manual',
    confidence: bounds ? 'exact' : 'manual',
    origin: {
      x: bounds?.center.x ?? 0,
      y: floorY,
      z: bounds?.center.z ?? 0,
    },
    yawRad: 0,
    scale: 1,
    upAxis: 'y',
    reasons: [bounds ? 'replay.alignReason' : 'align.reason.noCommonReference'],
    offset: { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 },
  }
}

/** Tiny deterministic RNG — the same browser always sees the same scan. */
function mulberry32(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6D2B79F5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function buildCatalogue(): Catalogue {
  const xyz: number[] = []
  const rgb: number[] = []
  const intensities: number[] = []
  const classes: number[] = []
  const phases: number[] = []
  const random = mulberry32(0x1FC2026)

  const add = (
    x: number, y: number, z: number,
    color: readonly [number, number, number], intensity: number, classification: number,
  ): void => {
    // Millimetric-looking measurement noise, fixed rather than freshly random
    // per frame so points do not shimmer as the timeline advances.
    const jitter = () => (random() - 0.5) * 0.012
    xyz.push(x + jitter(), y + jitter(), z + jitter())
    rgb.push(color[0], color[1], color[2])
    intensities.push(intensity)
    classes.push(classification)
    const alongTrack = (x + WIDTH / 2) / WIDTH
    phases.push(Math.min(0.985, Math.max(0.015, alongTrack * 0.90 + (random() - 0.5) * 0.045)))
  }

  const gridXZ = (
    y: number, nx: number, nz: number,
    color: readonly [number, number, number], intensity: number, classification: number,
  ): void => {
    for (let ix = 0; ix < nx; ix++) {
      const x = -WIDTH / 2 + (WIDTH * ix) / (nx - 1)
      for (let iz = 0; iz < nz; iz++) {
        const z = -DEPTH / 2 + (DEPTH * iz) / (nz - 1)
        add(x, y, z, color, intensity, classification)
      }
    }
  }

  // Floor, canopy top and underside. ASPRS class 2 = ground, 6 = building.
  gridXZ(0, 64, 38, [112, 133, 149], 164, 2)
  gridXZ(ROOF_Z, 52, 30, [117, 184, 219], 202, 6)
  gridXZ(ROOF_Z + ROOF_DEPTH, 56, 32, [165, 211, 230], 218, 6)

  // Six columns, four measured faces each.
  for (const x0 of GRID_X) {
    for (const z0 of GRID_Z) {
      for (let iy = 0; iy < 34; iy++) {
        const y = (COLUMN_HEIGHT * iy) / 33
        for (let edge = 0; edge < 7; edge++) {
          const across = -COLUMN / 2 + (COLUMN * edge) / 6
          add(x0 - COLUMN / 2, y, z0 + across, [65, 205, 190], 236, 6)
          add(x0 + COLUMN / 2, y, z0 + across, [65, 205, 190], 236, 6)
          add(x0 + across, y, z0 - COLUMN / 2, [54, 181, 190], 224, 6)
          add(x0 + across, y, z0 + COLUMN / 2, [54, 181, 190], 224, 6)
        }
      }
    }
  }

  // Longitudinal beams along the two column lines.
  for (const z0 of GRID_Z) {
    for (let ix = 0; ix < 120; ix++) {
      const x = -WIDTH / 2 + (WIDTH * ix) / 119
      add(x, COLUMN_HEIGHT, z0 - COLUMN / 2, [61, 123, 193], 216, 6)
      add(x, COLUMN_HEIGHT + BEAM_DEPTH, z0 + COLUMN / 2, [77, 148, 214], 230, 6)
      add(x, COLUMN_HEIGHT + BEAM_DEPTH / 2, z0 - COLUMN / 2, [70, 136, 204], 222, 6)
      add(x, COLUMN_HEIGHT + BEAM_DEPTH / 2, z0 + COLUMN / 2, [70, 136, 204], 222, 6)
    }
  }

  return {
    positions: new Float32Array(xyz),
    colors: new Uint8Array(rgb),
    intensity: new Uint8Array(intensities),
    classification: new Uint8Array(classes),
    capturePhase: new Float32Array(phases),
    count: phases.length,
  }
}

export function createPavilionLidarReplay(): PavilionLidarReplaySource {
  const base = buildCatalogue()
  const capacity = base.count + SENSOR_POINTS
  const positions = new Float32Array(capacity * 3)
  const colors = new Uint8Array(capacity * 3)
  const intensity = new Uint8Array(capacity)
  const classification = new Uint8Array(capacity)

  const sourceFrame: SourceFrame = {
    unitScale: 1,
    unitSource: 'declared',
    epsgCode: null,
    upAxis: 'y',
    upAxisSource: 'declared',
    min: { x: -WIDTH / 2, y: 0, z: -DEPTH / 2 - 1.4 },
    max: { x: WIDTH / 2, y: ROOF_Z + ROOF_DEPTH, z: DEPTH / 2 },
    origin: { x: 0, y: 0, z: 0 },
  }
  const frameBounds = {
    min: { ...sourceFrame.min },
    max: { ...sourceFrame.max },
  }

  const writePoint = (
    out: number, x: number, y: number, z: number,
    r: number, g: number, b: number, value: number, cls: number,
  ): number => {
    positions[out * 3] = x
    positions[out * 3 + 1] = y
    positions[out * 3 + 2] = z
    colors[out * 3] = r
    colors[out * 3 + 1] = g
    colors[out * 3 + 2] = b
    intensity[out] = value
    classification[out] = cls
    return out + 1
  }

  return {
    capacity,
    basePointCount: base.count,
    sourceFrame,
    sample(timestampMs, sequence) {
      const clamped = Math.min(PAVILION_LIDAR_DURATION_MS, Math.max(0, timestampMs))
      const phase = clamped / PAVILION_LIDAR_DURATION_MS
      let out = 0

      // Accumulated returns. Recent points receive a slight cyan lift so the
      // active scan front is visible without erasing earlier observations.
      for (let i = 0; i < base.count; i++) {
        const capturedAt = base.capturePhase[i]
        if (capturedAt > phase) continue
        const fresh = Math.max(0, 1 - (phase - capturedAt) / 0.10)
        const p = i * 3
        const r = Math.round(base.colors[p] * (1 - fresh * 0.18) + 80 * fresh * 0.18)
        const g = Math.round(base.colors[p + 1] * (1 - fresh * 0.18) + 235 * fresh * 0.18)
        const b = Math.round(base.colors[p + 2] * (1 - fresh * 0.18) + 255 * fresh * 0.18)
        out = writePoint(
          out, base.positions[p], base.positions[p + 1], base.positions[p + 2],
          r, g, b, base.intensity[i], base.classification[i],
        )
      }

      // Moving sensor glyph: two return rings, a vertical sweep and the
      // travelled path. These are presentation aids, not asserted measurements.
      const scannerX = -WIDTH / 2 + WIDTH * phase
      const scannerY = 1.15
      const scannerZ = -DEPTH / 2 - 1.4
      for (let i = 0; i < 144; i++) {
        const angle = (i / 144) * Math.PI * 2
        out = writePoint(out, scannerX + Math.cos(angle) * 0.34, scannerY, scannerZ + Math.sin(angle) * 0.34, 255, 181, 71, 255, 0)
        out = writePoint(out, scannerX, scannerY + Math.cos(angle) * 0.34, scannerZ + Math.sin(angle) * 0.34, 255, 211, 102, 255, 0)
      }
      for (let i = 0; i < 72; i++) {
        const amount = i / 71
        out = writePoint(out, scannerX, scannerY + amount * (ROOF_Z - scannerY), scannerZ + amount * (0 - scannerZ), 255, 196, 72, 245, 0)
      }
      for (let i = 0; i < 60; i++) {
        const amount = i / 59
        out = writePoint(out, -WIDTH / 2 + WIDTH * phase * amount, 0.035, scannerZ, 221, 151, 53, 210, 0)
      }

      return {
        sequence,
        timestampMs: clamped,
        count: out,
        origin: { x: 0, y: 0, z: 0 },
        radius: RADIUS,
        bounds: frameBounds,
        positions,
        colors,
        intensity,
        classification,
        confidence: null,
      }
    },
  }
}
