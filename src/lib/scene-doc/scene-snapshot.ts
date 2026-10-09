// ─── scene-snapshot ───────────────────────────────────────────────────────────
// The scene on screen right now, as a scene document: models by URL, data
// layers, twin bindings, map, background and (optionally) the camera. One
// assembly for everything that shares a scene — Share → "Digital-twin scene"
// and the SDK's exportScene() — so both always describe the same thing.

import { useSceneStore } from '../../stores/sceneStore'
import { useGeoStore } from '../../stores/geoStore'
import { useLoadingStore, jobForModel } from '../../stores/loadingStore'
import { useVectorLayerStore } from '../../stores/vectorLayerStore'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { buildSceneDoc, type SceneDoc, type SceneModel } from './scene-doc'
import { encodeSceneLink } from './scene-link'
import { backgroundToSpec, mapToSpec, portableModelUrl, roundVec } from './scene-capture'

export interface SceneSnapshot {
  doc: SceneDoc
  /** Models opened from this device (no URL): a scene cannot carry them. */
  localModels: number
  /** Credentials stripped from layer URLs on the way out. */
  secretsRemoved: number
}

export async function snapshotScene(opts: {
  title: string
  description?: string
  /** Eye and orbit target, scene metres; null leaves the camera out. */
  camera: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null
}): Promise<SceneSnapshot> {
  const jobs = useLoadingStore.getState().jobs
  const origin = window.location.origin
  const models: SceneModel[] = []
  let localModels = 0
  for (const m of useSceneStore.getState().models) {
    const url = jobForModel(jobs, m.id)?.sourceUrl
    if (url) models.push({ url: portableModelUrl(url, origin), name: m.fileName })
    else localModels++
  }
  let layers: unknown[] = []
  let secretsRemoved = 0
  if (useVectorLayerStore.getState().layers.length > 0) {
    const vr = await import('../layers/vector-runner')
    const r = vr.exportLayersFile()
    layers = (JSON.parse(r.json) as { layers: unknown[] }).layers
    secretsRemoved = r.secretsRemoved
  }
  const twin = useTwinDeviceStore.getState()
  const geo = useGeoStore.getState()
  const map = mapToSpec(geo)
  const background = backgroundToSpec(useSceneStore.getState().background)
  const doc = buildSceneDoc({
    meta: {
      title: opts.title,
      ...(opts.description ? { description: opts.description } : {}),
      ...(geo.placement ? { place: { lat: +geo.placement.lat.toFixed(6), lon: +geo.placement.lon.toFixed(6) } } : {}),
    },
    models,
    layers,
    twin: { sources: twin.sources, bindings: twin.bindings },
    view: {
      ...(map ? { map } : {}),
      ...(background ? { background } : {}),
      ...(opts.camera ? { camera: { position: roundVec(opts.camera.position), target: roundVec(opts.camera.target) } } : {}),
    },
  })
  return { doc, localModels, secretsRemoved }
}

/** The app's own address, without query or fragment: where a shared scene opens. */
export function appBase(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`
}

/** A link that carries the scene in its fragment, or null when it is too big for one. */
export async function sceneLink(doc: SceneDoc): Promise<string | null> {
  const packed = await encodeSceneLink(doc)
  return packed ? `${appBase()}#scene=${packed}` : null
}
