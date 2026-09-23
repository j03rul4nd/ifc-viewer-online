// ─── Presentation planner — recipe + model facts → a shot list ────────────────
// Pure: no viewer, no stores, no i18n. Given what the model REALLY contains
// (bounds, storeys, systems, validation findings, the recorded tour) and a
// recipe, decide every shot, how long it lasts, what the scene shows during it
// (which models, which elements isolated or highlighted) and every caption.
// The renderer then just executes the plan, so the whole creative logic is
// unit-testable and identical for one model or a batch of fifty.

import { defaultShot, type Bounds, type CameraPose, type ShotSpec, type ShotType, type Vec3 } from '../capture/shots'
import type { ClipTransition } from '../capture/project'
import type { TextAnchor, TextAnimId, TextStyleId } from '../capture/timeline'
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
}

export interface Rhythm { beatSec: number }

// ── Output ─────────────────────────────────────────────────────────────────────

/** What the 3D scene shows while a shot renders. */
export interface ShotScene {
  /** Only these models visible; undefined = leave all visible. */
  visibleModels?: string[]
  /** Only these elements visible. */
  isolate?: { modelId: string; ids: number[] }[]
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
}

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
    return { modelId: subject.modelId, title, width, height, shots, texts, transition, transitionSec: overlap, durationSec }
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
      shot: { ...defaultShot(type, bounds, aspect, 4), headingDeg: nextHeading(), ...over },
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
          out.push(make('issues', 'focus', minBounds(boxToBounds(s.box), 2), s.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            // Findings are always shown in context — highlighted, never isolated.
            { highlight: [{ modelId: s.modelId, ids: s.ids, severity: s.severity ?? 'warning' }] },
            recipe.captions.labelShots ? strings.issue(s.label, s.count) : undefined))
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
  const texts: PlannedText[] = []
  const push = (t: Omit<PlannedText, 'anim'>, anim: TextAnimId = look.anim) => texts.push({ ...t, anim })
  const end = (i: number) => starts[i] + shots[i].shot.durationSec - (i < shots.length - 1 ? overlap : 0)

  const heroEnd = end(0)
  if (title) push({ text: title, startSec: 0.3, endSec: Math.max(1.5, heroEnd - 0.2), style: look.title, anchor: vertical ? 'top-center' : 'mid-center' })
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
      push({ text: sub.join(' · '), startSec: round3(starts[1] + overlap + 0.15), endSec: round3(end(1) - 0.15), style: look.subtitle, anchor: 'top-center' })
    } else {
      push({ text: sub.join(' · '), startSec: 0.8, endSec: Math.max(2, heroEnd - 0.2), style: look.subtitle, anchor: vertical ? 'top-center' : 'bottom-center' })
    }
  }

  for (let i = 1; i < shots.length; i++) {
    const cap = shots[i].caption
    if (!cap) continue
    push({ text: cap, startSec: round3(starts[i] + overlap + 0.15), endSec: round3(Math.max(starts[i] + overlap + 1, end(i) - 0.15)), style: look.label, anchor: low })
  }
  const cta = recipe.captions.cta.trim()
  if (cta && shots.length > 1) {
    const last = shots.length - 1
    push({ text: cta, startSec: round3(starts[last] + overlap + 0.3), endSec: round3(end(last) - 0.1), style: look.cta, anchor: vertical ? 'mid-center' : 'bottom-center' })
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
 * framed on: the horizontal field shrinks with the aspect, so pull back by the
 * ratio (capped — a 9:16 Reel from a 16:9 stop would otherwise fly out 3×).
 */
export function fitPoseToAspect(pose: CameraPose, from: number, to: number): CameraPose {
  if (!(from > 0) || !(to > 0) || to >= from) return pose
  const vfov = (pose.fovDeg * Math.PI) / 180
  const h = (a: number) => Math.tan(Math.atan(Math.tan(vfov / 2) * a))
  return pullBack(pose, pose.target, Math.min(2.2, h(from) / h(to)))
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
