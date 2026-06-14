// ─── geo-types ────────────────────────────────────────────────────────────────
// Shared types for the optional GIS / Map mode. Pure types — no runtime imports.
// Normative reference: docs/GIS_MAP_INTEGRATION_PLAN.md §4 (coordinates) and §6 (state).

// ── Map mode lifecycle ─────────────────────────────────────────────────────────

export type MapMode = 'off' | 'starting' | 'on' | 'error'

export type TerrainStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Terrain visualization styles:
 *   imagery     — provider tiles draped on the relief (subtle baked hillshade)
 *   shaded      — no imagery: neutral high-contrast hillshade (landforms pop)
 *   hypsometric — atlas-style elevation tint × hillshade
 */
export type TerrainStyle = 'imagery' | 'shaded' | 'hypsometric'

// ── Georeferencing extraction ──────────────────────────────────────────────────

/**
 * Per-model georeferencing extraction status.
 *   unknown    — not yet extracted (quick-scan hint may exist in raw.quickScan)
 *   extracting — worker parse in flight
 *   found      — full georeferencing (IfcMapConversion or ePSet equivalent)
 *   partial    — usable but incomplete (e.g. site lat/lon only, or unknown CRS)
 *   none       — file has no georeferencing
 *   invalid    — georeferencing present but failed sanity gates (see reasons)
 */
export type GeorefStatus = 'unknown' | 'extracting' | 'found' | 'partial' | 'none' | 'invalid'

/**
 * Which rung of the extraction ladder produced the data (plan §4.3):
 *   1 — IfcMapConversion + IfcProjectedCRS (IFC4/4x3, LoGeoRef50)
 *   2 — ePSet_MapConversion property sets (IFC2x3 convention)
 *   3 — IfcSite RefLatitude/RefLongitude (+ TrueNorth)  (LoGeoRef20/40)
 *   4 — nothing found
 */
export type GeorefRung = 1 | 2 | 3 | 4

export interface GeorefExtraction {
  status: GeorefStatus
  rung: GeorefRung | null
  /** Normalized EPSG code like "EPSG:25832", or null when absent/unparseable. */
  epsgCode: string | null
  /**
   * Best-effort WGS84 result. For rung 1/2 this is only set once the CRS has
   * been resolved (the worker does NOT resolve CRS — that happens client-side
   * in placement.ts where proj4 lives). For rung 3 it is set directly.
   */
  lat: number | null
  lon: number | null
  /** Orthometric-ish height of the anchor in metres (RefElevation / OrthogonalHeight). */
  heightM: number | null
  /** Plan rotation (degrees CCW, grid/true-north → project axes). 0 when unknown. */
  rotationDeg: number
  /** Grid coordinates straight from MapConversion (already normalized to metres). */
  eastings: number | null
  northings: number | null
  /** MapConversion.Scale (project length → grid length). 1 when absent. */
  scale: number | null
  /** Normalized raw values for the coordinate-debug panel. */
  raw: Record<string, number | string | null>
  /** i18n keys (geo namespace) explaining downgrades, e.g. 'invalid.nullIsland'. */
  reasons: string[]
  /** True when model geometry sits > 10 km from the file origin (plan §4.4 gate 6). */
  largeWcsOffset: boolean
}

// ── Placement ──────────────────────────────────────────────────────────────────

export type PlacementSource = 'ifc' | 'manual'

export interface GeoPlacement {
  /** WGS84 latitude of the model anchor (building plan centroid), degrees. */
  lat: number
  /** WGS84 longitude, degrees. */
  lon: number
  /** Map yaw around the anchor, degrees. See geo-math.composeGeoRootTransform. */
  rotationDeg: number
  /** Raises the model relative to the map plane (positive = model higher), metres. */
  heightOffsetM: number
  source: PlacementSource
  confidence: 'high' | 'approximate'
}

/** Versioned envelope persisted to localStorage (plan §6.1 / T13). */
export interface PersistedPlacement {
  v: 1
  placement: GeoPlacement
  /** Optional custom proj4 definition the user registered for this file. */
  customProj4?: string
  savedAt: number
}

// ── Scene transform (output of geo-math.composeGeoRootTransform) ───────────────

/**
 * TRS for the basemap group. Rotation decomposes as quaternion(Y yaw) ×
 * quaternion(X −90°): the planar tile space (X east, Y north, Z up) is first
 * laid onto the scene ground (east = +X, north = −Z), then yawed about +Y.
 */
export interface GeoRootTransform {
  position: { x: number; y: number; z: number }
  /** Yaw about scene +Y, radians. */
  yawRad: number
  /** Fixed tilt laying the tile plane onto the ground: always −π/2 about X. */
  tiltRad: number
  /** Uniform scale: WEB_MERCATOR_WORLD_M × cos(anchor latitude). */
  scale: number
}

// ── Providers ──────────────────────────────────────────────────────────────────

export type MapLayerKind = 'streets' | 'satellite' | 'topo' | 'custom'

export interface MapProvider {
  id: string
  kind: MapLayerKind
  /** XYZ template with {z}/{x}/{y} (and optional {s}) placeholders. */
  urlTemplate: string
  /** Shown verbatim (escaped) in the attribution pill. License obligation. */
  attribution: string
  maxZoom: number
  tileDimension: number
  /** True → user must acknowledge the provider's terms once before first use. */
  requiresTermsNotice: boolean
  homepage: string
  /** Month the licensing terms were last manually reviewed, e.g. '2026-06'. */
  lastReviewed: string
}

// ── Worker messages (geo-extract) ──────────────────────────────────────────────

export interface GeoExtractRequest {
  /** Transferred copy of the IFC bytes (caller must slice, never the registry buffer). */
  buffer: ArrayBuffer
}

export interface GeoExtractResponse {
  ok: boolean
  extraction?: GeorefExtraction
  error?: string
}
