// ─── Realtime LiDAR showcase catalogue ──────────────────────────────────────
// Four deterministic IFC + temporal point-cloud pairs for exhibitions and
// article embeds. All motion is simulated and labelled as such. The renderer,
// binary transport, bounded buffer, timeline and GPU updates are the real
// product path.

import type { DynamicPointFrame, PointCloudAlignment, SourceFrame } from '../lib/pointcloud/pc-types'
import {
  createPavilionLidarReplay,
  PAVILION_LIDAR_DURATION_MS,
  PAVILION_LIDAR_FRAME_RATE,
  PAVILION_LIDAR_REPLAY_ID,
  pavilionReplayAlignment,
  type PavilionLidarReplaySource,
  type PavilionModelBounds,
} from './pavilion-lidar-replay'

export type TemporalShowcaseId =
  | 'operations-pavilion'
  | 'warehouse-operations'
  | 'construction-progress'
  | 'utility-tunnel'

export type TemporalReplaySource = PavilionLidarReplaySource

export interface TemporalLidarShowcase {
  id: TemporalShowcaseId
  cloudId: string
  demoModelId: string
  modelFileName: string
  modelPath: string
  copyKey: string
  durationMs: number
  frameRate: number
  mcapFileName: string
  approximatePoints: number
  pointSize: number
  modelOpacity: number
  /** Exhibition-friendly camera pose relative to the replay alignment origin. */
  camera?: {
    position: { x: number; y: number; z: number }
    target: { x: number; y: number; z: number }
  }
  createSource: () => TemporalReplaySource
  align: (bounds: PavilionModelBounds | null) => PointCloudAlignment
}

interface PointCatalogue {
  positions: Float32Array
  colors: Uint8Array
  intensity: Uint8Array
  classification: Uint8Array
  activation: Float32Array
  count: number
}

interface PointWriter {
  add(
    x: number, y: number, z: number,
    color: readonly [number, number, number],
    intensity?: number,
    classification?: number,
    activation?: number,
  ): void
}

interface SourceSpec {
  durationMs: number
  radius: number
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
  dynamicCapacity: number
  seed: number
  buildStatic(writer: PointWriter): void
  buildDynamic(writer: PointWriter, phase: number): void
}

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

function makeCatalogue(spec: SourceSpec): PointCatalogue {
  const xyz: number[] = []
  const rgb: number[] = []
  const intensities: number[] = []
  const classes: number[] = []
  const activations: number[] = []
  const random = mulberry32(spec.seed)
  const writer: PointWriter = {
    add(x, y, z, color, intensity = 205, classification = 6, activation = 0) {
      const jitter = () => (random() - 0.5) * 0.014
      xyz.push(x + jitter(), y + jitter(), z + jitter())
      rgb.push(color[0], color[1], color[2])
      intensities.push(intensity)
      classes.push(classification)
      activations.push(Math.max(0, Math.min(1, activation)))
    },
  }
  spec.buildStatic(writer)
  return {
    positions: new Float32Array(xyz),
    colors: new Uint8Array(rgb),
    intensity: new Uint8Array(intensities),
    classification: new Uint8Array(classes),
    activation: new Float32Array(activations),
    count: activations.length,
  }
}

function createSource(spec: SourceSpec): TemporalReplaySource {
  const base = makeCatalogue(spec)
  const capacity = base.count + spec.dynamicCapacity
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
    min: { ...spec.bounds.min },
    max: { ...spec.bounds.max },
    origin: { x: 0, y: 0, z: 0 },
  }

  return {
    capacity,
    basePointCount: base.count,
    sourceFrame,
    sample(timestampMs, sequence) {
      const clamped = Math.max(0, Math.min(spec.durationMs, timestampMs))
      const phase = clamped / spec.durationMs
      let out = 0
      const frameWriter: PointWriter = {
        add(x, y, z, color, value = 220, cls = 6) {
          if (out >= capacity) return
          const p = out * 3
          positions[p] = x
          positions[p + 1] = y
          positions[p + 2] = z
          colors[p] = color[0]
          colors[p + 1] = color[1]
          colors[p + 2] = color[2]
          intensity[out] = value
          classification[out] = cls
          out++
        },
      }

      for (let i = 0; i < base.count; i++) {
        if (base.activation[i] > phase) continue
        const p = i * 3
        const fresh = Math.max(0, 1 - (phase - base.activation[i]) / 0.08)
        frameWriter.add(
          base.positions[p], base.positions[p + 1], base.positions[p + 2],
          [
            Math.round(base.colors[p] * (1 - fresh * 0.16) + 80 * fresh * 0.16),
            Math.round(base.colors[p + 1] * (1 - fresh * 0.16) + 236 * fresh * 0.16),
            Math.round(base.colors[p + 2] * (1 - fresh * 0.16) + 255 * fresh * 0.16),
          ],
          base.intensity[i], base.classification[i],
        )
      }
      spec.buildDynamic(frameWriter, phase)
      return {
        sequence,
        timestampMs: clamped,
        count: out,
        origin: { x: 0, y: 0, z: 0 },
        radius: spec.radius,
        bounds: { min: { ...spec.bounds.min }, max: { ...spec.bounds.max } },
        positions,
        colors,
        intensity,
        classification,
        confidence: null,
      }
    },
  }
}

function gridXZ(
  writer: PointWriter, y: number, x0: number, x1: number, z0: number, z1: number,
  nx: number, nz: number, color: readonly [number, number, number],
  intensity = 205, classification = 6, activation = 0,
): void {
  for (let ix = 0; ix < nx; ix++) {
    const x = x0 + ((x1 - x0) * ix) / Math.max(1, nx - 1)
    for (let iz = 0; iz < nz; iz++) {
      const z = z0 + ((z1 - z0) * iz) / Math.max(1, nz - 1)
      writer.add(x, y, z, color, intensity, classification, activation)
    }
  }
}

function gridXY(
  writer: PointWriter, z: number, x0: number, x1: number, y0: number, y1: number,
  nx: number, ny: number, color: readonly [number, number, number],
  intensity = 205, classification = 6, activation = 0,
): void {
  for (let ix = 0; ix < nx; ix++) {
    const x = x0 + ((x1 - x0) * ix) / Math.max(1, nx - 1)
    for (let iy = 0; iy < ny; iy++) {
      const y = y0 + ((y1 - y0) * iy) / Math.max(1, ny - 1)
      writer.add(x, y, z, color, intensity, classification, activation)
    }
  }
}

function gridYZ(
  writer: PointWriter, x: number, y0: number, y1: number, z0: number, z1: number,
  ny: number, nz: number, color: readonly [number, number, number],
  intensity = 205, classification = 6, activation = 0,
): void {
  for (let iy = 0; iy < ny; iy++) {
    const y = y0 + ((y1 - y0) * iy) / Math.max(1, ny - 1)
    for (let iz = 0; iz < nz; iz++) {
      const z = z0 + ((z1 - z0) * iz) / Math.max(1, nz - 1)
      writer.add(x, y, z, color, intensity, classification, activation)
    }
  }
}

function boxSurface(
  writer: PointWriter,
  center: readonly [number, number, number],
  size: readonly [number, number, number],
  spacing: number,
  color: readonly [number, number, number],
  classification = 6,
  activation = 0,
): void {
  const [cx, cy, cz] = center
  const [sx, sy, sz] = size
  const nx = Math.max(2, Math.ceil(sx / spacing) + 1)
  const ny = Math.max(2, Math.ceil(sy / spacing) + 1)
  const nz = Math.max(2, Math.ceil(sz / spacing) + 1)
  gridXZ(writer, cy - sy / 2, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, nx, nz, color, 215, classification, activation)
  gridXZ(writer, cy + sy / 2, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, nx, nz, color, 225, classification, activation)
  gridXY(writer, cz - sz / 2, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, nx, ny, color, 205, classification, activation)
  gridXY(writer, cz + sz / 2, cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, nx, ny, color, 205, classification, activation)
  gridYZ(writer, cx - sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, ny, nz, color, 198, classification, activation)
  gridYZ(writer, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, ny, nz, color, 198, classification, activation)
}

function lidarRings(writer: PointWriter, x: number, y: number, z: number, radius: number): void {
  for (let i = 0; i < 180; i++) {
    const angle = (i / 180) * Math.PI * 2
    writer.add(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius, [255, 196, 72], 255, 0)
    writer.add(x, y + Math.cos(angle) * radius, z + Math.sin(angle) * radius, [255, 220, 112], 252, 0)
  }
}

function genericAlignment(bounds: PavilionModelBounds | null, floorDepth: number): PointCloudAlignment {
  const floorY = bounds ? bounds.center.y - bounds.size.y / 2 + floorDepth : 0
  return {
    rung: bounds ? 'local' : 'manual',
    confidence: bounds ? 'exact' : 'manual',
    origin: { x: bounds?.center.x ?? 0, y: floorY, z: bounds?.center.z ?? 0 },
    yawRad: 0,
    scale: 1,
    upAxis: 'y',
    reasons: [bounds ? 'replay.alignReason' : 'align.reason.noCommonReference'],
    offset: { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 },
  }
}

// ── Warehouse: fixed building/racks + two genuinely moving return clusters ──

function createWarehouseReplay(): TemporalReplaySource {
  return createSource({
    durationMs: 18_000,
    radius: 27,
    bounds: { min: { x: -15, y: 0, z: -9 }, max: { x: 15, y: 8, z: 9 } },
    dynamicCapacity: 4_800,
    seed: 0xA11CE,
    buildStatic(writer) {
      gridXZ(writer, 0, -15, 15, -9, 9, 140, 84, [92, 112, 126], 168, 2)
      gridXZ(writer, 8, -15, 15, -9, 9, 72, 44, [112, 160, 187])
      gridXY(writer, -9, -15, 15, 0, 8, 110, 30, [87, 132, 162])
      gridXY(writer, 9, -15, 15, 0, 8, 110, 30, [87, 132, 162])
      gridYZ(writer, -15, 0, 8, -9, 9, 30, 70, [76, 117, 148])
      gridYZ(writer, 15, 0, 8, -9, 9, 30, 70, [76, 117, 148])
      for (const x of [-10, -5, 0, 5, 10]) {
        for (const z of [-6.2, 6.2]) boxSurface(writer, [x, 2.35, z], [3.5, 4.7, 1.25], 0.36, [68, 150, 174])
      }
      for (const x of [-12, -4, 4, 12]) {
        for (const z of [-7.5, 0, 7.5]) boxSurface(writer, [x, 4, z], [0.34, 8, 0.34], 0.28, [71, 96, 119])
      }
    },
    buildDynamic(writer, phase) {
      const loop = phase * Math.PI * 2
      const forkliftX = -11 + 22 * phase
      const forkliftZ = -2.8 + Math.sin(loop) * 1.1
      boxSurface(writer, [forkliftX, 0.65, forkliftZ], [2.1, 1.3, 1.15], 0.11, [255, 143, 63], 18)
      boxSurface(writer, [forkliftX + 0.65, 1.65, forkliftZ], [0.18, 2.1, 0.95], 0.10, [255, 181, 82], 18)
      lidarRings(writer, forkliftX - 0.65, 1.25, forkliftZ, 0.5)

      const cartX = 10 - 20 * phase
      const cartZ = 2.7 + Math.cos(loop * 1.4) * 0.8
      boxSurface(writer, [cartX, 0.38, cartZ], [1.25, 0.75, 0.85], 0.10, [84, 226, 205], 18)
      for (let i = 0; i < 90; i++) {
        const trail = i / 89
        writer.add(cartX + trail * 3.4, 0.06, cartZ, [52, 211, 185], 230, 0)
      }
    },
  })
}

// ── Construction: elements appear over time + lifted panel + deviation zone ─

function createConstructionReplay(): TemporalReplaySource {
  return createSource({
    durationMs: 20_000,
    radius: 25,
    bounds: { min: { x: -13, y: 0, z: -10 }, max: { x: 13, y: 8.2, z: 10 } },
    dynamicCapacity: 4_500,
    seed: 0xC011AB,
    buildStatic(writer) {
      gridXZ(writer, 0, -13, 13, -10, 10, 132, 100, [116, 126, 136], 170, 2)
      const columns = [-10, -5, 0, 5, 10]
      for (let ix = 0; ix < columns.length; ix++) {
        for (const z of [-7.5, 0, 7.5]) {
          const activation = 0.10 + (ix / columns.length) * 0.34 + (z + 7.5) / 110
          boxSurface(writer, [columns[ix], 3.7, z], [0.46, 7.4, 0.46], 0.20, [71, 179, 187], 6, activation)
        }
      }
      for (const z of [-7.5, 0, 7.5]) {
        boxSurface(writer, [0, 7.55, z], [26, 0.38, 0.46], 0.28, [71, 126, 183], 6, 0.48 + (z + 7.5) / 90)
      }
      boxSurface(writer, [-8.5, 3.1, 4.3], [0.34, 6.2, 6.2], 0.25, [136, 151, 166], 6, 0.28)
      boxSurface(writer, [8.5, 3.1, -4.3], [0.34, 6.2, 6.2], 0.25, [136, 151, 166], 6, 0.36)
      gridXZ(writer, 7.75, -13, 13, -10, 10, 108, 82, [156, 183, 196], 212, 6, 0.72)
    },
    buildDynamic(writer, phase) {
      const lift = Math.sin(Math.min(1, phase * 1.6) * Math.PI / 2)
      const panelX = 9 - 13 * phase
      const panelY = 0.9 + lift * 5.6
      boxSurface(writer, [panelX, panelY, 8.2], [3.2, 1.8, 0.18], 0.11, [244, 168, 63], 18)
      for (let i = 0; i < 120; i++) {
        const amount = i / 119
        writer.add(11.5 + (panelX - 11.5) * amount, 10.5 + (panelY - 10.5) * amount, 8.2, [255, 207, 96], 245, 0)
      }
      lidarRings(writer, -11 + 22 * phase, 1.05, -9.1, 0.42)

      // Deliberately shifted as-built return cluster. It is a visual defect
      // example, not a claim of measurement accuracy.
      if (phase > 0.58) {
        const pulse = 0.8 + Math.sin(phase * Math.PI * 14) * 0.2
        for (let iy = 0; iy < 44; iy++) {
          const y = (7.4 * iy) / 43
          for (let edge = 0; edge < 16; edge++) {
            const angle = (edge / 16) * Math.PI * 2
            writer.add(5.08 + Math.cos(angle) * 0.27, y, Math.sin(angle) * 0.27, [255, Math.round(70 * pulse), 70], 255, 18)
          }
        }
      }
    },
  })
}

// ── Utility tunnel: dense services + moving inspection trolley and scan fan ─

function createTunnelReplay(): TemporalReplaySource {
  return createSource({
    durationMs: 22_000,
    radius: 30,
    bounds: { min: { x: -21, y: 0, z: -4 }, max: { x: 21, y: 6, z: 4 } },
    dynamicCapacity: 5_200,
    seed: 0x7A11E1,
    buildStatic(writer) {
      gridXZ(writer, 0, -21, 21, -4, 4, 180, 48, [105, 112, 119], 165, 2)
      gridXZ(writer, 6, -21, 21, -4, 4, 180, 48, [112, 139, 153])
      gridXY(writer, -4, -21, 21, 0, 6, 180, 36, [87, 126, 145])
      gridXY(writer, 4, -21, 21, 0, 6, 180, 36, [87, 126, 145])

      // Three longitudinal service pipes sampled as cylinders.
      for (const [pipeY, pipeZ, color] of [
        [4.7, -3.35, [59, 201, 181]],
        [3.7, -3.45, [62, 154, 211]],
        [2.7, -3.50, [224, 162, 68]],
      ] as const) {
        for (let ix = 0; ix < 170; ix++) {
          const x = -21 + (42 * ix) / 169
          for (let ring = 0; ring < 22; ring++) {
            const angle = (ring / 22) * Math.PI * 2
            writer.add(x, pipeY + Math.cos(angle) * 0.23, pipeZ + Math.sin(angle) * 0.23, color, 225, 6)
          }
        }
      }
      for (const z of [-1.05, 1.05]) boxSurface(writer, [0, 0.10, z], [42, 0.20, 0.16], 0.24, [165, 177, 184])
      boxSurface(writer, [0, 1.05, 3.58], [42, 0.16, 0.45], 0.26, [117, 137, 151])
    },
    buildDynamic(writer, phase) {
      const trolleyX = -19 + 38 * phase
      boxSurface(writer, [trolleyX, 0.55, 0], [1.8, 1.1, 1.45], 0.10, [238, 131, 63], 18)
      lidarRings(writer, trolleyX, 1.45, 0, 0.58)
      for (let fan = 0; fan < 9; fan++) {
        const yaw = -0.72 + (1.44 * fan) / 8
        for (let step = 0; step < 70; step++) {
          const amount = step / 69
          writer.add(
            trolleyX + Math.cos(yaw) * amount * 4.2,
            1.45 + Math.sin(amount * Math.PI) * 2.8,
            Math.sin(yaw) * amount * 4.2,
            [83, 225, 242], 245, 0,
          )
        }
      }
      // Pulsing moisture/deformation patch detected on the right wall.
      if (phase > 0.32) {
        const centerX = 3.5
        const pulse = 0.7 + Math.sin(phase * Math.PI * 12) * 0.3
        for (let ix = 0; ix < 34; ix++) {
          for (let iy = 0; iy < 28; iy++) {
            const x = centerX - 1.6 + (3.2 * ix) / 33
            const y = 1.5 + (2.4 * iy) / 27
            writer.add(x, y, 3.93 - Math.sin((x - centerX) * 2.2) * 0.07, [255, Math.round(66 + 50 * pulse), 86], 255, 18)
          }
        }
      }
    },
  })
}

export const TEMPORAL_LIDAR_SHOWCASES: readonly TemporalLidarShowcase[] = [
  {
    id: 'operations-pavilion',
    cloudId: PAVILION_LIDAR_REPLAY_ID,
    demoModelId: 'operations-pavilion-video',
    modelFileName: 'IVO-Operations-Pavilion.ifc',
    modelPath: 'models/video-demo/IVO-Operations-Pavilion.ifc',
    copyKey: 'pavilion',
    durationMs: PAVILION_LIDAR_DURATION_MS,
    frameRate: PAVILION_LIDAR_FRAME_RATE,
    mcapFileName: 'operations-pavilion-lidar-demo.mcap',
    approximatePoints: 12_500,
    pointSize: 2.6,
    modelOpacity: 0.42,
    createSource: createPavilionLidarReplay,
    align: pavilionReplayAlignment,
  },
  {
    id: 'warehouse-operations',
    cloudId: 'warehouse-operations-lidar-replay',
    demoModelId: 'warehouse-operations-lidar',
    modelFileName: 'IVO-Warehouse-Operations.ifc',
    modelPath: 'models/realtime-lidar/IVO-Warehouse-Operations.ifc',
    copyKey: 'warehouse',
    durationMs: 18_000,
    frameRate: 12,
    mcapFileName: 'warehouse-operations-lidar-demo.mcap',
    approximatePoints: 39_400,
    pointSize: 2.15,
    modelOpacity: 0.34,
    camera: {
      position: { x: 21, y: 13, z: 20 },
      target: { x: 0, y: 2.5, z: 0 },
    },
    createSource: createWarehouseReplay,
    align: (bounds) => genericAlignment(bounds, 0.22),
  },
  {
    id: 'construction-progress',
    cloudId: 'construction-progress-lidar-replay',
    demoModelId: 'construction-progress-lidar',
    modelFileName: 'IVO-Construction-Progress.ifc',
    modelPath: 'models/realtime-lidar/IVO-Construction-Progress.ifc',
    copyKey: 'construction',
    durationMs: 20_000,
    frameRate: 12,
    mcapFileName: 'construction-progress-lidar-demo.mcap',
    approximatePoints: 41_000,
    pointSize: 2.2,
    modelOpacity: 0.38,
    camera: {
      position: { x: 20, y: 15, z: 22 },
      target: { x: 0, y: 3.2, z: 0 },
    },
    createSource: createConstructionReplay,
    align: (bounds) => genericAlignment(bounds, 0.26),
  },
  {
    id: 'utility-tunnel',
    cloudId: 'utility-tunnel-lidar-replay',
    demoModelId: 'utility-tunnel-lidar',
    modelFileName: 'IVO-Utility-Tunnel.ifc',
    modelPath: 'models/realtime-lidar/IVO-Utility-Tunnel.ifc',
    copyKey: 'tunnel',
    durationMs: 22_000,
    frameRate: 12,
    mcapFileName: 'utility-tunnel-lidar-demo.mcap',
    approximatePoints: 49_300,
    pointSize: 1.95,
    modelOpacity: 0.30,
    camera: {
      position: { x: -18, y: 8.5, z: 13 },
      target: { x: 3, y: 2.1, z: 0 },
    },
    createSource: createTunnelReplay,
    align: (bounds) => genericAlignment(bounds, 0.24),
  },
] as const

export function getTemporalLidarShowcase(id?: string): TemporalLidarShowcase {
  return TEMPORAL_LIDAR_SHOWCASES.find((showcase) => showcase.id === id) ?? TEMPORAL_LIDAR_SHOWCASES[0]
}
