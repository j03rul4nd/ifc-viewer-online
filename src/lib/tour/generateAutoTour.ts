// ─── Auto-tour generation (Tour Mode — D-24) ───────────────────────────────────
// Turns a validation result into a short, presentable walkthrough. The pure
// parts (issue grouping/ordering + camera framing math) are unit-tested; the
// orchestrator only glues them to ViewerAPI (getElementsBox / getCameraViewpoint).
//
// Grouping criterion (D-24): one step per (rule, model) — NOT one per instance.
// A model with 300 RULE_EMPTY_NAME issues produces ONE step that highlights a
// capped sample of the affected elements and frames their union AABB. Steps are
// ordered by severity (error > warning > info), then by how many instances the
// rule has (most widespread problems first).

import type {
  ValidationIssue, ValidationRuleId, CameraState, CameraViewpoint,
  Tour, TourStep, Vec3Like,
} from '../../types'

// ── Options / constants ────────────────────────────────────────────────────────

/**
 * Step-selection strategy (D-26):
 * - 'severity'  — one step per failing rule, worst first (technical handoff;
 *                 the original behaviour).
 * - 'showcase'  — attractive whole-model views (ISO quarters, front, aerial…)
 *                 instead of issues; used by the social/client templates where
 *                 the tour is a presentation, not an audit.
 */
export type TourStrategy = 'severity' | 'showcase'

export interface AutoTourOptions {
  /** Maximum number of steps in the generated tour. */
  maxSteps?: number
  /** Cap on highlighted/framed elements per step (matches the viewer's batched-colour comfort zone). */
  maxHighlightsPerStep?: number
  /** Step selection strategy (default 'severity' — the original behaviour). */
  strategy?: TourStrategy
  /** Localised captions for showcase views, positionally matched to the view list. */
  showcaseCaptions?: string[]
  /** Showcase only: append one "areas to improve" step (top severity group). */
  includeImprovementsStep?: boolean
  /** Localised caption for the improvements step. */
  improvementsCaption?: string
}

export const DEFAULT_MAX_STEPS = 10
export const DEFAULT_MAX_HIGHLIGHTS = 25

/** Extra breathing room around the framed elements (1 = exact fit). */
export const FRAME_PADDING = 1.2

// ── Pure part 1: grouping / ordering ───────────────────────────────────────────

export interface IssueGroup {
  ruleId: ValidationRuleId
  severity: 'error' | 'warning' | 'info'
  modelId?: string
  /** Unique element ids (first N of the group, capped). */
  expressIds: number[]
  /** Total instances the rule has in this model (may exceed expressIds.length). */
  count: number
}

const SEVERITY_RANK: Record<IssueGroup['severity'], number> = { error: 0, warning: 1, info: 2 }

/**
 * Group validation issues into ordered tour-step drafts.
 * Pure — no viewer, no DOM.
 */
export function groupIssuesForTour(
  issues: readonly ValidationIssue[],
  options: AutoTourOptions = {},
): IssueGroup[] {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const maxHighlights = options.maxHighlightsPerStep ?? DEFAULT_MAX_HIGHLIGHTS
  if (maxSteps <= 0) return []

  const groups = new Map<string, IssueGroup & { seen: Set<number> }>()
  for (const issue of issues) {
    const key = `${issue.modelId ?? ''}::${issue.ruleId}`
    let g = groups.get(key)
    if (!g) {
      g = {
        ruleId: issue.ruleId as ValidationRuleId,
        severity: issue.severity,
        modelId: issue.modelId,
        expressIds: [],
        count: 0,
        seen: new Set(),
      }
      groups.set(key, g)
    }
    g.count++
    // File-level issues (schema check, header checks) carry expressId 0 —
    // they still make a valid step (overview camera), just nothing to frame.
    if (issue.expressId > 0 && !g.seen.has(issue.expressId) && g.expressIds.length < maxHighlights) {
      g.seen.add(issue.expressId)
      g.expressIds.push(issue.expressId)
    }
  }

  return [...groups.values()]
    .sort((a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.count - a.count ||
      a.ruleId.localeCompare(b.ruleId),
    )
    .slice(0, maxSteps)
    .map(({ seen: _seen, ...g }) => g)
}

// ── Pure part 2: camera framing math ───────────────────────────────────────────

export interface BoxLike { min: Vec3Like; max: Vec3Like }

/**
 * Camera pose that frames `box` while looking along `viewDirection`
 * (normalised). Same fit criterion as camera-controls' fitToSphere: pull back
 * until the box's bounding sphere fits the narrower field of view, times a
 * padding factor. Pure — unit-tested against known cases.
 */
export function computeFrameCamera(
  box: BoxLike,
  viewDirection: Vec3Like,
  fovDeg: number,
  aspect: number,
  padding: number = FRAME_PADDING,
): CameraState {
  const cx = (box.min.x + box.max.x) / 2
  const cy = (box.min.y + box.max.y) / 2
  const cz = (box.min.z + box.max.z) / 2

  const dx = box.max.x - box.min.x
  const dy = box.max.y - box.min.y
  const dz = box.max.z - box.min.z
  // Bounding-sphere radius = half the box diagonal; degenerate boxes (single
  // small element) get a 1 m floor so the camera never lands inside geometry.
  const radius = Math.max(0.5, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2)

  const safeFov = Math.min(170, Math.max(10, fovDeg))
  const fovV = (safeFov * Math.PI) / 180
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 16 / 9
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * safeAspect)
  const minFov = Math.min(fovV, fovH)

  const distance = (radius / Math.sin(minFov / 2)) * padding

  // Normalise the direction defensively (callers should pass unit vectors).
  const dl = Math.sqrt(
    viewDirection.x * viewDirection.x +
    viewDirection.y * viewDirection.y +
    viewDirection.z * viewDirection.z,
  ) || 1
  const nx = viewDirection.x / dl
  const ny = viewDirection.y / dl
  const nz = viewDirection.z / dl

  return {
    position: { x: cx - nx * distance, y: cy - ny * distance, z: cz - nz * distance },
    target:   { x: cx, y: cy, z: cz },
  }
}

// ── Pure part 3: showcase view planning (D-26) ─────────────────────────────────

/**
 * Whole-model view directions for the showcase strategy, in presentation
 * order. A direction is where the camera LOOKS (target − position, normalised
 * by computeFrameCamera): the first two are the classic ISO quarters, then an
 * eye-level front and side, an aerial oblique, and a closing quarter.
 */
export const SHOWCASE_VIEWS: readonly { id: string; direction: Vec3Like }[] = [
  { id: 'overview',    direction: { x: -0.55, y: -0.35, z: -0.55 } },
  { id: 'perspective', direction: { x:  0.55, y: -0.35, z: -0.55 } },
  { id: 'front',       direction: { x:  0,    y: -0.12, z: -1    } },
  { id: 'side',        direction: { x: -1,    y: -0.12, z:  0    } },
  { id: 'aerial',      direction: { x: -0.35, y: -0.9,  z: -0.35 } },
  { id: 'closing',     direction: { x:  0.55, y: -0.35, z:  0.55 } },
]

export interface ModelBoundsLike { center: Vec3Like; size: Vec3Like }

/** viewer.getModelBounds() shape → the BoxLike the framing math consumes. */
export function boundsToBox(bounds: ModelBoundsLike): BoxLike {
  return {
    min: {
      x: bounds.center.x - bounds.size.x / 2,
      y: bounds.center.y - bounds.size.y / 2,
      z: bounds.center.z - bounds.size.z / 2,
    },
    max: {
      x: bounds.center.x + bounds.size.x / 2,
      y: bounds.center.y + bounds.size.y / 2,
      z: bounds.center.z + bounds.size.z / 2,
    },
  }
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

/** The ViewerAPI capabilities the generator needs (narrow for testability). */
export interface AutoTourViewer {
  getCameraViewpoint(): CameraViewpoint | null
  getElementsBox(ids: number[], modelId?: string): Promise<BoxLike | null>
  /** Whole-model AABB (showcase strategy). Same shape as ViewerAPI.getModelBounds. */
  getModelBounds(modelId?: string): ModelBoundsLike | null
}

const FALLBACK_VIEW: CameraViewpoint = {
  position:  { x: 30, y: 30, z: 30 },
  target:    { x: 0, y: 0, z: 0 },
  direction: { x: -0.577, y: -0.577, z: -0.577 },
  fovDeg:    45,
  aspect:    16 / 9,
}

/**
 * Build a Tour from validation issues: group → frame each group's elements
 * (reusing the viewer's getMergedBox path via getElementsBox) → attach the
 * ruleId so the player can render D-22 remediation with no extra lookups.
 * Steps whose elements cannot be boxed keep the presenter's current camera.
 */
export async function generateAutoTour(
  issues: readonly ValidationIssue[],
  viewer: AutoTourViewer,
  options: AutoTourOptions = {},
): Promise<Tour> {
  const current = viewer.getCameraViewpoint() ?? FALLBACK_VIEW
  const steps: TourStep[] = options.strategy === 'showcase'
    ? await buildShowcaseSteps(issues, viewer, current, options)
    : await buildSeveritySteps(issues, viewer, current, options)

  return {
    id: crypto.randomUUID(),
    title: '',
    steps,
    createdFrom: 'auto',
  }
}

/** 'severity' strategy — one step per failing rule, worst first (D-24). */
async function buildSeveritySteps(
  issues: readonly ValidationIssue[],
  viewer: AutoTourViewer,
  current: CameraViewpoint,
  options: AutoTourOptions,
): Promise<TourStep[]> {
  const groups = groupIssuesForTour(issues, options)
  const steps: TourStep[] = []
  for (const g of groups) {
    steps.push(await issueGroupToStep(g, viewer, current))
  }
  return steps
}

/** 'showcase' strategy — whole-model beauty shots + optional improvements step (D-26). */
async function buildShowcaseSteps(
  issues: readonly ValidationIssue[],
  viewer: AutoTourViewer,
  current: CameraViewpoint,
  options: AutoTourOptions,
): Promise<TourStep[]> {
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS)
  const bounds = viewer.getModelBounds()
  const steps: TourStep[] = []

  if (bounds) {
    const box = boundsToBox(bounds)
    // Leave room for the improvements step inside the cap when requested.
    const viewBudget = options.includeImprovementsStep && issues.length > 0 ? maxSteps - 1 : maxSteps
    const views = SHOWCASE_VIEWS.slice(0, Math.max(1, Math.min(viewBudget, SHOWCASE_VIEWS.length)))
    for (let i = 0; i < views.length; i++) {
      steps.push({
        id: crypto.randomUUID(),
        camera: computeFrameCamera(box, views[i].direction, current.fovDeg, current.aspect),
        caption: options.showcaseCaptions?.[i],
      })
    }
  } else {
    // No bounds (no model?) — degrade to the presenter's current view.
    steps.push({
      id: crypto.randomUUID(),
      camera: { position: current.position, target: current.target },
      caption: options.showcaseCaptions?.[0],
    })
  }

  if (options.includeImprovementsStep && issues.length > 0) {
    const top = groupIssuesForTour(issues, { ...options, maxSteps: 1 })[0]
    if (top) {
      const step = await issueGroupToStep(top, viewer, current)
      steps.push({ ...step, caption: options.improvementsCaption ?? step.caption })
    }
  }

  return steps
}

async function issueGroupToStep(
  g: IssueGroup,
  viewer: AutoTourViewer,
  current: CameraViewpoint,
): Promise<TourStep> {
  const box = g.expressIds.length > 0 ? await viewer.getElementsBox(g.expressIds, g.modelId) : null
  const camera: CameraState = box
    ? computeFrameCamera(box, current.direction, current.fovDeg, current.aspect)
    : { position: current.position, target: current.target }
  return {
    id: crypto.randomUUID(),
    camera,
    modelId: g.modelId,
    highlightedExpressIds: g.expressIds.length > 0 ? g.expressIds : undefined,
    issueRuleId: g.ruleId,
    issueSeverity: g.severity,
    issueCount: g.count,
  }
}
