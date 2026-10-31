// ─── What the viewer hands to the sketch studio ───────────────────────────────
// Everything open and visible in the scene: IFC models, imported meshes and point
// clouds. Kept out of lib/sketch, which does not know the viewer exists.

import type { ModelSource } from './sketch'
import type { ViewerAPI } from './viewer'
import { exportAsGlb } from './diffStore'
import { useMeshStore } from '../stores/meshStore'
import { usePointCloudStore } from '../stores/pointCloudStore'

/** Enough to read a scan's shape on a phone, without holding the scan twice. */
const MAX_POINTS_PER_CLOUD = 600_000

export function sketchSources(viewer: ViewerAPI | null, models: readonly { id: string; fileName: string }[]): ModelSource[] {
  if (!viewer) return []
  const ifc: ModelSource[] = models.map((model) => ({
    name: model.fileName,
    read: async () => {
      const object = viewer.getModelObject(model.id)
      return object ? { kind: 'mesh', blob: await exportAsGlb(object, viewer.getFragmentsModel(model.id)) } : null
    },
  }))
  const meshes: ModelSource[] = useMeshStore.getState().meshes.filter((m) => m.visible !== false).map((mesh) => ({
    name: mesh.fileName,
    read: async () => {
      const root = (await viewer.getMeshes()).getRoot(mesh.id)
      return root ? { kind: 'mesh', blob: await exportAsGlb(root) } : null
    },
  }))
  const clouds: ModelSource[] = usePointCloudStore.getState().clouds.filter((c) => c.visible !== false).map((cloud) => ({
    name: cloud.fileName,
    read: async () => {
      const sample = (await viewer.getPointClouds()).samplePoints(cloud.id, MAX_POINTS_PER_CLOUD)
      return sample ? { kind: 'points', ...sample } : null
    },
  }))
  return [...ifc, ...meshes, ...clouds]
}
