// @vitest-environment jsdom
// ─── Loading UI smoke tests ───────────────────────────────────────────────────
// This repo has no component-test harness and does not run .test.tsx files, so
// these mount the real components with createElement against a real store
// snapshot. They pin what the pure tests cannot: that each piece renders from
// the store alone, stays out of the DOM when it has nothing to say, that the
// center's Escape closes the center WITHOUT reaching the floating panels'
// listener behind it (docs/RIGHT_EDGE.md, MODAL_DESIGN.md), that a press
// outside it closes it without being swallowed, and that the indicator's
// "done" moment and announcements follow what a burst actually did.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '../../i18n/config'
import { useLoadingStore } from '../../stores/loadingStore'
import { useSceneStore } from '../../stores/sceneStore'
import { emptySnapshot } from '../../lib/loading/defaults'
import { registerLoadingController, type LoadingController } from '../../lib/loading/controller'
import type { LoadBatchView, LoadJobView, LoadSnapshot } from '../../lib/loading/types'
import { LoadingIndicator } from './LoadingIndicator'
import { LoadingCenter } from './LoadingCenter'
import { FirstLoadCard } from './FirstLoadCard'
import { SceneLoadingSection } from './SceneLoadingSection'
import { useIfcUploadFlow } from '../../hooks/useIfcUploadFlow'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let seq = 0
function job(patch: Partial<LoadJobView> = {}): LoadJobView {
  seq++
  return {
    id: `j${seq}`, kind: 'ifc', origin: 'upload', managed: true,
    fileName: `Model_${seq}.ifc`, displayName: `Model_${seq}.ifc`, sizeBytes: 8 * 1024 * 1024,
    discipline: null, batchId: null, priority: 2, effectivePriority: 2,
    status: 'queued', waitReason: null, phase: null, phases: [],
    progress: { fraction: 0, determinate: false }, stalled: false, attempts: 1, error: null,
    metrics: { submittedAt: 1000, startedAt: 1000, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {} },
    resultId: null, fingerprint: null, duplicateOf: null, requestId: null, sourceUrl: null, sourceVersion: null, seq,
    capabilities: {
      cancel: true, retry: false, hold: false, resume: false, reprioritize: false, reload: false, remove: false, dismiss: false,
      focus: false,
    },
    ...patch,
  }
}

/** Capabilities of a settled row (nothing to cancel), with overrides. */
function settledCaps(patch: Partial<LoadJobView['capabilities']> = {}): LoadJobView['capabilities'] {
  return {
    cancel: false, retry: false, hold: false, resume: false, reprioritize: false, reload: false, remove: false, dismiss: true,
    focus: false, ...patch,
  }
}

const FINISHED = { submittedAt: 1, startedAt: 1, finishedAt: 5, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {} }

function snapshot(jobs: LoadJobView[], batches: LoadBatchView[] = []): LoadSnapshot {
  const s = emptySnapshot()
  s.jobs = jobs
  s.batches = batches
  for (const j of jobs) {
    s.summary.total++
    if (j.status === 'running') s.summary.running++
    if (j.status === 'queued') s.summary.queued++
    if (j.status === 'loaded') s.summary.loaded++
    if (j.status === 'failed') s.summary.failed++
    if (j.status === 'cancelled') s.summary.cancelled++
    const active = ['queued', 'held', 'running', 'waiting'].includes(j.status)
    if (active) s.summary.active++
    if (active && j.progress.determinate) s.summary.measuring = true
  }
  s.summary.fraction = 0.4
  return s
}

/** The indicator's polite live region. */
const liveText = (): string => document.querySelector('[aria-live="polite"]')?.textContent ?? ''

const running = (): LoadJobView => job({
  status: 'running', phase: 'geometry', displayName: 'Hotel_ARC.ifc', discipline: 'architecture',
  progress: { fraction: 0.42, determinate: true },
  phases: [
    { id: 'identify', status: 'done', weight: 1, fraction: 1 },
    { id: 'geometry', status: 'active', weight: 5, fraction: 0.6, done: 31, total: 48, unit: 'classes', detail: 'IFCWALL' },
    { id: 'attach', status: 'pending', weight: 1, fraction: null },
  ],
})

let host: HTMLDivElement
let root: Root
const calls: string[] = []

function render(node: ReturnType<typeof createElement>): void {
  act(() => { root.render(node) })
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  calls.length = 0
  const record = (name: string) => (...args: unknown[]): void => { calls.push(`${name}:${args.join(',')}`) }
  const impl: LoadingController = {
    cancel: record('cancel'), cancelAll: record('cancelAll'), retry: record('retry'), hold: record('hold'),
    resume: record('resume'), setPriority: record('setPriority'), move: record('move'), remove: record('remove'),
    reload: record('reload'), dismiss: record('dismiss'), clearFinished: record('clearFinished'), focus: record('focus'),
    openExisting: record('openExisting'), submitFiles: record('submitFiles'),
    findDuplicate: () => null, canCreateGroups: () => false, getRenderStats: () => null, listCache: async () => [], clearCache: async () => {},
  }
  registerLoadingController(impl)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    useLoadingStore.getState().reset()
    useSceneStore.getState().clearScene()
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  registerLoadingController(null)
  document.body.innerHTML = ''
})

describe('LoadingIndicator', () => {
  it('renders nothing while idle, then the single job with its percent', () => {
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))
    expect(host.querySelector('button')).toBeNull()
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running()])))
    const button = host.querySelector('button')
    expect(button?.textContent).toContain('Loading Hotel_ARC.ifc')
    expect(button?.textContent).toContain('40%')
    // Below xl the chip is ring + "40%": the name stays in the accessible label.
    expect(button?.getAttribute('aria-label')).toBe('Loading Hotel_ARC.ifc · 40%')
    expect(button?.className).toContain('max-w-[180px]')
    expect(button?.querySelector('span.hidden')?.textContent).toBe('Loading Hotel_ARC.ifc')
    act(() => button?.click())
    expect(useLoadingStore.getState().centerOpen).toBe(true)
  })

  it('shows activity, not a percent, while nothing active measures', () => {
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))
    const terrain = job({
      kind: 'gis', managed: false, origin: 'external', status: 'running', phase: 'fetch', displayName: 'Site terrain',
      phases: [{ id: 'fetch', status: 'active', weight: 1, fraction: null }],
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([terrain])))
    const button = host.querySelector('button')
    expect(button?.textContent).toContain('Loading Site terrain')
    expect(button?.textContent).not.toContain('%')
    expect(button?.querySelector('svg.animate-spin')).not.toBeNull()
  })

  it('says "All models loaded" only after a burst in which a model landed', () => {
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))
    const a = running()
    act(() => useLoadingStore.getState().setSnapshot(snapshot([a])))
    act(() => useLoadingStore.getState().setSnapshot(snapshot([
      { ...a, status: 'loaded', progress: { fraction: 1, determinate: true }, metrics: { ...a.metrics, finishedAt: 50 } },
    ])))
    expect(host.textContent).toContain('All models loaded')
    expect(liveText()).toContain('All models loaded')
  })

  it('stays quiet after a burst that only cancelled, or only fetched GIS terrain', () => {
    const earlier = job({ status: 'loaded', metrics: { submittedAt: 1, startedAt: 1, finishedAt: 5, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {} } })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([earlier])))
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))

    // B is dropped and cancelled: nothing landed, whatever "loaded: 1" says.
    const b = running()
    act(() => useLoadingStore.getState().setSnapshot(snapshot([earlier, b])))
    act(() => useLoadingStore.getState().setSnapshot(snapshot([earlier, { ...b, status: 'cancelled' }])))
    expect(host.textContent).not.toContain('All models loaded')

    // A terrain fetch comes and goes: tracked, not one of your models.
    const terrain = job({ kind: 'gis', managed: false, origin: 'external', status: 'running', displayName: 'Site terrain' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([earlier, terrain])))
    act(() => useLoadingStore.getState().setSnapshot(snapshot([
      earlier, { ...terrain, status: 'loaded', metrics: { ...terrain.metrics, finishedAt: 90 } },
    ])))
    expect(host.textContent).not.toContain('All models loaded')
    expect(liveText()).not.toContain('All models loaded')
  })

  it('announces a failure even while the Loading Center is open (so it counts as seen)', () => {
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))
    const a = running()
    act(() => useLoadingStore.getState().setSnapshot(snapshot([a])))
    act(() => useLoadingStore.getState().openCenter())
    act(() => useLoadingStore.getState().setSnapshot(snapshot([{
      ...a, status: 'failed',
      error: { code: 'parse', message: 'boom', phase: 'geometry', autoRetryable: false, userRetryable: true, attempt: 1 },
      metrics: { ...a.metrics, finishedAt: 1 },
    }])))
    expect(useLoadingStore.getState().summary.unseenFailures).toBe(0)
    expect(liveText()).toContain('1 model failed to load')
    expect(host.textContent).not.toContain('All models loaded')
  })

  it('keeps a compact entry in the floating and mobile variants once there is a history', () => {
    const failed = job({
      status: 'failed', displayName: 'Broken.ifc',
      error: { code: 'parse', message: 'boom', phase: 'geometry', autoRetryable: false, userRetryable: true, attempt: 1 },
      metrics: { submittedAt: 1, startedAt: 1, finishedAt: 5, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {} },
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([job({ status: 'loaded' }), failed])))
    act(() => useLoadingStore.getState().markFailuresSeen())
    for (const variant of ['floating', 'mobile'] as const) {
      render(createElement(LoadingIndicator, { variant }))
      const button = host.querySelector('button')
      // The failure was seen, so no "1 failed" chip — but the way back to its
      // Retry is still there, and says why it matters.
      expect(button?.getAttribute('aria-label')).toBe('Show model loading · 1 failed')
      act(() => button?.click())
      expect(useLoadingStore.getState().centerOpen).toBe(true)
      act(() => useLoadingStore.getState().closeCenter())
    }
  })

  it('stays quiet after a burst that only brought in a managed scan', () => {
    // Managed now — phases, cancel, retry — but a cloud is not a model.
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))
    const cloud = job({ kind: 'pointcloud', status: 'running', displayName: 'site.laz' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([cloud])))
    act(() => useLoadingStore.getState().setSnapshot(snapshot([
      { ...cloud, status: 'loaded', metrics: { ...cloud.metrics, finishedAt: 60 } },
    ])))
    expect(host.textContent).not.toContain('All models loaded')
    expect(liveText()).not.toContain('All models loaded')
  })

  it('counts several jobs and shows queued-only as "N queued"', () => {
    render(createElement(LoadingIndicator, { variant: 'floating' }))
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running(), job({ status: 'queued' })])))
    expect(host.textContent).toContain('Loading 2 models')
    act(() => useLoadingStore.getState().setSnapshot(snapshot([job({ status: 'queued' }), job({ status: 'queued' })])))
    expect(host.textContent).toContain('2 queued')
  })

  it('counts scans and meshes as files, not models', () => {
    render(createElement(LoadingIndicator, { variant: 'floating' }))
    const laz = (name: string): LoadJobView => job({ kind: 'pointcloud', status: 'running', displayName: name })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([laz('a.laz'), laz('b.laz')])))
    expect(host.textContent).toContain('Loading 2 files')
    expect(liveText()).toBe('Loading 2 files')
    // One model beside a scan is two loads, still not two models.
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running(), laz('site.laz')])))
    expect(host.textContent).toContain('Loading 2 files')
    expect(host.textContent).not.toContain('models')
  })

  it('announces a failed scan as a failed load, not as a model', () => {
    render(createElement(LoadingIndicator, { variant: 'toolbar' }))
    const cloud = job({ kind: 'pointcloud', status: 'running', displayName: 'site.laz' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([cloud])))
    act(() => useLoadingStore.getState().setSnapshot(snapshot([{
      ...cloud, status: 'failed',
      error: { code: 'invalid-file', message: 'The downloaded model is empty.', phase: 'download', autoRetryable: false, userRetryable: false, attempt: 1 },
      metrics: { ...cloud.metrics, finishedAt: 7 },
    }])))
    expect(liveText()).toContain('1 load failed')
    expect(liveText()).not.toContain('model')
  })
})

describe('LoadingCenter', () => {
  it('lists jobs with real phase lines, expands details, and closes on Escape without reaching panels', () => {
    const failed = job({
      status: 'failed', displayName: 'Broken.ifc', phase: 'geometry',
      error: { code: 'parse', message: 'boom', phase: 'geometry', autoRetryable: false, userRetryable: true, attempt: 1 },
      capabilities: { cancel: false, retry: true, hold: false, resume: false, reprioritize: false, reload: false, remove: false, dismiss: true, focus: false },
      metrics: { submittedAt: 1, startedAt: 1, finishedAt: 5, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {} },
    })
    const r = running()
    act(() => useLoadingStore.getState().setSnapshot(snapshot([r, failed])))
    render(createElement(LoadingCenter, { anchor: 'toolbar' }))
    expect(document.getElementById('loading-center')).toBeNull()

    act(() => useLoadingStore.getState().openCenter())
    const center = document.getElementById('loading-center')
    expect(center).not.toBeNull()
    expect(center?.getAttribute('role')).toBe('region')
    const text = center?.textContent ?? ''
    expect(text).toContain('Model loading')
    expect(text).toContain('Processing geometry · 31 / 48 classes · IFCWALL')
    expect(text).toContain('Failed · Geometry processing')
    expect(text).toContain('ARC')

    // Retry is the failed row's primary action.
    const retry = center?.querySelector('button[aria-label="Retry"]') as HTMLButtonElement | null
    act(() => retry?.click())
    expect(calls).toContain(`retry:${failed.id}`)

    // Expand the failed row → the actionable error sentence and the checklist.
    const expand = [...(center?.querySelectorAll('button[aria-label="Show details"]') ?? [])]
    act(() => (expand[1] as HTMLButtonElement).click())
    expect(document.getElementById('loading-center')?.textContent).toContain('re-export the model')

    // Escape: closes the center, and a bubble-phase window listener (where
    // panel-registry listens) never sees the key.
    let panelsSaw = false
    const panelListener = (): void => { panelsSaw = true }
    window.addEventListener('keydown', panelListener)
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    window.removeEventListener('keydown', panelListener)
    expect(useLoadingStore.getState().centerOpen).toBe(false)
    expect(panelsSaw).toBe(false)
  })

  it('asks before cancelling everything', () => {
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running(), job({ status: 'queued' })])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const find = (label: string): HTMLButtonElement | undefined =>
      [...document.querySelectorAll('#loading-center button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined
    act(() => find('Cancel all')?.click())
    expect(document.getElementById('loading-center')?.textContent).toContain('Cancel 2 loads?')
    expect(calls).not.toContain('cancelAll:')
    act(() => find('Yes')?.click())
    expect(calls).toContain('cancelAll:')
  })

  it('moves focus into the inline confirm and back, and announces the question', () => {
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running(), job({ status: 'queued' })])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const find = (label: string): HTMLButtonElement | undefined =>
      [...document.querySelectorAll('#loading-center button')].find((b) => b.textContent === label) as HTMLButtonElement | undefined

    const trigger = find('Cancel all')
    act(() => { trigger?.focus(); trigger?.click() })
    expect(document.activeElement?.textContent).toBe('No')
    expect(document.querySelector('#loading-center [role="alert"]')?.textContent).toBe('Cancel 2 loads?')

    act(() => find('No')?.click())
    expect(document.activeElement?.textContent).toBe('Cancel all')

    // Yes: "Cancel all" is about to go (nothing left to cancel), so focus
    // lands on the center itself rather than on <body>.
    act(() => find('Cancel all')?.click())
    act(() => find('Yes')?.click())
    expect(document.activeElement?.id).toBe('loading-center')
  })

  it('does the same for the cache confirm in Advanced', async () => {
    const entry = { key: 'v3:A.ifc:10:0', fileName: 'A.ifc', fileSize: 10, fragmentsSize: 5, cachedAt: 1 }
    registerLoadingController({
      ...({} as LoadingController),
      findDuplicate: () => null, canCreateGroups: () => false, getRenderStats: () => null,
      clearFinished: () => {}, cancelAll: () => {},
      listCache: async () => [entry], clearCache: async () => {},
    } as LoadingController)
    act(() => useLoadingStore.getState().setSnapshot(snapshot([job({ status: 'loaded' })])))
    act(() => useLoadingStore.getState().setDetail('advanced'))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const buttons = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('#loading-center button')]
    act(() => buttons().find((b) => b.textContent === 'Cache')?.click())
    await act(async () => { await Promise.resolve() })
    act(() => buttons().find((b) => b.textContent === 'Clear cache')?.click())
    expect(document.activeElement?.textContent).toBe('No')
    expect(document.querySelector('#loading-center [role="alert"]')?.textContent).toBe('Delete 1 cached model?')
    act(() => buttons().find((b) => b.textContent === 'No')?.click())
    expect(document.activeElement?.textContent).toBe('Clear cache')
    act(() => useLoadingStore.getState().setDetail('basic'))
  })

  it('offers Retry on a cancelled row the manager can retry', () => {
    const cancelled = job({
      status: 'cancelled', displayName: 'Oops.ifc',
      capabilities: { cancel: false, retry: true, hold: false, resume: false, reprioritize: false, reload: false, remove: false, dismiss: true, focus: false },
      metrics: { submittedAt: 1, startedAt: 1, finishedAt: 5, etaMs: null, etaReliable: false, estimatedPeakBytes: 0, phaseDurations: {} },
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([cancelled])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const center = document.getElementById('loading-center')
    const retry = center?.querySelector('button[aria-label="Retry"]') as HTMLButtonElement | null
    expect(retry).not.toBeNull()
    act(() => retry?.click())
    expect(calls).toContain(`retry:${cancelled.id}`)
    // Dismiss is still offered, just not as the primary.
    expect(center?.querySelector('button[aria-label="Dismiss"]')).not.toBeNull()
  })

  it('does not announce 0 % or print one for a job that has measured nothing yet', () => {
    const checking = job({
      status: 'running', phase: 'identify', displayName: 'Fresh.ifc',
      progress: { fraction: 0, determinate: false },
      phases: [{ id: 'identify', status: 'active', weight: 1, fraction: null }],
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([checking])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const center = document.getElementById('loading-center')
    const bar = center?.querySelector('[role="progressbar"]')
    expect(bar).not.toBeNull()
    expect(bar?.hasAttribute('aria-valuenow')).toBe(false)
    expect(bar?.getAttribute('aria-busy')).toBe('true')
    expect(center?.textContent).not.toContain('0%')
  })

  it('closes on a press outside without swallowing it, and ignores presses inside or on the indicator', () => {
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running()])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const press = (el: Element): MouseEvent => {
      const e = new MouseEvent('pointerdown', { bubbles: true, cancelable: true })
      act(() => { el.dispatchEvent(e) })
      return e
    }

    press(document.getElementById('loading-center') as HTMLElement)
    expect(useLoadingStore.getState().centerOpen).toBe(true)

    const toggle = document.createElement('button')
    toggle.setAttribute('data-loading-center-toggle', '')
    document.body.appendChild(toggle)
    press(toggle)
    expect(useLoadingStore.getState().centerOpen).toBe(true)

    // The viewer gets the very press that closes the center.
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    let canvasSaw = false
    canvas.addEventListener('pointerdown', () => { canvasSaw = true })
    const e = press(canvas)
    expect(canvasSaw).toBe(true)
    expect(e.defaultPrevented).toBe(false)
    expect(useLoadingStore.getState().centerOpen).toBe(false)
  })
})

describe('LoadingCenter — scans and meshes', () => {
  it('a copy of a scan or a mesh is not called "a model" in its details', () => {
    const rows = [
      job({ kind: 'pointcloud', status: 'loaded', displayName: 'copy.las', resultId: 'pc-2', duplicateOf: 'j0', metrics: FINISHED, capabilities: settledCaps() }),
      job({ kind: 'mesh', status: 'loaded', displayName: 'copy.glb', resultId: 'm-2', duplicateOf: 'j1', metrics: FINISHED, capabilities: settledCaps() }),
      job({ kind: 'ifc', status: 'loaded', displayName: 'copy.ifc', resultId: 'ifc-2', duplicateOf: 'j2', metrics: FINISHED, capabilities: settledCaps() }),
    ]
    act(() => useLoadingStore.getState().setSnapshot(snapshot(rows)))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    // One row open at a time: open each in turn and collect what it says.
    let text = ''
    for (const row of rows) {
      act(() => useLoadingStore.getState().setExpanded(row.id))
      text += document.getElementById('loading-center')?.textContent ?? ''
    }
    expect(text).toContain('Same content as a scan already in the scene')
    expect(text).toContain('Same content as a 3D model already in the scene')
    expect(text).toContain('Same content as a model already in the scene')
  })

  it('offers "Show in scene" exactly where the manager says something can frame the result', () => {
    const cloud = job({
      kind: 'pointcloud', status: 'loaded', displayName: 'site.laz', resultId: 'pc-1',
      metrics: FINISHED, capabilities: settledCaps({ focus: true, remove: true }),
    })
    // A loaded row with a resultId is not enough: nothing frames GIS terrain.
    const terrain = job({
      kind: 'gis', managed: false, origin: 'external', status: 'loaded', displayName: 'Site terrain', resultId: 'terrain',
      metrics: FINISHED, capabilities: settledCaps(),
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([cloud, terrain])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const focusButtons = [...document.querySelectorAll<HTMLButtonElement>('#loading-center button[aria-label="Show in scene"]')]
    expect(focusButtons).toHaveLength(1)
    act(() => focusButtons[0].click())
    expect(calls).toContain(`focus:${cloud.id}`)
  })

  it('leads a failed scan with its own cause, and keeps the generic reason for Advanced', () => {
    const failed = job({
      kind: 'pointcloud', status: 'failed', displayName: 'huge.laz', phase: 'decode',
      error: {
        code: 'unsupported', message: 'pointcloud error.lazTooLarge', phase: 'decode',
        autoRetryable: false, userRetryable: false, attempt: 1, detailKey: 'pointcloud:error.lazTooLarge',
      },
      metrics: FINISHED, capabilities: settledCaps(),
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([failed])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter(failed.id))
    const text = (): string => document.getElementById('loading-center')?.textContent ?? ''
    expect(text()).toContain('too large to decompress in a browser tab')
    expect(text()).toContain('Failed · Point reading')
    // Basic: one sentence, the one a person can act on.
    expect(text()).not.toContain("This file's format, size or link is not supported.")

    // Advanced: the code's generic sentence as a second line — in words for a
    // file, not the IFC ones ("this model's schema").
    act(() => useLoadingStore.getState().setDetail('advanced'))
    expect(text()).toContain("This file's format, size or link is not supported.")
    expect(text()).not.toContain('schema')
    expect(text()).toContain('pointcloud:error.lazTooLarge')
    act(() => useLoadingStore.getState().setDetail('basic'))
  })

  it('falls back to the kind-neutral generic reason for a detail key no bundle knows', () => {
    const failed = job({
      kind: 'mesh', status: 'failed', displayName: 'odd.glb', phase: 'decode',
      error: {
        code: 'parse', message: 'mesh error.brandNew', phase: 'decode',
        autoRetryable: false, userRetryable: true, attempt: 1, detailKey: 'mesh:error.brandNew',
      },
      metrics: FINISHED, capabilities: settledCaps({ retry: true }),
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([failed])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter(failed.id))
    const text = document.getElementById('loading-center')?.textContent ?? ''
    expect(text).toContain("The file's content could not be processed.")
    expect(text).not.toContain('The IFC content')
    expect(text).not.toContain('re-export the model')
    expect(text).not.toContain('error.brandNew')
  })

  it('does not call an empty scan download "not a readable IFC model"', () => {
    // The download helper's failures carry no detail key: the generic
    // sentence leads, and on a scan it must speak of a file.
    const failed = job({
      kind: 'pointcloud', status: 'failed', displayName: 'empty.laz', phase: 'download', origin: 'url',
      error: {
        code: 'invalid-file', message: 'The downloaded model is empty.', phase: 'download',
        autoRetryable: false, userRetryable: false, attempt: 1,
      },
      metrics: FINISHED, capabilities: settledCaps(),
    })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([failed])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter(failed.id))
    const text = document.getElementById('loading-center')?.textContent ?? ''
    expect(text).toContain('This file is empty or not a readable file of its type.')
    expect(text).not.toContain('IFC')
  })

  it('prints a scan\'s decode in points and says when it waits for the budget', () => {
    const reading = job({
      kind: 'pointcloud', status: 'running', displayName: 'a.laz', phase: 'decode',
      progress: { fraction: 0.3, determinate: true },
      phases: [{ id: 'decode', status: 'active', weight: 90, fraction: 0.3, done: 1_234_567, total: 4_012_345, unit: 'points' }],
    })
    const waiting = job({ kind: 'pointcloud', status: 'waiting', waitReason: 'budget', displayName: 'b.laz', phase: 'place' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([reading, waiting])))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const text = document.getElementById('loading-center')?.textContent ?? ''
    expect(text).toContain('Reading points · 1.2 M / 4.0 M points')
    expect(text).toContain('Waiting for the point budget (another scan is still loading)')
  })

  it('lists the decode lane with the other slots in Advanced → Resources', () => {
    act(() => useLoadingStore.getState().setSnapshot(snapshot([job({ status: 'loaded', metrics: FINISHED })])))
    act(() => useLoadingStore.getState().setDetail('advanced'))
    render(createElement(LoadingCenter, {}))
    act(() => useLoadingStore.getState().openCenter())
    const resources = [...document.querySelectorAll<HTMLButtonElement>('#loading-center button')].find((b) => b.textContent === 'Resources')
    act(() => resources?.click())
    const row = [...document.querySelectorAll('#loading-center dt')].find((dt) => dt.textContent === 'Parallel decodes (scans, 3D models)')
    expect(row?.nextElementSibling?.textContent).toBe('2')
    act(() => useLoadingStore.getState().setDetail('basic'))
  })
})

describe('FirstLoadCard', () => {
  it('does not announce a scan or a mesh as the first model', () => {
    const cloud = job({ kind: 'pointcloud', status: 'running', displayName: 'site.laz' })
    const mesh = job({ kind: 'mesh', status: 'queued', displayName: 'tree.glb' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([cloud, mesh])))
    render(createElement(FirstLoadCard))
    expect(host.textContent).toBe('')
  })

  it('shows the primary job with its checklist while the scene is empty, and hides when the center opens', () => {
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running()])))
    render(createElement(FirstLoadCard))
    const text = host.textContent ?? ''
    expect(text).toContain('Hotel_ARC.ifc')
    expect(text).toContain('Processing geometry')
    expect(text).toContain('Geometry processing')
    expect(text).toContain('The viewer stays usable while models load.')
    act(() => root.unmount())

    // Same load, center already open: the card does not duplicate it.
    root = createRoot(host)
    act(() => useLoadingStore.getState().openCenter())
    render(createElement(FirstLoadCard))
    expect(host.textContent).toBe('')
  })

  it('stays out of a scene that already has models', () => {
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running()])))
    act(() => useSceneStore.setState({ models: [{ id: 'm1' } as never] }))
    render(createElement(FirstLoadCard))
    expect(host.textContent).toBe('')
  })

  it('leads with the batch for a federated load', () => {
    const a = running(); a.batchId = 'b'
    const b = job({ status: 'queued', batchId: 'b', displayName: 'Hotel_STR.ifc' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([a, b], [{ id: 'b', name: 'Hotel Vela', createdAt: 0, jobIds: [a.id, b.id], groupId: null }])))
    render(createElement(FirstLoadCard))
    expect(host.textContent).toContain('Hotel Vela — 0 of 2 models')
    expect(host.textContent).toContain('Hotel_STR.ifc')
  })

  it('pluralises the batch title on what is still meant to land', () => {
    const a = running(); a.batchId = 'b'
    const b = job({ status: 'cancelled', batchId: 'b', displayName: 'Hotel_STR.ifc' })
    act(() => useLoadingStore.getState().setSnapshot(snapshot([a, b], [{ id: 'b', name: 'Hotel Vela', createdAt: 0, jobIds: [a.id, b.id], groupId: null }])))
    render(createElement(FirstLoadCard))
    expect(host.textContent).toContain('Hotel Vela — 0 of 1 model')
    expect(host.textContent).not.toContain('0 of 1 models')
  })
})

describe('SceneLoadingSection', () => {
  it('renders nothing without pending jobs, then a compact list with Details', () => {
    render(createElement(SceneLoadingSection, {}))
    expect(host.innerHTML).toBe('')
    act(() => useLoadingStore.getState().setSnapshot(snapshot([running(), job({ status: 'loaded' })])))
    expect(host.textContent).toContain('Loading · 1')
    const details = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Details')
    act(() => details?.click())
    expect(useLoadingStore.getState().centerOpen).toBe(true)
  })
})

describe('Upload hand-over', () => {
  it('submits a dropped file without opening the Loading Center', async () => {
    const closed: number[] = []
    const ifc = 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'\'),\'2;1\');\nFILE_SCHEMA((\'IFC4\'));\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n'
    const file = new File([ifc], 'Small.ifc', { type: '' })
    function Harness() {
      useIfcUploadFlow({ onClose: () => closed.push(1), initialFiles: [file], initialOrigin: 'drop' })
      return null
    }
    render(createElement(Harness))
    // The checks are async (header read, fingerprint); the fast path submits
    // as soon as they land.
    for (let i = 0; i < 50 && !calls.some((c) => c.startsWith('submitFiles:')); i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
    }
    expect(calls.some((c) => c.startsWith('submitFiles:'))).toBe(true)
    expect(closed).toHaveLength(1)
    // The FirstLoadCard (empty scene) and the indicator carry the hand-over;
    // a popover over the scene would hide the one and sit on the model.
    expect(useLoadingStore.getState().centerOpen).toBe(false)
  })
})
