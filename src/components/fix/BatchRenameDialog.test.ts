// @vitest-environment jsdom
// ─── BatchRenameDialog ────────────────────────────────────────────────────────
// Mounts the real dialog (Radix underneath, createRoot + act) with the real
// planner from lib/fix over a small tree: three doors named "D01" under one
// storey. Pins what the preview promises — the pattern error blocks Apply,
// Reset restores the default, keep-first changes the summary, and Apply hands
// back the plan for the pattern the input shows, even inside the debounce.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../locales/en/validation.json'
import BatchRenameDialog, { pickSampleRows, type BatchRenameApply, type BatchRenameDialogProps } from './BatchRenameDialog'
import { planBatchRename, type BatchRenamePlan, type BatchRenameRule } from '../../lib/fix/batch-rename'
import { DEFAULT_PATTERNS, parseNamePattern, type ParsedPattern } from '../../lib/fix/name-pattern'
import { EMPTY_PENDING } from '../../lib/fix/pending'
import { predictScoreAfter } from '../../lib/fix/score-delta'
import type { SpatialElement, SpatialNode, ValidationIssue } from '../../types'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const el = (expressId: number, name: string, ifcClass = 'IfcDoor'): SpatialElement =>
  ({ expressId, globalId: `g${expressId}`, ifcClass, name })
const node = (
  expressId: number, ifcClass: string, name: string,
  children: SpatialNode[] = [], containedElements: SpatialElement[] = [],
): SpatialNode => ({ expressId, globalId: `g${expressId}`, ifcClass, name, children, containedElements })

// Level 1 (#3) holds doors 7, 12 and 30, all named "D01"; walls 40 and 41 have no name.
const TREE: SpatialNode[] = [node(1, 'IfcSite', 'Site', [node(2, 'IfcBuilding', 'Building', [
  node(3, 'IfcBuildingStorey', 'Level 1', [], [
    el(7, 'D01'), el(12, 'D01'), el(30, 'D01'), el(40, '#40', 'IfcWall'), el(41, '#41', 'IfcWall'),
  ]),
])])]

const dup = (expressId: number, scopeId?: number): ValidationIssue => ({
  id: `d${expressId}`, ruleId: 'RULE_DUPLICATE_NAME', severity: 'warning', expressId,
  globalId: `A-g${expressId}`, ifcClass: 'IfcDoor', elementName: 'D01', message: '', path: [],
  autoFixable: false, modelId: 'A', ...(scopeId === undefined ? {} : { scopeId }),
})
const empty = (expressId: number): ValidationIssue => ({
  id: `e${expressId}`, ruleId: 'RULE_EMPTY_NAME', severity: 'error', expressId,
  globalId: `A-g${expressId}`, ifcClass: 'IfcWall', elementName: '(empty)', message: '', path: [],
  autoFixable: false, modelId: 'A',
})

const DUP_ISSUES = [dup(12, 3), dup(7, 3), dup(30, 3)]

const plannerFor = (
  ruleId: BatchRenameRule,
  issues: ValidationIssue[],
  trees: Record<string, SpatialNode[]> = { A: TREE },
) => (pattern: ParsedPattern, keepFirst: boolean): BatchRenamePlan => planBatchRename({
  ruleId, pattern, keepFirst, issues, trees, pendingNamesByModel: {}, pending: EMPTY_PENDING,
})

let i18n: I18n
let host: HTMLDivElement
let root: Root

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  i18n = i18next.createInstance()
  await i18n.use(initReactI18next).init({
    lng: 'en', resources: { en: { validation: en } }, interpolation: { escapeValue: false },
  })
})

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(over: Partial<BatchRenameDialogProps> & { ruleId?: BatchRenameRule; issues?: ValidationIssue[] } = {}) {
  const ruleId = over.ruleId ?? 'RULE_DUPLICATE_NAME'
  const issues = over.issues ?? DUP_ISSUES
  const props: BatchRenameDialogProps = {
    ruleId,
    onClose: vi.fn(),
    planner: plannerFor(ruleId, issues),
    beforeScore: 97,
    predictAfter: (plan) => predictScoreAfter(issues, plan.clearedKeys),
    onApply: vi.fn(),
    debounceMs: 0,
    ...over,
  }
  act(() => root.render(createElement(I18nextProvider, { i18n }, createElement(BatchRenameDialog, props))))
  return props
}

const q = <T extends Element = HTMLElement>(testId: string): T | null =>
  document.body.querySelector<T>(`[data-testid="${testId}"]`)
const input = (): HTMLInputElement => q<HTMLInputElement>('batch-rename-pattern')!
const applyButton = (): HTMLButtonElement => q<HTMLButtonElement>('batch-rename-apply')!

function typeInto(target: HTMLInputElement, value: string): void {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = (target: Element): void => {
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

describe('BatchRenameDialog', () => {
  it('opens on the rule default with a sample and the predicted score', () => {
    render()
    expect(document.body.textContent).toContain('Fix duplicate names')
    expect(input().value).toBe(DEFAULT_PATTERNS.RULE_DUPLICATE_NAME)
    // Keep-first is on by default: door 7 (lowest id) keeps "D01".
    expect(q('batch-rename-summary')!.textContent).toContain('Renames 2 elements · clears 3 issues')
    const rows = [...q('batch-rename-sample')!.querySelectorAll('tbody tr')].map((r) => r.textContent)
    expect(rows).toEqual(['Level 1D01D01-001', 'Level 1D01D01-002'])
    expect(q('batch-rename-predicted')!.textContent).toBe('Predicted Health Score: 97 → 100')
    expect(applyButton().disabled).toBe(false)
    expect(applyButton().textContent).toBe('Rename 2')
  })

  it('shows the unknown-token error and disables Apply', () => {
    render()
    typeInto(input(), '{foo}')
    expect(q('batch-rename-error')!.textContent).toBe('Unknown token {foo}.')
    expect(applyButton().disabled).toBe(true)
  })

  it('keeps the last valid preview, dimmed, while the pattern does not parse', () => {
    render()
    typeInto(input(), '{name}-{')
    expect(q('batch-rename-error')!.textContent).toBe('A brace is not closed.')
    // The summary and sample stay put (no collapse while typing a token)…
    expect(q('batch-rename-summary')!.textContent).toContain('Renames 2 elements · clears 3 issues')
    expect(q('batch-rename-sample')).not.toBeNull()
    expect(q('batch-rename-preview-summary')!.dataset.outdated).toBe('true')
    // …the keep-first box keeps its real state, and Apply waits.
    expect(q<HTMLInputElement>('batch-rename-keep-first')!.checked).toBe(true)
    expect(applyButton().disabled).toBe(true)

    typeInto(input(), '{name}-{n}')
    expect(q('batch-rename-preview-summary')!.dataset.outdated).toBe('false')
    expect(applyButton().disabled).toBe(false)
  })

  it('an Enter that confirms an IME composition does not apply', () => {
    const props = render()
    const press = (init: KeyboardEventInit): void => {
      act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })) })
    }
    press({ isComposing: true })
    press({ keyCode: 229 })
    expect(props.onApply).not.toHaveBeenCalled()
    press({})
    expect(props.onApply).toHaveBeenCalledTimes(1)
  })

  it('says one element, not "1 elements"', () => {
    render({ issues: [dup(12, 3), dup(7, 3)] })
    expect(q('batch-rename-summary')!.textContent).toBe('Renames 1 element · clears 2 issues')
  })

  it('Reset restores the default pattern', () => {
    render()
    expect(q('batch-rename-reset')).toBeNull() // nothing to reset yet
    typeInto(input(), '{foo}')
    click(q('batch-rename-reset')!)
    expect(input().value).toBe(DEFAULT_PATTERNS.RULE_DUPLICATE_NAME)
    expect(q('batch-rename-error')).toBeNull()
    expect(applyButton().disabled).toBe(false)
  })

  it('the keep-first toggle changes the summary', () => {
    render()
    const box = q<HTMLInputElement>('batch-rename-keep-first')!
    expect(box.checked).toBe(true)
    act(() => box.click())
    expect(box.checked).toBe(false)
    expect(q('batch-rename-summary')!.textContent).toContain('Renames 3 elements · clears 3 issues')
    expect(applyButton().textContent).toBe('Rename 3')
  })

  it('keep-first is unavailable when an issue has no scopeId', () => {
    render({ issues: [dup(12, 3), dup(7), dup(30, 3)] })
    const box = q<HTMLInputElement>('batch-rename-keep-first')!
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(false)
    expect(document.body.textContent).toContain('Run the validation again to enable this option.')
    expect(q('batch-rename-summary')!.textContent).toContain('Renames 3 elements')
  })

  it('Apply calls the handler with the plan', () => {
    const props = render()
    click(applyButton())
    expect(props.onApply).toHaveBeenCalledTimes(1)
    const arg = (props.onApply as ReturnType<typeof vi.fn>).mock.calls[0][0] as BatchRenameApply
    expect(arg.plan.renamed).toBe(2)
    expect(arg.plan.cleared).toBe(3)
    expect(arg.plan.items.map((i) => [i.expressId, i.newValue])).toEqual([[12, 'D01-001'], [30, 'D01-002']])
    expect(arg.pattern.source).toBe('{name}-{n}')
    expect(arg.keepFirst).toBe(true)
    expect(arg.patternEdited).toBe(false)
  })

  it('Apply inside the debounce uses the pattern the input shows', () => {
    const props = render({ debounceMs: 150 })
    typeInto(input(), '{name}_{n:2}')
    click(applyButton())
    const arg = (props.onApply as ReturnType<typeof vi.fn>).mock.calls[0][0] as BatchRenameApply
    expect(arg.pattern.source).toBe('{name}_{n:2}')
    expect(arg.plan.items.map((i) => i.newValue)).toEqual(['D01_01', 'D01_02'])
    expect(arg.patternEdited).toBe(true)
  })

  it('Apply inside the debounce does nothing for an invalid pattern, and shows why', () => {
    const props = render({ debounceMs: 150 })
    typeInto(input(), '{class')
    click(applyButton())
    expect(props.onApply).not.toHaveBeenCalled()
    expect(q('batch-rename-error')!.textContent).toBe('A brace is not closed.')
  })

  it('a token chip inserts at the cursor', () => {
    render()
    const target = input()
    typeInto(target, 'X-{n}')
    act(() => target.setSelectionRange(2, 2))
    const chip = [...document.body.querySelectorAll('button')].find((b) => b.textContent === '{storey}')!
    click(chip)
    expect(target.value).toBe('X-{storey}{n}')
  })

  it('fills empty names, with the current name shown as (empty)', () => {
    render({ ruleId: 'RULE_EMPTY_NAME', issues: [empty(40), empty(41)], beforeScore: 97 })
    expect(document.body.textContent).toContain('Fill empty names')
    expect(q('batch-rename-keep-first')).toBeNull()
    const cells = [...q('batch-rename-sample')!.querySelectorAll('tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent))
    expect(cells).toEqual([
      ['Level 1', '(empty)', 'Wall-Level 1-001'],
      ['Level 1', '(empty)', 'Wall-Level 1-002'],
    ])
    expect(q('batch-rename-sample')!.querySelector('em')!.textContent).toBe('(empty)')
  })

  it('blocks Apply when a target model has no spatial tree', () => {
    render({ planner: plannerFor('RULE_DUPLICATE_NAME', DUP_ISSUES, {}) })
    expect(applyButton().disabled).toBe(true)
    expect(document.body.textContent).toContain('Run the validation again to enable this fix.')
  })

  it('warns about a checked naming convention', () => {
    render({ namingConventionActive: true })
    expect(q('batch-rename-warnings')!.textContent).toContain('Your profile checks a naming convention.')
  })
})

describe('pickSampleRows', () => {
  const pattern = (src: string): ParsedPattern => {
    const r = parseNamePattern(src)
    if (!r.ok) throw new Error(r.error.code)
    return r.value
  }

  it('takes one row per distinct stem first, then fills in file order', () => {
    // Storey A holds walls 10–19, storey B holds wall 20: B must make the cut.
    const tree: SpatialNode[] = [node(1, 'IfcSite', 'Site', [node(2, 'IfcBuilding', 'B', [
      node(3, 'IfcBuildingStorey', 'A', [], Array.from({ length: 10 }, (_, k) => el(10 + k, `#${10 + k}`, 'IfcWall'))),
      node(4, 'IfcBuildingStorey', 'B', [], [el(20, '#20', 'IfcWall')]),
    ])])]
    const issues = Array.from({ length: 11 }, (_, k) => empty(10 + k))
    const plan = plannerFor('RULE_EMPTY_NAME', issues, { A: tree })(pattern('{class}-{storey}-{n}'), true)
    const rows = pickSampleRows(plan, pattern('{class}-{storey}-{n}'), 4)
    expect(rows.map((r) => r.expressId)).toEqual([10, 11, 12, 20])
  })
})
