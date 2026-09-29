// ─── Sound → clip — the song decides the edit ─────────────────────────────────
// In a TikTok the sound comes first: the hook plays on the build-up, the
// reveal lands on the drop, the rest rides the bars after it, and the video
// ends on a bar line so it loops. So when a clip starts from a sound, its
// length, its cut points and its peak all come from the sound's beat grid.
//
// Also a small memory of sounds already analysed (by TikTok sound id, in this
// browser only), so the second clip on a trending sound skips the listening.

import { projectRhythm, type MusicMeta } from './music-analysis'
import { layoutClips, snapCutsToBeats, trimClipEdge, type EditProject } from './project'
import type { SoundLink } from './tiktok-link'
import { beatCaptions } from './beat-captions'
import { applyTemplate, type TemplateContext, type TemplateId } from './viral-templates'

/** Seconds in a bar (4 beats). */
export const barSec = (m: MusicMeta) => m.beatSec * 4

export interface SoundCut {
  /** Where in the sound the clip starts, seconds. */
  offsetSec: number
  /** Clip length, seconds — a whole number of bars. */
  durationSec: number
  /** Where the drop lands in the clip, seconds. */
  dropAtSec: number
}

/**
 * The window of the sound the clip uses: two bars of build-up before the drop
 * (the hook — about 3–4 s at TikTok tempos), then whole bars after it until the
 * clip is about `targetSec` long, never running past the end of the sound.
 */
export function cutForSound(m: MusicMeta, targetSec = 15, minSec = 7, maxSec = 30): SoundCut {
  const bar = barSec(m)
  const hookBars = Math.max(0, Math.min(2, Math.floor(m.dropSec / bar + 1e-6)))
  const offsetSec = Math.max(0, m.dropSec - hookBars * bar)
  const available = Math.max(bar, m.durationSec - offsetSec)
  const target = Math.min(Math.max(targetSec, minSec), maxSec, available)
  const bars = Math.max(hookBars + 1, Math.round(target / bar))
  const fitBars = Math.min(bars, Math.floor(available / bar + 1e-6) || 1, Math.floor(maxSec / bar) || 1)
  return { offsetSec, durationSec: fitBars * bar, dropAtSec: m.dropSec - offsetSec }
}

/** Move the drop to where the user clicked, snapped to the nearest beat. */
export function moveDrop(m: MusicMeta, sec: number): MusicMeta {
  const k = Math.round((sec - m.gridOffsetSec) / m.beatSec)
  const dropSec = Math.min(m.durationSec, Math.max(0, m.gridOffsetSec + k * m.beatSec))
  return { ...m, dropSec }
}

/** Peak level per column, 0–1 — enough to draw a waveform strip. */
export function peaks(samples: Float32Array, columns: number): Float32Array {
  const out = new Float32Array(Math.max(1, columns))
  const step = samples.length / out.length
  let max = 0
  for (let c = 0; c < out.length; c++) {
    const from = Math.floor(c * step), to = Math.min(samples.length, Math.floor((c + 1) * step))
    let p = 0
    for (let i = from; i < to; i++) { const v = Math.abs(samples[i]); if (v > p) p = v }
    out[c] = p
    if (p > max) max = p
  }
  if (max > 0) for (let c = 0; c < out.length; c++) out[c] /= max
  return out
}

// ── Remembered sounds ──────────────────────────────────────────────────────────

const KEY = 'ifc-studio-sounds-v1'
const MAX_REMEMBERED = 40

export interface RememberedSound { link: SoundLink; music: MusicMeta; at: number }

/** TikTok's numeric id of a sound or video, the stable part of any of its links. */
export function soundKey(link: SoundLink): string {
  return link.url.match(/(\d{15,})/)?.[1] ?? link.url
}

function readAll(): Record<string, RememberedSound> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, RememberedSound> } catch { return {} }
}

export function recallSound(link: SoundLink): RememberedSound | null {
  return readAll()[soundKey(link)] ?? null
}

export function rememberSound(link: SoundLink, music: MusicMeta): void {
  try {
    const all = readAll()
    all[soundKey(link)] = { link, music, at: Date.now() }
    const kept = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_REMEMBERED)
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch { /* private mode: nothing remembered, nothing broken */ }
}

/** Most recent first — the user's own "recent sounds" shelf. */
export function recentSounds(): RememberedSound[] {
  return Object.values(readAll()).sort((a, b) => b.at - a.at)
}

// ── Finishing a generated clip to its sound ────────────────────────────────────

/**
 * Take the shots the director rendered (already cut on this beat) and make
 * them THIS sound's clip:
 *   1. play the chosen window of the sound (`cut`);
 *   2. apply the style (template);
 *   3. put the cut nearest the drop exactly ON the drop — the reveal hits
 *      with the song;
 *   4. snap the other cuts to the beat, punch in on every bar after the drop;
 *   5. end on the last bar line — for a loop, trimming the tail's START so its
 *      last frame still meets the first.
 */
export function finishSoundClip(project: EditProject, m: MusicMeta, cut: SoundCut, style: TemplateId, ctx: TemplateContext, captionsOnBeat = true): EditProject {
  let p: EditProject = { ...project, audio: { ...project.audio, offsetSec: cut.offsetSec, music: m, fadeSec: 0.05 } }
  const rhythm = projectRhythm(m, cut.offsetSec)
  p = applyTemplate(p, style, { ...ctx, rhythm, dropAt: cut.dropAtSec, targetSec: cut.durationSec })
  p = snapCutsToBeats(p, rhythm, 2)

  // The cut closest to the drop becomes the reveal: slide the SOUND (by whole
  // beats — both sit on the grid) so its drop lands exactly on that cut. Moving
  // the sound, not the picture, never runs out of rendered footage.
  let dropAt = cut.dropAtSec
  const placed = layoutClips(p)
  let near = -1, best = Infinity
  for (let i = 1; i < placed.length; i++) {
    const d = Math.abs(placed[i].start - dropAt)
    if (d < best) { best = d; near = i }
  }
  if (near > 0 && best > 1e-3 && best <= barSec(m) + 1e-3 && m.dropSec - placed[near].start >= 0) {
    dropAt = placed[near].start
    p = { ...p, audio: { ...p.audio, offsetSec: m.dropSec - dropAt } }
  }
  // The clip's end: the whole bars after the drop that come nearest the asked
  // length, and never past the end of the sound.
  const bar = barSec(m)
  const soundLeft = m.durationSec - p.audio.offsetSec
  const barsAfter = Math.max(1, Math.min(Math.round((cut.durationSec - dropAt) / bar), Math.floor((soundLeft - dropAt) / bar + 1e-6)))
  const targetEnd = dropAt + barsAfter * bar
  const window = targetEnd

  // Fill up to it: the style and the beat snap trim shots, so give the time
  // back after the drop, a beat at a time (later cuts stay on the beat).
  const loopTail = style === 'loop' ? p.clips[p.clips.length - 1]?.id : undefined
  p = fillToLength(p, targetEnd, dropAt, m.beatSec, loopTail)

  // End on a bar line within the sound's window. Cuts sit on the beat grid,
  // so the excess is whole beats: take it from the longest shot after the
  // drop, and every later cut stays on the beat.
  const keep = Math.max(0.5, m.beatSec)
  for (let guard = 0; guard < p.clips.length + 2; guard++) {
    const placedNow = layoutClips(p)
    const total = placedNow.reduce((mx, c) => Math.max(mx, c.end), 0)
    // Bar lines count from the drop — the one downbeat we are sure of.
    const bars = Math.max(1, Math.floor((Math.min(total, window) - dropAt) / bar + 1e-6))
    const over = total - (dropAt + bars * bar)
    if (over < 1e-3) break
    const pool = placedNow.filter((c) => c.start >= dropAt - 1e-3 && c.clip.id !== loopTail && c.end - c.start - keep > 1e-3)
    const longest = pool.sort((a, b) => (b.end - b.start) - (a.end - a.start))[0]
    if (!longest) break
    p = trimClipEdge(p, longest.clip.id, 'end', -Math.min(over, longest.end - longest.start - keep))
  }
  if (loopTail) p = reseamLoop(p)

  const end = layoutClips(p).reduce((mx, c) => Math.max(mx, c.end), 0)
  const times: number[] = []
  for (let t = Math.max(0, dropAt); t < end - 1e-3; t += barSec(m)) times.push(t)
  p = { ...p, fx: { ...p.fx, punch: { times, amount: 0.05 } } }
  // 6. Captions word by word, each word on a beat of the (possibly slid) sound.
  return captionsOnBeat ? beatCaptions(p, projectRhythm(m, p.audio.offsetSec)) : p
}

/** Snapping moves out-points; put the loop's tail back so its last frame meets the opener. */
function reseamLoop(p: EditProject): EditProject {
  const opener = p.clips[0], tail = p.clips[p.clips.length - 1]
  if (!opener || !tail || tail === opener || tail.sourceId !== opener.sourceId) return p
  const delta = opener.inSec - tail.outSec
  if (Math.abs(delta) < 1e-6 || tail.inSec + delta < 0) return p
  return { ...p, clips: [...p.clips.slice(0, -1), { ...tail, inSec: tail.inSec + delta, outSec: tail.outSec + delta }] }
}

/** Slowest a shot may be slowed to fill time — below this, motion looks broken. */
export const MIN_FILL_SPEED = 0.6

/**
 * Lengthen the edit to `targetEnd` without moving the drop cut: shots after
 * the drop grow by whole beats — first from footage their source still has
 * (the shortest shot first, so they even out), then, if the footage runs out,
 * by slowing a shot down (never below MIN_FILL_SPEED). A loop's tail grows at
 * its START, so its last frame still meets the opener.
 */
export function fillToLength(project: EditProject, targetEnd: number, dropAt: number, beatSec: number, loopTailId?: string): EditProject {
  let p = project
  if (!(beatSec > 0)) return p
  const sourceLen = new Map(p.sources.map((s) => [s.id, s.durationSec]))
  for (let guard = 0; guard < 400; guard++) {
    const placed = layoutClips(p)
    const total = placed.reduce((mx, c) => Math.max(mx, c.end), 0)
    if (targetEnd - total < 1e-3) break
    const step = Math.min(beatSec, targetEnd - total)
    const after = placed.filter((c) => c.start >= dropAt - 1e-3)
    const room = (c: typeof placed[number]) => {
      const need = step * c.clip.speed
      if (c.clip.id === loopTailId) return c.clip.inSec - need >= -1e-6 ? c.clip.inSec : -1
      const left = (sourceLen.get(c.clip.sourceId) ?? c.clip.outSec) - c.clip.outSec
      return left - need >= -1e-6 ? left : -1
    }
    const grow = after.filter((c) => room(c) >= 0).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
    if (grow) {
      p = trimClipEdge(p, grow.clip.id, grow.clip.id === loopTailId ? 'start' : 'end', grow.clip.id === loopTailId ? -step : step)
      continue
    }
    // Out of footage: slow the fastest shot after the drop by one beat's worth.
    const slow = after
      .filter((c) => c.clip.id !== loopTailId)
      .map((c) => ({ c, speed: (c.clip.outSec - c.clip.inSec) / (c.end - c.start + step) }))
      .filter((x) => x.speed >= MIN_FILL_SPEED - 1e-9)
      .sort((a, b) => b.speed - a.speed)[0]
    if (!slow) break
    p = { ...p, clips: p.clips.map((c) => (c.id === slow.c.clip.id ? { ...c, speed: slow.speed } : c)) }
  }
  return p
}
