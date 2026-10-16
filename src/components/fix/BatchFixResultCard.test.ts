// @vitest-environment jsdom
// ─── BatchFixResultCard / BatchFixBar ─────────────────────────────────────────
// Mounts the card with createRoot + act. Pins the honesty rules: the score is
// "predicted" until every model's check is done, Download hands over exactly
// the checked bytes straight from the click (nothing awaited first, so the save
// picker keeps the click's activation), and a stale check cannot be downloaded.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18next, { type i18n as I18n } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import en from '../../locales/en/validation.json'
import BatchFixResultCard, {
  BatchFixBar, downloadFixedRun, fixCardView,
  type BatchFixBarProps, type BatchFixResultCardProps,
} from './BatchFixResultCard'
import type { FixBatch, FixRun } from '../../stores/batchFixStore'
import type { FixSummary } from '../../lib/fix/score-delta'
import type { ValidationResult } from '../../types'

vi.mock('../../lib/analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/analytics')>()),
  trackExportClicked: vi.fn(),
}))
import { trackExportClicked } from '../../lib/analytics'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const RESULT: ValidationResult = {
  issues: [], stats: { total: 0, errors: 0, warnings: 0, info: 0, byRule: {} }, durationMs: 0, qualityScore: 100,
}

const batch = (over: Partial<FixBatch> = {}): FixBatch => ({
  batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', modelIds: ['A'], renamed: 2, cleared: 3,
  predictedBefore: 97, predictedAfter: 100, patternEdited: false, keepFirst: true,
  tokens: ['n', 'name'], startedAt: 0, ...over,
})

const run = (over: Partial<FixRun> = {}): FixRun => ({
  modelId: 'A', batchId: 'b1', ruleId: 'RULE_DUPLICATE_NAME', status: 'done', progress: 100,
  historySig: 'sig', fileName: 'tower-fixed.ifc', before: RESULT, after: RESULT,
  bytes: new Uint8Array([73, 83, 79, 45, 49, 48]), skippedDiffs: 0, totalDiffs: 2, startedAt: 0, ...over,
})

const PREDICTED: FixSummary = { before: 97, after: 100, resolved: 3, added: 0, measured: false }
const MEASURED: FixSummary = { before: 97, after: 100, resolved: 3, added: 0, measured: true }

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
  vi.mocked(trackExportClicked).mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function renderCard(over: Partial<BatchFixResultCardProps> = {}): BatchFixResultCardProps {
  const props: BatchFixResultCardProps = {
    batch: batch(),
    modelIds: ['A'],
    runs: [run()],
    summary: MEASURED,
    onDownload: vi.fn(),
    onUndo: vi.fn(),
    onDismiss: vi.fn(),
    onRecheck: vi.fn(),
    ...over,
  }
  act(() => root.render(createElement(I18nextProvider, { i18n }, createElement(BatchFixResultCard, props))))
  return props
}

function renderBar(over: Partial<BatchFixBarProps> = {}): BatchFixBarProps {
  const props: BatchFixBarProps = { count: 12, done: false, onFix: vi.fn(), ...over }
  act(() => root.render(createElement(I18nextProvider, { i18n }, createElement(BatchFixBar, props))))
  return props
}

const q = <T extends Element = HTMLElement>(testId: string): T | null =>
  host.querySelector<T>(`[data-testid="${testId}"]`)
const all = (testId: string): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>(`[data-testid="${testId}"]`)]
const click = (target: Element): void => {
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
}

describe('BatchFixResultCard', () => {
  it('shows the score as predicted while the check runs', () => {
    renderCard({ runs: [run({ status: 'checking', progress: 40, bytes: undefined, after: undefined })], summary: PREDICTED })
    expect(q('batch-fix-progress')!.textContent).toContain('Checking the fixed file… 40%')
    expect(q('batch-fix-badge')!.textContent).toBe('predicted')
    expect(q('batch-fix-badge')!.dataset.measured).toBe('false')
    expect(q<HTMLButtonElement>('batch-fix-download')!.disabled).toBe(true)
  })

  it('a model not started yet counts as writing, and keeps the badge predicted', () => {
    renderCard({ batch: batch({ modelIds: ['A', 'B'] }), modelIds: ['A', 'B'], runs: [run()], summary: PREDICTED })
    expect(q('batch-fix-progress')!.textContent).toContain('Writing the fixed IFC…')
    expect(q('batch-fix-badge')!.textContent).toBe('predicted')
  })

  it('switches to measured once every model is done', () => {
    renderCard()
    expect(q('batch-fix-progress')).toBeNull()
    expect(q('batch-fix-score')!.textContent).toBe('Health Score 97 → 100')
    expect(host.textContent).toContain('+3 pts')
    expect(q('batch-fix-badge')!.textContent).toBe('measured on the fixed file')
    expect(host.textContent).toContain('3 issues cleared · 0 new')
    expect(host.textContent).toContain("The score at the top is still the original file's.")
    expect(host.textContent).toContain('tower-fixed.ifc')
  })

  it('Download hands over the checked bytes from the click, with nothing awaited first', async () => {
    const r = run()
    const download = vi.fn((_blob: Blob, _name: string) => Promise.resolve())
    renderCard({ runs: [r], onDownload: (id) => { if (id === r.modelId) void downloadFixedRun(r, download) } })

    const button = q<HTMLButtonElement>('batch-fix-download')!
    expect(button.disabled).toBe(false)
    click(button)
    // Synchronously, in the click: a save picker opened after an await loses
    // the user's activation.
    expect(download).toHaveBeenCalledTimes(1)
    const [blob, name] = download.mock.calls[0]
    expect(name).toBe('tower-fixed.ifc')
    expect(blob.type).toBe('application/x-step')
    expect(blob.size).toBe(r.bytes!.byteLength)
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(r.bytes)

    await Promise.resolve()
    expect(trackExportClicked).toHaveBeenCalledWith({ format: 'ifc', model_count: 1, source: 'batch_fix' })
  })

  it('the stale state disables Download and offers Check again', () => {
    const stale = run({ status: 'stale', bytes: undefined })
    const props = renderCard({ runs: [stale], summary: PREDICTED })
    expect(q<HTMLButtonElement>('batch-fix-download')!.disabled).toBe(true)
    expect(q('batch-fix-stale')!.textContent).toContain('Your edits changed after this check.')
    click([...q('batch-fix-stale')!.querySelectorAll('button')].find((b) => b.textContent === 'Check again')!)
    expect(props.onRecheck).toHaveBeenCalledTimes(1)

    const download = vi.fn(() => Promise.resolve())
    expect(downloadFixedRun(stale, download)).toBeNull()
    expect(download).not.toHaveBeenCalled()
  })

  it('an error offers Retry; a missing buffer explains instead', () => {
    const props = renderCard({
      runs: [run({ status: 'error', bytes: undefined, error: { code: 'check_failed', message: 'worker died' } })],
      summary: PREDICTED,
    })
    expect(q('batch-fix-error')!.textContent).toContain('Could not check the fixed file.')
    click([...q('batch-fix-error')!.querySelectorAll('button')].find((b) => b.textContent === 'Retry')!)
    expect(props.onRecheck).toHaveBeenCalledTimes(1)

    renderCard({
      runs: [run({ status: 'error', bytes: undefined, error: { code: 'no_buffer', message: 'x' } })],
      summary: PREDICTED,
    })
    expect(q('batch-fix-error')!.textContent).toContain('The original IFC is not in memory')
    expect(q('batch-fix-error')!.querySelector('button')).toBeNull()
  })

  it('failures read in the UI language; the raw message is only the tooltip', () => {
    renderCard({
      runs: [run({ status: 'error', bytes: undefined, error: { code: 'stalled', message: 'The check stalled after RULE_CLASH_DETECTION — no progress for 60s.' } })],
      summary: PREDICTED,
    })
    const text = q('batch-fix-error')!.querySelector('span')!
    expect(text.textContent).toBe('The check of the fixed file stopped responding.')
    expect(text.title).toContain('RULE_CLASH_DETECTION')
    expect(q('batch-fix-error')!.querySelector('button')!.textContent).toBe('Retry')

    renderCard({
      runs: [run({ status: 'error', bytes: undefined, error: { code: 'export_failed', message: 'web-ifc said no' } })],
      summary: PREDICTED,
    })
    expect(q('batch-fix-error')!.textContent).toContain('Could not write the fixed IFC.')
    expect(q('batch-fix-error')!.textContent).not.toContain('web-ifc said no')
  })

  it('no original result to compare with: explains, and offers no Retry that cannot work', () => {
    renderCard({
      runs: [run({ status: 'error', bytes: undefined, error: { code: 'no_result', message: 'x' } })],
      summary: PREDICTED,
    })
    expect(q('batch-fix-error')!.textContent).toContain('Run the validation, then apply the fix again.')
    expect(q('batch-fix-error')!.querySelector('button')).toBeNull()
  })

  it('counts read in the singular for one', () => {
    renderCard({ summary: { ...MEASURED, resolved: 1, added: 1 } })
    expect(q('batch-fix-resolved')!.textContent).toBe('1 issue cleared · 1 new')
  })

  it('says so when the export settings changed the header checks too', () => {
    const header = { id: 'h', ruleId: 'RULE_FILE_AUTHOR_MISSING', severity: 'info' as const, expressId: 0, globalId: null,
      ifcClass: 'FILE_NAME', elementName: 'FILE_NAME', message: '', path: [], autoFixable: false }
    renderCard({ runs: [run({ before: { ...RESULT, issues: [header] } })] })
    expect(q('batch-fix-header-note')!.textContent).toContain('export settings')

    renderCard()
    expect(q('batch-fix-header-note')).toBeNull()
  })

  it('takes focus when asked, so a keyboard user lands on it after Apply', () => {
    renderCard({ autoFocus: true })
    expect(document.activeElement).toBe(q('batch-fix-card'))
  })

  it('Undo and dismiss call their handlers', () => {
    const props = renderCard()
    click(q('batch-fix-undo')!)
    click(q('batch-fix-dismiss')!)
    expect(props.onUndo).toHaveBeenCalledTimes(1)
    expect(props.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('one download per model, named, when the batch spans several', () => {
    const props = renderCard({
      batch: batch({ modelIds: ['A', 'B'] }),
      modelIds: ['A', 'B'],
      runs: [run(), run({ modelId: 'B', fileName: 'annex-fixed.ifc' })],
    })
    const buttons = all('batch-fix-download')
    expect(buttons.map((b) => b.textContent)).toEqual(['Download tower-fixed.ifc', 'Download annex-fixed.ifc'])
    click(buttons[1])
    expect(props.onDownload).toHaveBeenCalledWith('B')
  })

  it('says when the file carries earlier edits, and when some could not be written', () => {
    renderCard({ runs: [run({ totalDiffs: 5, skippedDiffs: 1 })] })
    expect(host.textContent).toContain('Includes 5 edits')
    expect(host.textContent).toContain('1 edit could not be written')
  })

  it('offers the empty names after a duplicate-name batch', () => {
    const onAlsoFixEmpty = vi.fn()
    renderCard({ alsoFixEmptyCount: 4, onAlsoFixEmpty })
    click(q('batch-fix-also-empty')!)
    expect(q('batch-fix-also-empty')!.textContent).toBe('Also fill 4 empty names')
    expect(onAlsoFixEmpty).toHaveBeenCalledTimes(1)

    renderCard({ batch: batch({ ruleId: 'RULE_EMPTY_NAME' }), alsoFixEmptyCount: 4, onAlsoFixEmpty })
    expect(q('batch-fix-also-empty')).toBeNull()
  })

  it('tells the list below to re-measure when it mounts', () => {
    const onResize = vi.fn()
    renderCard({ onResize })
    expect(onResize).toHaveBeenCalled()
  })
})

describe('fixCardView', () => {
  it('ignores runs from another batch', () => {
    const v = fixCardView(['A'], [run({ batchId: 'old' })], 'b1')
    expect(v.allDone).toBe(false)
    expect(v.working).toEqual({ modelId: 'A', status: 'exporting', progress: 0 })
  })
})

describe('BatchFixBar', () => {
  it('offers the fix with its count', () => {
    const props = renderBar()
    expect(q('batch-fix-bar')!.textContent).toContain('12 issues can be fixed here, in your browser')
    const button = q('batch-fix-bar')!.querySelector('button')!
    expect(button.textContent).toBe('Fix all 12')
    click(button)
    expect(props.onFix).toHaveBeenCalledTimes(1)
  })

  it('is disabled with the reason as its tooltip, and says it in the bar', () => {
    renderBar({ disabledReason: 'Wait for the validation to finish.' })
    const button = q('batch-fix-bar')!.querySelector('button')!
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('Wait for the validation to finish.')
    // Not "can be fixed here" next to a button that refuses.
    expect(q('batch-fix-bar')!.textContent).toContain('Wait for the validation to finish.')
    expect(q('batch-fix-bar')!.textContent).not.toContain('can be fixed here')
  })

  it('points at the card once the rule was fixed, and hides when there is nothing to do', () => {
    renderBar({ count: 0, done: true })
    expect(q('batch-fix-bar')!.textContent).toContain('Renamed — see the fixed file above')
    expect(q('batch-fix-bar')!.querySelector('button')).toBeNull()

    renderBar({ count: 0, done: false })
    expect(q('batch-fix-bar')).toBeNull()
  })
})
