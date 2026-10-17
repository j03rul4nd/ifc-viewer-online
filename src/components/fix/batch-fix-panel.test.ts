// @vitest-environment jsdom
// ─── Batch rename, wired into the validation panel ────────────────────────────
// Mounts the real ValidationPanel (desktop and phone) over one model with
// three doors named "D01" under one storey, and walks the flow end to end up
// to the export: "Fix all 3" → preview → Apply → one undoable command, the
// fixed-file card, Ctrl+Z takes it all back. The export and check themselves
// (fix-run) are stubbed — they have their own tests — and so is the benchmark
// POST, which is asserted on: once per file, however often the result changes.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../locales/en/validation.json'
import type { SceneModel, SpatialNode, ValidationIssue, ValidationResult } from '../../types'

vi.mock('../../lib/benchmark', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/benchmark')>()),
  postBenchmark: vi.fn(),
  fetchBenchmark: vi.fn(async () => null),
}))
vi.mock('../../lib/fix/fix-run', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/fix/fix-run')>()),
  runFixChecks: vi.fn(async () => {}),
}))

import ValidationPanel from '../ValidationPanel'
import { postBenchmark } from '../../lib/benchmark'
import { runFixChecks } from '../../lib/fix/fix-run'
import { modelRegistry } from '../../lib/model-registry'
import { useValidationStore } from '../../stores/validationStore'
import { useSceneStore } from '../../stores/sceneStore'
import { useUIStore } from '../../stores/uiStore'
import { useEditorStore } from '../../stores/editorStore'
import { useBatchFixStore } from '../../stores/batchFixStore'
import { useWaiverStore } from '../../stores/waiverStore'
import { useToastStore } from '../../stores/toastStore'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const TREE: SpatialNode[] = [{
  expressId: 1, globalId: 'g1', ifcClass: 'IfcSite', name: 'Site', containedElements: [], children: [{
    expressId: 2, globalId: 'g2', ifcClass: 'IfcBuilding', name: 'Building', containedElements: [], children: [{
      expressId: 3, globalId: 'g3', ifcClass: 'IfcBuildingStorey', name: 'Level 1', children: [],
      containedElements: [7, 12, 30].map((id) => ({ expressId: id, globalId: `g${id}`, ifcClass: 'IfcDoor', name: 'D01' })),
    }],
  }],
}]

const dup = (expressId: number): ValidationIssue => ({
  id: `d${expressId}`, ruleId: 'RULE_DUPLICATE_NAME', severity: 'warning', expressId,
  globalId: `g${expressId}`, ifcClass: 'IfcDoor', elementName: 'D01', message: 'Duplicate name', path: [],
  autoFixable: false, modelId: 'A', scopeId: 3,
})

const makeResult = (): ValidationResult => ({
  issues: [dup(7), dup(12), dup(30)],
  stats: { total: 3, errors: 0, warnings: 3, info: 0, byRule: { RULE_DUPLICATE_NAME: 3 } },
  durationMs: 10,
  qualityScore: 97,
})

const MODEL = {
  id: 'A', fileName: 'tower.ifc', fileSize: 8, elementCount: 3, categories: [], visible: true,
  transform: {}, loadedAt: 0,
} as unknown as SceneModel

let i18n: I18n
let host: HTMLDivElement
let root: Root

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({
    lng: 'en', resources: { en: { validation: en } }, interpolation: { escapeValue: false },
  })
  modelRegistry.register({
    modelId: 'A', fileName: 'tower.ifc', ifcBuffer: new ArrayBuffer(8), opfsCacheKey: 'tower-key',
    expressIDToType: new Map(), loadedAt: 0,
  })
})

beforeEach(() => {
  vi.mocked(postBenchmark).mockClear()
  vi.mocked(runFixChecks).mockClear()
  useEditorStore.getState().clearHistory()
  useBatchFixStore.getState().clear()
  useWaiverStore.setState({ muted: [] })
  useSceneStore.setState({ models: [MODEL] })
  useUIStore.setState({ validationPanelOpen: true })
  const result = makeResult()
  useValidationStore.setState({
    result, isRunning: false, validationStatus: 'complete', activeValidationModelId: 'A',
    spatialTrees: { A: TREE }, cachedResultsByModel: { A: result }, previousResultByModel: {},
    filters: { ...useValidationStore.getState().filters, groupBy: 'rule', activeTab: 'all' },
  })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const render = (): void => {
  act(() => root.render(createElement(I18nextProvider, { i18n }, createElement(ValidationPanel))))
}
const q = <T extends Element = HTMLElement>(testId: string): T | null =>
  document.body.querySelector<T>(`[data-testid="${testId}"]`)
const click = (target: Element): void => {
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

describe('ValidationPanel batch rename', () => {
  it('Fix all → preview → Apply queues one command, shows the card, and Ctrl+Z undoes it', () => {
    render()
    const chip = q<HTMLButtonElement>('batch-fix-chip')!
    expect(chip.textContent).toBe('Fix all 3')
    expect(chip.disabled).toBe(false)

    click(chip)
    expect(document.body.textContent).toContain('Fix duplicate names')
    click(q('batch-rename-apply')!)

    const { history, historyIndex } = useEditorStore.getState()
    expect(historyIndex).toBe(0)
    expect(history).toHaveLength(1)
    expect(history[0].modelId).toBe('A')
    expect(history[0].batchId).toBeTruthy()
    expect(history[0].diffs.map((d) => d.type === 'RENAME' && [d.expressId, d.newValue])).toEqual([[12, 'D01-001'], [30, 'D01-002']])

    const batch = useBatchFixStore.getState().batch!
    expect(batch.batchId).toBe(history[0].batchId)
    expect(batch).toMatchObject({ ruleId: 'RULE_DUPLICATE_NAME', modelIds: ['A'], renamed: 2, cleared: 3, predictedBefore: 97, predictedAfter: 100 })
    expect(runFixChecks).toHaveBeenCalledWith(batch, { A: 'tower.ifc' })

    // The dialog closed; the card is up, and the chip is gone (all 3 are edited).
    expect(q('batch-rename-apply')).toBeNull()
    expect(q('batch-fix-card')).not.toBeNull()
    expect(q('batch-fix-badge')!.textContent).toBe('predicted')
    expect(q('batch-fix-chip')).toBeNull()
    expect(host.textContent).toContain('2 edited')

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
    expect(useEditorStore.getState().historyIndex).toBe(-1)
    expect(useBatchFixStore.getState().batch).toBeNull()
    expect(q('batch-fix-card')).toBeNull()
    expect(q<HTMLButtonElement>('batch-fix-chip')!.textContent).toBe('Fix all 3')
  })

  it('is disabled with a reason when the IFC bytes are not in memory', () => {
    useSceneStore.setState({ models: [{ ...MODEL, id: 'B' } as SceneModel] })
    const result = { ...makeResult(), issues: makeResult().issues.map((i) => ({ ...i, modelId: 'B' })) }
    useValidationStore.setState({
      result, activeValidationModelId: 'B', spatialTrees: { B: TREE }, cachedResultsByModel: { B: result },
    })
    render()
    const chip = q<HTMLButtonElement>('batch-fix-chip')!
    expect(chip.disabled).toBe(true)
    expect(chip.title).toContain('The original IFC is not in memory')
  })

  it('posts each file to the benchmark once, however often the result changes', () => {
    // A file this session has not posted yet (the posted set outlives a test).
    modelRegistry.register({
      modelId: 'A', fileName: 'tower.ifc', ifcBuffer: new ArrayBuffer(8), opfsCacheKey: 'tower-key-2',
      expressIDToType: new Map(), loadedAt: 0,
    })
    render()
    expect(postBenchmark).toHaveBeenCalledTimes(1)
    expect(postBenchmark).toHaveBeenCalledWith(97)

    // Re-validate: a new result object for the same file.
    const again = makeResult()
    act(() => useValidationStore.setState({ result: again, cachedResultsByModel: { A: again } }))
    expect(postBenchmark).toHaveBeenCalledTimes(1)
  })

  it('after Apply, keyboard focus lands on the fixed-file card, not on <body>', async () => {
    render()
    click(q('batch-fix-chip')!)
    click(q('batch-rename-apply')!)
    expect(q('batch-fix-card')).not.toBeNull()
    expect(document.activeElement).toBe(q('batch-fix-card'))
    // The closing dialog's own focus restore (a timeout) leaves it there.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(document.activeElement).toBe(q('batch-fix-card'))
  })

  it('a second batch waits while the fixed file is being checked', () => {
    const empty = (expressId: number): ValidationIssue => ({
      id: `e${expressId}`, ruleId: 'RULE_EMPTY_NAME', severity: 'error', expressId, globalId: `g${expressId}`,
      ifcClass: 'IfcWall', elementName: '(empty)', message: 'Empty name', path: [], autoFixable: false, modelId: 'A',
    })
    const base = makeResult()
    const result: ValidationResult = {
      ...base, issues: [...base.issues, empty(40), empty(41)],
      stats: { ...base.stats, total: 5, errors: 2, byRule: { RULE_DUPLICATE_NAME: 3, RULE_EMPTY_NAME: 2 } },
    }
    useValidationStore.setState({ result, cachedResultsByModel: { A: result } })
    render()
    const dupChip = (): HTMLButtonElement | undefined =>
      [...document.body.querySelectorAll<HTMLButtonElement>('[data-testid="batch-fix-chip"]')].find((b) => b.textContent === 'Fix all 3')
    const emptyChip = (): HTMLButtonElement =>
      [...document.body.querySelectorAll<HTMLButtonElement>('[data-testid="batch-fix-chip"]')].find((b) => b.textContent === 'Fix all 2')!
    click(dupChip()!)
    click(q('batch-rename-apply')!)

    // The check (stubbed here) has not settled: the other rule waits for it.
    expect(emptyChip().disabled).toBe(true)
    expect(emptyChip().title).toBe('Wait for the check of the fixed file to finish.')

    const batch = useBatchFixStore.getState().batch!
    act(() => {
      const s = useBatchFixStore.getState()
      s.startRun({ modelId: 'A', batchId: batch.batchId, ruleId: batch.ruleId, fileName: 'tower-fixed.ifc', before: result, historySig: '', startedAt: 0 })
      s.finishRun('A', batch.batchId, { bytes: new Uint8Array([1]), after: result, skippedDiffs: 0, totalDiffs: 2 })
    })
    expect(emptyChip().disabled).toBe(false)
  })

  it('an empty spatial tree (no IfcProject, no IfcSite) still allows the fix', () => {
    useValidationStore.setState({ spatialTrees: { A: [] } })
    render()
    const chip = q<HTMLButtonElement>('batch-fix-chip')!
    expect(chip.disabled).toBe(false)
    expect(chip.title).not.toContain('Run the validation again')
  })

  it('never posts a removed model\'s score under the next model', () => {
    modelRegistry.register({
      modelId: 'A', fileName: 'tower.ifc', ifcBuffer: new ArrayBuffer(8), opfsCacheKey: 'tower-key-3',
      expressIDToType: new Map(), loadedAt: 0,
    })
    modelRegistry.register({
      modelId: 'N', fileName: 'next.ifc', ifcBuffer: new ArrayBuffer(8), opfsCacheKey: 'next-key',
      expressIDToType: new Map(), loadedAt: 0,
    })
    render()
    expect(postBenchmark).toHaveBeenCalledTimes(1)

    // A leaves the scene: its result stays on screen (status idle) …
    act(() => {
      useSceneStore.setState({ models: [] })
      useValidationStore.setState({ validationStatus: 'idle', cachedResultsByModel: {} })
    })
    // … and the next file loads, not validated yet.
    act(() => useSceneStore.setState({ models: [{ ...MODEL, id: 'N', fileName: 'next.ifc' } as SceneModel] }))
    expect(postBenchmark).toHaveBeenCalledTimes(1)
  })

  it('offers the same flow on a phone', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true, media: query,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    }))
    render()
    const chip = q<HTMLButtonElement>('batch-fix-chip')!
    expect(chip.textContent).toBe('Fix all 3')
    click(chip)
    expect(q('batch-rename-apply')).not.toBeNull()
    click(q('batch-rename-apply')!)
    expect(useEditorStore.getState().history).toHaveLength(1)
    expect(q('batch-fix-card')).not.toBeNull()
  })

  it('on a phone, a greyed chip says why when tapped (no tooltip on touch)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true, media: query,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    }))
    useToastStore.setState({ toasts: [] })
    useSceneStore.setState({ models: [{ ...MODEL, id: 'B' } as SceneModel] })
    const result = { ...makeResult(), issues: makeResult().issues.map((i) => ({ ...i, modelId: 'B' })) }
    useValidationStore.setState({
      result, activeValidationModelId: 'B', spatialTrees: { B: TREE }, cachedResultsByModel: { B: result },
    })
    render()
    const chip = q<HTMLButtonElement>('batch-fix-chip')!
    expect(chip.getAttribute('aria-disabled')).toBe('true')
    click(chip)
    expect(q('batch-rename-apply')).toBeNull()
    expect(useToastStore.getState().toasts.map((x) => x.message).join(' ')).toContain('The original IFC is not in memory')
  })
})
