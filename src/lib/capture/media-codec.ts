// ─── Media codec — frame-exact decode and encode with WebCodecs ───────────────
// The old exporter replayed the clip in real time through MediaRecorder: a
// 15 s clip took 15 s, froze when the tab was hidden (rAF stops), needed
// watchdog timers, and could not cut two sources together. This module does
// it the way an editor should:
//
//   decode — every source is opened with a demuxer and read at EXACT
//            timestamps (no <video> seeking, no "close enough" frames)
//   encode — each output frame is composed, handed to a hardware encoder and
//            muxed into MP4 (H.264 + AAC), as fast as the machine allows
//
// Nothing here depends on requestAnimationFrame or on the tab being visible.
// Mediabunny (MPL-2.0, used unmodified) supplies demuxing and muxing; the
// encoders are the browser's own WebCodecs.

import {
  Input, BlobSource, ALL_FORMATS, CanvasSink,
  Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, AudioBufferSource,
  canEncodeVideo, canEncodeAudio,
} from 'mediabunny'
import type { AudioSelection } from './timeline'
import { scheduleAudioEnvelope, resolveAudioOffset } from './audio-library'
import { cameraAt, shotFrameTimes, type ShotSpec } from './shots'

// ── Capability ─────────────────────────────────────────────────────────────────

export interface CodecChoice {
  container: 'mp4' | 'webm'
  video: 'avc' | 'vp9'
  audio: 'aac' | 'opus' | null
  mime: string
}

/** True where WebCodecs exists at all. Everything else falls back to the realtime path. */
export function hasWebCodecs(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

/**
 * The best output this browser can encode at this size. MP4/H.264/AAC first —
 * the only combination Instagram, TikTok and LinkedIn all accept — then WebM.
 */
export async function pickCodec(width: number, height: number, withAudio: boolean): Promise<CodecChoice | null> {
  if (!hasWebCodecs()) return null
  const size = { width: even(width), height: even(height) }
  if (await canEncodeVideo('avc', size)) {
    const aac = withAudio && (await canEncodeAudio('aac'))
    // H.264 without AAC would mean MP4+Opus, which some platforms reject —
    // prefer a silent MP4 over an audio track that fails the upload.
    return { container: 'mp4', video: 'avc', audio: aac ? 'aac' : null, mime: 'video/mp4' }
  }
  if (await canEncodeVideo('vp9', size)) {
    const opus = withAudio && (await canEncodeAudio('opus'))
    return { container: 'webm', video: 'vp9', audio: opus ? 'opus' : null, mime: 'video/webm' }
  }
  return null
}

// ── Reading sources ────────────────────────────────────────────────────────────

export interface VideoReader {
  width: number
  height: number
  durationSec: number
  /** The frame showing at `t` (the last one starting at or before it). Draw it before the next call. */
  frameAt(t: number): Promise<CanvasImageSource | null>
  dispose(): void
}

export async function openVideoReader(blob: Blob): Promise<VideoReader> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) { input.dispose?.(); throw new Error('No video track in this file') }
  const durationSec = await input.computeDuration()
  // Three pooled canvases: a crossfade between two halves of one split clip plus
  // a video overlay from that same source need three frames alive at once.
  const sink = new CanvasSink(track, { poolSize: 3 })
  const first = await track.getFirstTimestamp()
  return {
    width: track.displayWidth,
    height: track.displayHeight,
    durationSec,
    async frameAt(t: number) {
      // Before the first frame (a clip whose first packet starts at 0.03 s)
      // show the first frame rather than nothing.
      const wrapped = await sink.getCanvas(Math.max(first, t))
      return wrapped ? wrapped.canvas : null
    },
    dispose() { input.dispose?.() },
  }
}

/**
 * A reader for FORWARD playback — what an export does. Random access decodes
 * from the previous keyframe on every call (~30× the work at one keyframe per
 * second); this keeps one decoding iterator running and only restarts it when
 * asked to jump backwards or far ahead. One per clip, so two clips cut from
 * the same file never fight over one iterator.
 */
export async function openSequentialReader(blob: Blob): Promise<VideoReader> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  const track = await input.getPrimaryVideoTrack()
  if (!track) { input.dispose?.(); throw new Error('No video track in this file') }
  const durationSec = await input.computeDuration()
  // No canvas pool: the iterator decodes ahead, and a pooled canvas could be
  // repainted with a later frame while the caller is still drawing this one.
  const sink = new CanvasSink(track, { poolSize: 0 })
  const first = await track.getFirstTimestamp()
  type W = { canvas: HTMLCanvasElement | OffscreenCanvas; timestamp: number; duration: number }
  let iter: AsyncGenerator<W, void, unknown> | null = null
  let current: W | null = null
  let ahead: W | null = null
  let done = false

  const restart = async (t: number): Promise<void> => {
    await iter?.return(undefined)
    iter = sink.canvases(t)
    done = false
    const a = await iter.next()
    current = a.done ? null : a.value
    const b = a.done ? { done: true as const, value: undefined } : await iter.next()
    ahead = b.done ? null : b.value
    done = !!b.done
  }

  return {
    width: track.displayWidth,
    height: track.displayHeight,
    durationSec,
    async frameAt(tIn: number) {
      const t = Math.max(first, tIn)
      if (!current || t < current.timestamp - 1e-4 || t > current.timestamp + 2) await restart(t)
      // Advance while the next frame has already started.
      while (ahead && ahead.timestamp <= t + 1e-4) {
        current = ahead
        if (done || !iter) { ahead = null; break }
        const n = await iter.next()
        ahead = n.done ? null : n.value
        done = !!n.done
      }
      return current ? current.canvas : null
    },
    dispose() { void iter?.return(undefined); input.dispose?.() },
  }
}

// ── Writing video ──────────────────────────────────────────────────────────────

export interface VideoWriter {
  /** Draw each frame here, then call addFrame. */
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  addFrame(index: number): Promise<void>
  /** Mux the (already mixed) audio and close the file. */
  finalize(audio?: AudioBuffer | null): Promise<Blob>
  cancel(): Promise<void>
  choice: CodecChoice
}

export interface WriterOptions {
  width: number
  height: number
  fps: number
  choice: CodecChoice
  /** Video bitrate, bits/s. Default suits 1080p social uploads. */
  bitrate?: number
}

export async function createVideoWriter(o: WriterOptions): Promise<VideoWriter> {
  const width = even(o.width)
  const height = even(o.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('2D canvas unavailable')

  const output = new Output({
    format: o.choice.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  })
  const video = new CanvasSource(canvas, {
    codec: o.choice.video,
    bitrate: o.bitrate ?? defaultBitrate(width, height, o.fps),
    // A keyframe every second keeps scrubbing smooth wherever it is uploaded.
    keyFrameInterval: 1,
  })
  output.addVideoTrack(video, { frameRate: o.fps })
  const audio = o.choice.audio ? new AudioBufferSource({ codec: o.choice.audio, bitrate: 160_000 }) : null
  if (audio) output.addAudioTrack(audio)
  await output.start()

  const frameDur = 1 / o.fps
  return {
    canvas, ctx, choice: o.choice,
    addFrame: (i) => video.add(i * frameDur, frameDur),
    async finalize(buffer) {
      if (audio && buffer) await audio.add(buffer)
      await output.finalize()
      const bytes = (output.target as BufferTarget).buffer
      if (!bytes) throw new Error('Encoder produced no data')
      return new Blob([bytes], { type: o.choice.mime })
    },
    async cancel() { try { await output.cancel() } catch { /* already closed */ } },
  }
}

/** ~0.1 bits per pixel per frame — generous for H.264 at social resolutions. */
export function defaultBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(20_000_000, Math.max(2_500_000, width * height * fps * 0.1)))
}

// ── Audio ──────────────────────────────────────────────────────────────────────

/**
 * Render the music bed for a `durationSec` export, with the selection's
 * volume, fades and offset — offline, faster than real time, sample-exact.
 */
export async function mixBed(
  bed: AudioBuffer,
  selection: AudioSelection,
  durationSec: number,
  sampleRate = 48_000,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(durationSec * sampleRate))
  const ctx = new OfflineAudioContext(2, length, sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = bed
  src.loop = bed.duration < durationSec + resolveAudioOffset(selection, bed.duration)
  const gain = ctx.createGain()
  gain.gain.value = 0
  src.connect(gain)
  gain.connect(ctx.destination)
  scheduleAudioEnvelope(gain.gain, selection, durationSec, 0)
  src.start(0, resolveAudioOffset(selection, bed.duration))
  return ctx.startRendering()
}

// ── Rendering a 3D shot ────────────────────────────────────────────────────────

/** The slice of ViewerAPI shot rendering needs — narrowed so it can be faked. */
export interface ShotRenderer {
  beginShotRender(width: number, height: number): Promise<void>
  renderShotFrame(pose: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fovDeg: number }): Promise<HTMLCanvasElement>
  endShotRender(): Promise<void>
}

export interface ShotRenderOptions {
  width: number
  height: number
  fps: number
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
  /**
   * Frames rendered and thrown away before recording, at the first pose — lets
   * a scene change made just before (isolating, hiding a model, a highlight)
   * finish streaming in so the first recorded frame is already complete.
   */
  warmupFrames?: number
}

/**
 * Render a camera move from the model to a video file at the output size.
 * The on-screen view is frozen at the output aspect while this runs and is
 * restored afterwards, whatever happens.
 */
export async function renderShot(viewer: ShotRenderer, shot: ShotSpec, o: ShotRenderOptions): Promise<Blob> {
  const choice = await pickCodec(o.width, o.height, false)
  if (!choice) throw new Error('This browser cannot encode video (WebCodecs unavailable)')
  const writer = await createVideoWriter({ width: o.width, height: o.height, fps: o.fps, choice })
  const times = shotFrameTimes(shot, o.fps)
  await viewer.beginShotRender(writer.canvas.width, writer.canvas.height)
  try {
    for (let w = 0; w < (o.warmupFrames ?? 0); w++) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      await viewer.renderShotFrame(cameraAt(shot, 0))
      await new Promise((r) => setTimeout(r, 16))
    }
    for (let i = 0; i < times.length; i++) {
      if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const gl = await viewer.renderShotFrame(cameraAt(shot, times[i]))
      // Copy in the same task as the render: the WebGL buffer is cleared once
      // the browser composites.
      writer.ctx.drawImage(gl, 0, 0, writer.canvas.width, writer.canvas.height)
      await writer.addFrame(i)
      o.onProgress?.((i + 1) / times.length)
    }
  } catch (e) {
    await writer.cancel()
    throw e
  } finally {
    await viewer.endShotRender()
  }
  return writer.finalize(null)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** H.264 needs even dimensions. */
export function even(n: number): number {
  const r = Math.max(2, Math.round(n))
  return r % 2 === 0 ? r : r - 1
}
