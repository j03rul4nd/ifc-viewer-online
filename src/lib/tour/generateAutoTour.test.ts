// ─── Tests — auto-tour grouping + framing math (pure logic, D-24) ──────────────

import { describe, it, expect } from 'vitest'
import type { ValidationIssue } from '../../types'
import {
  groupIssuesForTour, computeFrameCamera, generateAutoTour, boundsToBox,
  DEFAULT_MAX_STEPS, DEFAULT_MAX_HIGHLIGHTS, SHOWCASE_VIEWS,
  type AutoTourViewer, type BoxLike,
} from './generateAutoTour'

function issue(over: Partial<ValidationIssue>): ValidationIssue {
  return {
    id: crypto.randomUUID(),
    ruleId: 'RULE_EMPTY_NAME',
    severity: 'warning',
    expressId: 1,
    globalId: 'g',
    ifcClass: 'IFCWALL',
    elementName: 'Wall',
    message: 'msg',
    path: [],
    autoFixable: false,
    modelId: 'm1',
    ...over,
  }
}

describe('groupIssuesForTour', () => {
  it('groups repeated instances of the same rule into ONE step', () => {
    const issues = Array.from({ length: 300 }, (_, i) =>
      issue({ ruleId: 'RULE_EMPTY_NAME', expressId: i + 1 }),
    )
    const groups = groupIssuesForTour(issues)
    expect(groups).toHaveLength(1)
    expect(groups[0].count).toBe(300)
    expect(groups[0].expressIds).toHaveLength(DEFAULT_MAX_HIGHLIGHTS)
  })

  it('orders by severity first (error > warning > info), then by count desc', () => {
    const issues = [
      ...Array.from({ length: 50 }, (_, i) => issue({ ruleId: 'RULE_EMPTY_NAME', severity: 'warning', expressId: 100 + i })),
      ...Array.from({ length: 2 }, (_, i) => issue({ ruleId: 'RULE_DUPLICATE_GUID', severity: 'error', expressId: 200 + i })),
      issue({ ruleId: 'RULE_INVALID_IFC_VERSION', severity: 'info', expressId: 0 }),
      ...Array.from({ length: 5 }, (_, i) => issue({ ruleId: 'RULE_MISSING_MATERIAL', severity: 'error', expressId: 300 + i })),
    ]
    const groups = groupIssuesForTour(issues)
    expect(groups.map((g) => g.ruleId)).toEqual([
      'RULE_MISSING_MATERIAL',   // error, 5 instances
      'RULE_DUPLICATE_GUID',     // error, 2 instances
      'RULE_EMPTY_NAME',         // warning, 50 instances
      'RULE_INVALID_IFC_VERSION',// info
    ])
  })

  it('breaks count ties deterministically by ruleId', () => {
    const issues = [
      issue({ ruleId: 'RULE_MISSING_TYPE', severity: 'error', expressId: 1 }),
      issue({ ruleId: 'RULE_DUPLICATE_GUID', severity: 'error', expressId: 2 }),
    ]
    const groups = groupIssuesForTour(issues)
    expect(groups.map((g) => g.ruleId)).toEqual(['RULE_DUPLICATE_GUID', 'RULE_MISSING_TYPE'])
  })

  it('caps the number of steps (default 10) and respects a custom cap', () => {
    const issues = Array.from({ length: 20 }, (_, i) =>
      issue({ ruleId: `RULE_${String(i).padStart(2, '0')}` as ValidationIssue['ruleId'], expressId: i + 1 }),
    )
    expect(groupIssuesForTour(issues)).toHaveLength(DEFAULT_MAX_STEPS)
    expect(groupIssuesForTour(issues, { maxSteps: 3 })).toHaveLength(3)
    expect(groupIssuesForTour(issues, { maxSteps: 0 })).toHaveLength(0)
  })

  it('splits the same rule across different models into separate steps', () => {
    const issues = [
      issue({ modelId: 'm1', expressId: 1 }),
      issue({ modelId: 'm2', expressId: 2 }),
    ]
    const groups = groupIssuesForTour(issues)
    expect(groups).toHaveLength(2)
    expect(new Set(groups.map((g) => g.modelId))).toEqual(new Set(['m1', 'm2']))
  })

  it('dedupes repeated expressIds and skips file-level issues (expressId 0)', () => {
    const issues = [
      issue({ expressId: 7 }),
      issue({ expressId: 7 }),
      issue({ expressId: 0 }),
    ]
    const groups = groupIssuesForTour(issues)
    expect(groups[0].expressIds).toEqual([7])
    expect(groups[0].count).toBe(3)
  })
})

describe('computeFrameCamera', () => {
  const unitBox: BoxLike = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }

  it('targets the box centre and looks along the given direction', () => {
    const cam = computeFrameCamera(unitBox, { x: 0, y: 0, z: -1 }, 45, 16 / 9)
    expect(cam.target).toEqual({ x: 0, y: 0, z: 0 })
    // position = center − dir·d → for dir (0,0,-1) the camera sits at +z
    expect(cam.position.x).toBeCloseTo(0, 5)
    expect(cam.position.y).toBeCloseTo(0, 5)
    expect(cam.position.z).toBeGreaterThan(0)
  })

  it('pulls back far enough for the bounding sphere to fit the FOV', () => {
    const cam = computeFrameCamera(unitBox, { x: 0, y: 0, z: -1 }, 45, 16 / 9, 1)
    const radius = Math.sqrt(12) / 2 // half diagonal of a 2×2×2 box
    const dist = Math.abs(cam.position.z)
    // Exact fit: d = r / sin(fovV/2) (vertical is the narrower FOV at 16:9)
    expect(dist).toBeCloseTo(radius / Math.sin((45 * Math.PI) / 360), 3)
  })

  it('applies the padding factor linearly', () => {
    const tight = computeFrameCamera(unitBox, { x: 0, y: 0, z: -1 }, 45, 1, 1)
    const padded = computeFrameCamera(unitBox, { x: 0, y: 0, z: -1 }, 45, 1, 1.5)
    expect(Math.abs(padded.position.z)).toBeCloseTo(Math.abs(tight.position.z) * 1.5, 4)
  })

  it('handles degenerate boxes with a minimum radius (never lands inside geometry)', () => {
    const point: BoxLike = { min: { x: 5, y: 5, z: 5 }, max: { x: 5, y: 5, z: 5 } }
    const cam = computeFrameCamera(point, { x: -1, y: 0, z: 0 }, 45, 1)
    const d = Math.hypot(cam.position.x - 5, cam.position.y - 5, cam.position.z - 5)
    expect(d).toBeGreaterThan(0.5)
  })

  it('normalises a non-unit view direction', () => {
    const a = computeFrameCamera(unitBox, { x: 0, y: 0, z: -1 }, 45, 1)
    const b = computeFrameCamera(unitBox, { x: 0, y: 0, z: -10 }, 45, 1)
    expect(b.position.z).toBeCloseTo(a.position.z, 5)
  })
})

describe('generateAutoTour', () => {
  const viewer: AutoTourViewer = {
    getCameraViewpoint: () => ({
      position: { x: 10, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      direction: { x: -0.577, y: -0.577, z: -0.577 },
      fovDeg: 45,
      aspect: 16 / 9,
    }),
    getElementsBox: (ids) =>
      Promise.resolve(ids.length > 0
        ? { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }
        : null),
    getModelBounds: () => ({ center: { x: 5, y: 5, z: 5 }, size: { x: 10, y: 6, z: 8 } }),
  }

  it('produces steps with camera, rule reference and highlight ids', async () => {
    const issues = [
      issue({ ruleId: 'RULE_DUPLICATE_GUID', severity: 'error', expressId: 4 }),
      issue({ ruleId: 'RULE_EMPTY_NAME', severity: 'warning', expressId: 9 }),
    ]
    const tour = await generateAutoTour(issues, viewer)
    expect(tour.createdFrom).toBe('auto')
    expect(tour.steps).toHaveLength(2)
    const [first, second] = tour.steps
    expect(first.issueRuleId).toBe('RULE_DUPLICATE_GUID')
    expect(first.issueSeverity).toBe('error')
    expect(first.highlightedExpressIds).toEqual([4])
    expect(first.camera.target).toEqual({ x: 1, y: 1, z: 1 }) // box centre
    expect(second.issueRuleId).toBe('RULE_EMPTY_NAME')
  })

  it('keeps the presenter camera for steps that cannot be framed (file-level)', async () => {
    const tour = await generateAutoTour(
      [issue({ ruleId: 'RULE_INVALID_IFC_VERSION', severity: 'info', expressId: 0 })],
      viewer,
    )
    expect(tour.steps).toHaveLength(1)
    expect(tour.steps[0].highlightedExpressIds).toBeUndefined()
    expect(tour.steps[0].camera.position).toEqual({ x: 10, y: 10, z: 10 })
    expect(tour.steps[0].camera.target).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('falls back to a default viewpoint when the viewer has no camera yet', async () => {
    const blindViewer: AutoTourViewer = { ...viewer, getCameraViewpoint: () => null }
    const tour = await generateAutoTour([issue({ expressId: 1 })], blindViewer)
    expect(tour.steps[0].camera.target).toEqual({ x: 1, y: 1, z: 1 })
    expect(Number.isFinite(tour.steps[0].camera.position.x)).toBe(true)
  })
})

describe('generateAutoTour — showcase strategy (D-26)', () => {
  const viewer: AutoTourViewer = {
    getCameraViewpoint: () => ({
      position: { x: 10, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      direction: { x: -0.577, y: -0.577, z: -0.577 },
      fovDeg: 45,
      aspect: 16 / 9,
    }),
    getElementsBox: () => Promise.resolve({ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }),
    getModelBounds: () => ({ center: { x: 0, y: 5, z: 0 }, size: { x: 20, y: 10, z: 20 } }),
  }
  const someIssues = [
    issue({ ruleId: 'RULE_DUPLICATE_GUID', severity: 'error', expressId: 4 }),
    issue({ ruleId: 'RULE_EMPTY_NAME', severity: 'warning', expressId: 9 }),
  ]

  it('produces whole-model views (no issue references), all targeting the model centre', async () => {
    const tour = await generateAutoTour(someIssues, viewer, { strategy: 'showcase', maxSteps: 5 })
    expect(tour.steps).toHaveLength(5)
    for (const step of tour.steps) {
      expect(step.issueRuleId).toBeUndefined()
      expect(step.highlightedExpressIds).toBeUndefined()
      expect(step.camera.target).toEqual({ x: 0, y: 5, z: 0 })
    }
    // Distinct camera positions per view
    const keys = new Set(tour.steps.map((s) => `${s.camera.position.x.toFixed(1)},${s.camera.position.z.toFixed(1)}`))
    expect(keys.size).toBe(5)
  })

  it('attaches positional captions and caps at the available view list', async () => {
    const captions = ['A', 'B', 'C']
    const tour = await generateAutoTour([], viewer, { strategy: 'showcase', maxSteps: 3, showcaseCaptions: captions })
    expect(tour.steps.map((s) => s.caption)).toEqual(captions)
    const big = await generateAutoTour([], viewer, { strategy: 'showcase', maxSteps: 99 })
    expect(big.steps).toHaveLength(SHOWCASE_VIEWS.length)
  })

  it('appends one improvements step (top severity group) inside the cap when requested', async () => {
    const tour = await generateAutoTour(someIssues, viewer, {
      strategy: 'showcase', maxSteps: 4, includeImprovementsStep: true, improvementsCaption: 'Mejoras',
    })
    expect(tour.steps).toHaveLength(4)
    const last = tour.steps[tour.steps.length - 1]
    expect(last.issueRuleId).toBe('RULE_DUPLICATE_GUID') // error outranks warning
    expect(last.caption).toBe('Mejoras')
    expect(tour.steps.slice(0, -1).every((s) => !s.issueRuleId)).toBe(true)
  })

  it('degrades to the presenter camera when the model has no bounds', async () => {
    const blind: AutoTourViewer = { ...viewer, getModelBounds: () => null }
    const tour = await generateAutoTour([], blind, { strategy: 'showcase' })
    expect(tour.steps).toHaveLength(1)
    expect(tour.steps[0].camera.position).toEqual({ x: 10, y: 10, z: 10 })
  })

  it('boundsToBox converts center/size to min/max', () => {
    expect(boundsToBox({ center: { x: 5, y: 5, z: 5 }, size: { x: 10, y: 6, z: 8 } })).toEqual({
      min: { x: 0, y: 2, z: 1 }, max: { x: 10, y: 8, z: 9 },
    })
  })
})
