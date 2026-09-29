// ─── Viral templates — the formats short-form feeds reward ─────────────────────
// A template does not render anything: it re-shapes the clips the user already
// has (shots of their model) into a format people recognise and finish:
//
//   • loop        — the end flows into the start, so the video replays with no
//                   seam. Rewatches count as watch time; a clean loop is the
//                   cheapest way to push completion past 100 %.
//   • dropReveal  — "wait for it": a teaser hook, a slow build, and the best
//                   shot landing on the drop, then fast cuts.
//   • beforeAfter — two halves with a white flash between, "Before" / "After".
//   • pov         — a relatable first-person line on top for the whole clip.
//   • facts       — "3 things about this building", one real fact per shot.
//
// Pure: EditProject in, EditProject out. Copy comes in as labels so the same
// template works in every language, and facts are only what the model has.

import {
  clipLength, layoutClips, makeId, splitAt,
  type Clip, type EditProject, type Rhythm,
} from './project'
import { createTextOverlay, type NewTextInput } from './timeline'

export type TemplateId = 'loop' | 'dropReveal' | 'beforeAfter' | 'pov' | 'facts'

export const TEMPLATE_IDS: readonly TemplateId[] = ['dropReveal', 'loop', 'beforeAfter', 'pov', 'facts']

export interface TemplateContext {
  /** Beat grid in project time, when the project has music. */
  rhythm: Rhythm | null
  /** Project time of the drop, when known. */
  dropAt: number | null
  /** Length the clip should reach, when a sound sets it (fast cuts share what is left). */
  targetSec?: number
  labels: {
    waitForIt: string
    before: string
    after: string
    pov: string
    /** Real facts about the model, already worded ("12 storeys"). */
    facts: string[]
    factsTitle: string
  }
}

const withClips = (p: EditProject, clips: Clip[]): EditProject => ({ ...p, clips })

const total = (p: EditProject) => layoutClips(p).reduce((m, c) => Math.max(m, c.end), 0)

function addText(p: EditProject, input: NewTextInput): EditProject {
  const text = createTextOverlay(input, Math.max(total(p), 0.5))
  return { ...p, texts: [...p.texts, text] }
}

/** Minimum clips a template needs to make sense. */
export function templateMinClips(id: TemplateId): number {
  return id === 'beforeAfter' || id === 'loop' ? 2 : 1
}

export function applyTemplate(project: EditProject, id: TemplateId, ctx: TemplateContext): EditProject {
  if (project.clips.length < templateMinClips(id)) return project
  switch (id) {
    case 'loop': return makeLoop(project, ctx.rhythm)
    case 'dropReveal': return dropReveal(project, ctx)
    case 'beforeAfter': return beforeAfter(project, ctx)
    case 'pov': return addText(project, { text: ctx.labels.pov, startSec: 0, endSec: total(project), style: 'title', anchor: 'top-center', anim: 'words' })
    case 'facts': return facts(project, ctx)
  }
}

// ── Loop ───────────────────────────────────────────────────────────────────────

/**
 * Seamless loop: cut the first clip's head off and move it to the very end.
 * The video now ENDS on the frames that come right before its first frame, so
 * the replay continues the motion instead of jumping. Fades are removed (a dip
 * to black at the loop point is exactly the seam we are hiding).
 *
 * The head is one bar of the music when there is a beat (so the loop point is
 * on the downbeat), else a third of the first clip.
 */
export function makeLoop(project: EditProject, rhythm: Rhythm | null): EditProject {
  const first = project.clips[0]
  if (!first || project.clips.length < 2) return project
  const len = clipLength(first)
  const bar = rhythm ? rhythm.beatSec * rhythm.beatsPerBar : 0
  const head = bar > 0 && bar < len * 0.6 ? bar : len / 3
  const split = splitAt(project, head)
  if (split.clips.length !== project.clips.length + 1) return project

  const [headClip, rest, ...others] = split.clips
  // The head re-enters the way the rest of the edit cuts; the new opener has nothing before it.
  const joinFrom = others.find((c) => c.transition !== 'cut') ?? others[0]
  const tail: Clip = { ...headClip, id: makeId('clip'), transition: joinFrom?.transition ?? 'cut', transitionSec: joinFrom?.transitionSec ?? headClip.transitionSec }
  const clips: Clip[] = [{ ...rest, transition: 'cut' }, ...others, tail]
  const looped = withClips(split, clips)
  return {
    ...looped,
    intro: { ...looped.intro, type: 'none' },
    outro: { ...looped.outro, type: 'none' },
    audio: { ...looped.audio, fadeSec: Math.min(looped.audio.fadeSec, 0.05) },
  }
}

// ── Drop reveal ────────────────────────────────────────────────────────────────

/**
 * The best shot (the longest, by the user's own edit) moves to where the drop
 * lands; everything before it is the build, captioned "wait for it". Shots
 * after the drop are cut tight: two beats each.
 */
function dropReveal(project: EditProject, ctx: TemplateContext): EditProject {
  const clips = [...project.clips]
  const heroIdx = clips.reduce((b, c, i) => (clipLength(c) > clipLength(clips[b]) ? i : b), 0)
  const [hero] = clips.splice(heroIdx, 1)
  // Build: one shot before the reveal if we have it, so there IS a build.
  const build = clips.splice(0, 1)
  let p = withClips(project, [...build, hero, ...clips])
  const placed = layoutClips(p)
  const revealAt = placed[build.length]?.start ?? 0
  if (ctx.rhythm && placed.length > build.length + 1) {
    // Fast cuts: two beats each — or, when a sound sets the length, an equal
    // share of what is left after the hero, in whole beats (never under two).
    const beat = ctx.rhythm.beatSec
    const after = placed.length - build.length - 1
    const heroEnd = placed[build.length]?.end ?? 0
    const share = ctx.targetSec ? Math.floor((ctx.targetSec - heroEnd) / after / beat) * beat : 0
    const each = Math.max(2 * beat, share)
    p = withClips(p, p.clips.map((c, i) => (i > build.length ? { ...c, outSec: Math.min(c.outSec, c.inSec + each * c.speed) } : c)))
  }
  const hookEnd = Math.max(1, revealAt || Math.min(2, total(p)))
  return addText(p, { text: ctx.labels.waitForIt, startSec: 0, endSec: hookEnd, style: 'title', anchor: 'top-center', anim: 'pop' })
}

// ── Before / after ─────────────────────────────────────────────────────────────

function beforeAfter(project: EditProject, ctx: TemplateContext): EditProject {
  const half = Math.ceil(project.clips.length / 2)
  let p = withClips(project, project.clips.map((c, i) => (i === half ? { ...c, transition: 'dipWhite', transitionSec: 0.3 } : c)))
  const placed = layoutClips(p)
  const cut = placed[half]?.start ?? total(p) / 2
  p = addText(p, { text: ctx.labels.before, startSec: 0, endSec: cut, style: 'badge', anchor: 'top-center', anim: 'pop' })
  return addText(p, { text: ctx.labels.after, startSec: cut, endSec: total(p), style: 'badge', anchor: 'top-center', anim: 'slam' })
}

// ── Facts ──────────────────────────────────────────────────────────────────────

function facts(project: EditProject, ctx: TemplateContext): EditProject {
  const placed = layoutClips(project)
  let p = addText(project, { text: ctx.labels.factsTitle, startSec: 0, endSec: Math.min(2, placed[0]?.end ?? 2), style: 'title', anchor: 'top-center', anim: 'pop' })
  const n = Math.min(ctx.labels.facts.length, placed.length)
  for (let i = 0; i < n; i++) {
    const c = placed[i]
    const start = i === 0 ? Math.min(2, c.end - 0.5) : c.start
    p = addText(p, { text: `${i + 1}/${n} · ${ctx.labels.facts[i]}`, startSec: start, endSec: c.end, style: 'caption', anchor: 'mid-center', anim: 'slideUp' })
  }
  return p
}
