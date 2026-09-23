// ─── Clip Studio preview engine ────────────────────────────────────────────────
// Real-time playback of a multi-clip project into a canvas, through the SAME
// composeProjectFrame the exporter uses — what you see is what you export.
//
// Each clip gets its own hidden <video> (two halves of a split clip can then
// crossfade into each other). A project clock drives playback; every tick the
// clips on screen are nudged to their source time and rate, and a clip about
// to start is parked on its first frame so a cut never flashes black.
// Paused, the engine seeks exactly and draws on 'seeked'.

import { useCallback, useEffect, useRef, useState } from 'react'
import { layoutClips, projectDuration, sampleProject, type EditProject } from '../../lib/capture/project'
import { composeProjectFrame, type FramePicture } from '../../lib/capture/project-compositor'
import { overlayTime, type SourceMedia } from '../../lib/capture/project-export'
import { getBuiltInBed, scheduleAudioEnvelope, resolveAudioOffset } from '../../lib/capture/audio-library'
import type { StudioOutput } from '../../stores/clipStudioStore'

/** Beyond this drift (seconds) a playing clip is re-seeked. */
const DRIFT_SEC = 0.2
/** Clips starting within this window are pre-rolled to their first frame. */
const PREROLL_SEC = 1

interface Deps {
  canvasRef: React.RefObject<HTMLCanvasElement>
  project: EditProject
  media: ReadonlyMap<string, SourceMedia>
  output: StudioOutput
  playhead: number
  setPlayhead: (t: number) => void
}

export function usePreviewEngine({ canvasRef, project, media, output, playhead, setPlayhead }: Deps) {
  const [playing, setPlaying] = useState(false)
  const urls = useRef(new Map<string, string>())
  const videos = useRef(new Map<string, HTMLVideoElement>())
  const projectRef = useRef(project)
  projectRef.current = project
  const mediaRef = useRef(media)
  mediaRef.current = media
  const outputRef = useRef(output)
  outputRef.current = output
  const clock = useRef<{ start: number; from: number } | null>(null)
  const raf = useRef(0)
  const audio = useRef<{ ctx: AudioContext; src: AudioBufferSourceNode } | null>(null)

  const urlFor = useCallback((sourceId: string): string | null => {
    const m = mediaRef.current.get(sourceId)
    if (!m || m.kind !== 'video') return null
    let url = urls.current.get(sourceId)
    if (!url) {
      url = URL.createObjectURL(m.blob)
      urls.current.set(sourceId, url)
    }
    return url
  }, [])

  /** The <video> for a clip (or overlay) id, created on demand. */
  const videoFor = useCallback((key: string, sourceId: string): HTMLVideoElement | null => {
    let el = videos.current.get(key)
    if (el) return el
    const url = urlFor(sourceId)
    if (!url) return null
    el = document.createElement('video')
    el.muted = true
    el.playsInline = true
    el.preload = 'auto'
    el.src = url
    el.addEventListener('seeked', () => { if (!clock.current) draw() })
    el.addEventListener('loadeddata', () => { if (!clock.current) draw() })
    videos.current.set(key, el)
    return el
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFor])

  const pictureOf = (el: HTMLVideoElement | null): FramePicture | null =>
    el && el.readyState >= 2 && el.videoWidth > 0 ? { image: el, width: el.videoWidth, height: el.videoHeight } : null

  const draw = useCallback((tOverride?: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const p = projectRef.current
    const t = tOverride ?? currentTime()
    const sample = sampleProject(p, t)
    composeProjectFrame({
      ctx, width: canvas.width, height: canvas.height, project: p, sample, t,
      frameOf: (c) => pictureOf(videos.current.get(c.clip.id) ?? null),
      overlayOf: (ov) => {
        const m = mediaRef.current.get(ov.sourceId)
        if (m?.kind === 'image') return { image: m.image, width: m.width, height: m.height }
        return pictureOf(videos.current.get(ov.id) ?? null)
      },
      fill: outputRef.current.fill,
      watermark: outputRef.current.watermark,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef])

  const currentTime = (): number => {
    const c = clock.current
    return c ? c.from + (performance.now() - c.start) / 1000 : playheadRef.current
  }
  const playheadRef = useRef(playhead)
  playheadRef.current = playhead

  /** Bring every clip/overlay video to where it should be at t. */
  const syncVideos = useCallback((t: number, isPlaying: boolean) => {
    const p = projectRef.current
    const sample = sampleProject(p, t)
    const active = new Set<string>()
    for (const s of [sample.primary, sample.outgoing]) {
      if (!s) continue
      const el = videoFor(s.clip.id, s.clip.sourceId)
      if (!el) continue
      active.add(s.clip.id)
      el.playbackRate = s.clip.speed
      if (isPlaying) {
        if (Math.abs(el.currentTime - s.sourceTime) > DRIFT_SEC) el.currentTime = s.sourceTime
        if (el.paused) void el.play().catch(() => { /* autoplay policy: muted, so rare */ })
      } else if (Math.abs(el.currentTime - s.sourceTime) > 1 / 120) {
        el.currentTime = s.sourceTime
      }
    }
    // Pre-roll the clips about to start so the cut lands on a decoded frame.
    for (const placed of layoutClips(p)) {
      if (active.has(placed.clip.id)) continue
      const el = videoFor(placed.clip.id, placed.clip.sourceId)
      if (!el) continue
      if (!el.paused) el.pause()
      if (placed.start > t && placed.start - t < PREROLL_SEC && Math.abs(el.currentTime - placed.clip.inSec) > 0.05) {
        el.currentTime = placed.clip.inSec
      }
    }
    for (const ov of p.overlays) {
      if (mediaRef.current.get(ov.sourceId)?.kind !== 'video') continue
      const el = videoFor(ov.id, ov.sourceId)
      if (!el) continue
      const on = t >= ov.startSec && t <= ov.endSec
      const target = overlayTime(ov, t) % Math.max(0.1, el.duration || Infinity)
      if (on && isPlaying) {
        if (Math.abs(el.currentTime - target) > DRIFT_SEC) el.currentTime = target
        if (el.paused) void el.play().catch(() => { /* muted */ })
      } else {
        if (!el.paused) el.pause()
        if (on && Math.abs(el.currentTime - target) > 1 / 60) el.currentTime = target
      }
    }
  }, [videoFor])

  // ── Audio ──────────────────────────────────────────────────────────────────

  const stopAudio = useCallback(() => {
    const a = audio.current
    audio.current = null
    if (!a) return
    try { a.src.stop() } catch { /* not started */ }
    void a.ctx.close().catch(() => { /* closed */ })
  }, [])

  const startAudio = useCallback(async () => {
    const p = projectRef.current
    if (p.audio.kind !== 'builtin' || !p.audio.trackId) return
    const ctx = new AudioContext()
    const bed = await getBuiltInBed(p.audio.trackId as Parameters<typeof getBuiltInBed>[0], ctx.sampleRate)
    if (!clock.current) { void ctx.close(); return }
    const duration = projectDuration(p)
    const src = ctx.createBufferSource()
    src.buffer = bed
    src.loop = true
    const gain = ctx.createGain()
    src.connect(gain)
    gain.connect(ctx.destination)
    // The clock may have moved while the bed was generating.
    const now = currentTime()
    scheduleAudioEnvelope(gain.gain, p.audio, duration, ctx.currentTime, now)
    src.start(ctx.currentTime, (resolveAudioOffset(p.audio, bed.duration) + now) % bed.duration)
    audio.current = { ctx, src }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Transport ──────────────────────────────────────────────────────────────

  const pause = useCallback(() => {
    if (!clock.current) return
    const t = currentTime()
    clock.current = null
    cancelAnimationFrame(raf.current)
    for (const el of videos.current.values()) el.pause()
    stopAudio()
    setPlaying(false)
    setPlayhead(Math.min(t, projectDuration(projectRef.current)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPlayhead, stopAudio])

  const play = useCallback(() => {
    const total = projectDuration(projectRef.current)
    if (total <= 0) return
    const from = playheadRef.current >= total - 0.05 ? 0 : playheadRef.current
    clock.current = { start: performance.now(), from }
    setPlaying(true)
    void startAudio()
    let lastUi = 0
    const tick = (now: number) => {
      const t = currentTime()
      if (t >= total) {
        pause()
        setPlayhead(total)
        return
      }
      syncVideos(t, true)
      draw(t)
      // Keep React's playhead roughly current without re-rendering at 60 Hz.
      if (now - lastUi > 80) { lastUi = now; setPlayhead(t) }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, pause, setPlayhead, startAudio, syncVideos])

  const toggle = useCallback(() => (clock.current ? pause() : play()), [pause, play])

  // Paused: follow the playhead and every edit.
  useEffect(() => {
    if (clock.current) return
    syncVideos(playhead, false)
    draw(playhead)
  }, [playhead, project, output, media, syncVideos, draw])

  // Drop videos for clips that no longer exist.
  useEffect(() => {
    const keep = new Set([...project.clips.map((c) => c.id), ...project.overlays.map((o) => o.id)])
    for (const [key, el] of videos.current) {
      if (!keep.has(key)) { el.pause(); el.removeAttribute('src'); el.load(); videos.current.delete(key) }
    }
  }, [project])

  useEffect(() => () => {
    cancelAnimationFrame(raf.current)
    stopAudio()
    for (const el of videos.current.values()) { el.pause(); el.removeAttribute('src'); el.load() }
    videos.current.clear()
    for (const url of urls.current.values()) URL.revokeObjectURL(url)
    urls.current.clear()
  }, [stopAudio])

  return { playing, play, pause, toggle, redraw: draw }
}
