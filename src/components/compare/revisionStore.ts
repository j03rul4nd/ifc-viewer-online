// State of the revision compare workspace: two drops (A = old, B = new), their
// snapshots, the RevisionDiff, the list filters, the selected change and the
// review states. The snapshots stay in memory so a tolerance change recomputes
// the diff without reading the files again (M5). Never persisted except the
// review states (IndexedDB, review-db.ts).
import { create } from 'zustand'
import type { RevisionDiff, RevisionOptions } from '../../lib/compare/revision-types'
import type { ModelSnapshot } from '../../lib/compare/types'
import {
  EMPTY_FILTER, reviewKey, reviewPrefix, sideHash, sortByImpact,
  type RevisionFilter, type ReviewState,
} from '../../lib/compare/revision-view'
import { loadReviews, saveReview } from './review-db'
import { trackRcChangeReviewed, trackRcDiffCompleted } from '../../lib/analytics'

export type RevisionPhase = 'idle' | 'reading' | 'ready' | 'error'
/** Side-by-side split is pending (see T3-RESULTADO): fragments cannot be drawn by a second renderer. */
export type ViewMode = 'changes' | 'curtain' | 'blink'

export interface RevisionSide {
  files: File[]
  snapshots: ModelSnapshot[]
  /** snapshot fileName → scene model id */
  modelIds: Record<string, string>
  hash: string
}

const emptySide = (): RevisionSide => ({ files: [], snapshots: [], modelIds: {}, hash: '' })

interface RevisionStore {
  /** The workspace owns the 3D overlay channel while true (validation / IDS paused). */
  active: boolean
  phase: RevisionPhase
  a: RevisionSide
  b: RevisionSide
  /** fileName → 0–100 while reading. */
  progress: Record<string, number>
  error: string | null
  options: RevisionOptions
  diff: RevisionDiff | null
  /** ms the last diff took (shown next to the tolerance panel). */
  diffMs: number
  filter: RevisionFilter
  /** GlobalId of the change on screen. */
  selected: string | null
  reviews: Map<string, ReviewState>
  view: ViewMode
  /** Blink: which side is on screen. */
  blinkSide: 'a' | 'b'
  /** Curtain position, 0–1 of the viewport width. */
  curtain: number
  /** Where the pair on screen came from: the guided demo or the user's own files. */
  source: 'demo' | 'own' | null
  /** The guided tour is on screen. */
  tour: boolean
  /** The demo pair was opened in this page (kept across reset): own files after it count as conversions. */
  demoSeen: boolean

  setActive: (v: boolean) => void
  setPhase: (p: RevisionPhase, error?: string | null) => void
  setSide: (side: 'a' | 'b', s: Partial<RevisionSide>) => void
  setProgress: (name: string, pct: number) => void
  setDiff: (diff: RevisionDiff, ms: number) => void
  setOptions: (o: RevisionOptions) => void
  setFilter: (f: Partial<RevisionFilter>) => void
  select: (gid: string | null) => void
  setReview: (gid: string, state: ReviewState) => void
  setReviews: (m: Map<string, ReviewState>) => void
  setView: (v: ViewMode) => void
  setBlinkSide: (s: 'a' | 'b') => void
  setCurtain: (x: number) => void
  setSource: (s: 'demo' | 'own' | null) => void
  setTour: (v: boolean) => void
  reset: () => void
}

export const useRevisionStore = create<RevisionStore>()((set, get) => ({
  active: false,
  phase: 'idle',
  a: emptySide(),
  b: emptySide(),
  progress: {},
  error: null,
  options: {},
  diff: null,
  diffMs: 0,
  filter: EMPTY_FILTER,
  selected: null,
  reviews: new Map(),
  view: 'changes',
  blinkSide: 'b',
  curtain: 0.5,
  source: null,
  tour: false,
  demoSeen: false,

  setActive: (active) => set({ active }),
  setPhase: (phase, error = null) => set({ phase, error }),
  setSide: (side, s) => set((st) => ({ [side]: { ...st[side], ...s } }) as Partial<RevisionStore>),
  setProgress: (name, pct) => set((s) => ({ progress: { ...s.progress, [name]: pct } })),
  setDiff: (diff, diffMs) => set({ diff, diffMs }),
  setOptions: (options) => set({ options }),
  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
  select: (selected) => set({ selected }),
  setReview: (gid, state) => {
    const { a, b, reviews } = get()
    const next = new Map(reviews)
    if (state === 'pending') next.delete(gid); else next.set(gid, state)
    set({ reviews: next })
    trackRcChangeReviewed({ state })
    if (a.hash && b.hash) void saveReview(reviewKey(a.hash, b.hash, gid), state)
  },
  setReviews: (reviews) => set({ reviews }),
  setView: (view) => set({ view }),
  setBlinkSide: (blinkSide) => set({ blinkSide }),
  setCurtain: (curtain) => set({ curtain: Math.min(0.95, Math.max(0.05, curtain)) }),
  setSource: (source) => set(source === 'demo' ? { source, demoSeen: true } : { source }),
  setTour: (tour) => set({ tour }),
  reset: () => set({
    active: false, phase: 'idle', a: emptySide(), b: emptySide(), progress: {}, error: null,
    diff: null, diffMs: 0, filter: EMPTY_FILTER, selected: null, reviews: new Map(), view: 'changes', blinkSide: 'b', curtain: 0.5, source: null, tour: false,
  }),
}))

// ── Runner ───────────────────────────────────────────────────────────────────

/** Recompute the diff from the snapshots in memory (tolerance panel, M5). */
export async function recomputeDiff(options?: RevisionOptions): Promise<void> {
  const s = useRevisionStore.getState()
  if (!s.a.snapshots.length || !s.b.snapshots.length) return
  const opts = options ?? s.options
  const { diffRevisions } = await import('../../lib/compare/revision-diff')
  const t0 = performance.now()
  const diff = diffRevisions(s.a.snapshots, s.b.snapshots, opts, { labels: { base: label(s.a.files), head: label(s.b.files) } })
  const ms = Math.round(performance.now() - t0)
  useRevisionStore.setState({ options: opts })
  useRevisionStore.getState().setDiff(diff, ms)
  const cur = useRevisionStore.getState().selected
  if (!cur || !diff.changes.some((c) => c.globalId === cur && c.kind !== 'unchanged')) {
    useRevisionStore.getState().select(sortByImpact(diff.changes)[0]?.globalId ?? null)
  }
}

const label = (files: File[]): string => (files.length === 1 ? files[0].name : files.map((f) => f.name).join(', '))

/**
 * The three-click flow: both sides dropped → read, snapshot and load into the
 * scene in parallel, diff, restore review states, open on the change of most
 * impact. `loadIntoScene` returns fileName → model id (LoadManager).
 */
export async function runRevision(loadIntoScene: (files: File[], side: 'a' | 'b') => Promise<Record<string, string>>): Promise<void> {
  const st = useRevisionStore.getState()
  const { a, b } = st
  if (!a.files.length || !b.files.length) return
  st.setPhase('reading')
  const started = performance.now()
  useRevisionStore.setState({ progress: {}, diff: null, selected: null })
  try {
    const { snapshotMany } = await import('../../lib/compare/snapshot-runner')
    const read = async (files: File[]) => Promise.all(files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })))
    const [ra, rb] = await Promise.all([read(a.files), read(b.files)])
    const [hashA, hashB] = await Promise.all([sideHash(ra), sideHash(rb)])
    const onProgress = (name: string, pct: number) => useRevisionStore.getState().setProgress(name, pct)
    const snap = (side: 'a' | 'b', r: typeof ra) => snapshotMany(
      // snapshot workers take the buffers: hand them copies, the hash already ran.
      r.map((x) => ({ fileName: x.name, buffer: x.bytes.slice(0), geometry: true })),
      (name, pct) => onProgress(`${side.toUpperCase()} · ${name}`, pct),
    )
    // List first, 3D after (05-ux §1): the scene load runs alongside and fills
    // the model ids when it lands; the list does not wait for it.
    const scene = Promise.all([
      loadIntoScene(a.files, 'a').catch(() => ({} as Record<string, string>)),
      loadIntoScene(b.files, 'b').catch(() => ({} as Record<string, string>)),
    ])
    const [snapsA, snapsB] = await Promise.all([snap('a', ra), snap('b', rb)])
    const s = useRevisionStore.getState()
    s.setSide('a', { snapshots: snapsA, hash: hashA })
    s.setSide('b', { snapshots: snapsB, hash: hashB })
    s.setReviews(await loadReviews(reviewPrefix(hashA, hashB)))
    await recomputeDiff()
    useRevisionStore.getState().setPhase('ready')
    const done = useRevisionStore.getState()
    if (done.diff) {
      const shown = done.diff.changes.filter((c) => c.kind !== 'unchanged')
      trackRcDiffCompleted({
        elements: Math.max(...[done.a, done.b].map((x) => x.snapshots.reduce((n, sn) => n + sn.elements.length, 0))), changes: shown.length, kinds: shown.map((c) => c.kind),
        guid_regenerated: !!done.diff.guidRegenerated, ms: Math.round(performance.now() - started),
      })
    }
    const [idsA, idsB] = await scene
    if (useRevisionStore.getState().a.hash !== hashA) return // another pair was dropped meanwhile
    useRevisionStore.getState().setSide('a', { modelIds: idsA })
    useRevisionStore.getState().setSide('b', { modelIds: idsB })
  } catch (err) {
    useRevisionStore.getState().setPhase('error', err instanceof Error ? err.message : String(err))
  }
}
