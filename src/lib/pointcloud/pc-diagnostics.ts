// ─── Point cloud diagnostics ──────────────────────────────────────────────────
// What is wrong with a loaded scan, and the one-click fix for it.
//
// Pure: the panel gathers the facts (entry, display, world bounds, model
// bounds) and this decides. Kept out of the component so every rule is tested
// without a canvas — and so the rules read as a list, which is what they are.
//
// The rules come from the problems people actually hit with scans in a BIM
// viewer, roughly in order of how often:
//   1. lying on its side      — Y-up exports (PLY/OBJ tools) read as Z-up
//   2. wrong size             — millimetre / foot files read as metres
//   3. nowhere near the model — no shared CRS, or a CRS this build lacks
//   4. black / white / flat   — colour mode the file has no data for
//   5. invisible              — hidden, or opacity dragged to nothing
//   6. slow                   — tens of millions of points at full detail
//   7. incomplete             — truncated by the budget, or a stream error
// Each issue names its fixes; the panel owns what a fix DOES.

import type {
  PointAttributesPresent, PointCloudDisplay, PointColorMode, PointCloudEntry,
} from './pc-types'

export type IssueSeverity = 'error' | 'warn' | 'info'

export type IssueId =
  | 'failed' | 'partial' | 'truncated'
  | 'upAxisGuessed' | 'colorUnavailable' | 'hidden' | 'faint'
  | 'farFromModel' | 'manualPlacement' | 'crsUnknown'
  | 'tooLarge' | 'tooSmall' | 'heavy'

export type FixId =
  | 'flipUpAxis' | 'bestColor' | 'showAll' | 'opacityFull'
  | 'fitCloud' | 'fitBoth' | 'realign' | 'openPlacement'
  | 'unitMm' | 'unitCm' | 'unitFt' | 'scaleUp' | 'performance' | 'remove'

export interface Issue {
  id: IssueId
  severity: IssueSeverity
  fixes: FixId[]
}

/** A world-space box as { center, size } — the shape viewer.getModelBounds returns. */
export interface BoxCS {
  center: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
}

export interface DiagnoseInput {
  cloud: Pick<PointCloudEntry,
    'status' | 'streamErrorKey' | 'truncated' | 'visible' | 'attributes' | 'frame' | 'alignment' | 'sourceKind'
  >
  display: Pick<PointCloudDisplay, 'colorMode' | 'opacity'>
  /** The cloud's world bounds, or null while nothing has landed. */
  cloudBox: BoxCS | null
  /** The active model's world bounds, or null without a model. */
  modelBox: BoxCS | null
  /** Resident points across every loaded cloud. */
  totalPoints: number
  /** Detail slider (0.05–1). */
  density: number
}

/** Above this many resident points at full detail, suggest the lighter preset. */
export const HEAVY_POINTS = 12_000_000

const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warn: 1, info: 2 }

/** Does the file carry the data a colour mode draws? */
export function colorModeAvailable(mode: PointColorMode, attributes: PointAttributesPresent | undefined): boolean {
  if (mode === 'flat' || mode === 'elevation') return true
  if (!attributes) return false
  if (mode === 'rgb') return attributes.color
  if (mode === 'intensity') return attributes.intensity
  return attributes.classification
}

/**
 * The most informative colour mode a file supports. Real colour first (it is
 * what people expect a scan to look like), then classes, then intensity, and
 * height when the file carries nothing but positions — height always works
 * and reads far better than a single flat colour.
 */
export function bestColorMode(attributes: PointAttributesPresent | undefined): PointColorMode {
  if (attributes?.color) return 'rgb'
  if (attributes?.classification) return 'classification'
  if (attributes?.intensity) return 'intensity'
  return 'elevation'
}

const maxExtent = (b: BoxCS): number => Math.max(b.size.x, b.size.y, b.size.z)

/** Gap between two boxes (0 when they overlap), metres. */
export function boxGap(a: BoxCS, b: BoxCS): number {
  const axis = (k: 'x' | 'y' | 'z'): number => {
    const d = Math.abs(a.center[k] - b.center[k]) - (a.size[k] + b.size[k]) / 2
    return Math.max(0, d)
  }
  const dx = axis('x'), dy = axis('y'), dz = axis('z')
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Every issue the scan shows, most severe first. Empty = nothing to fix. */
export function diagnoseCloud(input: DiagnoseInput): Issue[] {
  const { cloud, display, cloudBox, modelBox } = input
  const issues: Issue[] = []
  const add = (id: IssueId, severity: IssueSeverity, fixes: FixId[]): void => { issues.push({ id, severity, fixes }) }

  if (cloud.status === 'error') {
    add('failed', 'error', ['remove'])
    return issues
  }
  // Nothing else is meaningful until the scan has landed.
  if (cloud.status !== 'ready') return issues

  // A replay is authored in the model's own frame; placement and unit rules do
  // not apply to it.
  const replay = cloud.sourceKind === 'temporal-replay'

  if (cloud.streamErrorKey) add('partial', 'warn', [])
  if (cloud.truncated) add('truncated', 'info', [])

  if (!cloud.visible) add('hidden', 'warn', ['showAll'])
  else if (display.opacity < 0.2) add('faint', 'warn', ['opacityFull'])

  if (!colorModeAvailable(display.colorMode, cloud.attributes)) add('colorUnavailable', 'warn', ['bestColor'])

  if (!replay && cloud.frame?.upAxisSource === 'assumed') add('upAxisGuessed', 'info', ['flipUpAxis'])

  const reasons = cloud.alignment?.reasons ?? []
  if (!replay && reasons.includes('align.reason.cloudCrsUnknown')) add('crsUnknown', 'warn', ['openPlacement'])

  // Size — only when nobody has already corrected it. The aligner's own unit
  // guesses (mm / cm / ft reasons) mean the extent WAS looked at.
  const unitGuessed = reasons.some((r) => r === 'align.reason.unitMillimetres' ||
    r === 'align.reason.unitCentimetres' || r === 'align.reason.unitFeet')
  const scaled = (cloud.alignment?.offset.scaleMul ?? 1) !== 1
  if (!replay && cloudBox && !unitGuessed && !scaled) {
    const size = maxExtent(cloudBox)
    const reference = modelBox ? maxExtent(modelBox) : null
    const tooLarge = reference && reference > 0.5 ? size > reference * 300 : size > 50_000
    const tooSmall = reference && reference > 0.5 ? size < reference / 300 : size > 0 && size < 0.02
    if (tooLarge) add('tooLarge', 'warn', ['unitMm', 'unitCm', 'unitFt'])
    else if (tooSmall) add('tooSmall', 'warn', ['scaleUp'])
  }

  if (!replay && cloudBox && modelBox) {
    const gap = boxGap(cloudBox, modelBox)
    const span = Math.max(maxExtent(cloudBox), maxExtent(modelBox), 1)
    if (gap > span * 1.5) add('farFromModel', 'warn', ['realign', 'fitBoth', 'openPlacement'])
  }

  if (!replay && cloud.alignment?.rung === 'manual' && !issues.some((i) => i.id === 'farFromModel')) {
    add('manualPlacement', 'info', ['openPlacement'])
  }

  if (input.totalPoints > HEAVY_POINTS && input.density > 0.6) add('heavy', 'info', ['performance'])

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ── Appearance presets ────────────────────────────────────────────────────────

export type AppearancePresetId = 'balanced' | 'detail' | 'presentation' | 'performance'

export interface AppearancePreset {
  display: Partial<PointCloudDisplay>
  renderBudget: number
}

/** One click per intent; the sliders stay for everything in between. */
export const APPEARANCE_PRESETS: Record<AppearancePresetId, AppearancePreset> = {
  balanced:     { display: { pointSize: 2,   attenuate: false, round: true,  density: 1,   opacity: 1 }, renderBudget: 4_000_000 },
  detail:       { display: { pointSize: 1.5, attenuate: false, round: true,  density: 1,   opacity: 1 }, renderBudget: 8_000_000 },
  presentation: { display: { pointSize: 1.5, attenuate: true,  round: true,  density: 1,   opacity: 1 }, renderBudget: 6_000_000 },
  performance:  { display: { pointSize: 2.5, attenuate: false, round: false, density: 0.5, opacity: 1 }, renderBudget: 1_500_000 },
}

/** Which preset the current settings match, or null once the user has tuned them. */
export function matchPreset(display: PointCloudDisplay, renderBudget: number): AppearancePresetId | null {
  for (const [id, preset] of Object.entries(APPEARANCE_PRESETS) as [AppearancePresetId, AppearancePreset][]) {
    if (preset.renderBudget !== renderBudget) continue
    const same = (Object.entries(preset.display) as [keyof PointCloudDisplay, unknown][])
      .every(([k, v]) => display[k] === v)
    if (same) return id
  }
  return null
}

/** Scale multipliers behind the unit fixes: source unit → metres. */
export const UNIT_FIX_SCALE: Record<'unitMm' | 'unitCm' | 'unitFt' | 'scaleUp', number> = {
  unitMm: 0.001,
  unitCm: 0.01,
  unitFt: 0.3048,
  scaleUp: 1000,
}
