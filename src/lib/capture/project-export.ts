// ─── Project export — deterministic, frame by frame ────────────────────────────
// Walks the output timeline one frame at a time: sample the project, fetch the
// exact source frames it needs, compose with the SAME compositor the preview
// uses, encode. No playback, no real time, no rAF — so it runs as fast as the
// machine encodes, keeps going in a background tab, and produces identical
// files for identical projects.

import { layoutClips, sampleProject, projectDuration, type EditProject, type MediaOverlay } from './project'
import { composeProjectFrame, type FramePicture, type ProjectFill } from './project-compositor'
import { createVideoWriter, mixBed, openSequentialReader, pickCodec, type CodecChoice, type VideoReader } from './media-codec'

/** Media behind each source id: a video file, or a decoded still. */
export type SourceMedia = { kind: 'video'; blob: Blob } | { kind: 'image'; image: ImageBitmap | HTMLImageElement; width: number; height: number }

export interface ProjectExportOptions {
  width: number
  height: number
  fps: number
  fill: ProjectFill
  watermark: boolean
  /** Decoded music bed, or null for a silent file. */
  bed: AudioBuffer | null
  onProgress?: (fraction: number, stage: 'frames' | 'audio' | 'finishing') => void
  signal?: AbortSignal
}

export interface ProjectExportResult {
  blob: Blob
  choice: CodecChoice
  durationSec: number
  frames: number
}

export async function exportProject(
  project: EditProject,
  media: ReadonlyMap<string, SourceMedia>,
  o: ProjectExportOptions,
): Promise<ProjectExportResult> {
  const duration = projectDuration(project)
  if (duration <= 0) throw new Error('The project is empty')

  const hasBed = !!o.bed && project.audio.kind !== 'none'
  const hasSfx = !!project.sfx && project.sfx.cues.length > 0 && project.sfx.volume > 0
  const wantsAudio = hasBed || hasSfx
  const choice = await pickCodec(o.width, o.height, wantsAudio)
  if (!choice) throw new Error('This browser cannot encode video (WebCodecs unavailable)')

  // One forward-reading decoder per CLIP (and per video overlay), opened when
  // it first appears and closed once it is behind the playhead: two halves of
  // one split clip then never share an iterator, and at most the clips on
  // screen hold a decoder.
  const readers = new Map<string, VideoReader>()
  const readerFor = async (key: string, sourceId: string): Promise<VideoReader | null> => {
    const existing = readers.get(key)
    if (existing) return existing
    const m = media.get(sourceId)
    if (m?.kind !== 'video') return null
    const r = await openSequentialReader(m.blob)
    readers.set(key, r)
    return r
  }
  const layout = layoutClips(project)
  const writer = await createVideoWriter({ width: o.width, height: o.height, fps: o.fps, choice })
  try {

    const frames = Math.max(1, Math.round(duration * o.fps))
    for (let i = 0; i < frames; i++) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const t = i / o.fps
      const sample = sampleProject(project, t)

      // Fetch every picture this frame needs BEFORE composing: a reader hands
      // out pooled canvases, and composing between fetches could see one reused.
      const clipPics = new Map<string, FramePicture | null>()
      for (const s of [sample.outgoing, sample.primary]) {
        if (s) clipPics.set(s.clip.id, await pictureAt(media, await readerFor(s.clip.id, s.clip.sourceId), s.clip.sourceId, s.sourceTime))
      }
      const overlayPics = new Map<string, FramePicture | null>()
      for (const ov of project.overlays) {
        if (t < ov.startSec || t > ov.endSec) continue
        overlayPics.set(ov.id, await pictureAt(media, await readerFor(ov.id, ov.sourceId), ov.sourceId, overlayTime(ov, t)))
      }
      // Free decoders of clips that are finished.
      for (const p of layout) {
        if (p.end < t - 0.5 && readers.has(p.clip.id)) { readers.get(p.clip.id)?.dispose(); readers.delete(p.clip.id) }
      }

      composeProjectFrame({
        ctx: writer.ctx, width: writer.canvas.width, height: writer.canvas.height,
        project, sample, t,
        frameOf: (c) => clipPics.get(c.clip.id) ?? null,
        overlayOf: (ov) => overlayPics.get(ov.id) ?? null,
        fill: o.fill, watermark: o.watermark,
      })
      await writer.addFrame(i)
      o.onProgress?.((i + 1) / frames, 'frames')
    }

    let audio: AudioBuffer | null = null
    if (wantsAudio && choice.audio) {
      o.onProgress?.(1, 'audio')
      audio = await mixBed(hasBed ? o.bed : null, project.audio, duration, 48_000, project.sfx)
    }
    o.onProgress?.(1, 'finishing')
    const blob = await writer.finalize(audio)
    return { blob, choice, durationSec: duration, frames }
  } catch (e) {
    await writer.cancel()
    throw e
  } finally {
    for (const r of readers.values()) r.dispose()
  }
}

/** Source time shown by a video overlay at project time t (loops short media). */
export function overlayTime(ov: MediaOverlay, t: number): number {
  return ov.inSec + Math.max(0, t - ov.startSec)
}

async function pictureAt(
  media: ReadonlyMap<string, SourceMedia>,
  reader: VideoReader | null,
  sourceId: string,
  t: number,
): Promise<FramePicture | null> {
  const m = media.get(sourceId)
  if (!m) return null
  if (m.kind === 'image') return { image: m.image, width: m.width, height: m.height }
  if (!reader) return null
  const time = reader.durationSec > 0 ? Math.min(t, reader.durationSec - 1e-3) : t
  const image = await reader.frameAt(time)
  return image ? { image, width: reader.width, height: reader.height } : null
}
