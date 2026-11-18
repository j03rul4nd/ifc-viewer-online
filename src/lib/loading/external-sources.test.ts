// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import i18n from '../../i18n/config'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useMeshStore } from '../../stores/meshStore'
import { useGeoStore } from '../../stores/geoStore'
import { startExternalTracking, watchSourceRemovals } from './external-sources'
import { LoadManager } from './load-manager'
import { createResourcePolicy } from './resource-policy'
import type { ExternalJobController, ExternalJobSpec, JobStatus, PhaseCounters, PhaseId, SourceKind } from './types'
import { NO_OFFSET, type PointCloudEntry } from '../pointcloud/pc-types'
import type { MeshEntry } from '../mesh/mesh-types'

// ── Test doubles ──────────────────────────────────────────────────────────────

type Call =
  | ['phase', PhaseId]
  | ['progress', number | null, PhaseCounters | undefined]
  | ['loaded', string | undefined]
  | ['failed', { code: string; message: string }]
  | ['cancelled']
  | ['removed']

interface FakeJob {
  spec: ExternalJobSpec
  calls: Call[]
}

/** Records every track() and every controller call, in order. */
function fakeManager() {
  const jobs: FakeJob[] = []
  const track = (spec: ExternalJobSpec): ExternalJobController => {
    const job: FakeJob = { spec, calls: [] }
    jobs.push(job)
    return {
      id: `x${jobs.length}`,
      phase: (id) => {
        job.calls.push(['phase', id])
        return {
          progress: (fraction, counters) => { job.calls.push(['progress', fraction, counters]) },
          done: () => {},
        }
      },
      loaded: (resultId) => { job.calls.push(['loaded', resultId]) },
      failed: (error) => { job.calls.push(['failed', { code: error.code, message: error.message }]) },
      cancelled: () => { job.calls.push(['cancelled']) },
      removed: () => { job.calls.push(['removed']) },
    }
  }
  return { jobs, manager: { track } }
}

function cloud(patch: Partial<PointCloudEntry> & { id: string }): PointCloudEntry {
  return {
    fileName: `${patch.id}.laz`, fileSize: 40_000_000, format: 'laz',
    status: 'parsing', errorKey: null, progress: 0, pointCount: 0, declaredCount: null,
    truncated: false, streamErrorKey: null, visible: true, frame: null,
    attributes: { color: false, intensity: false, classification: false, confidence: false },
    alignment: null, alignedToModelId: null, fileKey: `key:${patch.id}`, loadedAt: 0,
    ...patch,
  }
}

function mesh(patch: Partial<MeshEntry> & { id: string }): MeshEntry {
  return {
    fileName: `${patch.id}.glb`, fileSize: 2_000_000, format: 'glb', status: 'loading',
    errorKey: null, visible: true,
    stats: { meshes: 0, triangles: 0, materials: 0, textures: 0, textureBytes: 0 },
    frame: null, placement: { ...NO_OFFSET },
    fileKey: `key:${patch.id}`, loadedAt: 0,
    ...patch,
  }
}

const pc = () => usePointCloudStore.getState()
const ms = () => useMeshStore.getState()
const setTerrain = (terrainStatus: 'idle' | 'loading' | 'ready' | 'error') => useGeoStore.setState({ terrainStatus })
const setBuildings = (buildingsStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error') =>
  useGeoStore.setState({ buildingsStatus })

let stops: Array<() => void> = []
function start(...args: Parameters<typeof startExternalTracking>): () => void {
  const stop = startExternalTracking(...args)
  stops.push(stop)
  return stop
}
function watch(...args: Parameters<typeof watchSourceRemovals>): () => void {
  const stop = watchSourceRemovals(...args)
  stops.push(stop)
  return stop
}

beforeEach(() => {
  usePointCloudStore.setState({ clouds: [], activeCloudId: null })
  useMeshStore.setState({ meshes: [], activeMeshId: null })
  useGeoStore.setState({ terrainStatus: 'idle', buildingsStatus: 'idle' })
})

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
})

// ── Scene removals of managed point clouds / meshes ──────────────────────────

/** What the watcher calls on the manager, with a scripted job table. */
function fakeRemovalManager(table: Record<string, { jobId: string; status: JobStatus; kind: SourceKind }>) {
  const calls: Array<['cancel', string] | ['markRemoved', string]> = []
  return {
    calls,
    manager: {
      findByResult: (kind: SourceKind, id: string) => {
        const hit = table[id]
        return hit && hit.kind === kind ? { jobId: hit.jobId, status: hit.status } : null
      },
      cancel: (jobId: string) => { calls.push(['cancel', jobId]) },
      markRemoved: (id: string) => { calls.push(['markRemoved', id]) },
    },
  }
}

describe('watchSourceRemovals', () => {
  it('an entry of a job still loading is a cancel; of a loaded job, a removal', () => {
    const { calls, manager } = fakeRemovalManager({
      a: { jobId: 'j1', status: 'running', kind: 'pointcloud' },
      b: { jobId: 'j2', status: 'loaded', kind: 'pointcloud' },
      m: { jobId: 'j3', status: 'waiting', kind: 'mesh' },
    })
    pc().addCloud(cloud({ id: 'a' }))
    pc().addCloud(cloud({ id: 'b', status: 'ready' }))
    ms().addMesh(mesh({ id: 'm' }))
    watch(manager)

    pc().removeCloud('a')
    pc().removeCloud('b')
    ms().removeMesh('m')
    expect(calls).toEqual([['cancel', 'j1'], ['markRemoved', 'b'], ['cancel', 'j3']])
  })

  it('ignores entries no job owns (a temporal replay) and settled jobs', () => {
    const { calls, manager } = fakeRemovalManager({
      done: { jobId: 'j1', status: 'cancelled', kind: 'pointcloud' },
    })
    pc().addCloud(cloud({ id: 'replay-1', sourceKind: 'temporal-replay', status: 'ready' }))
    pc().addCloud(cloud({ id: 'done' }))
    watch(manager)
    pc().removeCloud('replay-1')
    pc().removeCloud('done')
    expect(calls).toEqual([])
  })

  it('a clear reports every entry; kinds never cross (a cloud id is not looked up as a mesh)', () => {
    const { calls, manager } = fakeRemovalManager({
      x: { jobId: 'jm', status: 'loaded', kind: 'mesh' },
      y: { jobId: 'jp', status: 'loaded', kind: 'pointcloud' },
    })
    pc().addCloud(cloud({ id: 'x' }))
    pc().addCloud(cloud({ id: 'y' }))
    watch(manager)
    pc().clearClouds()
    expect(calls).toEqual([['markRemoved', 'y']])
  })

  it('unrelated writes do nothing; a throwing manager never breaks the store write', () => {
    const manager = {
      findByResult: (): { jobId: string; status: JobStatus } | null => { throw new Error('boom') },
      cancel: () => {},
      markRemoved: () => {},
    }
    pc().addCloud(cloud({ id: 'a' }))
    watch(manager)
    pc().updateCloud('a', { progress: 50 })
    expect(() => pc().removeCloud('a')).not.toThrow()
    expect(pc().clouds).toHaveLength(0)
  })

  it('stop() unsubscribes', () => {
    const { calls, manager } = fakeRemovalManager({ a: { jobId: 'j1', status: 'running', kind: 'pointcloud' } })
    pc().addCloud(cloud({ id: 'a' }))
    const stop = watch(manager)
    stop()
    stop()
    pc().removeCloud('a')
    expect(calls).toEqual([])
  })
})

// ── GIS ───────────────────────────────────────────────────────────────────────

describe('external tracking — GIS context', () => {
  it('terrain loading → ready is one background row named from i18n, with no cancel', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    setTerrain('loading')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].spec).toMatchObject({
      kind: 'gis', fileName: i18n.t('loading:external.terrain'), priority: 4, plan: [{ id: 'fetch', weight: 1 }],
    })
    expect(jobs[0].spec.fileName).not.toMatch(/external\./)   // resolved, not the raw key
    expect(jobs[0].spec.onCancel).toBeUndefined()
    expect(jobs[0].calls).toEqual([['phase', 'fetch']])

    setTerrain('ready')
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['loaded', undefined])

    // Toggled off: what it drew is gone.
    setTerrain('idle')
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['removed'])
    expect(jobs).toHaveLength(1)
  })

  it('buildings: empty is loaded, error fails with network, idle while loading cancels, a refetch replaces', () => {
    const { jobs, manager } = fakeManager()
    start(manager)

    setBuildings('loading')
    setBuildings('empty')
    expect(jobs[0].spec.fileName).toBe(i18n.t('loading:external.buildings'))
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['loaded', undefined])

    setBuildings('loading')                                  // toggled on again: a new fetch
    expect(jobs[0].calls[jobs[0].calls.length - 1]).toEqual(['removed'])
    setBuildings('error')
    expect(jobs[1].calls[jobs[1].calls.length - 1]).toMatchObject(['failed', { code: 'network' }])

    setBuildings('loading')
    setBuildings('idle')                                     // map mode left under it
    expect(jobs[2].calls[jobs[2].calls.length - 1]).toEqual(['cancelled'])
    expect(jobs).toHaveLength(3)
  })

  it('both slots in one write (disable / resetForScene) close both rows; unrelated geo writes do nothing', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    useGeoStore.setState({ terrainStatus: 'loading', buildingsStatus: 'loading' })
    expect(jobs.map((j) => j.spec.fileName)).toEqual([
      i18n.t('loading:external.terrain'), i18n.t('loading:external.buildings'),
    ])
    useGeoStore.getState().setPanelOpen(true)
    expect(jobs.every((j) => j.calls.length === 1)).toBe(true)

    useGeoStore.getState().resetForScene()
    expect(jobs.map((j) => j.calls[j.calls.length - 1])).toEqual([['cancelled'], ['cancelled']])
  })

  it('a fetch already running when tracking starts is picked up; a settled one is not', () => {
    useGeoStore.setState({ terrainStatus: 'loading', buildingsStatus: 'ready' })
    const { jobs, manager } = fakeManager()
    start(manager)
    expect(jobs).toHaveLength(1)
    expect(jobs[0].spec.fileName).toBe(i18n.t('loading:external.terrain'))
  })

  it('point cloud and mesh entries are no longer mirrored as tracked rows', () => {
    const { jobs, manager } = fakeManager()
    start(manager)
    pc().addCloud(cloud({ id: 'a' }))
    ms().addMesh(mesh({ id: 'm' }))
    expect(jobs).toHaveLength(0)
  })
})

// ── stop() ────────────────────────────────────────────────────────────────────

describe('external tracking — stop', () => {
  it('unsubscribes and cancels nothing', () => {
    const { jobs, manager } = fakeManager()
    const stop = start(manager)
    setTerrain('loading')
    expect(jobs).toHaveLength(1)
    const before = jobs.map((j) => j.calls.length)

    stop()
    stop()                                                   // idempotent
    expect(jobs.map((j) => j.calls.length)).toEqual(before)  // nothing cancelled on stop

    setTerrain('ready')
    setBuildings('loading')
    expect(jobs).toHaveLength(1)
    expect(jobs.map((j) => j.calls.length)).toEqual(before)
  })
})

// ── Against the real manager ──────────────────────────────────────────────────

describe('external tracking — real LoadManager', () => {
  it('GIS rows run in the background and cannot be cancelled from the center', () => {
    const policy = createResourcePolicy({
      cores: 8, deviceMemoryGB: 8, crossOriginIsolated: false, mobile: false, heapLimitBytes: null,
    })
    const mgr = new LoadManager({ policy })
    start(mgr)
    setBuildings('loading')
    const row = mgr.getSnapshot().jobs[0]
    expect(row).toMatchObject({ kind: 'gis', status: 'running', priority: 4 })
    expect(row.capabilities.cancel).toBe(false)
    setBuildings('ready')
    expect(mgr.getSnapshot().jobs[0].status).toBe('loaded')
    mgr.dispose()
  })
})
