// ─── geo-terrain ──────────────────────────────────────────────────────────────
// Main-thread side of the 3×3 terrain patch (docs/TERRAIN_3D_IMPROVEMENT_PLAN.md):
// runs geo-terrain.worker, then assembles ONE seamless mesh in the NORMALIZED
// planar frame (same frame as the basemap tiles — parented under geoRoot, so
// it inherits placement/scale/yaw for free).
//
// Design (plan D1-D5):
//   • ONE unified height grid → ONE geometry → cracks are impossible.
//   • Heights and drape have SEPARATE lifecycles: redrape() swaps only the
//     imagery texture — that is what keeps the terrain in sync when the user
//     switches basemap providers (BUG-1).
//   • Relief is baked into vertex colours (hillshade × edge fade) — map
//     imagery already carries its own shading; scene lights would double-shade.
//   • DEM zoom is adaptive (z15 default, z14 for big models/high latitudes).
//
// Vertical convention: heights are offset by the anchor elevation, so the
// terrain surface passes through the map ground plane exactly at the anchor —
// the model base keeps sitting on the ground (plan §4.5). Scene metres map to
// normalized z through 1/(WORLD × cosφ₀).

import * as THREE from 'three'
import { WEB_MERCATOR_WORLD_M, cosLatScale } from './geo-math'
import {
  terrainZoomFor, imageryZoomFor, hillshade, hypsometricColor,
  slopeColor, slopeFraction, occlusionFactor, contourFactor,
  computeNormals, vertexSpacingM, clampTerrainLook, DEFAULT_TERRAIN_LOOK,
  SHADE_AMBIENT_IMAGERY, SHADE_AMBIENT_RELIEF,
} from './terrain-sampling'
import { createLogger } from '../logger'
import type { GeoPlacement, MapProvider, TerrainStyle, TerrainLook } from './geo-types'
import type { TerrainWorkerIn, TerrainWorkerOut } from '../../workers/geo-terrain.worker'

const log = createLogger('GeoTerrain')

const BUILD_TIMEOUT_MS = 60_000
const DRAPE_TIMEOUT_MS = 45_000
/** Vertex segments per patch side → 385² vertices ≈ 295k triangles (~9.5 m
 *  vertex spacing at z15 — matches the best regional DEM sources). */
const GRID_SEGMENTS = 384
/**
 * Fraction of the patch half-width over which the outer edge fades out.
 * Exported: geo-system insets the flat-basemap clipping hole by this amount
 * so the faded terrain rim overlaps the flat tiles instead of a void.
 */
export const TERRAIN_EDGE_FADE = 0.12
const UNTEXTURED_COLOR = 0x3a414d
/** Neutral base for the imagery-less "shaded relief" style. */
const SHADED_BASE_COLOR = 0xb8bec6
/** Anisotropy cap — the single biggest drape-quality win at oblique angles. */
const MAX_ANISOTROPY = 8

export interface TerrainBuildOptions {
  /** Plan-diagonal of the model (m) — drops DEM zoom for big sites (D3). */
  modelSpanM?: number | null
  /** renderer.capabilities.getMaxAnisotropy() — clamped to 8. */
  maxAnisotropy?: number
}

export interface TerrainPatch {
  group: THREE.Group
  /** Terrain elevation at the anchor (metres) — for the height-offset UI. */
  anchorElevation: number
  /**
   * Ground elevation in METRES at a normalized planar position, bilinearly
   * interpolated from the patch grid. Outside the patch it clamps to the edge.
   * Used to sit context buildings on the terrain.
   */
  sampleGroundM(nx: number, ny: number): number
  zoom: number
  centerTx: number
  centerTy: number
  /**
   * Swap the imagery drape to a new provider WITHOUT refetching the DEM.
   * Token-guarded: overlapping calls keep only the latest; safe after dispose.
   */
  redrape(provider: MapProvider | null): Promise<void>
  /** Switch visualization style (imagery / shaded relief / hypsometric / slope). */
  setStyle(style: TerrainStyle): void
  /** Vertical exaggeration ×k — live (scales displacement + re-bakes shading). */
  setExaggeration(k: number): void
  /**
   * Advanced look (sun, softness, occlusion, synthetic detail, contours).
   * Live: colours re-bake always; geometry re-displaces only when the synthetic
   * detail blend changes. No refetch in either case.
   */
  setLook(look: TerrainLook): void
  dispose(): void
}

/** Slippy tile → centred-normalized centre + size (exported for tests). */
export function tileNormalizedCenter(tx: number, ty: number, zoom: number): { nx: number; ny: number; size: number } {
  const n = Math.pow(2, zoom)
  return {
    nx: (tx + 0.5) / n - 0.5,
    ny: 0.5 - (ty + 0.5) / n, // slippy y grows south; normalized ny grows north
    size: 1 / n,
  }
}

/**
 * Build the patch for a placement. Throws on worker failure/timeout.
 * The caller owns the returned group (parent it under geoRoot) and MUST call
 * dispose() when done.
 */
export async function buildTerrainPatch(
  placement: GeoPlacement,
  provider: MapProvider | null,
  opts: TerrainBuildOptions = {},
): Promise<TerrainPatch> {
  const zoom = terrainZoomFor(placement.lat, opts.modelSpanM ?? null)
  const imageryZoom = provider ? imageryZoomFor(zoom, provider.id, provider.maxZoom) : null

  const result = await runTerrainWorker({
    type: 'build-terrain',
    id: crypto.randomUUID(),
    lat: placement.lat,
    lon: placement.lon,
    zoom,
    grid: GRID_SEGMENTS,
    imageryTemplate: provider?.urlTemplate ?? null,
    imageryZoom,
  }, BUILD_TIMEOUT_MS)
  if (result.type !== 'done') throw new Error('unexpected terrain worker reply')

  return assemblePatch(result, placement.lat, Math.min(MAX_ANISOTROPY, opts.maxAnisotropy ?? 1))
}

/** Steepness ramp needs a fixed reference; 45° reads as "cliff" on any site. */
const SLOPE_MAX_DEG = 45

// ── Assembly (single seamless mesh) ─────────────────────────────────────────────

function assemblePatch(
  data: Extract<TerrainWorkerOut, { type: 'done' }>,
  anchorLat: number,
  anisotropy: number,
): TerrainPatch {
  const { zoom, grid, centerTx, centerTy, anchorElevation, heights, normals, detail, sky } = data
  const verts = grid + 1
  const metresToNormalized = 1 / (WEB_MERCATOR_WORLD_M * cosLatScale(anchorLat))
  const spacingM = vertexSpacingM(anchorLat, zoom, grid)

  const centre = tileNormalizedCenter(centerTx, centerTy, zoom)
  const patchSize = centre.size * 3

  // PlaneGeometry vertices are row-major starting at +y (north) — exactly the
  // worker's height/normal layout (row 0 = north edge).
  const geometry = new THREE.PlaneGeometry(patchSize, patchSize, grid, grid)
  const pos = geometry.attributes.position
  const nrm = geometry.attributes.normal
  const colors = new Float32Array(pos.count * 4)

  // Working buffers: `heights` stays the untouched MEASURED surface; `effective`
  // is what the mesh actually shows (measured + synthetic detail × blend).
  const effective = Float32Array.from(heights)
  let effectiveNormals = normals
  let minH = 0
  let maxH = 0
  let heightRange = 1

  const colorAttr = new THREE.BufferAttribute(colors, 4)
  geometry.setAttribute('color', colorAttr)

  const material = new THREE.MeshBasicMaterial({ transparent: true, vertexColors: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(centre.nx, centre.ny, 0)
  // Draw above the flat basemap tiles to avoid z-fighting at elevation ≈ 0.
  mesh.renderOrder = 1

  const group = new THREE.Group()
  group.name = 'terrain-patch'
  group.add(mesh)

  // ── Visual state (style / exaggeration / drape — all swappable live) ──────────
  let disposed = false
  let drapeToken = 0
  let texture: THREE.Texture | null = null
  let bitmap: ImageBitmap | null = null
  let style: TerrainStyle = 'imagery'
  let exaggeration = 1
  let look: TerrainLook = { ...DEFAULT_TERRAIN_LOOK }

  /**
   * Re-displace the mesh from measured heights + the synthetic detail blend,
   * then recompute normals. Called on build and whenever `look.detail` moves —
   * normals must follow the geometry or the shading would describe a surface
   * the user is not looking at.
   */
  function applyHeights(): void {
    minH = Infinity
    maxH = -Infinity
    for (let idx = 0; idx < verts * verts; idx++) {
      const h = heights[idx] + detail[idx] * look.detail
      effective[idx] = h
      if (h < minH) minH = h
      if (h > maxH) maxH = h
      pos.setZ(idx, (h - anchorElevation) * metresToNormalized)
    }
    pos.needsUpdate = true
    heightRange = Math.max(1, maxH - minH) // guard: dead-flat patches

    // Skip the recompute when nothing synthetic is blended in — the worker's
    // normals already describe the measured surface exactly.
    effectiveNormals = look.detail > 0 ? computeNormals(effective, verts, spacingM) : normals
    for (let idx = 0; idx < verts * verts; idx++) {
      const o = idx * 3
      // Tile-local axes (X east, Y north, Z up) ARE the plane's local axes.
      nrm.setXYZ(idx, effectiveNormals[o], effectiveNormals[o + 1], effectiveNormals[o + 2])
    }
    nrm.needsUpdate = true
    geometry.computeBoundingSphere()
  }

  /**
   * Re-bake vertex colours: hillshade × sky-view occlusion × style tint ×
   * contour lines × edge fade. All of it rides the existing vertex-colour
   * attribute, so the material stays unlit and the map imagery is never
   * double-shaded by the scene lights (plan D5).
   */
  function recolor(): void {
    const ambient = style === 'imagery' ? SHADE_AMBIENT_IMAGERY : SHADE_AMBIENT_RELIEF
    const sun = { azimuthDeg: look.sunAzimuth, altitudeDeg: look.sunAltitude }
    for (let j = 0; j < verts; j++) {
      for (let i = 0; i < verts; i++) {
        const idx = j * verts + i
        const o = idx * 3
        const nx = effectiveNormals[o]
        const ny = effectiveNormals[o + 1]
        const nz = effectiveNormals[o + 2]

        let shade = hillshade(nx, ny, nz, sun, ambient, exaggeration, look.softness)
        shade *= occlusionFactor(sky[idx], look.occlusion)

        let r = shade, g = shade, b = shade
        if (style === 'hypsometric') {
          const tint = hypsometricColor((effective[idx] - minH) / heightRange)
          r = tint.r * shade; g = tint.g * shade; b = tint.b * shade
        } else if (style === 'slope') {
          const tint = slopeColor(slopeFraction(nz, SLOPE_MAX_DEG))
          r = tint.r * shade; g = tint.g * shade; b = tint.b * shade
        }

        if (look.contourInterval > 0) {
          // Height change per vertex sets the line width so contours stay
          // readable on both plateaus and cliffs.
          const gradient = Math.hypot(nx, ny) / Math.max(1e-6, nz) * spacingM
          const c = contourFactor(effective[idx], look.contourInterval, gradient)
          r *= c; g *= c; b *= c
        }

        const ex = 1 - Math.abs((2 * i) / grid - 1) // 1 centre → 0 patch edge
        const ey = 1 - Math.abs((2 * j) / grid - 1)
        const alpha = Math.max(0, Math.min(1, Math.min(ex, ey) / TERRAIN_EDGE_FADE))
        const c = idx * 4
        colors[c] = r; colors[c + 1] = g; colors[c + 2] = b; colors[c + 3] = alpha
      }
    }
    colorAttr.needsUpdate = true
  }

  /** Point material.map/color at the right resource for the current style. */
  function applyVisuals(): void {
    if (style === 'imagery' && texture) {
      material.map = texture
      material.color.set(0xffffff)
    } else {
      material.map = null
      material.color.set(
        style === 'hypsometric' ? 0xffffff
        : style === 'shaded' ? SHADED_BASE_COLOR
        : UNTEXTURED_COLOR, // imagery requested but no drape available
      )
    }
    material.needsUpdate = true
  }

  function applyDrape(next: ImageBitmap | null): void {
    texture?.dispose()
    bitmap?.close()
    texture = null
    bitmap = null
    if (next) {
      const tex = new THREE.CanvasTexture(next)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = anisotropy
      texture = tex
      bitmap = next
    }
    applyVisuals()
  }

  applyDrape(data.imagery)
  applyHeights()
  recolor()
  log.debug(`patch: z${zoom}, ${verts}×${verts} verts, anchor elev ${anchorElevation.toFixed(1)} m`)

  return {
    group,
    anchorElevation,
    zoom,
    centerTx,
    centerTy,

    sampleGroundM(nx, ny) {
      // Normalized position → fractional vertex index. The patch spans
      // `patchSize` centred on `centre`; row 0 is the NORTH edge, so the Y
      // axis is inverted relative to the grid index.
      const u = (nx - (centre.nx - patchSize / 2)) / patchSize
      const v = ((centre.ny + patchSize / 2) - ny) / patchSize
      const fx = Math.min(Math.max(u, 0), 1) * grid
      const fy = Math.min(Math.max(v, 0), 1) * grid
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, grid)
      const y1 = Math.min(y0 + 1, grid)
      const tx = fx - x0
      const ty = fy - y0
      // Sample the EFFECTIVE surface (measured + any synthetic blend) so a
      // building sits on the ground the user is actually looking at.
      const top = effective[y0 * verts + x0] * (1 - tx) + effective[y0 * verts + x1] * tx
      const bot = effective[y1 * verts + x0] * (1 - tx) + effective[y1 * verts + x1] * tx
      return top * (1 - ty) + bot * ty
    },

    async redrape(provider) {
      if (disposed) return
      const token = ++drapeToken
      const imageryZoom = provider ? imageryZoomFor(zoom, provider.id, provider.maxZoom) : null
      const result = await runTerrainWorker({
        type: 'drape-terrain',
        id: crypto.randomUUID(),
        centerTx, centerTy, zoom,
        imageryTemplate: provider?.urlTemplate ?? null,
        imageryZoom,
      }, DRAPE_TIMEOUT_MS)
      if (result.type !== 'drape-done') throw new Error('unexpected drape worker reply')
      if (disposed || token !== drapeToken) {
        result.imagery?.close() // raced by a newer drape or dispose — drop it
        return
      }
      applyDrape(result.imagery)
      log.debug(`redraped with "${provider?.id ?? 'none'}"`)
    },

    setStyle(next) {
      if (disposed || style === next) return
      style = next
      applyVisuals()
      recolor()
    },

    setExaggeration(k) {
      if (disposed || !Number.isFinite(k) || k <= 0) return
      exaggeration = k
      mesh.scale.z = k // displacement is around z=0 = the anchor plane — live
      recolor()        // re-bake shading for the steeper apparent gradients
    },

    setLook(next) {
      if (disposed) return
      const clamped = clampTerrainLook(next)
      const detailChanged = clamped.detail !== look.detail
      look = clamped
      // Geometry only moves when the synthetic blend changes; everything else
      // is a colour re-bake, which is why the sun slider feels instant.
      if (detailChanged) applyHeights()
      recolor()
    },

    dispose() {
      disposed = true
      drapeToken++
      group.removeFromParent()
      group.clear()
      geometry.dispose()
      material.dispose()
      texture?.dispose()
      bitmap?.close()
      texture = null
      bitmap = null
    },
  }
}

// ── Worker runner (UUID correlation + watchdog, ids-runner pattern) ─────────────

function runTerrainWorker(message: TerrainWorkerIn, timeoutMs: number): Promise<TerrainWorkerOut> {
  return new Promise<TerrainWorkerOut>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/geo-terrain.worker.ts', import.meta.url), { type: 'module' })

    let timer: ReturnType<typeof setTimeout> | null = null
    const done = (fn: () => void): void => {
      if (timer !== null) clearTimeout(timer)
      fn()
      worker.terminate()
    }
    timer = setTimeout(
      () => done(() => reject(new Error(`terrain worker timed out after ${timeoutMs / 1000}s`))),
      timeoutMs,
    )

    worker.onmessage = (e: MessageEvent<TerrainWorkerOut>): void => {
      const m = e.data
      if (!m || m.id !== message.id) return
      if (m.type === 'error') done(() => reject(new Error(m.message || 'terrain worker failed')))
      else done(() => resolve(m))
    }
    worker.onerror = (e): void => done(() => reject(new Error(e.message || 'terrain worker error')))

    worker.postMessage(message)
  })
}
