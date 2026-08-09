// ─── pc-types ─────────────────────────────────────────────────────────────────
// Shared types for the point cloud feature. Pure types + a few constants — NO
// runtime imports beyond primitives, so workers, stores, UI and tests can all
// import this without dragging three.js or proj4 into their chunk.
//
// Normative reference: docs/POINT_CLOUD_PLAN.md.

// ── Formats ────────────────────────────────────────────────────────────────────

/**
 * Formats the reader registry can decode today. Adding one is a new reader
 * module + one line in pc-format.ts — see the plan §6.
 *   las — ASPRS LAS 1.0-1.4, point data record formats 0-10, uncompressed
 *   ply — Stanford PLY, ascii / binary_little_endian / binary_big_endian
 *   laz — LASzip-compressed LAS, via the laz-perf WASM decoder
 *   copc — Cloud Optimized Point Cloud: LAZ + an octree, range-read node by node
 *   xyz — whitespace/comma separated text (also .pts, .csv, .asc)
 *   pcd — Point Cloud Library: ascii, binary and LZF binary_compressed
 */
export type PointCloudFormat = 'las' | 'laz' | 'copc' | 'ply' | 'xyz' | 'pcd'

/** Extensions accepted by the file picker, in the order they are advertised. */
export const POINT_CLOUD_EXTENSIONS =
  ['.las', '.laz', '.copc', '.ply', '.pcd', '.xyz', '.pts', '.csv', '.asc', '.txt'] as const

/**
 * Formats we deliberately do NOT decode yet, mapped to the i18n reason key the
 * UI shows instead of a generic "unsupported file". Being specific here is the
 * difference between "this viewer is broken" and "this viewer knows what your
 * file is and tells you what to do with it".
 */
export const DEFERRED_EXTENSIONS: Record<string, string> = {
  '.e57': 'unsupported.e57',
  '.rcp': 'unsupported.proprietary',
  '.rcs': 'unsupported.proprietary',
  '.fls': 'unsupported.proprietary',
  '.zfs': 'unsupported.proprietary',
}

// ── Source frame ───────────────────────────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number }

/** Which axis the source data treats as "up". Survey/LAS/PLY are Z-up as a rule. */
export type UpAxis = 'z' | 'y'

/**
 * Everything about the coordinates a reader found, in the SOURCE's own terms.
 * This is the input to the alignment ladder — it never contains scene values.
 */
export interface SourceFrame {
  /** Source unit → metre. 1 for metres, 0.3048 for feet, 0.001 for millimetres. */
  unitScale: number
  /** How unitScale was determined — surfaced in the UI, never guessed silently. */
  unitSource: 'declared' | 'assumed' | 'user'
  /** Normalized EPSG code from the file (LAS VLRs), or null. */
  epsgCode: string | null
  upAxis: UpAxis
  /**
   * How `upAxis` was arrived at, surfaced in the UI exactly like `unitSource`.
   *
   *   declared — the FORMAT defines it. LAS/LAZ/COPC say Z is elevation, so
   *              there is nothing to guess and nothing to offer the user.
   *   assumed  — inferred from the shape of the data. PLY, PCD and text carry
   *              no orientation at all, and a scan from a phone or a
   *              photogrammetry pipeline is as likely to be Y-up as Z-up.
   *   user     — someone corrected it, and that decision outranks both.
   *
   * This field exists because getting it wrong lays a whole scan on its side,
   * and until it was carried the guess was silent: every reader hardcoded 'z'.
   */
  upAxisSource: 'declared' | 'assumed' | 'user'
  /** Source-space bounding box, in source units, float64. */
  min: Vec3
  max: Vec3
  /**
   * Double-precision origin subtracted from every emitted vertex position.
   * Always the bbox centre. Chunks are positioned relative to THIS.
   */
  origin: Vec3
}

// ── Per-point attributes a chunk can carry ─────────────────────────────────────

/**
 * Which optional per-point channels the source actually provided. Drives both
 * the shader and which colour modes the UI is allowed to offer — offering
 * "Classification" for a file with no classification is a lie.
 */
export interface PointAttributesPresent {
  color: boolean
  intensity: boolean
  classification: boolean
  /**
   * Per-point confidence in [0,1]. Read from PLY `confidence` / `quality` /
   * `scalar_confidence`. Reconstruction pipelines (LingBot-Map and friends)
   * emit this; laser scanners do not.
   */
  confidence: boolean
}

export type PointColorMode = 'rgb' | 'intensity' | 'elevation' | 'classification' | 'flat'

// ── Chunks ─────────────────────────────────────────────────────────────────────

/**
 * One GPU-ready block of points. Positions are float32 RELATIVE TO `origin`
 * (which is itself relative to SourceFrame.origin), so magnitudes stay small
 * enough for float32 regardless of how far from the survey origin the site is.
 *
 * Point order inside a chunk is a seeded random permutation — see
 * pc-chunker.shuffleChunk. That is what makes `setDrawRange(0, k)` a valid
 * uniform subsample and therefore what makes LOD free.
 */
export interface PointChunk {
  id: string
  /** Chunk centre relative to SourceFrame.origin, in source units. */
  origin: Vec3
  /** Half-extent of the chunk's own bbox, source units. Used for LOD scoring. */
  radius: number
  count: number
  /** 3 × count, float32, source units, relative to `origin`. */
  positions: Float32Array
  /** 3 × count, uint8. Present only when attributes.color. */
  colors: Uint8Array | null
  /** count, uint8 (intensity normalized to 0-255). */
  intensity: Uint8Array | null
  /** count, uint8, ASPRS classification code. */
  classification: Uint8Array | null
  /** count, uint8 (confidence × 255). */
  confidence: Uint8Array | null
}

// ── Alignment ──────────────────────────────────────────────────────────────────

/**
 * Which rung of the alignment ladder produced the transform (plan §3.2).
 *   map-conversion — both georeferenced, IFC has a full IfcMapConversion
 *   shared-crs     — both carry the same projected CRS
 *   geographic     — cloud is georeferenced, IFC only has IfcSite lat/lon
 *   local          — neither is georeferenced, the bboxes plausibly coincide
 *   manual         — nothing known; centred on the model, user drives from there
 */
export type AlignmentRung = 'map-conversion' | 'shared-crs' | 'geographic' | 'local' | 'manual'

export type AlignmentConfidence = 'exact' | 'high' | 'approximate' | 'manual'

/** User nudge applied ON TOP of the derived transform. Never folded into it. */
export interface AlignmentOffset {
  /** Scene metres. */
  x: number
  y: number
  z: number
  /** Extra yaw about scene +Y, degrees. */
  yawDeg: number
  /**
   * Extra pitch about scene +X and roll about scene +Z, degrees.
   *
   * These exist because yaw alone cannot fix a scan that arrived lying on its
   * side. Until they were added, a source whose vertical axis we read wrongly —
   * or one that was simply captured off-level, which handheld scanning does all
   * the time — could not be corrected by ANY control in the product. The up-axis
   * switch handles the 90° case; these handle the couple of degrees that are
   * left, and that a client will notice in a presentation.
   */
  pitchDeg: number
  rollDeg: number
  /** Extra uniform scale multiplier (1 = none). */
  scaleMul: number
}

export const NO_OFFSET: AlignmentOffset =
  { x: 0, y: 0, z: 0, yawDeg: 0, pitchDeg: 0, rollDeg: 0, scaleMul: 1 }

/**
 * Clamp a user offset to values the UI can express. Lives here rather than in
 * pc-align so pointCloudStore — which the toolbar imports eagerly — never pulls
 * proj4 into the entry chunk.
 */
export function clampOffset(o: Partial<AlignmentOffset>): AlignmentOffset {
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  return {
    x: num(o.x, 0), y: num(o.y, 0), z: num(o.z, 0),
    yawDeg: num(o.yawDeg, 0) % 360,
    // Levelling corrections, not free rotation: ±45° is far more than any real
    // capture is off by, and clamping keeps a stray drag from tipping a scan
    // somewhere it takes a reset to escape from. Placements saved before these
    // existed simply arrive without them and default to level — which is what
    // they were.
    pitchDeg: clampAngle(num(o.pitchDeg, 0)),
    rollDeg: clampAngle(num(o.rollDeg, 0)),
    scaleMul: Math.min(1000, Math.max(0.001, num(o.scaleMul, 1))),
  }
}

/** Levelling range for pitch/roll, degrees. */
export const MAX_LEVEL_DEG = 45
const clampAngle = (v: number): number => Math.min(MAX_LEVEL_DEG, Math.max(-MAX_LEVEL_DEG, v))

/**
 * The complete source→scene transform for one cloud. Serialisable: this is what
 * lives in the store and what gets persisted per file.
 *
 * Applied to the cloud ROOT group only:
 *   root.position   = origin
 *   root.quaternion = yaw(Y) ∘ tilt(X, −90° when upAxis === 'z')
 *   root.scale      = scale
 */
export interface PointCloudAlignment {
  rung: AlignmentRung
  confidence: AlignmentConfidence
  /** Scene-space position of SourceFrame.origin, metres. Computed in float64. */
  origin: Vec3
  /** Yaw about scene +Y, radians. */
  yawRad: number
  /** Uniform scale: source unit → scene metre (includes unitScale). */
  scale: number
  upAxis: UpAxis
  /** i18n keys (pointcloud namespace) explaining the choice, e.g. 'align.reason.sameCrs'. */
  reasons: string[]
  offset: AlignmentOffset
}

// ── Loaded cloud (store-facing) ────────────────────────────────────────────────

export type PointCloudStatus = 'parsing' | 'ready' | 'error'

/**
 * Everything the UI knows about one loaded cloud. Deliberately free of typed
 * arrays and Three objects — those live in point-cloud-system.ts.
 */
export interface PointCloudEntry {
  id: string
  fileName: string
  fileSize: number
  format: PointCloudFormat
  status: PointCloudStatus
  /** i18n key when status === 'error'. */
  errorKey: string | null
  /** 0-100 while parsing. */
  progress: number
  /** Points actually uploaded to the GPU. */
  pointCount: number
  /** Points the file claims to hold (header count), when known. */
  declaredCount: number | null
  /** True when the parse stopped at the maxPoints budget. */
  truncated: boolean
  visible: boolean
  frame: SourceFrame | null
  attributes: PointAttributesPresent
  alignment: PointCloudAlignment | null
  /** The IFC model this cloud was aligned against, when there was one. */
  alignedToModelId: string | null
  /** Stable per-file identity — the key a manual placement is persisted under. */
  fileKey: string
  loadedAt: number
}

// ── Display settings (one set, applies to every loaded cloud) ──────────────────

export interface PointCloudDisplay {
  /** Point size. Pixels when attenuate is off; scene metres when on. */
  pointSize: number
  /** True → points shrink with distance (world-sized). False → constant pixels. */
  attenuate: boolean
  opacity: number
  colorMode: PointColorMode
  /** Flat-mode colour, hex. */
  flatColor: number
  /**
   * Fraction of the point budget to actually use, 0.1-1. The user-facing
   * "density" control — the LOD budget is what it scales.
   */
  density: number
  /**
   * Discard points whose confidence is below this (0-1). Only meaningful when
   * the source carried confidence. LingBot-Map's --conf_threshold, done in the
   * shader so it is instant. 0 = keep everything.
   */
  confidenceThreshold: number
  /** Round sprites vs. hard squares. Round reads far better at low density. */
  round: boolean
  /** Eye-dome-lighting-ish depth cue: darken points by depth gradient. */
  edl: boolean
}

export const DEFAULT_DISPLAY: PointCloudDisplay = {
  pointSize: 2,
  attenuate: false,
  opacity: 1,
  colorMode: 'rgb',
  flatColor: 0x9db4d6,
  density: 1,
  confidenceThreshold: 0,
  round: true,
  edl: false,
}

// ── Budgets ────────────────────────────────────────────────────────────────────

/** Points per chunk. 262 144 ≈ 4.7 MB of position data — one comfortable upload. */
export const CHUNK_POINTS = 262_144

/**
 * Hard ceiling on points held in GPU memory across all clouds. 20 M × 18 B
 * ≈ 360 MB — beyond this a browser tab is living dangerously.
 */
export const MAX_POINTS_DEFAULT = 20_000_000

/**
 * Points DRAWN per frame at density 1. Independent of how many are resident:
 * this is the LOD budget the allocator distributes across visible chunks.
 */
export const RENDER_BUDGET_DEFAULT = 4_000_000

/** Bytes per resident point (12 pos + 3 rgb + 1 int + 1 class + 1 conf). */
export const BYTES_PER_POINT = 18

// ── Worker protocol ────────────────────────────────────────────────────────────

/**
 * Streaming protocol for COPC, alongside the one-shot `parse`.
 *
 * The worker keeps the reader (and therefore the octree index and the File
 * handle) alive between messages, so a node can be range-read on demand as the
 * camera moves. `parse` remains the path for every other format, which has no
 * index to stream from.
 */
export interface PointCloudStreamOpenRequest {
  type: 'stream-open'
  id: string
  file: File
  format: PointCloudFormat
  /**
   * Stable identity of this scan across sessions, used to key the decoded-node
   * cache. Omit it and the reader simply decodes everything afresh, which is the
   * old behaviour and always correct.
   */
  scanKey?: string
}

export interface PointCloudStreamNodesRequest {
  type: 'stream-nodes'
  id: string
  /** Octree node ids, in the order they should arrive. */
  nodeIds: string[]
}

export interface PointCloudStreamCloseRequest {
  type: 'stream-close'
  id: string
}

/** One octree node, as the selection policy needs it. */
export interface StreamIndexNode {
  id: string
  level: number
  x: number
  y: number
  z: number
  pointCount: number
}

export interface PointCloudParseRequest {
  type: 'parse'
  id: string
  file: File
  format: PointCloudFormat
  maxPoints: number
  chunkPoints: number
}

export type PointCloudWorkerIn =
  | PointCloudParseRequest
  | PointCloudStreamOpenRequest
  | PointCloudStreamNodesRequest
  | PointCloudStreamCloseRequest
  | { type: 'cancel' }

export type PointCloudWorkerOut =
  | { type: 'header'; id: string; frame: SourceFrame; attributes: PointAttributesPresent; declaredCount: number | null }
  | { type: 'chunk'; id: string; chunk: PointChunk; progress: number }
  /** The octree index, once, in reply to `stream-open`. */
  | {
      type: 'index'
      id: string
      root: { center: Vec3; halfSize: number; spacing: number }
      nodes: StreamIndexNode[]
    }
  /** One octree node's points, in reply to `stream-nodes`. `nodeId` identifies it. */
  | { type: 'node'; id: string; nodeId: string; chunk: PointChunk }
  /** Every requested node has been served. */
  | { type: 'nodes-done'; id: string }
  /**
   * `frame` here is EXACT (measured while streaming). The one in `header` may be
   * an estimate for formats that carry no bbox (PLY, XYZ) — see pc-format.
   */
  | { type: 'done'; id: string; pointCount: number; truncated: boolean; frame: SourceFrame }
  | { type: 'error'; id: string; errorKey: string; detail?: string }
