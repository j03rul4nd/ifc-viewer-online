// 3D video surfaces for IFC / terrain / scan comparison.
//
// The system owns every non-serialisable resource it creates: HTMLVideoElement,
// object URL, VideoTexture, material, geometry and scene nodes. The store owns
// only intent. This keeps remove/dispose reliable during long exhibition runs,
// where repeatedly trying clips must not leak decoders or GPU textures.

import * as THREE from 'three'
import type {
  VideoPlacement,
  VideoPlaybackSnapshot,
  VideoSurfaceMode,
} from './video-types'
import {
  clampVideoPlacement,
  groundFootprintSamples,
  snapPlacementToSurface,
  type SurfaceSnapPlacement,
} from './video-placement'

export interface VideoSystemContext {
  scene: THREE.Scene
  getActiveCamera(): THREE.Camera
  getActiveModelBounds(): {
    center: { x: number; y: number; z: number }
    size: { x: number; y: number; z: number }
  } | null
  frameBox(min: THREE.Vector3, max: THREE.Vector3): void
}

export interface AddVideoInput {
  id: string
  src: string
  revokeSrcOnDispose?: boolean
  mode: VideoSurfaceMode
  placement: VideoPlacement
  muted?: boolean
  loop?: boolean
  volume?: number
}

export interface AddVideoStreamInput extends Omit<AddVideoInput, 'src' | 'revokeSrcOnDispose'> {
  stream: MediaStream
  /** Local capture streams are owned by the surface and stopped on removal. */
  stopTracksOnDispose?: boolean
  onStreamEnded?: () => void
}

export interface AddVideoResult {
  aspectRatio: number
  duration: number
}

export interface VideoSystemAPI {
  add(input: AddVideoInput): Promise<AddVideoResult>
  addStream(input: AddVideoStreamInput): Promise<AddVideoResult>
  setPresentation(id: string, mode: VideoSurfaceMode, placement: VideoPlacement): void
  setVisible(id: string, visible: boolean): void
  play(id: string): Promise<boolean>
  pause(id: string): void
  seek(id: string, seconds: number): void
  setLoop(id: string, loop: boolean): void
  setMuted(id: string, muted: boolean): void
  setVolume(id: string, volume: number): void
  getPlayback(id: string): VideoPlaybackSnapshot | null
  getCameraPosition(): { x: number; y: number; z: number }
  getModelBounds(): ReturnType<VideoSystemContext['getActiveModelBounds']>
  frame(id?: string): void
  frameWithModel(id?: string): void
  /** Sample terrain (preferred) or visible scene meshes under a rigid ground video. */
  snapToSurface(id: string, placement: VideoPlacement): SurfaceSnapPlacement | null
  remove(id: string): void
  count(): number
  dispose(): void
}

interface VideoRecord {
  id: string
  root: THREE.Group
  plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  geometry: THREE.PlaneGeometry
  material: THREE.MeshBasicMaterial
  texture: THREE.VideoTexture
  video: HTMLVideoElement
  src: string | null
  revokeSrcOnDispose: boolean
  stream: MediaStream | null
  stopTracksOnDispose: boolean
  removeStreamListeners: (() => void) | null
  mode: VideoSurfaceMode
  aspectRatio: number
}

const METADATA_TIMEOUT_MS = 15_000

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('Video metadata timed out')), METADATA_TIMEOUT_MS)
    const cleanup = (): void => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }
    const finish = (error?: Error): void => {
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const onReady = (): void => finish()
    const onError = (): void => finish(new Error(video.error?.message || 'Video could not be decoded'))
    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function createVideoSystem(ctx: VideoSystemContext): VideoSystemAPI {
  const records = new Map<string, VideoRecord>()
  let disposed = false

  function replaceExisting(id: string): void {
    const previous = records.get(id)
    if (!previous) return
    disposeRecord(previous)
    records.delete(id)
  }

  function configureVideo(input: Pick<AddVideoInput, 'muted' | 'loop' | 'volume'>): HTMLVideoElement {
    const video = document.createElement('video')
    video.playsInline = true
    video.muted = input.muted ?? true
    video.loop = input.loop ?? true
    video.volume = clamp01(input.volume ?? 0.7)
    return video
  }

  function applyPresentation(record: VideoRecord, mode: VideoSurfaceMode, raw: VideoPlacement): void {
    const placement = clampVideoPlacement(raw)
    record.mode = mode
    record.root.position.set(
      placement.x,
      placement.y + (mode === 'ground' ? placement.surfaceOffset : 0),
      placement.z,
    )
    record.root.scale.setScalar(1)

    const user = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(placement.pitchDeg),
      THREE.MathUtils.degToRad(placement.yawDeg),
      THREE.MathUtils.degToRad(placement.rollDeg),
      'YXZ',
    ))
    if (mode === 'ground') {
      // PlaneGeometry is XY with +Z normal. Lay it into XZ so its visible face
      // points up; polygonOffset and the explicit lift handle coplanar terrain.
      user.multiply(new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), -Math.PI / 2,
      ))
    }
    record.root.quaternion.copy(mode === 'billboard' ? new THREE.Quaternion() : user)
    record.plane.scale.set(placement.width, placement.width / record.aspectRatio, 1)
    record.material.opacity = placement.opacity
    record.material.transparent = placement.opacity < 1
    record.material.needsUpdate = true
    record.plane.renderOrder = mode === 'ground' ? 4 : 3
    record.root.updateMatrixWorld(true)
  }

  function disposeRecord(record: VideoRecord): void {
    record.removeStreamListeners?.()
    record.removeStreamListeners = null
    record.video.pause()
    record.video.srcObject = null
    record.video.removeAttribute('src')
    try { record.video.load() } catch { /* browser teardown */ }
    record.plane.onBeforeRender = () => undefined
    record.root.removeFromParent()
    record.texture.dispose()
    record.material.dispose()
    record.geometry.dispose()
    if (record.stopTracksOnDispose && record.stream) {
      for (const track of record.stream.getTracks()) track.stop()
    }
    if (record.revokeSrcOnDispose && record.src) URL.revokeObjectURL(record.src)
  }

  async function finaliseVideo(
    input: Omit<AddVideoInput, 'src' | 'revokeSrcOnDispose'>,
    video: HTMLVideoElement,
    source: {
      src?: string
      revokeSrcOnDispose?: boolean
      stream?: MediaStream
      stopTracksOnDispose?: boolean
      onStreamEnded?: () => void
    },
  ): Promise<AddVideoResult> {
    await waitForMetadata(video)
    if (disposed) throw new Error('Video system was disposed while loading')

    const aspectRatio = video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : 16 / 9
    const texture = new THREE.VideoTexture(video)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false

    const geometry = new THREE.PlaneGeometry(1, 1)
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: input.placement.opacity < 1,
      opacity: input.placement.opacity,
      depthTest: true,
      // A transparent media plane must not punch an invisible rectangle out
      // of IFC/terrain rendered after it.
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    })
    const plane = new THREE.Mesh(geometry, material)
    plane.name = `video-surface:${input.id}`
    const root = new THREE.Group()
    root.name = `video:${input.id}`
    root.add(plane)
    ctx.scene.add(root)

    let removeStreamListeners: (() => void) | null = null
    if (source.stream && source.onStreamEnded) {
      const tracks = source.stream.getVideoTracks()
      const onEnded = (): void => source.onStreamEnded?.()
      for (const track of tracks) track.addEventListener('ended', onEnded)
      removeStreamListeners = () => {
        for (const track of tracks) track.removeEventListener('ended', onEnded)
      }
    }

    const record: VideoRecord = {
      id: input.id,
      root,
      plane,
      geometry,
      material,
      texture,
      video,
      src: source.src ?? null,
      revokeSrcOnDispose: source.revokeSrcOnDispose === true,
      stream: source.stream ?? null,
      stopTracksOnDispose: source.stopTracksOnDispose === true,
      removeStreamListeners,
      mode: input.mode,
      aspectRatio,
    }
    plane.onBeforeRender = () => {
      if (record.mode === 'billboard') {
        plane.quaternion.copy(ctx.getActiveCamera().quaternion)
      } else {
        plane.quaternion.identity()
      }
    }
    records.set(input.id, record)
    applyPresentation(record, input.mode, input.placement)
    return {
      aspectRatio,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
    }
  }

  function boundsOf(id?: string): THREE.Box3 | null {
    const targets = id
      ? ([records.get(id)].filter(Boolean) as VideoRecord[])
      : [...records.values()]
    const box = new THREE.Box3()
    for (const record of targets) {
      if (!record.root.visible) continue
      // Resolve the current billboard orientation before computing its bounds.
      if (record.mode === 'billboard') record.plane.quaternion.copy(ctx.getActiveCamera().quaternion)
      record.root.updateMatrixWorld(true)
      box.union(new THREE.Box3().setFromObject(record.root))
    }
    return box.isEmpty() ? null : box
  }

  function hasNamedAncestor(object: THREE.Object3D, name: string): boolean {
    let cursor: THREE.Object3D | null = object
    while (cursor) {
      if (cursor.name === name) return true
      cursor = cursor.parent
    }
    return false
  }

  function belongsToVideo(object: THREE.Object3D): boolean {
    let cursor: THREE.Object3D | null = object
    while (cursor) {
      if (cursor.name.startsWith('video:')) return true
      cursor = cursor.parent
    }
    return false
  }

  function isEffectivelyVisible(object: THREE.Object3D): boolean {
    let cursor: THREE.Object3D | null = object
    while (cursor) {
      if (!cursor.visible) return false
      cursor = cursor.parent
    }
    return true
  }

  /** Prefer the real DEM patch; fall back to visible meshes such as an IFC slab. */
  function surfaceMeshes(): THREE.Object3D[] {
    const terrain: THREE.Object3D[] = []
    const fallback: THREE.Object3D[] = []
    ctx.scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh || belongsToVideo(object) || !isEffectivelyVisible(object)) return
      fallback.push(object)
      if (hasNamedAncestor(object, 'terrain-patch')) terrain.push(object)
    })
    return terrain.length > 0 ? terrain : fallback
  }

  function sampleSurfaceHeights(points: Array<{ x: number; z: number }>): number[] {
    const candidates = surfaceMeshes()
    if (candidates.length === 0) return []
    ctx.scene.updateMatrixWorld(true)

    const bounds = new THREE.Box3()
    const scratch = new THREE.Box3()
    for (const candidate of candidates) bounds.union(scratch.setFromObject(candidate))
    if (bounds.isEmpty()) return []

    const originY = bounds.max.y + Math.max(10, bounds.getSize(new THREE.Vector3()).y * 0.1)
    const raycaster = new THREE.Raycaster()
    raycaster.near = 0
    raycaster.far = Math.max(20, originY - bounds.min.y + 20)
    const down = new THREE.Vector3(0, -1, 0)
    const heights: number[] = []
    for (const point of points) {
      raycaster.set(new THREE.Vector3(point.x, originY, point.z), down)
      let nearest: THREE.Intersection | null = null
      // Fragment collections can contain placeholder meshes whose accelerated
      // raycast has no position data. Isolate candidates so one invalid helper
      // never aborts the useful terrain/slab hits from the rest of the scene.
      for (const candidate of candidates) {
        try {
          const hit = raycaster.intersectObject(candidate, false)[0]
          if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit
        } catch {
          // Non-renderable/placeholder fragment: not a surface candidate.
        }
      }
      if (nearest) heights.push(nearest.point.y)
    }
    return heights
  }

  return {
    async add(input) {
      if (disposed) throw new Error('Video system is disposed')
      replaceExisting(input.id)
      const video = configureVideo(input)
      video.preload = 'metadata'
      video.crossOrigin = 'anonymous'
      video.src = input.src

      try {
        video.load()
        return await finaliseVideo(input, video, {
          src: input.src,
          revokeSrcOnDispose: input.revokeSrcOnDispose,
        })
      } catch (error) {
        video.pause()
        video.removeAttribute('src')
        try { video.load() } catch { /* browser teardown */ }
        if (input.revokeSrcOnDispose) URL.revokeObjectURL(input.src)
        throw error
      }
    },

    async addStream(input) {
      if (disposed) throw new Error('Video system is disposed')
      replaceExisting(input.id)
      const video = configureVideo(input)
      video.preload = 'none'
      video.autoplay = true
      video.srcObject = input.stream

      try {
        // Muted streams are autoplay-safe. Starting immediately also makes
        // camera metadata arrive reliably on Chromium and WebKit.
        void video.play().catch(() => undefined)
        return await finaliseVideo(input, video, {
          stream: input.stream,
          stopTracksOnDispose: input.stopTracksOnDispose ?? true,
          onStreamEnded: input.onStreamEnded,
        })
      } catch (error) {
        video.pause()
        video.srcObject = null
        if (input.stopTracksOnDispose ?? true) {
          for (const track of input.stream.getTracks()) track.stop()
        }
        throw error
      }
    },

    setPresentation(id, mode, placement) {
      const record = records.get(id)
      if (record) applyPresentation(record, mode, placement)
    },

    setVisible(id, visible) {
      const record = records.get(id)
      if (!record) return
      record.root.visible = visible
      // Hidden video should not keep a hardware/software decoder busy during a
      // presentation. A local muted stream resumes when shown; file playback
      // keeps its timestamp and still uses the panel's explicit Play action.
      if (!visible) record.video.pause()
      else if (record.stream) void record.video.play().catch(() => undefined)
    },

    async play(id) {
      const record = records.get(id)
      if (!record) return false
      try {
        await record.video.play()
        return true
      } catch {
        // Autoplay policies are expected, not exceptional. The panel retains a
        // clear Play action so a user gesture can resume the same element.
        return false
      }
    },

    pause(id) { records.get(id)?.video.pause() },

    seek(id, seconds) {
      const video = records.get(id)?.video
      if (!video || !Number.isFinite(seconds)) return
      const duration = Number.isFinite(video.duration) ? video.duration : seconds
      video.currentTime = Math.min(Math.max(0, seconds), Math.max(0, duration))
    },

    setLoop(id, loop) {
      const video = records.get(id)?.video
      if (video) video.loop = loop
    },

    setMuted(id, muted) {
      const video = records.get(id)?.video
      if (video) video.muted = muted
    },

    setVolume(id, volume) {
      const video = records.get(id)?.video
      if (video) video.volume = clamp01(volume)
    },

    getPlayback(id) {
      const video = records.get(id)?.video
      if (!video) return null
      return {
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        paused: video.paused,
        ended: video.ended,
      }
    },

    getCameraPosition() {
      const position = new THREE.Vector3()
      ctx.getActiveCamera().getWorldPosition(position)
      return { x: position.x, y: position.y, z: position.z }
    },

    getModelBounds: () => ctx.getActiveModelBounds(),

    frame(id) {
      const box = boundsOf(id)
      if (box) ctx.frameBox(box.min, box.max)
    },

    frameWithModel(id) {
      const box = boundsOf(id)
      if (!box) return
      const model = ctx.getActiveModelBounds()
      if (model) {
        const half = new THREE.Vector3(model.size.x / 2, model.size.y / 2, model.size.z / 2)
        const centre = new THREE.Vector3(model.center.x, model.center.y, model.center.z)
        box.expandByPoint(centre.clone().sub(half))
        box.expandByPoint(centre.clone().add(half))
      }
      ctx.frameBox(box.min, box.max)
    },

    snapToSurface(id, placement) {
      const record = records.get(id)
      if (!record || record.mode !== 'ground') return null
      const samples = groundFootprintSamples(placement, record.aspectRatio)
      const snapped = snapPlacementToSurface(placement, sampleSurfaceHeights(samples))
      if (!snapped) return null
      applyPresentation(record, 'ground', snapped.placement)
      return snapped
    },

    remove(id) {
      const record = records.get(id)
      if (!record) return
      disposeRecord(record)
      records.delete(id)
    },

    count: () => records.size,

    dispose() {
      if (disposed) return
      disposed = true
      for (const record of records.values()) disposeRecord(record)
      records.clear()
    },
  }
}
