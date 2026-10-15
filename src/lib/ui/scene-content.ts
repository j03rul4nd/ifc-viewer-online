// ─── Scene content ────────────────────────────────────────────────────────────
// "Is there anything in the scene?" — the question menu gates and the rail
// answer instead of "is validation idle?". Device sources are deliberately not
// content: they persist in ifc-twin-devices:v1 and would make an empty canvas
// count as populated.

import { useSceneStore } from '../../stores/sceneStore'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useVideoStore } from '../../stores/videoStore'
import { useVectorLayerStore } from '../../stores/vectorLayerStore'

export interface SceneContentCounts {
  models: number
  clouds: number
  meshes: number
  videos: number
  layers: number
}

export type SceneContent = SceneContentCounts & { any: boolean }

export function hasSceneContent(c: SceneContentCounts): boolean {
  return c.models + c.clouds + c.meshes + c.videos + c.layers > 0
}

export function withAny(c: SceneContentCounts): SceneContent {
  return { ...c, any: hasSceneContent(c) }
}

/** Snapshot outside React (event handlers, drop routing). */
export function readSceneContent(): SceneContent {
  return withAny({
    models: useSceneStore.getState().models.length,
    clouds: usePointCloudStore.getState().clouds.length,
    meshes: useMeshStore.getState().meshes.length,
    videos: useVideoStore.getState().videos.length,
    layers: useVectorLayerStore.getState().layers.length,
  })
}
