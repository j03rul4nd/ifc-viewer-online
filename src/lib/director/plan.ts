// ─── Presentation planner — recipe + model facts → a shot list ────────────────
// Pure: no viewer, no stores, no i18n. Given what the model REALLY contains
// (bounds, storeys, systems, validation findings, the recorded tour) and a
// recipe, decide every shot, how long it lasts, what the scene shows during it
// (which models, which elements isolated or highlighted) and every caption.
// The renderer then just executes the plan, so the whole creative logic is
// unit-testable and identical for one model or a batch of fifty.

import { defaultShot, type Bounds, type CameraPose, type ShotSpec, type ShotType, type Vec3 } from '../capture/shots'
import type { ClipTransition } from '../capture/project'
import { WORD_STEP_SEC, type TextAnchor, type TextAnimId, type TextStyleId } from '../capture/timeline'
import { cueAt, type ProjectSfx, type SfxCue } from '../capture/sfx'
import { PACE_SHOT_SEC, type CaptionLook, type Recipe, type SectionKind } from './recipe'

// ── Input ──────────────────────────────────────────────────────────────────────

export interface Box { min: Vec3; max: Vec3 }

/** Something a shot can be about: a storey, a system, a group of issues. */
export interface Subject {
  key: string
  label: string
  count: number
  modelId: string
  ids: number[]
  box: Box
  severity?: 'error' | 'warning' | 'info'
  /** Extra lines for a review video: affected elements, how to fix, status. */
  detail?: string[]
  /** A recorded camera for this subject (BCF viewpoints). */
  pose?: CameraPose
}

export interface ModelFacts {
  modelId: string
  name: string
  bounds: Bounds
  elementCount: number
  /** Health Score, null when validation has not run. */
  score: number | null
  /** Bottom to top. */
  storeys: Subject[]
  systems: Subject[]
  /** Worst first. */
  issues: Subject[]
  /** Group the model belongs to (the IFC project it is part of). */
  group?: string
  /** Failed IDS specifications. */
  ids?: Subject[]
  /** BCF topics with a viewpoint. */
  bcf?: Subject[]
  /** Findings of the previous validation run that are gone now. */
  fixed?: Subject[]
  /** Health Score of the previous run, when there is one. */
  scoreBefore?: number | null
}

export interface TourStop {
  pose: CameraPose
  /** Aspect of the screen the stop was framed on (default 16:9). */
  aspect?: number
  caption?: string
  highlight?: { modelId?: string; ids: number[]; severity?: 'error' | 'warning' | 'info' }
}

export interface SceneFacts {
  models: ModelFacts[]
  tour: TourStop[]
  /** The element selected in the viewer, for the 'detail' section. */
  detail: Subject | null
}

/** Localised wording the planner needs — the UI builds it from i18n. */
export interface PlanStrings {
  stats: (elements: number, storeys: number) => string
  score: (score: number) => string
  system: (label: string, count: number) => string
  issue: (label: string, count: number) => string
  tourStop: (index: number) => string
  together: string
  ids?: (label: string, count: number) => string
  fixed?: (label: string, count: number) => string
  fixedSummary?: (resolved: number, before: number | null, after: number | null) => string
}

export interface Rhythm { beatSec: number }

// ── Output ─────────────────────────────────────────────────────────────────────

/** What the 3D scene shows while a shot renders. */
export interface ShotScene {
  /** Only these models visible; undefined = leave all visible. */
  visibleModels?: string[]
  /** Only these elements visible. */
  isolate?: { modelId: string; ids: number[] }[]
  /**
   * Cumulative stages shown over the shot, in order: at progress p the first
   * ceil(p·n) stages are visible and nothing else (storeys appearing).
   */
  stages?: { modelId: string; ids: number[] }[][]
  /** Elements painted with the overlay colours, the rest ghosted. */
  highlight?: { modelId?: string; ids: number[]; severity: 'error' | 'warning' | 'info' }[]
}

export interface PlannedShot {
  section: SectionKind
  shot: ShotSpec
  /** Media-bin label. */
  label: string
  /** Lower-third over this shot, if any. */
  caption?: string
  /** Detail lines under the caption (review videos). */
  details?: string[]
  scene: ShotScene
}

export interface PlannedText {
  anim: TextAnimId
  text: string
  startSec: number
  endSec: number
  style: TextStyleId
  anchor: TextAnchor
}

export interface PlannedClip {
  /** Model this clip is about (the first one for combined/sequence clips). */
  modelId: string
  title: string
  width: number
  height: number
  shots: PlannedShot[]
  texts: PlannedText[]
  transition: ClipTransition
  transitionSec: number
  /** Project length once the transitions overlap. */
  durationSec: number
  /** Picture punches (launch style): project times, amount. */
  punch?: { times: number[]; amount: number }
  /** Motion-blur sub-frames per rendered frame (1 = off). */
  motionBlur: number
  /** Sound effects placed on the cut (none when the recipe has them off). */
  sfx?: ProjectSfx
}

/** Launch grammar: which moves get a speed ramp (reveals keep their ease-out). */
const RAMPED: readonly ShotType[] = ['orbit', 'focus', 'flyby', 'crane', 'topDown']
/** How hard a cut punches in. */
export const PUNCH_AMOUNT = 0.055

export const FORMAT_SIZE: Record<Recipe['format'], { width: number; height: number }> = {
  wide: { width: 1920, height: 1080 },
  linkedin: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  reel: { width: 1080, height: 1920 },
  tiktok: { width: 1080, height: 1920 },
}

/** How a recipe's captions look — one choice instead of five. */
export const CAPTION_LOOKS: Record<CaptionLook, { title: TextStyleId; subtitle: TextStyleId; label: TextStyleId; cta: TextStyleId; anim: TextAnimId; stats: boolean }> = {
  clean:   { title: 'title', subtitle: 'subtitle', label: 'lowerThird', cta: 'caption', anim: 'fade', stats: true },
  bold:    { title: 'title', subtitle: 'badge', label: 'badge', cta: 'badge', anim: 'pop', stats: true },
  minimal: { title: 'subtitle', subtitle: 'caption', label: 'caption', cta: 'caption', anim: 'fade', stats: false },
}

/** Only a score worth showing is shown — the same bar as the client badge. */
export const PRESENTABLE_SCORE = 70

// ── Entry point ────────────────────────────────────────────────────────────────

/**
 * One clip, or one per model for the 'separate' mode. Models without bounds
 * are skipped; no models → no clips.
 */
export function planPresentation(recipe: Recipe, facts: SceneFacts, strings: PlanStrings, rhythm: Rhythm | null): PlannedClip[] {
  const models = facts.models.filter((m) => isUsable(m.bounds))
  if (models.length === 0) return []
  const { width, height } = FORMAT_SIZE[recipe.format]
  const aspect = width / height
  const beat = recipe.onBeat && recipe.music !== 'none' ? rhythm : null
  const transition: ClipTransition = recipe.transition
  const overlap = transition === 'cut' ? 0 : recipe.transitionSec

  const build = (drafts: Draft[], subject: ModelFacts, title: string, allModels: ModelFacts[]): PlannedClip => {
    const fitted = fitDrafts(drafts, recipe, overlap, beat)
    const shots = fitted.map((d) => d.shot)
    const starts: number[] = []
    let at = 0
    for (let i = 0; i < shots.length; i++) {
      starts.push(at)
      at += shots[i].shot.durationSec - (i < shots.length - 1 ? overlap : 0)
    }
    const durationSec = at
    const texts = recipe.captions.enabled ? planTexts(recipe, shots, starts, overlap, subject, allModels, title, strings) : []
    const launch = recipe.style === 'launch'
    return {
      modelId: subject.modelId, title, width, height, shots, texts, transition, transitionSec: overlap, durationSec,
      ...(launch ? { punch: { times: punchTimes(starts, overlap, beat, durationSec), amount: PUNCH_AMOUNT } } : {}),
      // Fast launch cuts get a real shutter; calmer ones stay crisp (and 3× cheaper).
      motionBlur: launch && recipe.pace === 'fast' ? 3 : 1,
      ...(recipe.sfx && recipe.sfx !== 'off' ? { sfx: planSfx(recipe.sfx, shots, starts, overlap, texts, durationSec) } : {}),
    }
  }

  if (recipe.multiModel === 'separate' || models.length === 1) {
    return models.map((m) => {
      const title = titleFor(recipe, m.name)
      return build(sectionDrafts(recipe, recipe.sections, m, facts, aspect, strings, undefined), m, title, [m])
    })
  }

  const combined = combine(models)
  if (recipe.multiModel === 'combined') {
    const title = titleFor(recipe, combined.name)
    return [build(sectionDrafts(recipe, recipe.sections, combined, facts, aspect, strings, undefined), combined, title, models)]
  }

  if (recipe.multiModel === 'groups') {
    // Each project (group of discipline models) on its own, then all projects together.
    const groups = groupModels(models)
    if (groups.length > 1) {
      const perGroup = recipe.sections.filter((s) => s !== 'closing' && s !== 'tour')
      const drafts: Draft[] = []
      for (const g of groups) {
        const gm = { ...combine(g.models), name: g.name }
        const own = sectionDrafts(recipe, perGroup, gm, facts, aspect, strings, g.models.map((m) => m.modelId))
        if (own[0]) own[0] = { ...own[0], shot: { ...own[0].shot, caption: g.name } }
        drafts.push(...own)
      }
      const everything = { ...combined, name: federationName(groups.map((g) => g.name)) }
      const finale = sectionDrafts(recipe, ['orbit', ...(recipe.sections.includes('closing') ? ['closing' as const] : [])], everything, facts, aspect, strings, undefined)
      if (finale[0]) finale[0] = { ...finale[0], shot: { ...finale[0].shot, caption: strings.together } }
      drafts.push(...finale)
      return [build(drafts, everything, titleFor(recipe, everything.name), models)]
    }
  }

  // 'sequence': each model on its own (the others hidden), then everything together.
  const perModel = recipe.sections.filter((s) => s !== 'closing' && s !== 'tour')
  const drafts: Draft[] = []
  for (const m of models) {
    const own = sectionDrafts(recipe, perModel, m, facts, aspect, strings, [m.modelId])
    // A model's first shot carries its name, so the audience knows which one this is.
    if (own[0]) own[0] = { ...own[0], shot: { ...own[0].shot, caption: m.name } }
    drafts.push(...own)
  }
  const finale = sectionDrafts(recipe, ['orbit', ...(recipe.sections.includes('closing') ? ['closing' as const] : [])], combined, facts, aspect, strings, undefined)
  if (finale[0]) finale[0] = { ...finale[0], shot: { ...finale[0].shot, caption: strings.together } }
  drafts.push(...finale)
  return [build(drafts, combined, titleFor(recipe, combined.name), models)]
}

// ── Sections → shot drafts ─────────────────────────────────────────────────────

interface Draft {
  shot: PlannedShot
  /** Relative length: the hero and the closing breathe a little longer. */
  weight: number
  /** Drafts of one group (storeys, systems…) are trimmed together when time is short. */
  group: SectionKind
}

function sectionDrafts(
  recipe: Recipe, sections: readonly SectionKind[], m: ModelFacts, facts: SceneFacts,
  aspect: number, strings: PlanStrings, visibleModels: string[] | undefined,
): Draft[] {
  const out: Draft[] = []
  let heading = 25
  const nextHeading = () => { const h = heading; heading = (heading + 55) % 360; return h }
  const make = (section: SectionKind, type: ShotType, bounds: Bounds, label: string, over: Partial<ShotSpec>, scene: ShotScene, caption?: string, weight = 1): Draft => ({
    shot: {
      section,
      shot: launchEase(recipe, type, { ...defaultShot(type, bounds, aspect, 4), headingDeg: nextHeading(), ...over }),
      label, caption,
      scene: { ...(visibleModels ? { visibleModels } : {}), ...scene },
    },
    weight,
    group: section,
  })

  for (const section of sections) {
    switch (section) {
      case 'hero':
        out.push(make('hero', 'reveal', m.bounds, m.name, {}, {}, undefined, 1.3))
        break
      case 'orbit':
        out.push(make('orbit', 'orbit', m.bounds, m.name, { sweepDeg: 70, easing: 'linear' }, {}))
        break
      case 'aerial':
        out.push(make('aerial', 'topDown', m.bounds, m.name, {}, {}))
        break
      case 'buildup': {
        // Needs at least a few storeys to read as a building going up.
        if (m.storeys.length < 3) break
        const stages = m.storeys.map((st) => [{ modelId: st.modelId, ids: st.ids }])
        out.push(make('buildup', 'orbit', m.bounds, m.name,
          { sweepDeg: 80, elevationDeg: 22, easing: 'linear' }, { stages }, undefined, 1.6))
        break
      }
      case 'storeys':
        for (const s of pickSpread(m.storeys, recipe.maxStoreys)) {
          out.push(make('storeys', 'focus', minBounds(boxToBounds(s.box), 1), s.label,
            { elevationDeg: 48, sweepDeg: 30, padding: 1.2 },
            subjectScene(recipe, s, 'info'),
            recipe.captions.labelShots ? s.label : undefined))
        }
        break
      case 'systems':
        for (const s of m.systems.slice(0, recipe.maxSystems)) {
          out.push(make('systems', 'orbit', minBounds(boxToBounds(s.box), 1), s.label,
            { sweepDeg: 45, elevationDeg: 26, padding: 1.1, easing: 'easeInOut' },
            subjectScene(recipe, s, 'info'),
            recipe.captions.labelShots ? strings.system(s.label, s.count) : undefined))
        }
        break
      case 'issues':
        for (const s of m.issues.slice(0, recipe.maxIssues)) {
          out.push(withDetails(make('issues', 'focus', minBounds(boxToBounds(s.box), 2), s.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            // Findings are always shown in context — highlighted, never isolated.
            { highlight: [{ modelId: s.modelId, ids: s.ids, severity: s.severity ?? 'warning' }] },
            recipe.captions.labelShots ? strings.issue(s.label, s.count) : undefined), recipe, s))
        }
        break
      case 'ids':
        for (const sub of (m.ids ?? []).slice(0, recipe.maxIssues)) {
          out.push(withDetails(make('ids', 'focus', minBounds(boxToBounds(sub.box), 2), sub.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            { highlight: [{ modelId: sub.modelId, ids: sub.ids, severity: 'error' }] },
            recipe.captions.labelShots ? (strings.ids ?? strings.issue)(sub.label, sub.count) : undefined), recipe, sub))
        }
        break
      case 'fixed':
        for (const sub of (m.fixed ?? []).slice(0, recipe.maxIssues)) {
          out.push(withDetails(make('fixed', 'focus', minBounds(boxToBounds(sub.box), 2), sub.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            { highlight: [{ modelId: sub.modelId, ids: sub.ids, severity: 'info' }] },
            recipe.captions.labelShots ? (strings.fixed ?? strings.issue)(sub.label, sub.count) : undefined), recipe, sub))
        }
        break
      case 'bcf':
        for (const sub of (m.bcf ?? []).slice(0, recipe.maxIssues)) {
          const hl = sub.ids.length ? { highlight: [{ modelId: sub.modelId, ids: sub.ids, severity: sub.severity ?? 'warning' }] } : {}
          const draft = sub.pose
            // The topic's own camera: fly in to it, then settle.
            ? make('bcf', 'path', m.bounds, sub.label, { keyframes: [pullBack(fitPoseToAspect(sub.pose, SCREEN_ASPECT, aspect), sub.pose.target, 1.35), fitPoseToAspect(sub.pose, SCREEN_ASPECT, aspect)], easing: 'easeOut' }, hl, recipe.captions.labelShots ? sub.label : undefined)
            : make('bcf', 'focus', minBounds(boxToBounds(sub.box), 2), sub.label, { sweepDeg: 30, padding: 1.8 }, hl, recipe.captions.labelShots ? sub.label : undefined)
          out.push(withDetails(draft, recipe, sub))
        }
        break
      case 'tour': {
        // Stops were framed on the presenter's screen; a narrower output needs
        // the camera further back to keep the same subject in frame.
        const stops = facts.tour.map((st) => ({ ...st, pose: fitPoseToAspect(st.pose, st.aspect ?? SCREEN_ASPECT, aspect) }))
        for (let i = 0; i < stops.length; i++) {
          const stop = stops[i]
          const from = i === 0 ? pullBack(stop.pose, m.bounds.center, 1.35) : stops[i - 1].pose
          const settle = pullBack(stop.pose, stop.pose.target, 0.9)
          const hl = stop.highlight && stop.highlight.ids.length
            ? { highlight: [{ modelId: stop.highlight.modelId, ids: stop.highlight.ids, severity: stop.highlight.severity ?? 'info' as const }] }
            : {}
          out.push(make('tour', 'path', m.bounds, stop.caption || strings.tourStop(i + 1),
            { keyframes: [from, stop.pose, settle], easing: 'easeInOut' }, hl,
            recipe.captions.labelShots ? stop.caption || undefined : undefined))
        }
        break
      }
      case 'detail': {
        const d = facts.detail
        if (d && (!visibleModels || visibleModels.includes(d.modelId))) {
          out.push(make('detail', 'focus', minBounds(boxToBounds(d.box), 1), d.label,
            { sweepDeg: 40, padding: 1.7 },
            { highlight: [{ modelId: d.modelId, ids: d.ids, severity: 'info' }] },
            recipe.captions.labelShots ? d.label : undefined))
        } else {
          out.push(make('detail', 'dollyIn', m.bounds, m.name, {}, {}))
        }
        break
      }
      case 'closing':
        out.push(make('closing', 'orbit', m.bounds, m.name, { sweepDeg: 40, elevationDeg: 20, easing: 'easeOut' }, {}, undefined, 1.2))
        break
    }
  }
  return out
}

/** Launch style: speed-ramp the moves that have a hero moment in the middle. */
function launchEase(recipe: Recipe, type: ShotType, shot: ShotSpec): ShotSpec {
  if (recipe.style !== 'launch' || !RAMPED.includes(type)) return shot
  // A ramp needs travel to read: widen the sweep a little.
  return { ...shot, easing: 'ramp', sweepDeg: shot.sweepDeg * 1.25 }
}

/**
 * Where the picture punches in: on every cut, and on each bar's downbeat in
 * between when there is a beat. Sorted, deduplicated, never in the first
 * half-second (the opening frame should land clean).
 */
export function punchTimes(starts: number[], overlap: number, beat: Rhythm | null, duration: number): number[] {
  const cuts = starts.slice(1).map((s) => s + overlap)
  const bars: number[] = []
  if (beat && beat.beatSec > 0) for (let t = beat.beatSec * 4; t < duration - 0.3; t += beat.beatSec * 4) bars.push(t)
  // A cut always wins over a bar that falls next to it.
  const lone = bars.filter((b) => cuts.every((c) => Math.abs(c - b) > 0.35))
  const all = [...cuts, ...lone].filter((t) => t >= 0.5 && t < duration - 0.2).sort((a, b) => a - b)
  return all.filter((t, i) => i === 0 || t - all[i - 1] > 0.3).map(round3)
}

/**
 * The sound design, placed on the cut:
 * - every cut gets a whoosh peaking on it;
 * - 'full' adds a hit when a title or the CTA slams in, a riser into the
 *   last shot, a boom when the building finishes rising, and a soft tick as
 *   each word of a word-by-word label lands (first eight words).
 * Effects never start past the end; the same effect twice closer than 0.12 s
 * (0.05 s for ticks) is played once.
 */
export function planSfx(
  level: 'subtle' | 'full', shots: PlannedShot[], starts: number[], overlap: number,
  texts: PlannedText[], duration: number,
): ProjectSfx {
  const cues: SfxCue[] = []
  for (let i = 1; i < shots.length; i++) cues.push(cueAt('whoosh', starts[i] + overlap / 2, level === 'full' ? 0.55 : 0.3))
  if (level === 'full') {
    for (const t of texts) {
      if (t.anim === 'slam') cues.push(cueAt('hit', t.startSec, 0.85))
      if (t.anim === 'words') {
        const words = t.text.split(/\s+/).filter(Boolean).slice(0, 8)
        words.forEach((_, k) => cues.push(cueAt('tick', t.startSec + k * WORD_STEP_SEC, 0.22)))
      }
    }
    const last = shots.length - 1
    if (last > 0) cues.push(cueAt('riser', starts[last] + overlap, 0.5))
    shots.forEach((sh, i) => {
      if (sh.section === 'buildup') cues.push(cueAt('boom', starts[i] + sh.shot.durationSec * 0.85, 0.7))
    })
  }
  const inside = cues.filter((c) => c.t < duration - 0.05).sort((a, b) => a.t - b.t)
  // Same kind closer than 0.12 s is one sound played twice — keep the first.
  const kept: SfxCue[] = []
  for (const c of inside) {
    const gap = c.kind === 'tick' ? 0.05 : 0.12
    if (kept.some((k) => k.kind === c.kind && Math.abs(k.t - c.t) < gap)) continue
    kept.push({ ...c, t: round3(c.t) })
  }
  return { cues: kept, volume: 0.8 }
}

/** Attach a subject's detail lines when the recipe shows details. */
function withDetails(d: Draft, recipe: Recipe, sub: Subject): Draft {
  if (!recipe.captions.details || !sub.detail?.length) return d
  // Details need reading time: a review shot stays up a little longer.
  return { ...d, weight: d.weight * 1.3, shot: { ...d.shot, details: sub.detail.slice(0, 4) } }
}

function subjectScene(recipe: Recipe, s: Subject, severity: 'error' | 'warning' | 'info'): ShotScene {
  return recipe.isolateSubjects
    ? { isolate: [{ modelId: s.modelId, ids: s.ids }] }
    : { highlight: [{ modelId: s.modelId, ids: s.ids, severity }] }
}

// ── Timing ─────────────────────────────────────────────────────────────────────

/**
 * Give every draft a length so the clip lands near the target: each within the
 * pace's bounds, whole beats when cutting on the beat, and the outgoing shot
 * of every transition extended by the overlap so the CUT lands on the beat.
 * When there is not enough time for every draft, the multi-shot groups
 * (storeys, systems, issues, tour) lose shots from their end first.
 */
export function fitDrafts(drafts: Draft[], recipe: Recipe, overlap: number, beat: Rhythm | null): Draft[] {
  const pace = PACE_SHOT_SEC[recipe.pace]
  const list = [...drafts]
  const fits = () => list.length * pace.min - (list.length - 1) * overlap <= recipe.targetSec
  while (list.length > 2 && !fits()) {
    const counts = new Map<SectionKind, number>()
    for (const d of list) counts.set(d.group, (counts.get(d.group) ?? 0) + 1)
    let victim: SectionKind | null = null
    for (const [g, n] of counts) if (n > 1 && (victim === null || n > (counts.get(victim) ?? 0))) victim = g
    if (!victim) victim = list[list.length - 2].group // keep the closing shot
    const idx = list.map((d) => d.group).lastIndexOf(victim)
    list.splice(idx, 1)
  }
  const weights = list.reduce((s, d) => s + d.weight, 0)
  const budget = recipe.targetSec + (list.length - 1) * overlap
  const lens = list.map((d) => Math.min(pace.max * d.weight, Math.max(pace.min, (budget * d.weight) / weights)))
  if (beat && beat.beatSec > 0) {
    // Whole beats per shot; then give back beats from the longest shots while
    // rounding up has pushed the clip past its target.
    const b = beat.beatSec
    const beats = lens.map((l) => Math.max(1, Math.round(l / b)))
    const floor = Math.max(1, Math.ceil(pace.min / b - 1e-9))
    while (beats.reduce((s, n) => s + n, 0) * b > recipe.targetSec + b / 2) {
      let k = -1
      for (let j = 0; j < beats.length; j++) if (beats[j] > floor && (k < 0 || beats[j] > beats[k])) k = j
      if (k < 0) break
      beats[k]--
    }
    beats.forEach((n, j) => { lens[j] = n * b })
  }
  return list.map((d, i) => {
    let len = lens[i]
    // On the beat, the transition INTO the next shot eats the overlap — extend
    // the outgoing shot so the cut itself lands on the beat.
    if (i < list.length - 1 && beat) len += overlap
    return { ...d, shot: { ...d.shot, shot: { ...d.shot.shot, durationSec: round3(len) } } }
  })
}

// ── Captions ───────────────────────────────────────────────────────────────────

function planTexts(
  recipe: Recipe, shots: PlannedShot[], starts: number[], overlap: number,
  subject: ModelFacts, models: ModelFacts[], title: string, strings: PlanStrings,
): PlannedText[] {
  if (shots.length === 0) return []
  const vertical = FORMAT_SIZE[recipe.format].height > FORMAT_SIZE[recipe.format].width
  // Reels and TikTok draw their own UI over the bottom fifth — keep text out of it.
  const low: TextAnchor = vertical ? 'mid-center' : 'bottom-left'
  const look = CAPTION_LOOKS[recipe.captions.look ?? 'clean']
  // Launch grammar: titles slam in, numbers count up, labels land word by word.
  const launch = recipe.style === 'launch'
  const anim = (kind: 'title' | 'stats' | 'label' | 'cta'): TextAnimId =>
    !launch ? look.anim : kind === 'stats' ? 'count' : kind === 'label' ? 'words' : 'slam'
  const texts: PlannedText[] = []
  const push = (t: Omit<PlannedText, 'anim'>, anim: TextAnimId = look.anim) => texts.push({ ...t, anim })
  const end = (i: number) => starts[i] + shots[i].shot.durationSec - (i < shots.length - 1 ? overlap : 0)

  const heroEnd = end(0)
  // Launch titles hit within the first beat: no slow fade-in on a feed.
  if (title) push({ text: title, startSec: launch ? 0.12 : 0.3, endSec: Math.max(1.5, heroEnd - 0.2), style: look.title, anchor: vertical ? 'top-center' : 'mid-center' }, anim('title'))
  const sub: string[] = []
  if (recipe.captions.showStats) {
    const elements = models.reduce((s, m) => s + m.elementCount, 0)
    const storeys = models.reduce((s, m) => s + m.storeys.length, 0)
    if (elements > 0) sub.push(strings.stats(elements, storeys))
  }
  if (recipe.captions.showScore && models.length === 1 && subject.score !== null && subject.score >= PRESENTABLE_SCORE) {
    sub.push(strings.score(subject.score))
  }
  if (sub.length && look.stats) {
    // Vertical frames have no room under a wrapped title — the facts follow it
    // on the second shot instead of piling onto it.
    if (vertical && shots.length > 1) {
      push({ text: sub.join(' · '), startSec: round3(starts[1] + overlap + 0.15), endSec: round3(end(1) - 0.15), style: look.subtitle, anchor: 'top-center' }, anim('stats'))
    } else {
      push({ text: sub.join(' · '), startSec: 0.8, endSec: Math.max(2, heroEnd - 0.2), style: look.subtitle, anchor: vertical ? 'top-center' : 'bottom-center' }, anim('stats'))
    }
  }

  for (let i = 1; i < shots.length; i++) {
    const cap = shots[i].caption
    if (!cap) continue
    push({ text: cap, startSec: round3(starts[i] + overlap + 0.15), endSec: round3(Math.max(starts[i] + overlap + 1, end(i) - 0.15)), style: look.label, anchor: low }, anim('label'))
  }
  // The fixes summary ("12 fixed · Health Score 71 → 86") opens the first fix
  // shot: on top of its detail lines when it has them, on its own otherwise.
  const firstFixed = shots.findIndex((sh) => sh.section === 'fixed')
  let summary: string | null = null
  if (firstFixed >= 0 && strings.fixedSummary) {
    const resolved = models.reduce((n, m) => n + (m.fixed ?? []).reduce((k, f) => k + f.count, 0), 0)
    const withFixes = models.filter((m) => (m.fixed ?? []).length > 0)
    const single = withFixes.length === 1 ? withFixes[0] : null
    summary = strings.fixedSummary(resolved, single?.scoreBefore ?? null, single?.score ?? null)
    if (!shots[firstFixed].details?.length) {
      push({
        text: summary,
        startSec: round3(starts[firstFixed] + overlap + 0.2), endSec: round3(end(firstFixed) - 0.15),
        style: look.subtitle, anchor: vertical ? 'mid-center' : 'top-center',
      })
    }
  }
  for (let i = 0; i < shots.length; i++) {
    const lines = shots[i].details
    if (!lines?.length) continue
    const text = (i === firstFixed && summary ? [summary, ...lines] : lines).join('\n')
    push({ text, startSec: round3(starts[i] + overlap + 0.35), endSec: round3(Math.max(starts[i] + overlap + 1.2, end(i) - 0.15)), style: 'caption', anchor: vertical ? 'top-center' : 'top-left' }, 'fade')
  }
  const cta = recipe.captions.cta.trim()
  if (cta && shots.length > 1) {
    const last = shots.length - 1
    push({ text: cta, startSec: round3(starts[last] + overlap + 0.3), endSec: round3(end(last) - 0.1), style: look.cta, anchor: vertical ? 'mid-center' : 'bottom-center' }, anim('cta'))
  }
  return texts
}

function titleFor(recipe: Recipe, name: string): string {
  const t = recipe.captions.title.trim()
  return (t ? t.replace(/\{name\}/g, name) : name).trim()
}

// ── Geometry helpers ───────────────────────────────────────────────────────────

export function boxToBounds(b: Box): Bounds {
  return {
    center: { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 },
    size: { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z },
  }
}

function boundsToBox(b: Bounds): Box {
  return {
    min: { x: b.center.x - b.size.x / 2, y: b.center.y - b.size.y / 2, z: b.center.z - b.size.z / 2 },
    max: { x: b.center.x + b.size.x / 2, y: b.center.y + b.size.y / 2, z: b.center.z + b.size.z / 2 },
  }
}

/** A tiny subject still gets a readable frame. */
function minBounds(b: Bounds, min: number): Bounds {
  return { center: b.center, size: { x: Math.max(min, b.size.x), y: Math.max(min, b.size.y), z: Math.max(min, b.size.z) } }
}

function isUsable(b: Bounds | null | undefined): b is Bounds {
  return !!b && [b.center.x, b.center.y, b.center.z, b.size.x, b.size.y, b.size.z].every(Number.isFinite) &&
    Math.max(b.size.x, b.size.y, b.size.z) > 0
}

/** What a stop recorded on a laptop was framed for. */
export const SCREEN_ASPECT = 16 / 9

/**
 * Keep what a pose frames when the output is narrower than the screen it was
 * framed on (a 16:9 stop in a 9:16 Reel pulls back 1.78×, in 4:5 1.25×).
 */
export function fitPoseToAspect(pose: CameraPose, from: number, to: number): CameraPose {
  if (!(from > 0) || !(to > 0) || to >= from) return pose
  // A subject framed on screen touches the NARROWER side of the frame: the
  // height on a landscape screen, the width on a portrait one. In units of the
  // vertical half-field, that side is min(1, aspect) — pull back by how much
  // narrower it gets.
  const factor = Math.min(1, from) / Math.min(1, to)
  return factor > 1 ? pullBack(pose, pose.target, Math.min(2.2, factor)) : pose
}

/** Move the eye away from (factor > 1) or toward (< 1) `from`, keeping the target. */
function pullBack(p: CameraPose, from: Vec3, factor: number): CameraPose {
  return {
    ...p,
    position: {
      x: from.x + (p.position.x - from.x) * factor,
      y: from.y + (p.position.y - from.y) * factor,
      z: from.z + (p.position.z - from.z) * factor,
    },
  }
}

/** Up to n items spread evenly — first and last always kept (ground floor and roof). */
export function pickSpread<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return [...items]
  if (n <= 1) return [items[0]]
  const out: T[] = []
  for (let i = 0; i < n; i++) out.push(items[Math.round((i * (items.length - 1)) / (n - 1))])
  return out
}

/** The federation as one subject: union box, all subjects, names joined. */
export function combine(models: ModelFacts[]): ModelFacts {
  if (models.length === 1) return models[0]
  const boxes = models.map((m) => boundsToBox(m.bounds))
  const box: Box = {
    min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)), z: Math.min(...boxes.map((b) => b.min.z)) },
    max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)), z: Math.max(...boxes.map((b) => b.max.z)) },
  }
  const name = federationName(models.map((m) => m.name).filter(Boolean))
  const bySeverity = { error: 0, warning: 1, info: 2 }
  return {
    modelId: models[0].modelId,
    name,
    bounds: boxToBounds(box),
    elementCount: models.reduce((s, m) => s + m.elementCount, 0),
    score: null,
    storeys: models.flatMap((m) => m.storeys).sort((a, b) => a.box.min.y - b.box.min.y),
    systems: mergeSystems(models.flatMap((m) => m.systems)),
    issues: models.flatMap((m) => m.issues).sort((a, b) => bySeverity[a.severity ?? 'info'] - bySeverity[b.severity ?? 'info'] || b.count - a.count),
    ids: models.flatMap((m) => m.ids ?? []).sort((a, b) => b.count - a.count),
    bcf: models.flatMap((m) => m.bcf ?? []),
    fixed: models.flatMap((m) => m.fixed ?? []).sort((a, b) => b.count - a.count),
    scoreBefore: null,
  }
}

/**
 * A federation's name. Discipline files of one project usually share a prefix
 * ("Hospital_ARQ", "Hospital_EST") — that prefix IS the project name. Without
 * one, the names are joined (three at most).
 */
export function federationName(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  const words = names.map((n) => n.split(/\s+/))
  const shared: string[] = []
  for (let i = 0; words.every((w) => i < w.length - 1 && w[i] === words[0][i]); i++) shared.push(words[0][i])
  if (shared.join(' ').length >= 3) return shared.join(' ')
  return names.length <= 3 ? names.join(' + ') : `${names.slice(0, 2).join(' + ')} +${names.length - 2}`
}

/**
 * Loaded models grouped by the project they belong to (IfcProject name, set
 * by the gatherer as `group`), in load order. Models without a group each
 * stand alone.
 */
export function groupModels(models: ModelFacts[]): { name: string; models: ModelFacts[] }[] {
  const out: { name: string; models: ModelFacts[] }[] = []
  for (const m of models) {
    const key = m.group?.trim()
    const g = key ? out.find((x) => x.name === key) : undefined
    if (g) g.models.push(m)
    else out.push({ name: key || m.name, models: [m] })
  }
  return out
}

/**
 * Same system from several models → one subject per model still (ids are per
 * model), but ordered so each system's biggest contribution comes first and
 * the list alternates systems instead of showing "structure" three times.
 */
function mergeSystems(all: Subject[]): Subject[] {
  const byKey = new Map<string, Subject[]>()
  for (const s of all) byKey.set(s.key, [...(byKey.get(s.key) ?? []), s].sort((a, b) => b.count - a.count))
  const out: Subject[] = []
  for (let round = 0; out.length < all.length; round++) {
    for (const list of byKey.values()) if (list[round]) out.push(list[round])
  }
  return out
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
