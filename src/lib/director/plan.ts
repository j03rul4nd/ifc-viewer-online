// ─── Presentation planner — recipe + model facts → a shot list ────────────────
// Pure: no viewer, no stores, no i18n. Given what the model REALLY contains
// (bounds, storeys, systems, validation findings, the recorded tour) and a
// recipe, decide every shot, how long it lasts, what the scene shows during it
// (which models, which elements isolated or highlighted) and every caption.
// The renderer then just executes the plan, so the whole creative logic is
// unit-testable and identical for one model or a batch of fifty.

import { defaultShot, fitDistance, orbitPoint, zoomKeyframes, DEFAULT_FOV_DEG, type Bounds, type CameraPose, type ShotSpec, type ShotType, type Vec3 } from '../capture/shots'
import { MOTION_TRANSITIONS, type ClipTransition } from '../capture/project'
import { WORD_STEP_SEC, type TextAnchor, type TextAnimId, type TextStyleId } from '../capture/timeline'
import { cueAt, type ProjectSfx, type SfxCue } from '../capture/sfx'
import { PACE_SHOT_SEC, isKineticStyle, type CaptionLook, type Recipe, type SectionKind } from './recipe'
import { LOOKS, type Grade, type Look } from './looks'
import { MAX_CUE_CHARS, subtitleCues, type NarrationFact } from './narration'
import type { Hud, HudMark } from '../capture/hud'

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
  /** Storeys: how many rooms (IfcSpace) it holds, when the model has them. */
  rooms?: number
  /** Storeys: the box of its largest room (IfcSpace) — empty space to stand in. */
  room?: Box
  /** The interior storey: columns and walls in it, for a camera route that misses them. */
  obstacles?: Box[]
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
  /** One narrated line per shot (subtitles); missing = no narration. */
  narrate?: (fact: NarrationFact) => string
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
  /**
   * A section plane moving over the shot: it keeps the side `normal` points
   * toward and passes through `cutPointAt(points, p, stepped)` at progress p.
   */
  cut?: { normal: Vec3; points: Vec3[]; stepped: boolean }
  /** Exploded view: y-bands of the model pulled apart by `gap` each (see explodeOffsets). */
  explode?: { bands: Array<{ min: number; max: number }>; gap: number }
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
  /** What the shot is about, for its narrated subtitle. */
  say?: NarrationFact
  /** A 2D end card instead of a 3D shot: name, facts, URL over a drifting gradient. */
  card?: { title: string; subtitle?: string; url?: string }
  scene: ShotScene
}

export interface PlannedText {
  /** Look typography: face, ink, accent, case. */
  font?: 'sans' | 'serif' | 'mono'
  color?: string
  accent?: string
  uppercase?: boolean
  anim: TextAnimId
  text: string
  startSec: number
  endSec: number
  style: TextStyleId
  anchor: TextAnchor
  /** Vertical centre as a fraction of the height (overrides the anchor's row). */
  yFrac?: number
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
  /** Motion style: the joins cycle through these instead of repeating `transition`. */
  transitionCycle?: ClipTransition[]
  /** Motion-blur sub-frames per rendered frame (1 = off). */
  motionBlur: number
  /** Sound effects placed on the cut (none when the recipe has them off). */
  sfx?: ProjectSfx
  /** Film treatment from the look. */
  grade?: Grade
  /** The look everything was styled for. */
  look: Look
  /** Technical interface frame, when the recipe asks for it. */
  hud?: Hud
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
    const launch = isKineticStyle(recipe.style)
    const motion = recipe.style === 'motion'
    return {
      modelId: subject.modelId, title, width, height, shots, texts, transition, transitionSec: overlap, durationSec,
      ...(launch ? { punch: { times: punchTimes(starts, overlap, beat, durationSec), amount: PUNCH_AMOUNT } } : {}),
      ...(motion && overlap > 0 ? { transitionCycle: [...MOTION_TRANSITIONS] } : {}),
      // Fast launch cuts get a real shutter; calmer ones stay crisp (and 3× cheaper).
      motionBlur: launch && recipe.pace === 'fast' ? 3 : 1,
      ...(recipe.sfx && recipe.sfx !== 'off' ? { sfx: planSfx(recipe.sfx, shots, starts, overlap, texts, durationSec) } : {}),
      ...(lookOf(recipe).grade ? { grade: lookOf(recipe).grade! } : {}),
      look: lookOf(recipe),
      ...(recipe.hud ? { hud: planHud(shots, starts, overlap, durationSec, title || subject.name, subject, lookOf(recipe), FORMAT_SIZE[recipe.format].height > FORMAT_SIZE[recipe.format].width) } : {}),
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
      const perGroup = recipe.sections.filter((s) => s !== 'closing' && s !== 'tour' && s !== 'endCard')
      const everything = { ...combined, name: federationName(groups.map((g) => g.name)) }
      // With a zoom-through in the recipe, the camera dives from the whole set
      // into each project before showing it: the "portal" between projects.
      const dive = recipe.sections.includes('zoomThrough')
      const drafts: Draft[] = []
      for (const g of groups) {
        const gm = { ...combine(g.models), name: g.name }
        const own = sectionDrafts(recipe, perGroup.filter((s) => !dive || s !== 'zoomThrough'), gm, facts, aspect, strings, g.models.map((m) => m.modelId))
        if (dive) {
          drafts.push(diveInto(everything, gm, aspect, g.name, recipe.captions.labelShots))
        } else if (own[0]) {
          own[0] = { ...own[0], shot: { ...own[0].shot, caption: g.name } }
        }
        drafts.push(...own)
      }
      const finale = sectionDrafts(recipe, ['orbit', ...(recipe.sections.includes('closing') ? ['closing' as const] : []), ...(recipe.sections.includes('endCard') ? ['endCard' as const] : [])], everything, facts, aspect, strings, undefined)
      if (finale[0]) finale[0] = { ...finale[0], shot: { ...finale[0].shot, caption: strings.together } }
      drafts.push(...finale)
      return [build(drafts, everything, titleFor(recipe, everything.name), models)]
    }
  }

  // 'sequence': each model on its own (the others hidden), then everything together.
  const perModel = recipe.sections.filter((s) => s !== 'closing' && s !== 'tour' && s !== 'endCard')
  const drafts: Draft[] = []
  for (const m of models) {
    const own = sectionDrafts(recipe, perModel, m, facts, aspect, strings, [m.modelId])
    // A model's first shot carries its name, so the audience knows which one this is.
    if (own[0]) own[0] = { ...own[0], shot: { ...own[0].shot, caption: m.name } }
    drafts.push(...own)
  }
  const finale = sectionDrafts(recipe, ['orbit', ...(recipe.sections.includes('closing') ? ['closing' as const] : []), ...(recipe.sections.includes('endCard') ? ['endCard' as const] : [])], combined, facts, aspect, strings, undefined)
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
  const said = (d: Draft, fact: NarrationFact): Draft => ({ ...d, shot: { ...d.shot, say: fact } })
  const metres = (n: number) => Math.round(n)

  for (const section of sections) {
    switch (section) {
      case 'hero':
        out.push(said(make('hero', 'reveal', m.bounds, m.name, {}, {}, undefined, 1.3),
          { kind: 'intro', name: m.name, elements: m.elementCount, storeys: m.storeys.length }))
        break
      case 'orbit':
        out.push(make('orbit', 'orbit', m.bounds, m.name, { sweepDeg: 70, easing: 'linear' }, {}))
        break
      case 'aerial':
        out.push(said(make('aerial', 'topDown', m.bounds, m.name, {}, {}),
          { kind: 'footprint', widthM: metres(Math.max(m.bounds.size.x, m.bounds.size.z)), depthM: metres(Math.min(m.bounds.size.x, m.bounds.size.z)) }))
        break
      case 'zoomThrough': {
        // Push through the facade into the heart of a storey (or the model),
        // gathering speed into the cut — the portal into the next shot.
        const into = m.storeys.length ? m.storeys[Math.floor(m.storeys.length / 2)] : null
        const target = into ? boxToBounds(into.box).center : m.bounds.center
        const dir = unitOf(orbitPoint({ x: 0, y: 0, z: 0 }, 1, nextHeading(), 12))
        const far = fitDistance(m.bounds, DEFAULT_FOV_DEG, aspect, 0.95)
        out.push(make('zoomThrough', 'path', m.bounds, into?.label ?? m.name, {
          keyframes: zoomKeyframes(m.bounds.center, target, dir, far, 0.35, DEFAULT_FOV_DEG),
          pathTiming: 'even', easing: 'easeIn',
        }, {}, recipe.captions.labelShots && into ? into.label : undefined, 0.8))
        out[out.length - 1] = said(out[out.length - 1], { kind: 'inside', name: into?.label ?? m.name })
        break
      }
      case 'pullOut': {
        // Start a metre from a detail — the selected element, or a spot on the
        // facade — and pull back until the whole building sits in its context.
        const dir = unitOf(orbitPoint({ x: 0, y: 0, z: 0 }, 1, nextHeading(), 18))
        const d = facts.detail && (!visibleModels || visibleModels.includes(facts.detail.modelId)) ? facts.detail : null
        const c = m.bounds.center
        // No detail: the facade of the middle storey (a tower's podium is wider
        // than the tower — starting at the model's edge would start in the air).
        const mid = m.storeys.length ? boxToBounds(m.storeys[Math.floor(m.storeys.length / 2)].box) : m.bounds
        const half = Math.min(mid.size.x, mid.size.z) / 2
        const start = d ? boxToBounds(d.box).center : { x: mid.center.x + dir.x * half, y: mid.center.y, z: mid.center.z + dir.z * half }
        const near = d ? Math.max(0.8, Math.hypot(d.box.max.x - d.box.min.x, d.box.max.y - d.box.min.y, d.box.max.z - d.box.min.z) * 1.5) : 1.2
        const far = fitDistance(m.bounds, DEFAULT_FOV_DEG, aspect, 1.05)
        out.push(make('pullOut', 'path', m.bounds, d?.label ?? m.name, {
          keyframes: zoomKeyframes(start, c, dir, near, far, DEFAULT_FOV_DEG),
          // Linear on a geometric path = the same apparent speed all the way out.
          pathTiming: 'even', easing: 'linear',
        }, d ? { highlight: [{ modelId: d.modelId, ids: d.ids, severity: 'info' }] } : {}, undefined, 1.2))
        out[out.length - 1] = said(out[out.length - 1], { kind: 'context', name: m.name })
        break
      }
      case 'sectionCut': {
        // A plan cut from above the roof down to the ground storey, stopping
        // at each one: the drawing a section tool would make, storey by storey.
        if (m.storeys.length < 2) break
        const top = m.bounds.center.y + m.bounds.size.y / 2
        // Its own cap: one continuous shot, not the per-storey shot budget.
        const picked = pickSpread(m.storeys, 6).slice().reverse()
        const points = [
          { x: m.bounds.center.x, y: top + 0.5, z: m.bounds.center.z },
          ...picked.map((s) => ({ x: m.bounds.center.x, y: planCutHeight(s, m.storeys), z: m.bounds.center.z })),
        ]
        const d = make('sectionCut', 'orbit', m.bounds, m.name,
          { sweepDeg: 60, elevationDeg: 50, easing: 'linear' },
          { cut: { normal: { x: 0, y: -1, z: 0 }, points, stepped: true } }, undefined, 1.2 + picked.length * 0.15)
        out.push(said(d, { kind: 'sectionCut', storeys: picked.length, from: picked[0].label, to: picked[picked.length - 1].label }))
        break
      }
      case 'sectionSweep': {
        // A vertical plane crossing the long side: the inside revealed slice by slice.
        const long = m.bounds.size.x >= m.bounds.size.z ? 'x' : 'z'
        const half = m.bounds.size[long] / 2
        const at = (k: number): Vec3 => ({ ...m.bounds.center, [long]: m.bounds.center[long] + k * half })
        const normal: Vec3 = long === 'x' ? { x: -1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 }
        // Looking at the cut face: the camera sits on the removed side.
        const d = make('sectionSweep', 'orbit', m.bounds, m.name,
          { sweepDeg: 35, elevationDeg: 24, easing: 'linear', headingDeg: long === 'x' ? 70 : 340 },
          { cut: { normal, points: [at(1.02), at(0.25), at(-0.2)], stepped: false } }, undefined, 1.1)
        out.push(said(d, { kind: 'sectionSweep', lengthM: Math.round(m.bounds.size[long]) }))
        break
      }
      case 'exploded': {
        // Storeys in up to 8 bands pulled apart and fitted back: needs a building.
        if (m.storeys.length < 3) break
        const bands = explodeBands(m.storeys, 8)
        const gap = (m.bounds.size.y / bands.length) * 0.9
        const lift = gap * (bands.length - 1)
        // Frame the building at its tallest, exploded.
        const framed: Bounds = { center: { ...m.bounds.center, y: m.bounds.center.y + lift / 2 }, size: { ...m.bounds.size, y: m.bounds.size.y + lift } }
        const d = make('exploded', 'orbit', framed, m.name,
          { sweepDeg: 70, elevationDeg: 22, easing: 'linear' },
          { explode: { bands, gap } }, undefined, 1.5)
        out.push(said(d, { kind: 'exploded', storeys: m.storeys.length }))
        break
      }
      case 'plans':
        // Each storey as a drawing: cut at plan height, the camera settling
        // from an oblique view to nearly overhead, close on that floor.
        for (const s of pickSpread(typicalStoreys(m.storeys), recipe.maxStoreys)) {
          const b = boxToBounds(s.box)
          const cutY = planCutHeight(s, m.storeys)
          const floor: Bounds = { center: { ...b.center, y: (s.box.min.y + cutY) / 2 }, size: { ...b.size, y: Math.max(1, cutY - s.box.min.y) } }
          const d = make('plans', 'orbit', minBounds(floor, 2), s.label,
            { sweepDeg: 35, elevationDeg: 62, padding: 1.05, easing: 'easeInOut' },
            { cut: { normal: { x: 0, y: -1, z: 0 }, points: [{ ...b.center, y: cutY }], stepped: false } },
            recipe.captions.labelShots ? s.label : undefined)
          out.push(said(d, { kind: 'plan', name: s.label, rooms: s.rooms ?? 0, elements: s.count }))
        }
        break
      case 'interior': {
        // Eye height inside a middle storey, turning slowly with a wide lens.
        // Off-centre so a central core does not fill the frame.
        const s = interiorStorey(m.storeys)
        if (!s) break
        const b = boxToBounds(s.box)
        // Eye height over the room's own floor: the storey's box starts lower
        // (columns and slab edges from below), which put the eye in the slab.
        const keyframes = interiorKeyframes(s.room ?? s.box, (s.room ?? s.box).min.y + 1.6, s.obstacles ?? [])
        // No cut: the slab above is the ceiling (a cut shows the backdrop instead).
        const d = make('interior', 'path', b, s.label, { keyframes, easing: 'easeInOut', fovDeg: 72 }, {},
          recipe.captions.labelShots ? s.label : undefined, 1.2)
        out.push(said(d, { kind: 'interior', name: s.label, rooms: s.rooms ?? 0 }))
        break
      }
      case 'buildup': {
        // Needs at least a few storeys to read as a building going up.
        if (m.storeys.length < 3) break
        const stages = m.storeys.map((st) => [{ modelId: st.modelId, ids: st.ids }])
        out.push(make('buildup', 'orbit', m.bounds, m.name,
          { sweepDeg: 80, elevationDeg: 22, easing: 'linear' }, { stages }, undefined, 1.6))
        out[out.length - 1] = said(out[out.length - 1], { kind: 'rise', storeys: m.storeys.length, heightM: metres(m.bounds.size.y) })
        break
      }
      case 'storeys':
        for (const s of pickSpread(m.storeys, recipe.maxStoreys)) {
          out.push(make('storeys', 'focus', minBounds(boxToBounds(s.box), 1), s.label,
            { elevationDeg: 48, sweepDeg: 30, padding: 1.2 },
            subjectScene(recipe, s, 'info'),
            recipe.captions.labelShots ? s.label : undefined))
          out[out.length - 1] = said(out[out.length - 1], { kind: 'storey', name: s.label, elements: s.count, index: m.storeys.indexOf(s) + 1, total: m.storeys.length })
        }
        break
      case 'systems':
        for (const s of m.systems.slice(0, recipe.maxSystems)) {
          out.push(make('systems', 'orbit', minBounds(boxToBounds(s.box), 1), s.label,
            { sweepDeg: 45, elevationDeg: 26, padding: 1.1, easing: 'easeInOut' },
            subjectScene(recipe, s, 'info'),
            recipe.captions.labelShots ? strings.system(s.label, s.count) : undefined))
          out[out.length - 1] = said(out[out.length - 1], { kind: 'system', label: s.label, elements: s.count, percent: m.elementCount > 0 ? Math.min(100, Math.round((s.count / m.elementCount) * 100)) : 0 })
        }
        break
      case 'issues':
        for (const s of m.issues.slice(0, recipe.maxIssues)) {
          out.push(withDetails(make('issues', 'focus', minBounds(boxToBounds(s.box), 2), s.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            // Findings are always shown in context — highlighted, never isolated.
            { highlight: [{ modelId: s.modelId, ids: s.ids, severity: s.severity ?? 'warning' }] },
            recipe.captions.labelShots ? strings.issue(s.label, s.count) : undefined), recipe, s))
          out[out.length - 1] = said(out[out.length - 1], { kind: 'issue', label: s.label, count: s.count, severity: s.severity ?? 'warning' })
        }
        break
      case 'ids':
        for (const sub of (m.ids ?? []).slice(0, recipe.maxIssues)) {
          out.push(withDetails(make('ids', 'focus', minBounds(boxToBounds(sub.box), 2), sub.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            { highlight: [{ modelId: sub.modelId, ids: sub.ids, severity: 'error' }] },
            recipe.captions.labelShots ? (strings.ids ?? strings.issue)(sub.label, sub.count) : undefined), recipe, sub))
          out[out.length - 1] = said(out[out.length - 1], { kind: 'ids', label: sub.label, count: sub.count })
        }
        break
      case 'fixed':
        for (const sub of (m.fixed ?? []).slice(0, recipe.maxIssues)) {
          out.push(withDetails(make('fixed', 'focus', minBounds(boxToBounds(sub.box), 2), sub.label,
            { sweepDeg: 35, elevationDeg: 30, padding: 1.8 },
            { highlight: [{ modelId: sub.modelId, ids: sub.ids, severity: 'info' }] },
            recipe.captions.labelShots ? (strings.fixed ?? strings.issue)(sub.label, sub.count) : undefined), recipe, sub))
          out[out.length - 1] = said(out[out.length - 1], { kind: 'fixed', label: sub.label, count: sub.count })
        }
        break
      case 'bcf':
        for (const sub of (m.bcf ?? []).slice(0, recipe.maxIssues)) {
          const hl = sub.ids.length ? { highlight: [{ modelId: sub.modelId, ids: sub.ids, severity: sub.severity ?? 'warning' }] } : {}
          const draft = sub.pose
            // The topic's own camera: fly in to it, then settle.
            ? make('bcf', 'path', m.bounds, sub.label, { keyframes: [pullBack(fitPoseToAspect(sub.pose, SCREEN_ASPECT, aspect), sub.pose.target, 1.35), fitPoseToAspect(sub.pose, SCREEN_ASPECT, aspect)], easing: 'easeOut' }, hl, recipe.captions.labelShots ? sub.label : undefined)
            : make('bcf', 'focus', minBounds(boxToBounds(sub.box), 2), sub.label, { sweepDeg: 30, padding: 1.8 }, hl, recipe.captions.labelShots ? sub.label : undefined)
          out.push(said(withDetails(draft, recipe, sub), { kind: 'bcf', label: sub.label }))
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
          out[out.length - 1] = said(out[out.length - 1], { kind: 'detail', label: d.label })
        } else {
          out.push(make('detail', 'dollyIn', m.bounds, m.name, {}, {}))
        }
        break
      }
      case 'closing':
        out.push(said(make('closing', 'orbit', m.bounds, m.name, { sweepDeg: 40, elevationDeg: 20, easing: 'easeOut' }, {}, undefined, 1.2),
          { kind: 'closing', name: m.name, score: recipe.captions.showScore && m.score !== null && m.score >= PRESENTABLE_SCORE ? m.score : null }))
        break
      case 'endCard': {
        const d = make('endCard', 'orbit', m.bounds, m.name, {}, {}, undefined, 0.9)
        const stats = m.elementCount > 0 ? strings.stats(m.elementCount, m.storeys.length) : undefined
        out.push({ ...d, shot: { ...d.shot, card: { title: titleFor(recipe, m.name), subtitle: stats, url: recipe.captions.cta.trim() || undefined } } })
        break
      }
    }
  }
  return out
}

/** Launch style: speed-ramp the moves that have a hero moment in the middle. */
function launchEase(recipe: Recipe, type: ShotType, shot: ShotSpec): ShotSpec {
  if (!isKineticStyle(recipe.style) || !RAMPED.includes(type)) return shot
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
      // The end card's title slams in with a hit and a boom under it.
      if (sh.card) { cues.push(cueAt('hit', starts[i] + overlap, 0.9)); cues.push(cueAt('boom', starts[i] + overlap, 0.6)) }
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

export function lookOf(recipe: Recipe): Look {
  return LOOKS[recipe.look ?? 'native'] ?? LOOKS.native
}

/** Attach a subject's detail lines when the recipe shows details. */
function withDetails(d: Draft, recipe: Recipe, sub: Subject): Draft {
  if (!recipe.captions.details || !sub.detail?.length) return d
  // Details need reading time: a review shot stays up a little longer.
  return { ...d, weight: d.weight * 1.3, shot: { ...d.shot, details: sub.detail.slice(0, 4) } }
}

/**
 * Where a moving cut is at progress p (0–1). Stepped: glides to each stop in
 * the first 40 % of its segment and holds for the rest, so every plan reads.
 * Otherwise smooth from the first point to the last.
 */
export function cutPointAt(points: readonly Vec3[], p: number, stepped: boolean): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  if (points.length === 1) return points[0]
  const q = Math.min(1, Math.max(0, p)) * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(q))
  const f = q - i
  const s = stepped ? smooth(Math.min(1, f / 0.4)) : f
  const a = points[i], b = points[i + 1]
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: a.z + (b.z - a.z) * s }
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * Split the storeys (bottom to top) into at most `max` contiguous bands. A
 * band starts just under its first storey's floor so the slab travels with
 * it; the lowest reaches down and the highest up without limit.
 */
export function explodeBands(storeys: readonly Subject[], max: number): Array<{ min: number; max: number }> {
  const sorted = [...storeys].sort((a, b) => a.box.min.y - b.box.min.y)
  const k = Math.max(1, Math.min(max, sorted.length))
  const starts: number[] = []
  for (let i = 0; i < k; i++) starts.push(sorted[Math.floor((i * sorted.length) / k)].box.min.y - 0.05)
  return starts.map((y, i) => ({ min: i === 0 ? -Infinity : y, max: i === k - 1 ? Infinity : starts[i + 1] }))
}

/**
 * How far each band is lifted at progress p: apart over 10–45 %, held,
 * together again over 70–95 %. Band i rises i × gap at full explosion.
 */
export function explodeOffsets(bands: number, gap: number, p: number): number[] {
  const e = p < 0.45 ? smooth(clamp01((p - 0.1) / 0.35)) : p < 0.7 ? 1 : 1 - smooth(clamp01((p - 0.7) / 0.25))
  return Array.from({ length: bands }, (_, i) => i * gap * e)
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/**
 * The HUD for a clip: one mark per 3D shot (the end card has none — the HUD
 * stops where it starts), with the storey counter or the live cut height.
 */
export function planHud(
  shots: readonly PlannedShot[], starts: readonly number[], overlap: number, durationSec: number,
  title: string, subject: ModelFacts, look: Look, vertical: boolean,
): Hud {
  const baseY = subject.bounds.center.y - subject.bounds.size.y / 2
  const marks: HudMark[] = []
  let end = durationSec
  shots.forEach((s, i) => {
    const startSec = i === 0 ? 0 : starts[i] + overlap / 2
    const endSec = i < shots.length - 1 ? starts[i + 1] + overlap / 2 : durationSec
    if (s.card) { end = Math.min(end, startSec); return }
    const say = s.say
    const cut = s.scene.cut && s.scene.cut.normal.y < -0.5
      ? { ys: s.scene.cut.points.map((p) => p.y), stepped: s.scene.cut.stepped, baseY }
      : undefined
    const meta = say?.kind === 'storey' ? `L ${say.index}/${say.total}`
      : say?.kind === 'exploded' ? `${say.storeys} L`
      : say?.kind === 'system' ? `${say.percent}%`
      : undefined
    marks.push({ startSec: round3(startSec), endSec: round3(endSec), label: s.label, ...(meta ? { meta } : {}), ...(cut ? { cut } : {}) })
  })
  const accent = look.id === 'native' ? '#ff5a1f' : look.accent
  const ink = look.id === 'native' ? '#f4f4f5' : look.type.ink
  return { title, accent, ink, durationSec: round3(end), marks, ...(vertical ? { vertical: true } : {}) }
}

/** Storeys worth a plan: the typical floors — no near-empty foundation or roof slab. */
export function typicalStoreys(storeys: readonly Subject[]): Subject[] {
  const counts = storeys.map((s) => s.count).sort((a, b) => a - b)
  const median = counts[Math.floor(counts.length / 2)] ?? 0
  const full = storeys.filter((s) => s.count >= Math.max(10, median * 0.5))
  const inner = full.length > 3 ? full.slice(1, -1) : full
  return inner.length ? inner : [...storeys]
}

/** A storey you can stand in, preferring one with a room, near the middle. */
export function interiorStorey(storeys: readonly Subject[]): Subject | null {
  const tall = typicalStoreys(storeys).filter((s) => s.box.max.y - s.box.min.y > 2.4)
  const roomy = tall.filter((s) => s.room)
  const pool = roomy.length ? roomy : tall
  return pool.length ? pool[Math.floor(pool.length / 2)] : null
}

/**
 * Walk into a room at eye height: from a fifth of the way along its long axis,
 * a slow dolly forward while the view pans across the far end.
 */
export function interiorKeyframes(room: Box, eye: number, obstacles: readonly Box[] = []): CameraPose[] {
  const b = boxToBounds(room)
  const alongX = b.size.x >= b.size.z
  const len = alongX ? b.size.x : b.size.z
  const width = alongX ? b.size.z : b.size.x
  const at = (f: number, side = 0): Vec3 => alongX
    ? { x: room.min.x + len * f, y: eye, z: b.center.z + side }
    : { x: b.center.x + side, y: eye, z: room.min.z + len * f }
  // The eye must not pass through a column or a wall: of the parallel lines
  // across the room, the one nearest the middle whose whole route is clear.
  const side = clearLine(obstacles, at, width, eye) ?? 0
  return [0, 1, 2, 3].map((i) => ({
    position: at(0.18 + i * 0.05, side),
    target: at(0.95, side * 0.3 + (i / 3 - 0.5) * width * 0.9),
    fovDeg: 72,
  }))
}

/** Lateral offset of a route (f 0.14–0.37 along the room) clear of every obstacle by 0.5 m; null when none is. */
export function clearLine(obstacles: readonly Box[], at: (f: number, side: number) => Vec3, width: number, eye: number): number | null {
  const pad = 0.5
  const blocked = (p: Vec3) => obstacles.some((o) =>
    eye >= o.min.y - 0.2 && eye <= o.max.y + 0.2 &&
    p.x >= o.min.x - pad && p.x <= o.max.x + pad && p.z >= o.min.z - pad && p.z <= o.max.z + pad)
  for (const k of [0, 0.12, -0.12, 0.24, -0.24, 0.36, -0.36]) {
    const side = k * width
    let ok = true
    for (let f = 0.14; f <= 0.37 && ok; f += 0.01) if (blocked(at(f, side))) ok = false
    if (ok) return side
  }
  return null
}

/** A plan is cut ~1.2 m above the floor, below the storey above. */
function planCutHeight(s: Subject, all: readonly Subject[]): number {
  const floor = s.box.min.y
  const next = all.find((o) => o.box.min.y > floor + 0.5)
  const room = (next ? next.box.min.y : s.box.max.y) - floor
  return floor + Math.min(1.2, Math.max(0.3, room * 0.45))
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
  // Art direction: the look's faces and inks on every line.
  const art = lookOf(recipe)
  const styled = (kind: 'title' | 'body' | 'muted'): Pick<PlannedText, 'font' | 'color' | 'accent' | 'uppercase'> => art.id === 'native' ? {} : {
    font: kind === 'title' ? art.type.titleFamily : art.type.family,
    color: kind === 'muted' ? art.type.muted : art.type.ink,
    accent: art.accent,
    ...(art.type.uppercase && kind !== 'muted' ? { uppercase: true } : {}),
  }
  // Launch grammar: titles slam in, numbers count up, labels land word by word.
  // Motion grammar: titles glitch in, labels whip in blurred, the CTA echoes.
  const launch = isKineticStyle(recipe.style)
  const motion = recipe.style === 'motion'
  const anim = (kind: 'title' | 'stats' | 'label' | 'cta'): TextAnimId =>
    motion ? MOTION_ANIMS[kind]
      : !launch ? look.anim : kind === 'stats' ? 'count' : kind === 'label' ? 'words' : 'slam'
  const texts: PlannedText[] = []
  const push = (t: Omit<PlannedText, 'anim'>, anim: TextAnimId = look.anim) => {
    const kind = t.style === 'title' || (t.style === look.title && t.anchor !== 'top-left') ? 'title' : t.style === 'caption' ? 'muted' : 'body'
    texts.push({ ...styled(kind), ...t, anim })
  }
  const end = (i: number) => starts[i] + shots[i].shot.durationSec - (i < shots.length - 1 ? overlap : 0)
  // Narration: a subtitle track says what each shot shows; it takes over the
  // per-shot labels and the stats line (it names the subject with its numbers).
  const narrate = recipe.captions.narration && strings.narrate ? strings.narrate : null

  const heroEnd = end(0)
  // Launch titles hit within the first beat: no slow fade-in on a feed. An
  // art-directed title sits in the open sky above the building — the
  // cinematic rule: type never sits on the subject.
  const titleAnchor: TextAnchor = 'top-center'
  // Motion: the title first flashes word by word on full-frame colour cards
  // (the kinetic-type cold open), then lands glitched over the picture.
  const flash = motion && title ? wordFlash(title, heroEnd) : []
  for (const f of flash) texts.push(f)
  const titleStart = flash.length ? flash[flash.length - 1].endSec : launch ? 0.12 : 0.3
  if (title) push({ text: title, startSec: titleStart, endSec: Math.max(titleStart + 1, heroEnd - 0.2), style: motion ? 'display' : look.title, anchor: titleAnchor }, anim('title'))
  const sub: string[] = []
  if (recipe.captions.showStats) {
    const elements = models.reduce((s, m) => s + m.elementCount, 0)
    const storeys = models.reduce((s, m) => s + m.storeys.length, 0)
    if (elements > 0) sub.push(strings.stats(elements, storeys))
  }
  if (recipe.captions.showScore && models.length === 1 && subject.score !== null && subject.score >= PRESENTABLE_SCORE) {
    sub.push(strings.score(subject.score))
  }
  if (sub.length && look.stats && !narrate) {
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
    if (!cap || narrate) continue
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
  // An end card already carries the URL.
  const ctaShown = !!cta && shots.length > 1 && !shots[shots.length - 1].card
  if (narrate) {
    const maxChars = vertical ? MAX_CUE_CHARS.vertical : MAX_CUE_CHARS.wide
    for (let i = 0; i < shots.length; i++) {
      const fact = shots[i].say
      // The closing CTA owns the last shot's lower band.
      if (!fact || shots[i].card || (ctaShown && i === shots.length - 1)) continue
      // The hero's line waits for the title to land; the rest start after the cut.
      const from = i === 0 ? (title ? 1.1 : 0.3) : starts[i] + overlap + 0.2
      for (const cue of subtitleCues(narrate(fact), from, end(i) - 0.15, maxChars)) {
        // Vertical: above the band the feed's own UI covers, below the building's middle.
        push({ ...styled('body'), text: cue.text, startSec: cue.startSec, endSec: cue.endSec, style: 'caption', anchor: 'bottom-center', ...(vertical ? { yFrac: 0.72 } : {}) }, launch ? 'roll' : 'fade')
      }
    }
  }
  if (ctaShown) {
    const last = shots.length - 1
    push({ text: cta, startSec: round3(starts[last] + overlap + 0.3), endSec: round3(end(last) - 0.1), style: look.cta, anchor: vertical ? 'mid-center' : 'bottom-center' }, anim('cta'))
  }
  return texts
}

/** Motion style: which lettering each caption role gets. */
const MOTION_ANIMS: Record<'title' | 'stats' | 'label' | 'cta', TextAnimId> = {
  title: 'glitch', stats: 'count', label: 'blurSlide', cta: 'echo',
}

/** Motion style's HUD/card accent when the look has none. */
export const MOTION_ACCENT = '#FF4F1F'

/** Card colour + ink + entry for each flashed word, cycled — the orange/ink/paper/blue rhythm. */
const FLASH_CARDS: Array<{ card: string; ink: string; anim: TextAnimId }> = [
  { card: '#FF4F1F', ink: '#111111', anim: 'slam' },
  { card: '#0E0F12', ink: '#FF4F1F', anim: 'select' },
  { card: '#F1EFEA', ink: '#2B4BFF', anim: 'zoomIn' },
  { card: '#2B4BFF', ink: '#FFFFFF', anim: 'glitch' },
]

/** Seconds each flashed word holds. Fast enough to feel cut, slow enough to read one word. */
export const FLASH_WORD_SEC = 0.42

/**
 * The cold open: the title's words one at a time on full-frame cards. At most
 * 5 words and never more than 60 % of the hero shot, so the model still gets
 * its reveal.
 */
export function wordFlash(title: string, heroEnd: number): PlannedText[] {
  const words = title.split(/\s+/).filter(Boolean).slice(0, 5)
  const per = Math.min(FLASH_WORD_SEC, (heroEnd * 0.6) / Math.max(1, words.length))
  if (words.length < 2 || per < 0.25) return []
  return words.map((w, i) => {
    const c = FLASH_CARDS[i % FLASH_CARDS.length]
    return {
      text: w, startSec: round3(i * per), endSec: round3((i + 1) * per),
      style: 'wordCard', anchor: 'mid-center', anim: c.anim, color: c.ink, accent: c.card, uppercase: true,
    }
  })
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

/**
 * The dive between projects: from a view of the whole set, an exponential
 * zoom onto one project, everything still visible — so the audience sees
 * where this project sits before it has the screen to itself.
 */
function diveInto(all: ModelFacts, target: ModelFacts, aspect: number, name: string, label: boolean): Draft {
  const dir = unitOf(orbitPoint({ x: 0, y: 0, z: 0 }, 1, 30, 28))
  const far = fitDistance(all.bounds, DEFAULT_FOV_DEG, aspect, 1.05)
  const near = fitDistance(target.bounds, DEFAULT_FOV_DEG, aspect, 1.1)
  return {
    shot: {
      section: 'zoomThrough',
      shot: {
        ...defaultShot('path', target.bounds, aspect, 3),
        keyframes: zoomKeyframes(all.bounds.center, target.bounds.center, dir, far, near, DEFAULT_FOV_DEG),
        pathTiming: 'even', easing: 'easeInOut',
      },
      label: name,
      caption: label ? name : undefined,
      scene: {},
    },
    weight: 1,
    group: 'zoomThrough',
  }
}

function unitOf(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / l, y: v.y / l, z: v.z / l }
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

/** Up to n items spread evenly — first and last always kept (ground floor and roof); a single pick is the middle one. */
export function pickSpread<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return [...items]
  // One storey: the middle one — the one the zoom-through flies into.
  if (n <= 1) return [items[Math.floor(items.length / 2)]]
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
