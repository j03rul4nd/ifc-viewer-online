// ─── 3d-tiles-renderer plugin type gap ────────────────────────────────────────
// GeneratedSurfacePlugin IS exported at runtime from '3d-tiles-renderer/plugins'
// (build/index.plugins.js, verified v0.4.28) but the package ships no .d.ts for
// it and omits it from src/three/plugins/index.d.ts. This file is a MODULE
// AUGMENTATION (the top-level import makes it a module) that merges the missing
// class into the package's existing types. It mirrors
// node_modules/3d-tiles-renderer/src/three/plugins/images/GeneratedSurfacePlugin.js.
// Delete when upstream ships official types.

import type { Vector3 } from 'three'

declare module '3d-tiles-renderer/plugins' {
  export class GeneratedSurfacePlugin {
    constructor(options?: {
      /** Overlay instance the tiling scheme (and texture) derives from. */
      overlay?: object | null
      /** 'planar' lays normalized mercator tiles in the local XY plane. */
      shape?: 'planar' | 'ellipsoid'
      endCaps?: boolean
      /** Shift planar tiles so the 1×1 world is centred at the origin. */
      center?: boolean
      /** true sets tiles.errorTarget = 1 (aggressive) — we tune our own. */
      useRecommendedSettings?: boolean
      /** Texture generated meshes directly from the overlay source. */
      applyOverlayTexture?: boolean
    })
    /** Planar: position (local XY, normalized) → lat/lon in RADIANS. */
    getCartographicFromPosition(
      position: Vector3,
      target?: { lat: number; lon: number },
    ): { lat: number; lon: number }
    /** Planar: lat/lon in RADIANS → local-XY normalized position (z = 0). */
    getPositionFromCartographic(lat: number, lon: number, target?: Vector3): Vector3
    dispose(): void
  }
}
