import { useMemo } from 'react'
import { useSceneStore } from '../stores/sceneStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { useMeshStore } from '../stores/meshStore'
import { useVideoStore } from '../stores/videoStore'
import { useVectorLayerStore } from '../stores/vectorLayerStore'
import { withAny, type SceneContent } from '../lib/ui/scene-content'

/** Live counts of what the scene holds (see lib/ui/scene-content.ts). */
export function useSceneContent(): SceneContent {
  const models = useSceneStore((s) => s.models.length)
  const clouds = usePointCloudStore((s) => s.clouds.length)
  const meshes = useMeshStore((s) => s.meshes.length)
  const videos = useVideoStore((s) => s.videos.length)
  const layers = useVectorLayerStore((s) => s.layers.length)
  return useMemo(() => withAny({ models, clouds, meshes, videos, layers }), [models, clouds, meshes, videos, layers])
}
