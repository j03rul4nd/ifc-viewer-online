// ─── Edit project — the multi-clip model ───────────────────────────────────────
// A project is a SEQUENCE of clips cut from one or more sources (screen
// captures, rendered 3D shots, imported videos), joined by transitions, with
// overlay tracks (text, images, video) and one music bed on top.
//
// Pure: no DOM, no canvas, no media. The preview, the exporter and the tests
// all ask the same questions of it — "which clips are on screen at t, and how
// far through the transition are we?" — so what plays is what exports.
//
// Time has two frames of reference and the names say which:
//   • project time  — seconds on the output timeline (what the viewer sees)
//   • source time   — seconds inside a source's media
// A clip maps one onto the other with in/out points and a speed.

import type { AudioSelection, TextOverlay, TextAnimId } from './timeline'
import type { ProjectSfx } from './sfx'
import { DEFAULT_AUDIO } from './timeline'

// ── Sources ────────────────────────────────────────────────────────────────────

export type SourceKind = 'capture' | 'shot' | 'import' | 'image'

export interface MediaSource {
  id: string
  kind: SourceKind
  label: string
  /** Seconds of media. Images report the default still duration. */
  durationSec: number
  width: number
  height: number
}

// ── Clips ──────────────────────────────────────────────────────────────────────

/**
 * How two clips meet.
 *   cut        — hard cut, no overlap
 *   crossfade  — the two pictures dissolve into each other (overlaps)
 *   dipBlack / dipWhite — out to a colour, back in (no overlap)
 *   slideLeft / slideUp — the incoming clip pushes the outgoing one (overlaps)
 *   zoom       — outgoing punches in and fades, incoming settles (overlaps)
 *   whip       — fast directional blur-pan, the Reels staple (overlaps)
 */
export type ClipTransition =
  | 'cut' | 'crossfade' | 'dipBlack' | 'dipWhite' | 'slideLeft' | 'slideUp' | 'zoom' | 'whip'

export const CLIP_TRANSITIONS: readonly ClipTransition[] = [
  'cut', 'crossfade', 'dipBlack', 'dipWhite', 'slideLeft', 'slideUp', 'zoom', 'whip',
]

/** Transitions that overlap the two clips in time (and so shorten the project). */
export function overlapsClips(t: ClipTransition): boolean {
  return t === 'crossfade' || t === 'slideLeft' || t === 'slideUp' || t === 'zoom' || t === 'whip'
}

export const MIN_CLIP_SEC = 0.25
export const MIN_SPEED = 0.25
export const MAX_SPEED = 4
export const MAX_TRANSITION_SEC = 1.5
export const DEFAULT_TRANSITION_SEC = 0.4

/**
 * Pan & zoom inside the source frame over the clip's life — the "reframe" that
 * turns a 16:9 capture into a 9:16 shot that follows the subject. cx/cy are the
 * centre of the crop in source-frame fractions; zoom ≥ 1 narrows it.
 */
export interface Framing {
  cx: number
  cy: number
  zoom: number
}

export const CENTER_FRAMING: Framing = { cx: 0.5, cy: 0.5, zoom: 1 }

export interface Clip {
  id: string
  sourceId: string
  /** Source seconds. */
  inSec: number
  outSec: number
  /** Playback rate, MIN_SPEED–MAX_SPEED. */
  speed: number
  /** How this clip is entered from the previous one. Ignored on the first clip. */
  transition: ClipTransition
  transitionSec: number
  /** Reframe at the clip's first and last frame; eased in between. */
  framingFrom: Framing
  framingTo: Framing
  /** Source audio level (0 mutes). Screen captures are silent; imports may not be. */
  volume: number
}

// ── Overlays ───────────────────────────────────────────────────────────────────

/**
 * A picture-in-picture layer: a logo, a photo of the site, a phone recording.
 * Geometry is in output-frame fractions so it survives a change of aspect.
 */
export interface MediaOverlay {
  id: string
  sourceId: string
  /** Project seconds. */
  startSec: number
  endSec: number
  /** Where the overlay's media starts playing (video overlays only). */
  inSec: number
  /** Centre, as fractions of the output frame. */
  x: number
  y: number
  /** Width as a fraction of the output frame width; height follows the media's aspect. */
  width: number
  rotationDeg: number
  opacity: number
  /** Corner radius as a fraction of the overlay's short side. */
  radius: number
  anim: TextAnimId
}

// ── The project ────────────────────────────────────────────────────────────────

export type Fade = { type: 'none' | 'black' | 'white'; sec: number }

export interface EditProject {
  sources: MediaSource[]
  clips: Clip[]
  /** Project-time text cards (same model as the single-clip editor). */
  texts: TextOverlay[]
  overlays: MediaOverlay[]
  audio: AudioSelection
  /** Fade from a colour at the very start / to a colour at the very end. */
  intro: Fade
  outro: Fade
  /** Finishing effects applied to the picture (not to text). */
  fx?: ProjectFx
  /** Sound effects on the timeline (whooshes, hits, risers…). */
  sfx?: ProjectSfx
}

export interface ProjectFx {
  /**
   * Beat punch: at each of these project times the picture jumps in by
   * `amount` (0.06 = 6 %) and eases back — the "hit" launch edits put on cuts
   * and on the beat.
   */
  punch?: { times: number[]; amount: number }
}

/** How long a punch takes to settle back, seconds. */
export const PUNCH_DECAY_SEC = 0.14

/** Picture scale at time t from the beat punches (1 = none). */
export function punchScale(fx: ProjectFx | undefined, t: number): number {
  const p = fx?.punch
  if (!p || p.times.length === 0 || p.amount <= 0) return 1
  // Latest punch at or before t (times are sorted).
  let lo = 0, hi = p.times.length - 1, at = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (p.times[mid] <= t) { at = mid; lo = mid + 1 } else hi = mid - 1
  }
  if (at < 0) return 1
  const dt = t - p.times[at]
  return dt > PUNCH_DECAY_SEC * 5 ? 1 : 1 + p.amount * Math.exp(-dt / PUNCH_DECAY_SEC)
}

export function createProject(): EditProject {
  return {
    sources: [], clips: [], texts: [], overlays: [],
    audio: { ...DEFAULT_AUDIO },
    intro: { type: 'none', sec: 0.4 },
    outro: { type: 'none', sec: 0.4 },
  }
}

export function makeId(prefix = 'c'): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`
  } catch {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
  }
}

export function sourceById(project: EditProject, id: string): MediaSource | undefined {
  return project.sources.find((s) => s.id === id)
}

/** A clip covering the whole of `source`. */
export function createClip(source: MediaSource, over: Partial<Clip> = {}): Clip {
  return {
    id: makeId('clip'),
    sourceId: source.id,
    inSec: 0,
    outSec: source.durationSec,
    speed: 1,
    transition: 'cut',
    transitionSec: DEFAULT_TRANSITION_SEC,
    framingFrom: { ...CENTER_FRAMING },
    framingTo: { ...CENTER_FRAMING },
    volume: source.kind === 'import' ? 1 : 0,
    ...over,
  }
}

// ── Layout: where each clip sits on the output timeline ────────────────────────

/** Seconds a clip occupies on the output timeline. */
export function clipLength(c: Clip): number {
  return Math.max(0, c.outSec - c.inSec) / clampSpeed(c.speed)
}

export interface PlacedClip {
  clip: Clip
  index: number
  /** Project seconds. */
  start: number
  end: number
  /** Effective (clamped) length of the transition INTO this clip. */
  transitionSec: number
}

/**
 * Transition length actually used between two clips: never more than half of
 * either neighbour, so a transition can't swallow a clip or overlap a second
 * one. A 'cut' is always zero.
 */
export function effectiveTransitionSec(prev: Clip, next: Clip): number {
  if (next.transition === 'cut') return 0
  const cap = Math.min(clipLength(prev), clipLength(next)) / 2
  return clamp(next.transitionSec, 0, Math.min(MAX_TRANSITION_SEC, cap))
}

/** Every clip with its project start/end. Overlapping transitions pull the next clip earlier. */
export function layoutClips(project: EditProject): PlacedClip[] {
  const out: PlacedClip[] = []
  let cursor = 0
  project.clips.forEach((clip, index) => {
    const prev = project.clips[index - 1]
    const trans = prev ? effectiveTransitionSec(prev, clip) : 0
    const start = prev && overlapsClips(clip.transition) ? cursor - trans : cursor
    const end = start + clipLength(clip)
    out.push({ clip, index, start, end, transitionSec: trans })
    cursor = end
  })
  return out
}

export function projectDuration(project: EditProject): number {
  const placed = layoutClips(project)
  return placed.length ? placed[placed.length - 1].end : 0
}

// ── Sampling: what is on screen at project time t ─────────────────────────────

export interface ClipSample {
  clip: Clip
  /** Source seconds to show. */
  sourceTime: number
  /** 0–1 through the clip, for framing interpolation. */
  progress: number
  framing: Framing
}

export interface FrameSample {
  /** The clip being entered (or the only clip). */
  primary: ClipSample | null
  /** The clip being left, during an overlapping transition. */
  outgoing: ClipSample | null
  /** Active transition between outgoing and primary. */
  transition: ClipTransition
  /** 0 → just started, 1 → complete. */
  transitionProgress: number
  /** Solid colour over the frame (dip transitions, intro/outro fades). */
  cover: { amount: number; color: string }
}

function sampleClip(p: PlacedClip, t: number): ClipSample {
  const local = clamp(t - p.start, 0, p.end - p.start)
  const len = Math.max(1e-6, p.end - p.start)
  const progress = local / len
  const sourceTime = clamp(p.clip.inSec + local * clampSpeed(p.clip.speed), p.clip.inSec, p.clip.outSec)
  return { clip: p.clip, sourceTime, progress, framing: interpolateFraming(p.clip.framingFrom, p.clip.framingTo, progress) }
}

const DIP_COLOR: Partial<Record<ClipTransition, string>> = { dipBlack: '#000000', dipWhite: '#ffffff' }

export function sampleProject(project: EditProject, t: number): FrameSample {
  const placed = layoutClips(project)
  const empty: FrameSample = { primary: null, outgoing: null, transition: 'cut', transitionProgress: 1, cover: { amount: 0, color: '#000000' } }
  if (!placed.length) return empty

  const total = placed[placed.length - 1].end
  const time = clamp(t, 0, Math.max(0, total - 1e-6))

  // Latest clip that has started — during an overlap that's the incoming one.
  let idx = placed.length - 1
  for (let i = 0; i < placed.length; i++) {
    if (time < placed[i].start) { idx = i - 1; break }
  }
  idx = Math.max(0, idx)
  const cur = placed[idx]
  const prev = placed[idx - 1]
  const sample: FrameSample = { ...empty, primary: sampleClip(cur, time) }

  // Overlapping transition: previous clip still on screen.
  if (prev && overlapsClips(cur.clip.transition) && cur.transitionSec > 0 && time < prev.end) {
    sample.outgoing = sampleClip(prev, time)
    sample.transition = cur.clip.transition
    sample.transitionProgress = clamp((time - cur.start) / cur.transitionSec, 0, 1)
  }

  // Dip transitions: fade the tail of the previous clip and the head of this one.
  let cover = 0
  let color = '#000000'
  // A dip is centred on the join: full colour exactly at the incoming clip's start.
  const dipInto = (incoming: PlacedClip | undefined): void => {
    if (!incoming || incoming.index === 0) return
    const dipColor = DIP_COLOR[incoming.clip.transition]
    if (!dipColor || incoming.transitionSec <= 0) return
    const half = incoming.transitionSec / 2
    const d = Math.abs(time - incoming.start)
    if (d < half) {
      const amt = 1 - d / half
      if (amt > cover) { cover = amt; color = dipColor }
    }
  }
  dipInto(cur)
  dipInto(placed[idx + 1])

  // Project intro / outro fades.
  const fadeCover = (f: Fade, distance: number): void => {
    if (f.type === 'none' || f.sec <= 0) return
    const amt = clamp(1 - distance / f.sec, 0, 1)
    if (amt > cover) { cover = amt; color = f.type === 'white' ? '#ffffff' : '#000000' }
  }
  fadeCover(project.intro, time)
  fadeCover(project.outro, total - time)

  sample.cover = { amount: cover, color }
  return sample
}

// ── Framing ────────────────────────────────────────────────────────────────────

export function interpolateFraming(a: Framing, b: Framing, p: number): Framing {
  const e = easeInOut(clamp(p, 0, 1))
  return {
    cx: a.cx + (b.cx - a.cx) * e,
    cy: a.cy + (b.cy - a.cy) * e,
    zoom: a.zoom + (b.zoom - a.zoom) * e,
  }
}

/**
 * The source rectangle a framing shows, for an output of `outAspect`
 * (width/height). The crop keeps the output aspect, is as large as the source
 * allows at zoom 1, and never leaves the source frame — a pan that would show
 * past the edge slides back in instead.
 */
export function framingRect(
  f: Framing, srcW: number, srcH: number, outAspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const zoom = Math.max(1, f.zoom)
  let sw = srcW
  let sh = srcW / outAspect
  if (sh > srcH) { sh = srcH; sw = srcH * outAspect }
  sw /= zoom
  sh /= zoom
  const sx = clamp(f.cx * srcW - sw / 2, 0, srcW - sw)
  const sy = clamp(f.cy * srcH - sh / 2, 0, srcH - sh)
  return { sx, sy, sw, sh }
}

// ── Editing operations (all return a new project) ─────────────────────────────

function withClips(project: EditProject, clips: Clip[]): EditProject {
  return { ...project, clips }
}

export function addSource(project: EditProject, source: MediaSource, appendClip = true): EditProject {
  const sources = [...project.sources.filter((s) => s.id !== source.id), source]
  const clips = appendClip ? [...project.clips, createClip(source)] : project.clips
  return { ...project, sources, clips }
}

/** Where on the output timeline is `t` inside clip `index`, in source seconds. */
export function projectToSource(project: EditProject, index: number, t: number): number | null {
  const p = layoutClips(project)[index]
  if (!p || t < p.start || t > p.end) return null
  return p.clip.inSec + (t - p.start) * clampSpeed(p.clip.speed)
}

/** Index of the clip under the playhead (the incoming one during an overlap). */
export function clipIndexAt(project: EditProject, t: number): number {
  const placed = layoutClips(project)
  let found = -1
  for (const p of placed) if (t >= p.start && t < p.end) found = p.index
  return found
}

/**
 * Split the clip under the playhead into two at `t` — the "S" of every editor.
 * The right half starts with a cut and keeps the original's end framing.
 */
export function splitAt(project: EditProject, t: number): EditProject {
  const index = clipIndexAt(project, t)
  if (index < 0) return project
  const clip = project.clips[index]
  const at = projectToSource(project, index, t)
  if (at === null) return project
  if (at - clip.inSec < MIN_CLIP_SEC || clip.outSec - at < MIN_CLIP_SEC) return project

  const mid = interpolateFraming(clip.framingFrom, clip.framingTo, (at - clip.inSec) / (clip.outSec - clip.inSec))
  const left: Clip = { ...clip, outSec: at, framingTo: mid }
  const right: Clip = { ...clip, id: makeId('clip'), inSec: at, transition: 'cut', framingFrom: mid }
  const clips = [...project.clips]
  clips.splice(index, 1, left, right)
  return withClips(project, clips)
}

/** Remove a clip and close the gap (ripple delete). */
export function removeClip(project: EditProject, clipId: string): EditProject {
  return withClips(project, project.clips.filter((c) => c.id !== clipId))
}

export function moveClip(project: EditProject, clipId: string, toIndex: number): EditProject {
  const from = project.clips.findIndex((c) => c.id === clipId)
  if (from < 0) return project
  const clips = [...project.clips]
  const [c] = clips.splice(from, 1)
  clips.splice(clamp(Math.round(toIndex), 0, clips.length), 0, c)
  return withClips(project, clips)
}

export function duplicateClip(project: EditProject, clipId: string): EditProject {
  const i = project.clips.findIndex((c) => c.id === clipId)
  if (i < 0) return project
  const clips = [...project.clips]
  clips.splice(i + 1, 0, { ...project.clips[i], id: makeId('clip'), transition: 'cut' })
  return withClips(project, clips)
}

/** Patch one clip, then re-clamp it against its source. */
export function updateClip(project: EditProject, clipId: string, patch: Partial<Clip>): EditProject {
  return withClips(project, project.clips.map((c) => {
    if (c.id !== clipId) return c
    const src = sourceById(project, c.sourceId)
    return clampClip({ ...c, ...patch }, src?.durationSec ?? Infinity)
  }))
}

export function clampClip(c: Clip, sourceDuration: number): Clip {
  const dur = Number.isFinite(sourceDuration) ? sourceDuration : c.outSec
  const speed = clampSpeed(c.speed)
  const inSec = clamp(c.inSec, 0, Math.max(0, dur - MIN_CLIP_SEC))
  const outSec = clamp(c.outSec, inSec + MIN_CLIP_SEC, dur)
  return {
    ...c,
    speed,
    inSec,
    outSec,
    transitionSec: clamp(c.transitionSec, 0, MAX_TRANSITION_SEC),
    volume: clamp(c.volume, 0, 1),
    framingFrom: clampFraming(c.framingFrom),
    framingTo: clampFraming(c.framingTo),
  }
}

function clampFraming(f: Framing): Framing {
  return { cx: clamp(f.cx, 0, 1), cy: clamp(f.cy, 0, 1), zoom: clamp(f.zoom, 1, 4) }
}

/**
 * Trim a clip's edge by dragging it on the timeline. `edge` 'start' moves the
 * in-point, 'end' the out-point; `deltaProjectSec` is in output seconds and is
 * converted through the clip's speed.
 */
export function trimClipEdge(project: EditProject, clipId: string, edge: 'start' | 'end', deltaProjectSec: number): EditProject {
  const c = project.clips.find((x) => x.id === clipId)
  if (!c) return project
  const delta = deltaProjectSec * clampSpeed(c.speed)
  return updateClip(project, clipId, edge === 'start' ? { inSec: c.inSec + delta } : { outSec: c.outSec + delta })
}

/** Apply one transition to every join — the "apply to all" button. */
export function setAllTransitions(project: EditProject, transition: ClipTransition, sec = DEFAULT_TRANSITION_SEC): EditProject {
  return withClips(project, project.clips.map((c, i) => (i === 0 ? c : { ...c, transition, transitionSec: sec })))
}

// ── Rhythm ─────────────────────────────────────────────────────────────────────

/** Beat grid of a music bed: a beat length and how many beats make a bar. */
export interface Rhythm {
  beatSec: number
  beatsPerBar: number
  /** Where the first downbeat falls in the bed, seconds. */
  offsetSec: number
}

/** Beat times from 0 to `duration`. With `every` = 4, bar downbeats only. */
export function beatTimes(r: Rhythm, duration: number, every = 1): number[] {
  const step = r.beatSec * Math.max(1, every)
  if (!(step > 0)) return []
  const out: number[] = []
  for (let t = r.offsetSec; t <= duration + 1e-6; t += step) if (t >= 0) out.push(round3(t))
  return out
}

/**
 * Re-time the cuts so each clip boundary lands on a beat — cutting on the
 * music is most of what makes a short edit feel "produced". Each clip keeps
 * its in-point and speed; its out-point moves to the nearest beat at least
 * `minBeats` beats long, as far as its source allows.
 */
export function snapCutsToBeats(project: EditProject, r: Rhythm, minBeats = 2): EditProject {
  if (!(r.beatSec > 0) || project.clips.length === 0) return project
  let next = project
  for (let i = 0; i < next.clips.length; i++) {
    const placed = layoutClips(next)[i]
    const c = placed.clip
    const src = sourceById(next, c.sourceId)
    const maxLen = ((src?.durationSec ?? c.outSec) - c.inSec) / clampSpeed(c.speed)
    const nextClip = next.clips[i + 1]
    // For an overlapping transition the NEXT clip starts `trans` before this
    // end; aim that start at the beat instead.
    const lead = nextClip && overlapsClips(nextClip.transition) ? Math.min(nextClip.transitionSec, MAX_TRANSITION_SEC) : 0
    const wantedEnd = placed.end - lead
    let beat = Math.max(placed.start + minBeats * r.beatSec, nearestBeat(wantedEnd, r))
    // The nearest beat may need more source than there is — fall back to the
    // last beat the source can still reach, rather than stopping between beats.
    const latest = placed.start + maxLen - lead
    if (beat > latest + 1e-9) beat = floorBeat(latest, r)
    const newLen = clamp(beat + lead - placed.start, MIN_CLIP_SEC, maxLen)
    next = updateClip(next, c.id, { outSec: c.inSec + newLen * clampSpeed(c.speed) })
  }
  return next
}

function nearestBeat(t: number, r: Rhythm): number {
  return r.offsetSec + Math.round((t - r.offsetSec) / r.beatSec) * r.beatSec
}

function floorBeat(t: number, r: Rhythm): number {
  return r.offsetSec + Math.floor((t - r.offsetSec) / r.beatSec + 1e-9) * r.beatSec
}

// ── Overlays ───────────────────────────────────────────────────────────────────

export function createMediaOverlay(sourceId: string, startSec: number, duration: number, over: Partial<MediaOverlay> = {}): MediaOverlay {
  return {
    id: makeId('ov'),
    sourceId,
    startSec,
    endSec: startSec + duration,
    inSec: 0,
    x: 0.78, y: 0.2, width: 0.32,
    rotationDeg: 0, opacity: 1, radius: 0.08,
    anim: 'pop',
    ...over,
  }
}

export function overlaysAt(project: EditProject, t: number): MediaOverlay[] {
  return project.overlays.filter((o) => t >= o.startSec && t <= o.endSec)
}

/** Keep overlays and text cards inside the (possibly shorter) project. */
export function clampTracks(project: EditProject): EditProject {
  const total = projectDuration(project)
  const fit = <T extends { startSec: number; endSec: number }>(o: T): T | null => {
    if (o.startSec >= total) return null
    return { ...o, endSec: Math.min(o.endSec, total) }
  }
  return {
    ...project,
    texts: project.texts.map(fit).filter((x): x is TextOverlay => x !== null),
    overlays: project.overlays.map(fit).filter((x): x is MediaOverlay => x !== null),
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function clampSpeed(s: number): number {
  return clamp(Number.isFinite(s) ? s : 1, MIN_SPEED, MAX_SPEED)
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
