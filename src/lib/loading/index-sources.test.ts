// The loading system's app wiring for point clouds and meshes: the words a
// failed scan / mesh reaches the user and an SDK host with, the runner's own
// key the mesh wire contract carries, and what happens when the user opens a
// scan / mesh the scene already holds.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import i18n from '../../i18n/config'
import {
  describeSourceError, sourceErrorKey, getLoadManager, resetLoading,
  loadPointCloudsOnce, loadMeshesOnce, partitionDuplicates, submitPointClouds, submitMeshes, cancelLoadsOfKind,
  type SourceSubmitItem,
} from './index'
import { fingerprintBlob } from './fingerprint'
import { useToastStore, runToastAction } from '../../stores/toastStore'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import type { PointCloudEntry } from '../pointcloud/pc-types'
import type { MeshEntry } from '../mesh/mesh-types'
import type { AdapterResult, JobContext, LoadError, SourceAdapter, SourceKind } from './types'

function err(patch: Partial<LoadError>): LoadError {
  return { code: 'parse', message: 'x', phase: null, autoRetryable: false, userRetryable: true, attempt: 1, ...patch }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
  await i18n.loadNamespaces(['loading', 'pointcloud', 'mesh'])
})

describe('describeSourceError', () => {
  it("prefers the runner's own reason, loading its namespace first", async () => {
    const text = await describeSourceError(err({ code: 'unsupported', detailKey: 'pointcloud:error.lazTooLarge' }), 'pointcloud')
    expect(text).toBe(i18n.t('pointcloud:error.lazTooLarge'))
    expect(text).not.toMatch(/error\./)
  })

  it('fills the HTTP status of a failed download instead of printing {{status}}', async () => {
    const text = await describeSourceError(err({ code: 'http', httpStatus: 404 }), 'pointcloud')
    expect(text).toContain('404')
    expect(text).not.toContain('{{')
  })

  it('a scan / mesh failure without a runner reason gets the kind-neutral sentence, never the IFC one', async () => {
    const scan = await describeSourceError(err({ code: 'invalid-file' }), 'pointcloud')
    expect(scan).toBe(i18n.t('loading:errorGeneric.invalid-file'))
    expect(scan).not.toMatch(/IFC/)
    const ifc = await describeSourceError(err({ code: 'invalid-file' }), 'ifc')
    expect(ifc).toBe(i18n.t('loading:error.invalid-file'))
  })

  it('an unknown runner key falls back to the generic sentence, not the raw key', async () => {
    const text = await describeSourceError(err({ code: 'parse', detailKey: 'mesh:error.somethingNew' }), 'mesh')
    expect(text).not.toContain('somethingNew')
    expect(text).toBe(i18n.t('loading:errorGeneric.parse'))
  })
})

describe('sourceErrorKey', () => {
  it('is the runner key without its namespace (the mesh wire contract), or null', () => {
    expect(sourceErrorKey(err({ detailKey: 'mesh:error.noEntryFile' }))).toBe('error.noEntryFile')
    expect(sourceErrorKey(err({}))).toBeNull()
  })
})

// ── Loading what the scene already holds ─────────────────────────────────────

/** A stand-in adapter: commits at once, or waits for `release` when told to hold. */
function fakeAdapter(kind: SourceKind) {
  let n = 0
  const focused: string[] = []
  const frames: Array<boolean | undefined> = []
  let hold = false
  const waiting: Array<() => void> = []
  let unloadGate: Promise<void> | null = null
  const adapter: SourceAdapter = {
    kind,
    plan: () => [{ id: 'decode', weight: 1 }],
    sizeOf: (src) => (src.type === 'file' ? src.file.size : 0),
    fileNameOf: (src) => (src.type === 'file' ? src.file.name : src.type === 'url' ? src.url.split('/').pop() ?? 'x' : 'x'),
    estimate: () => ({ peakBytes: 0, exclusive: false }),
    run: async (ctx: JobContext): Promise<AdapterResult> => {
      frames.push(ctx.opts.frame)
      ctx.phase('decode')
      // Through the kind's decode lane, like the real adapters: a third load
      // behind two held ones waits for a slot (and can be paused there).
      const slot = await ctx.acquire('decode')
      if (hold) await new Promise<void>((r) => { waiting.push(r) })
      const id = `${kind}-${++n}`
      ctx.committed(id, { fromCache: false })
      slot.release()
      return { resultId: id, fromCache: false }
    },
    focus: (id) => { focused.push(id) },
    unload: async () => { if (unloadGate) await unloadGate },
  }
  return {
    adapter, focused, frames,
    holdNext: () => { hold = true },
    release: () => { hold = false; for (const r of waiting.splice(0)) r() },
    /** Unloads wait until the returned function is called. */
    holdUnload: (): (() => void) => {
      let open: () => void = () => {}
      unloadGate = new Promise<void>((r) => { open = r })
      return () => { unloadGate = null; open() }
    },
  }
}

const bytes = (fill: number, size = 4096): Uint8Array => new Uint8Array(size).fill(fill)
/** The same file on disk keeps its modification time across drops. */
const MTIME = 1_750_000_000_000
const file = (name: string, fill: number, size?: number, lastModified = MTIME): File =>
  new File([bytes(fill, size) as BlobPart], name, { lastModified })
/** A file whose read waits until `open()` — holds a submission inside its sampling. */
function gatedFile(name: string, fill: number): { file: File; open: () => void; reads: () => number } {
  let open: () => void = () => {}
  const gate = new Promise<void>((r) => { open = r })
  let reads = 0
  const f = file(name, fill)
  const read = f.arrayBuffer.bind(f)
  Object.defineProperty(f, 'arrayBuffer', { value: async () => { reads++; await gate; return read() } })
  return { file: f, open, reads: () => reads }
}
/**
 * A 1 MB scan whose sampled windows (head / middle / tail 64 KB) never change:
 * `edit` touches a byte outside them, as reclassifying some points does.
 */
function sampledScan(name: string, fill: number, lastModified: number, edit = false): File {
  const data = new Uint8Array(1_000_000).fill(fill)
  if (edit) data[300_000] = fill + 1
  return new File([data as BlobPart], name, { lastModified })
}
const listOf = (...names: string[]): string =>
  new (Intl as unknown as { ListFormat: new (l: string, o: object) => { format(x: string[]): string } })
    .ListFormat('en', { type: 'conjunction' }).format(names.map((n) => t('loading:duplicate.quoted', { name: n })))
const jobsOf = (kind: SourceKind) => getLoadManager().getSnapshot().jobs.filter((j) => j.kind === kind)
const toasts = () => useToastStore.getState().toasts
const t = (key: string, values?: Record<string, unknown>): string => String(i18n.t(key as never, values as never))
async function until(pred: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000
  while (!pred() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 2))
  if (!pred()) throw new Error('timed out')
}

/** What the panel lists once a scan / mesh lands (the real runners add it; the fake adapter does not). */
function inScene(kind: 'pointcloud' | 'mesh', id: string, fileName: string, visible = true): void {
  if (kind === 'pointcloud') {
    usePointCloudStore.getState().addCloud({ id, fileName, visible, status: 'ready', pointCount: 1 } as PointCloudEntry)
  } else {
    useMeshStore.getState().addMesh({ id, fileName, visible, status: 'ready' } as MeshEntry)
  }
}

async function loadOne(kind: 'pointcloud' | 'mesh', f: File, extra: Partial<SourceSubmitItem> = {}): Promise<string> {
  const load = kind === 'pointcloud' ? loadPointCloudsOnce : loadMeshesOnce
  const [h] = await load([{ source: { type: 'file', file: f }, ...extra }], { origin: 'drop' })
  const out = await h.settled
  if (out.status !== 'loaded') throw new Error(`not loaded: ${out.status}`)
  inScene(kind, out.resultId, f.name)
  return out.resultId
}

describe('loading a scan / mesh the scene already holds', () => {
  let pc: ReturnType<typeof fakeAdapter>
  let mesh: ReturnType<typeof fakeAdapter>
  beforeEach(() => {
    resetLoading()
    useToastStore.getState().clearAll()
    usePointCloudStore.setState({ clouds: [] })
    useMeshStore.setState({ meshes: [] })
    pc = fakeAdapter('pointcloud')
    mesh = fakeAdapter('mesh')
    getLoadManager().registerAdapter(pc.adapter)
    getLoadManager().registerAdapter(mesh.adapter)
  })

  it('the same scan again is not loaded twice: it is framed, and a copy is offered', async () => {
    await loadOne('pointcloud', file('site.las', 1))
    const again = await loadPointCloudsOnce([{ source: { type: 'file', file: file('site.las', 1) } }], { origin: 'drop' })
    expect(again).toEqual([])
    expect(jobsOf('pointcloud')).toHaveLength(1)
    expect(pc.focused).toEqual(['pointcloud-1'])
    const [toast] = toasts()
    expect(toast.message).toBe(t('loading:duplicate.inScene', { name: 'site.las' }))
    expect(toast.actionLabel).toBe(t('loading:duplicate.loadAnyway'))
    // "Load a copy anyway" really loads it.
    runToastAction(toast.id)
    await until(() => jobsOf('pointcloud').length === 2)
  })

  it('a renamed copy names the scan the panel shows, not only the new name', async () => {
    await loadOne('pointcloud', file('site.las', 11))
    await loadPointCloudsOnce([{ source: { type: 'file', file: file('IMG_final.las', 11) } }], { origin: 'drop' })
    expect(toasts()[0].message).toBe(t('loading:duplicate.sameAsInScene', { name: 'IMG_final.las', existing: 'site.las' }))
  })

  it('the same URL while its first load is still running: "already loading", nothing fetched twice', async () => {
    pc.holdNext()
    await loadPointCloudsOnce([{ source: { type: 'url', url: 'https://cdn.example/a.laz' } }], { origin: 'url' })
    const again = await loadPointCloudsOnce([{ source: { type: 'url', url: 'https://cdn.example/a.laz' } }], { origin: 'url' })
    expect(again).toEqual([])
    expect(toasts()[0].message).toBe(t('loading:duplicate.loading', { name: 'a.laz' }))
    pc.release()
  })

  it('?scan=a,a — the same URL twice in one link loads once and says it is loading', async () => {
    pc.holdNext()
    const url = 'https://cdn.example/twice.laz'
    const handles = await loadPointCloudsOnce([{ source: { type: 'url', url } }, { source: { type: 'url', url } }], { origin: 'url' })
    expect(handles).toHaveLength(1)
    expect(toasts()[0].message).toBe(t('loading:duplicate.loading', { name: 'twice.laz' }))
    pc.release()
  })

  it('one selection holding the same file twice loads it once, naming the twin; different content loads', async () => {
    const handles = await loadPointCloudsOnce([
      { source: { type: 'file', file: file('a.ply', 2) } },
      { source: { type: 'file', file: file('a-again.ply', 2) } },
      { source: { type: 'file', file: file('b.ply', 3) } },
    ], { origin: 'upload' })
    expect(handles).toHaveLength(2)
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].message).toBe(t('loading:duplicate.sameAsLoading', { name: 'a-again.ply', existing: 'a.ply' }))
    // Fresh jobs carry the fingerprint the check computed.
    expect(jobsOf('pointcloud').every((j) => j.fingerprint?.startsWith('f1:'))).toBe(true)
  })

  it('two files matching the same scan count once, and "load a copy" adds one copy, not two', async () => {
    await loadOne('pointcloud', file('s.las', 12))
    await loadPointCloudsOnce([
      { source: { type: 'file', file: file('s.las', 12) } },
      { source: { type: 'file', file: file('s2.las', 12) } },
    ], { origin: 'drop' })
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].message).toBe(t('loading:duplicate.inScene', { name: 's.las' }))
    runToastAction(toasts()[0].id)
    await until(() => jobsOf('pointcloud').length === 2)
    await new Promise((r) => setTimeout(r, 20))
    expect(jobsOf('pointcloud')).toHaveLength(2)
  })

  it('several duplicates share one toast: named up to three, counted beyond', async () => {
    await loadOne('pointcloud', file('a.ply', 4))
    await loadOne('pointcloud', file('b.ply', 5))
    await loadPointCloudsOnce([
      { source: { type: 'file', file: file('a.ply', 4) } },
      { source: { type: 'file', file: file('b.ply', 5) } },
    ], { origin: 'drop' })
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].message).toBe(t('loading:duplicate.manyNamed', { names: listOf('a.ply', 'b.ply') }))

    await loadOne('pointcloud', file('c.ply', 41))
    await loadOne('pointcloud', file('d.ply', 42))
    await loadPointCloudsOnce(['a', 'b', 'c', 'd'].map((n, i) => ({
      source: { type: 'file' as const, file: file(`${n}.ply`, [4, 5, 41, 42][i]) },
    })), { origin: 'drop' })
    // The newest duplicate toast replaces the previous one instead of stacking.
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].message).toBe(t('loading:duplicate.many', { count: 4 }))
  })

  it('a scan and a mesh re-dropped together keep a toast each: neither copy is lost', async () => {
    await loadOne('pointcloud', file('both.las', 57))
    await loadOne('mesh', file('both.glb', 58))
    await Promise.all([
      loadPointCloudsOnce([{ source: { type: 'file', file: file('both.las', 57) } }], { origin: 'drop' }),
      loadMeshesOnce([{ source: { type: 'file', file: file('both.glb', 58) } }], { origin: 'drop' }),
    ])
    expect(toasts()).toHaveLength(2)
  })

  it('several duplicates: what was done to them is said too', async () => {
    const a = await loadOne('pointcloud', file('h1.las', 59))
    await loadOne('pointcloud', file('h2.las', 60))
    usePointCloudStore.getState().setVisible(a, false)
    await loadPointCloudsOnce([
      { source: { type: 'file', file: file('h1.las', 59) } },
      { source: { type: 'file', file: file('h2.las', 60) } },
    ], { origin: 'drop' })
    expect(toasts()[0].message).toBe(`${t('loading:duplicate.manyNamed', { names: listOf('h1.las', 'h2.las') })} ${t('loading:duplicate.revealedSome')}`)
    expect(usePointCloudStore.getState().clouds.find((c) => c.id === a)?.visible).toBe(true)
  })

  it('the duplicate toast stays until it is used or closed: it is the only way to a copy', async () => {
    await loadOne('pointcloud', file('stay.las', 43))
    await loadPointCloudsOnce([{ source: { type: 'file', file: file('stay.las', 43) } }], { origin: 'drop' })
    expect(toasts()[0].duration).toBe(0)
  })

  it('an edited scan with the same sample is not a copy: another modification time loads it', async () => {
    const big = (mtime: number, edit: boolean): File => sampledScan('site.las', 44, mtime, edit)
    await loadOne('pointcloud', big(MTIME, false))
    const copy = await loadPointCloudsOnce([{ source: { type: 'file', file: big(MTIME, false) } }], { origin: 'drop' })
    expect(copy).toEqual([])
    const edited = await loadPointCloudsOnce([{ source: { type: 'file', file: big(MTIME + 60_000, true) } }], { origin: 'drop' })
    expect(edited).toHaveLength(1)
    // …and its row is not called a copy of the first.
    await edited[0].settled
    expect(jobsOf('pointcloud')[1].duplicateOf).toBeNull()
    // And the edited version is itself recognised the next time.
    inScene('pointcloud', jobsOf('pointcloud')[1].resultId!, 'site.las')
    expect(await loadPointCloudsOnce([{ source: { type: 'file', file: big(MTIME + 60_000, true) } }], { origin: 'drop' })).toEqual([])
  })

  it('the file and its edit picked together both load', async () => {
    const handles = await loadPointCloudsOnce([
      { source: { type: 'file', file: sampledScan('site.las', 54, MTIME) } },
      { source: { type: 'file', file: sampledScan('site-edited.las', 54, MTIME + 60_000, true) } },
    ], { origin: 'drop' })
    expect(handles).toHaveLength(2)
    expect(toasts()).toHaveLength(0)
  })

  it('a reloaded scan keeps its version: an edit dropped after a Reload still loads', async () => {
    await loadOne('pointcloud', sampledScan('site.las', 55, MTIME))
    const reloaded = getLoadManager().reload(jobsOf('pointcloud')[0].id)
    if (!reloaded) throw new Error('no reload')
    const out = await reloaded.settled
    if (out.status !== 'loaded') throw new Error(out.status)
    inScene('pointcloud', out.resultId, 'site.las')
    const edited = await loadPointCloudsOnce([{ source: { type: 'file', file: sampledScan('site.las', 55, MTIME + 60_000, true) } }], { origin: 'drop' })
    expect(edited).toHaveLength(1)
  })

  it('an older version still loading is found even when a newer one is already in the scene', async () => {
    const fp = await fingerprintBlob(sampledScan('site.las', 56, MTIME))
    // v2 (the edit) is in the scene; v1 is still loading.
    const [v2] = submitPointClouds([{ source: { type: 'file', file: sampledScan('site.las', 56, MTIME + 60_000, true) }, fingerprint: fp }], { origin: 'sdk' })
    await v2.settled
    pc.holdNext()
    const [v1] = submitPointClouds([{ source: { type: 'file', file: sampledScan('site.las', 56, MTIME) }, fingerprint: fp }], { origin: 'sdk' })
    await until(() => jobsOf('pointcloud').some((j) => j.id === v1.id && j.status === 'running'))
    // v1 asked for again: that is the one loading, not a new file.
    const again = await loadPointCloudsOnce([{ source: { type: 'file', file: sampledScan('site.las', 56, MTIME) } }], { origin: 'drop' })
    expect(again).toEqual([])
    expect(toasts()[0].message).toBe(t('loading:duplicate.loading', { name: 'site.las' }))
    pc.release()
  })

  it("kinds never match: a mesh with a scan's bytes is a new mesh", async () => {
    await loadOne('pointcloud', file('x.ply', 6))
    const { fresh, duplicates } = await partitionDuplicates('mesh', [{ source: { type: 'file', file: file('x.glb', 6) } }])
    expect(fresh).toHaveLength(1)
    expect(duplicates).toHaveLength(0)
    const [m] = await loadMeshesOnce(fresh, { origin: 'drop' })
    expect((await m.settled).status).toBe('loaded')
    // Nor does the IFC dialog's check see a scan.
    const fp = jobsOf('pointcloud')[0].fingerprint!
    expect(getLoadManager().findDuplicate(fp, 'ifc')).toBeNull()
    expect(getLoadManager().findDuplicate(fp, 'pointcloud')).not.toBeNull()
  })

  it('a removed scan is not a duplicate any more', async () => {
    const id = await loadOne('pointcloud', file('gone.las', 7))
    getLoadManager().markRemoved(id, 'pointcloud')
    usePointCloudStore.getState().removeCloud(id)
    const again = await loadPointCloudsOnce([{ source: { type: 'file', file: file('gone.las', 7) } }], { origin: 'drop' })
    expect(again).toHaveLength(1)
  })

  it('a dismissed or cleared Loading Center row does not make its scan / mesh new again', async () => {
    await loadOne('pointcloud', file('kept.las', 13))
    getLoadManager().dismiss(jobsOf('pointcloud')[0].id)
    expect(jobsOf('pointcloud')).toHaveLength(0)
    expect(await loadPointCloudsOnce([{ source: { type: 'file', file: file('kept.las', 13) } }], { origin: 'drop' })).toEqual([])
    expect(toasts()[0].message).toBe(t('loading:duplicate.inScene', { name: 'kept.las' }))

    await loadOne('mesh', file('kept.glb', 14))
    getLoadManager().clearFinished()
    expect(jobsOf('mesh')).toHaveLength(0)
    expect(await loadMeshesOnce([{ source: { type: 'file', file: file('kept.glb', 14) } }], { origin: 'drop' })).toEqual([])
  })

  it('…until the scan leaves the scene by any path', async () => {
    const id = await loadOne('pointcloud', file('later.las', 15))
    getLoadManager().dismiss(jobsOf('pointcloud')[0].id)
    usePointCloudStore.getState().removeCloud(id)
    expect(await loadPointCloudsOnce([{ source: { type: 'file', file: file('later.las', 15) } }], { origin: 'drop' })).toHaveLength(1)
  })

  it('a hidden scan asked for again under another name: both names, and it is shown again', async () => {
    const id = await loadOne('pointcloud', file('survey.las', 45))
    usePointCloudStore.getState().setVisible(id, false)
    await loadPointCloudsOnce([{ source: { type: 'file', file: file('survey_copy.las', 45) } }], { origin: 'drop' })
    expect(usePointCloudStore.getState().clouds.find((c) => c.id === id)?.visible).toBe(true)
    expect(toasts()[0].message).toBe(t('loading:duplicate.revealedSameAs', { name: 'survey_copy.las', existing: 'survey.las' }))
  })

  it('a scan being removed is not "already in the scene": the drop loads it again', async () => {
    const id = await loadOne('pointcloud', file('going.las', 46))
    const openUnload = pc.holdUnload()
    const job = jobsOf('pointcloud')[0]
    const removing = getLoadManager().remove(job.id)
    await until(() => jobsOf('pointcloud')[0]?.status === 'unloading')
    // Its store entry is still there while the unload runs.
    expect(usePointCloudStore.getState().clouds.some((c) => c.id === id)).toBe(true)
    const again = await loadPointCloudsOnce([{ source: { type: 'file', file: file('going.las', 46) } }], { origin: 'drop' })
    expect(again).toHaveLength(1)
    openUnload()
    await removing
  })

  it('a file and a link to the same scan are one duplicate, and one copy', async () => {
    const url = 'https://cdn.example/one.laz'
    // Host bytes from that URL, with the content identity a real adapter records.
    const fingerprint = await fingerprintBlob(file('one.laz', 47))
    const [h] = submitPointClouds([{ source: { type: 'file', file: file('one.laz', 47) }, sourceUrl: url, fingerprint }], { origin: 'sdk' })
    await h.settled
    await loadPointCloudsOnce([
      { source: { type: 'file', file: file('one.laz', 47) } },
      { source: { type: 'url', url } },
    ], { origin: 'drop' })
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0].message).toBe(t('loading:duplicate.inScene', { name: 'one.laz' }))
    runToastAction(toasts()[0].id)
    await until(() => jobsOf('pointcloud').length === 2)
    await new Promise((r) => setTimeout(r, 20))
    expect(jobsOf('pointcloud')).toHaveLength(2)
  })

  it('a hidden scan asked for again is shown again, and the toast says so', async () => {
    const id = await loadOne('pointcloud', file('hidden.las', 16))
    usePointCloudStore.getState().setVisible(id, false)
    await loadPointCloudsOnce([{ source: { type: 'file', file: file('hidden.las', 16) } }], { origin: 'drop' })
    expect(usePointCloudStore.getState().clouds.find((c) => c.id === id)?.visible).toBe(true)
    expect(toasts()[0].message).toBe(t('loading:duplicate.revealed', { name: 'hidden.las' }))
  })

  it('a paused load asked for again resumes', async () => {
    pc.holdNext()
    const f = (i: number): File => file(`p${i}.las`, 30 + i)
    const handles = await loadPointCloudsOnce([0, 1, 2].map((i) => ({ source: { type: 'file' as const, file: f(i) } })), { origin: 'drop' })
    const third = handles[2].id
    const status = (): string | undefined => jobsOf('pointcloud').find((j) => j.id === third)?.status
    // Behind the two loads holding the decode slots: queued for a slot.
    await until(() => jobsOf('pointcloud').find((j) => j.id === third)?.waitReason === 'slot')
    getLoadManager().hold(third)
    expect(status()).toBe('held')
    await loadPointCloudsOnce([{ source: { type: 'file', file: f(2) } }], { origin: 'drop' })
    expect(toasts()[0].message).toBe(t('loading:duplicate.resumed', { name: 'p2.las' }))
    expect(status()).not.toBe('held')
    pc.release()
    await Promise.all(handles.map((h) => h.settled))
    expect(jobsOf('pointcloud')).toHaveLength(3)
  })

  it('"load a copy" keeps the submission\'s own options', async () => {
    await loadOne('mesh', file('m.glb', 19))
    await loadMeshesOnce([{ source: { type: 'file', file: file('m.glb', 19) } }], { origin: 'upload', frame: true })
    runToastAction(toasts()[0].id)
    await until(() => jobsOf('mesh').length === 2)
    expect(jobsOf('mesh')[1].origin).toBe('upload')
    await until(() => mesh.frames.length === 2)
    expect(mesh.frames[1]).toBe(true)
  })

  it('"load a copy" of a URL still loading queues a second download', async () => {
    pc.holdNext()
    const url = 'https://cdn.example/twice-over.laz'
    await loadPointCloudsOnce([{ source: { type: 'url', url } }], { origin: 'url' })
    await loadPointCloudsOnce([{ source: { type: 'url', url } }], { origin: 'url' })
    runToastAction(toasts()[0].id)
    await until(() => jobsOf('pointcloud').length === 2)
    pc.release()
  })

  it('a copy is marked as one only against its own kind', async () => {
    const fp = 'f1:4096:same-content'
    const [a] = submitPointClouds([{ source: { type: 'file', file: file('a.las', 48) }, fingerprint: fp }], { origin: 'sdk' })
    await a.settled
    const [b] = submitPointClouds([{ source: { type: 'file', file: file('b.las', 48) }, fingerprint: fp }], { origin: 'sdk' })
    const [m] = submitMeshes([{ source: { type: 'file', file: file('m.glb', 48) }, fingerprint: fp }], { origin: 'sdk' })
    await Promise.all([b.settled, m.settled])
    const row = (id: string) => getLoadManager().getSnapshot().jobs.find((j) => j.id === id)!
    expect(row(b.id).duplicateOf).toBe(row(a.id).resultId)
    expect(row(m.id).duplicateOf).toBeNull()
    expect(getLoadManager().findDuplicate(fp, 'ifc')).toBeNull()
  })

  it('an .obj brought back with its .mtl is a new import, not a copy of the grey one', async () => {
    const obj = file('house.obj', 20)
    await loadOne('mesh', obj)
    const mtl = file('house.mtl', 21, 64)
    const fixed = await loadMeshesOnce([{ source: { type: 'file', file: obj, sidecars: [mtl] } }], { origin: 'drop' })
    expect(fixed).toHaveLength(1)
    await fixed[0].settled
    // The same set once more IS a copy.
    const again = await loadMeshesOnce([{ source: { type: 'file', file: obj, sidecars: [mtl] } }], { origin: 'drop' })
    expect(again).toEqual([])
  })

  it('host bytes from a URL are recognised when that URL is opened later', async () => {
    const [h] = submitPointClouds([{ source: { type: 'file', file: file('site.laz', 22) }, sourceUrl: 'https://cdn.example/site.laz' }], { origin: 'sdk' })
    await h.settled
    const again = await loadPointCloudsOnce([{ source: { type: 'url', url: 'https://cdn.example/site.laz' } }], { origin: 'demo' })
    expect(again).toEqual([])
  })

  it('the SDK path is not deduplicated: a host that adds a scan twice asked for two', async () => {
    const [a] = submitPointClouds([{ source: { type: 'file', file: file('sdk.las', 23) } }], { origin: 'sdk' })
    await a.settled
    const [b] = submitPointClouds([{ source: { type: 'file', file: file('sdk.las', 23) } }], { origin: 'sdk' })
    expect((await b.settled).status).toBe('loaded')
    expect(toasts()).toHaveLength(0)
  })

  it('two drops that overlap in time still load a shared file once', async () => {
    const [first, second] = await Promise.all([
      loadPointCloudsOnce([
        { source: { type: 'file', file: file('o-a.las', 24) } },
        { source: { type: 'file', file: file('o-b.las', 25) } },
      ], { origin: 'drop' }),
      loadPointCloudsOnce([{ source: { type: 'file', file: file('o-a.las', 24) } }], { origin: 'drop' }),
    ])
    expect(first.length + second.length).toBe(2)
    expect(jobsOf('pointcloud').map((j) => j.fileName).sort()).toEqual(['o-a.las', 'o-b.las'])
  })

  it('a drop still being sampled when the scans are cleared does not land after the clear', async () => {
    const g = gatedFile('cleared.las', 49)
    const pending = loadPointCloudsOnce([{ source: { type: 'file', file: g.file } }], { origin: 'drop' })
    await until(() => g.reads() === 1)
    cancelLoadsOfKind('pointcloud')
    g.open()
    expect(await pending).toEqual([])
    expect(jobsOf('pointcloud')).toHaveLength(0)
    // Meshes were not cleared: theirs still lands.
    const [m] = await loadMeshesOnce([{ source: { type: 'file', file: file('kept.glb', 50) } }], { origin: 'drop' })
    expect((await m.settled).status).toBe('loaded')
  })

  it('clearing the scans also ends the claims of a drop being sampled, and its "already in the scene" toast', async () => {
    await loadOne('pointcloud', file('stale.las', 61))
    await loadPointCloudsOnce([{ source: { type: 'file', file: file('stale.las', 61) } }], { origin: 'drop' })
    expect(toasts()).toHaveLength(1)
    const c = gatedFile('c.las', 62)
    const old = loadPointCloudsOnce([
      { source: { type: 'file', file: file('a.las', 63) } },
      { source: { type: 'file', file: c.file } },
    ], { origin: 'drop' })
    await until(() => c.reads() === 1)
    cancelLoadsOfKind('pointcloud')
    expect(toasts()).toHaveLength(0)
    // A new drop of a.las (claimed by the cleared drop) loads.
    const fresh = await loadPointCloudsOnce([{ source: { type: 'file', file: file('a.las', 63) } }], { origin: 'drop' })
    expect(fresh).toHaveLength(1)
    c.open()
    expect(await old).toEqual([])
  })

  it('a drop from an ended session claims nothing in the next one', async () => {
    const a = gatedFile('old-a.las', 51)
    const c = gatedFile('old-c.las', 53)
    const old = loadPointCloudsOnce([
      { source: { type: 'file', file: a.file } },
      { source: { type: 'file', file: file('old-b.las', 52) } },
      { source: { type: 'file', file: c.file } },
    ], { origin: 'drop' })
    await until(() => a.reads() === 1)
    resetLoading()
    getLoadManager().registerAdapter(pc.adapter)
    a.open()
    // Give the old loop every chance to go on to old-b.las and park on old-c.
    await Promise.race([until(() => c.reads() === 1), new Promise((r) => setTimeout(r, 200))])
    // The new session opens old-b.las: it loads, not "already loading".
    const fresh = await loadPointCloudsOnce([{ source: { type: 'file', file: file('old-b.las', 52) } }], { origin: 'drop' })
    expect(fresh).toHaveLength(1)
    expect(toasts()).toHaveLength(0)
    c.open()
    expect(await old).toEqual([])
  })

  it('a drop still being sampled when the session ends is dropped with it; so is its "load a copy"', async () => {
    await loadOne('pointcloud', file('old.las', 26))
    await loadPointCloudsOnce([{ source: { type: 'file', file: file('old.las', 26) } }], { origin: 'drop' })
    const stale = toasts()[0]
    const pending = loadPointCloudsOnce([{ source: { type: 'file', file: file('late.las', 27) } }], { origin: 'drop' })
    resetLoading()
    getLoadManager().registerAdapter(pc.adapter)
    expect(await pending).toEqual([])
    // The old session's toast is gone, and its action does nothing.
    expect(toasts().find((x) => x.id === stale.id)).toBeUndefined()
    runToastAction(stale.id)
    await new Promise((r) => setTimeout(r, 20))
    expect(jobsOf('pointcloud')).toHaveLength(0)
  })
})
