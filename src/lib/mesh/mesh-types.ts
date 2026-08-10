// ─── mesh-types ───────────────────────────────────────────────────────────────
// Shared types for user-supplied meshes (GLB / glTF / OBJ). Pure types plus a
// few constants — no three.js, so stores, UI and tests import this freely.
//
// ── Why this reuses the point cloud's placement vocabulary
// An imported mesh has exactly the problem a scan has: no coordinate reference
// system, no declared unit, and an orientation that may or may not match the
// scene. The answer is the same one — a manual placement on top of a derived
// guess, persisted per file — so the OFFSET type is imported from pc-types
// rather than duplicated. pc-types is deliberately dependency-free, and two
// copies of the same seven fields would drift the first time one gained a
// control the other did not.

import type { AlignmentOffset, UpAxis } from '../pointcloud/pc-types'

export type { AlignmentOffset, UpAxis }

/** Formats the mesh importer decodes. */
export type MeshFormat = 'glb' | 'gltf' | 'obj'

/** Extensions the picker advertises, entry files first. */
export const MESH_EXTENSIONS =
  ['.glb', '.gltf', '.obj', '.mtl', '.bin', '.png', '.jpg', '.jpeg', '.webp'] as const

/**
 * Ceiling on triangles across every imported mesh.
 *
 * Not a performance guess: a browser tab that runs out of GPU memory does not
 * degrade, it loses the WebGL context and the whole scene goes black — taking
 * the IFC model with it. The mesh importer must never be able to do that to a
 * model someone is presenting.
 */
export const MAX_TRIANGLES_DEFAULT = 8_000_000

export type MeshStatus = 'loading' | 'ready' | 'error'

/** What the loader found. Shown in the panel, and used to enforce the budget. */
export interface MeshStats {
  meshes: number
  triangles: number
  materials: number
  textures: number
  /** Bytes of texture data, estimated from image dimensions. */
  textureBytes: number
}

/**
 * Everything about the source's own coordinates, before anything is placed.
 * The mesh equivalent of SourceFrame, and deliberately the same shape of
 * honesty: every guess says it is a guess.
 */
export interface MeshFrame {
  /** Source unit → metre. */
  unitScale: number
  unitSource: 'assumed' | 'user'
  upAxis: UpAxis
  /**
   * glTF is the only one of these formats that MANDATES an orientation — the
   * specification requires Y-up — so a .glb or .gltf reports 'declared' and the
   * panel offers nothing. OBJ has no convention at all: it comes out of DCC
   * tools Y-up and out of CAD Z-up, so it is inferred and marked as such.
   */
  upAxisSource: 'declared' | 'assumed' | 'user'
  /** Source-space bounding box, in source units. */
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

/** One imported mesh, as the store holds it. Serialisable — no three objects. */
export interface MeshEntry {
  id: string
  fileName: string
  fileSize: number
  format: MeshFormat
  status: MeshStatus
  /** i18n key (mesh namespace) when status is 'error'. */
  errorKey: string | null
  visible: boolean
  stats: MeshStats
  frame: MeshFrame | null
  /** Manual placement on top of the derived fit. */
  placement: AlignmentOffset
  /** Stable identity for persistence — name:size:mtime, or the source URL. */
  fileKey: string
  loadedAt: number
}

export const EMPTY_STATS: MeshStats = {
  meshes: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0,
}
