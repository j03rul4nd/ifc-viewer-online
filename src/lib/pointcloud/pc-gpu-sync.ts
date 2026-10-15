// ─── pc-gpu-sync ──────────────────────────────────────────────────────────────
// The single store → GPU bridge for point clouds. pointCloudStore holds intent
// (display, budget, per-scan alignment, visibility, style); point-cloud-system
// holds the Three resources. Before this module, every writer had to remember
// to push its own change to the GPU — and the SDK 'placement' command did not,
// so a host could move a scan in the store while the screen stayed put.
//
// No three import: the system is reached through a structural type only.

import { usePointCloudStore } from '../../stores/pointCloudStore'
import type { AlignmentOffset, PointCloudAlignment } from './pc-types'
import type { PointCloudSystemAPI } from './point-cloud-system'

/**
 * Write a placement patch to the store and apply the resulting alignment to the
 * GPU synchronously. Returns the new alignment, or null when the cloud is
 * unknown or has not been placed yet (no alignment). A null system still
 * updates the store; the sync pushes it once the system exists.
 */
export function applyCloudOffset(
  system: Pick<PointCloudSystemAPI, 'setAlignment'> | null,
  id: string,
  patch: Partial<AlignmentOffset>,
): PointCloudAlignment | null {
  const before = usePointCloudStore.getState().clouds.find((c) => c.id === id)
  if (!before?.alignment) return null
  usePointCloudStore.getState().setOffset(id, patch)
  const alignment = usePointCloudStore.getState().clouds.find((c) => c.id === id)?.alignment ?? null
  if (alignment && system) system.setAlignment(id, alignment)
  return alignment
}
