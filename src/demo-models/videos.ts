import type { VideoPlacement, VideoSurfaceMode } from '../lib/video/video-types'

export interface DemoVideo {
  id: string
  name: string
  description: string
  fileName: string
  url: string
  posterUrl: string
  approximateSize: string
  sizeBytes: number
  durationLabel: string
  mode: VideoSurfaceMode
  /** Optional exact world placement; omitted demos use the active IFC bounds. */
  placement?: VideoPlacement
  companionIfcId: string
  sourceUrl: string
  sourceLabel: string
}

const ROOT = `${import.meta.env.BASE_URL}models/video-demo`

/**
 * Authored in this repository from the same dimensions as the companion IFC.
 * Keeping the media local makes the fair demo deterministic and avoids CORS,
 * expiring URLs and venue Wi-Fi.
 */
export const DEMO_VIDEOS: DemoVideo[] = [
  {
    id: 'operations-pavilion-progress',
    name: 'Operations Pavilion — progress loop',
    description: 'Synthetic construction progress and live-inspection loop for the matching IFC pavilion.',
    fileName: 'operations-pavilion-progress.mp4',
    url: `${ROOT}/operations-pavilion-progress.mp4`,
    posterUrl: `${ROOT}/operations-pavilion-poster.jpg`,
    approximateSize: '407 KB',
    sizeBytes: 407_222,
    durationLabel: '8 s loop',
    // A camera-facing first view is the most robust exhibition default. The
    // preset is calculated from the loaded IFC bounds on every run.
    mode: 'billboard',
    companionIfcId: 'operations-pavilion-video',
    sourceUrl: 'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-video-demo.py',
    sourceLabel: 'Synthetic asset authored with Blender + Bonsai',
  },
]
