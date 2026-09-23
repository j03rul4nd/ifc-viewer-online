// ─── Project export — deterministic, frame by frame ────────────────────────────
// Walks the output timeline one frame at a time: sample the project, fetch the
// exact source frames it needs, compose with the SAME compositor the preview
// uses, encode. No playback, no real time, no rAF — so it runs as fast as the
// machine encodes, keeps going in a background tab, and produces identical
// files for identical projects.

import { sampleProject, projectDuration, type EditProject, type MediaOverlay } from './project'
import { composeProjectFrame, type FramePicture, type ProjectFill } from './project-compositor'
import { createVideoWriter, mixBed, openVideoReader, pickCodec, type CodecChoice, type VideoReader } from './media-codec'

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

  const wantsAudio = !!o.bed && project.audio.kind !== 'none'
  const choice = await pickCodec(o.width, o.height, wantsAudio)
  if (!choice) throw new Error('This browser cannot encode video (WebCodecs unavailable)')

  // One reader per video source actually used — clips and video overlays.
  const readers = new Map<string, VideoReader>()
  const used = new Set([...project.clips.map((c) => c.sourceId), ...project.overlays.map((v) => v.sourceId)])
  const writer = await createVideoWriter({ width: o.width, height: o.height, fps: o.fps, choice })
  try {
    for (const id of used) {
      const m = media.get(id)
      if (m?.kind === 'video') readers.set(id, await openVideoReader(m.blob))
    }

    const frames = Math.max(1, Math.round(duration * o.fps))
    for (let i = 0; i < frames; i++) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const t = i / o.fps
      const sample = sampleProject(project, t)

      // Fetch every picture this frame needs BEFORE composing: a reader hands
      // out pooled canvases, and composing between fetches could see one reused.
      const clipPics = new Map<string, FramePicture | null>()
      for (const s of [sample.outgoing, sample.primary]) {
        if (s) clipPics.set(s.clip.id, await pictureAt(media, readers, s.clip.sourceId, s.sourceTime))
      }
      const overlayPics = new Map<string, FramePicture | null>()
      for (const ov of project.overlays) {
        if (t < ov.startSec || t > ov.endSec) continue
        overlayPics.set(ov.id, await pictureAt(media, readers, ov.sourceId, overlayTime(ov, t)))
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
    if (wantsAudio && choice.audio && o.bed) {
      o.onProgress?.(1, 'audio')
      audio = await mixBed(o.bed, project.audio, duration)
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
  readers: ReadonlyMap<string, VideoReader>,
  sourceId: string,
  t: number,
): Promise<FramePicture | null> {
  const m = media.get(sourceId)
  if (!m) return null
  if (m.kind === 'image') return { image: m.image, width: m.width, height: m.height }
  const reader = readers.get(sourceId)
  if (!reader) return null
  const time = reader.durationSec > 0 ? Math.min(t, reader.durationSec - 1e-3) : t
  const image = await reader.frameAt(time)
  return image ? { image, width: reader.width, height: reader.height } : null
}
