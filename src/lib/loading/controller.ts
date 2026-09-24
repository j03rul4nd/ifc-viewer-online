// ─── Loading controller facade ────────────────────────────────────────────────
// The one surface the UI calls to act on loads. The UI never holds the manager
// (or a File, a worker, the viewer): it reads the store and calls this. App
// registers the implementation once it has the viewer and the scene handlers,
// because some actions ("focus", "remove a loaded model", "reload") need the
// same removal/activation paths App already owns — duplicating them here would
// be the start of two ways to remove a model.
//
// Before registration every action is a no-op (with a dev warning), so a
// component that renders early can never throw.

import type { CacheEntry } from '../../types'
import type { JobStatus, Priority } from './types'
import { createLogger } from '../logger'

const log = createLogger('LoadController')

export interface ImportOptions {
  origin: 'upload' | 'drop'
  /** Name for the batch (shown in the loading center). */
  batchName?: string | null
  /** Also create a scene group with this name and put the files in it. */
  createGroup?: boolean
  priority?: Priority
  /** Fingerprints the import dialog already computed, keyed by file index. */
  fingerprints?: Record<number, string>
}

export interface DuplicateMatch {
  /** Loaded scene model with the same content, when there is one. */
  modelId: string | null
  jobId: string
  fileName: string
  status: JobStatus
}

export interface RenderStats {
  calls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

export interface LoadingController {
  cancel(jobId: string): void
  cancelAll(): void
  retry(jobId: string): void
  hold(jobId: string): void
  resume(jobId: string): void
  setPriority(jobId: string, priority: Priority): void
  move(jobId: string, direction: 'up' | 'down'): void
  /** Cancel an active job, or remove the loaded model it produced. */
  remove(jobId: string): void
  /** Remove and load again a loaded model (fast when cached). */
  reload(jobId: string): void
  /** Drop a finished row from the list. */
  dismiss(jobId: string): void
  clearFinished(): void
  /** Activate and frame the model a loaded job produced. */
  focus(jobId: string): void
  /** Activate and frame an existing model (duplicate prompt → "Open existing"). */
  openExisting(modelId: string): void
  /** Submit files picked or dropped by the user. */
  submitFiles(files: File[], opts: ImportOptions): void
  /** A loaded model or live job with this content fingerprint, if any. */
  findDuplicate(fingerprint: string): DuplicateMatch | null
  /**
   * Whether the host can put a batch into a scene group. Not every build has
   * user-defined scene groups; where it doesn't, the dialog does not offer it.
   */
  canCreateGroups(): boolean
  getRenderStats(): RenderStats | null
  listCache(): Promise<CacheEntry[]>
  clearCache(): Promise<void>
}

const NOOP_STATS = (): RenderStats | null => null

function unregistered(name: string) {
  return (): void => {
    if (import.meta.env.DEV) log.warn(`loadingController.${name}() called before registration`)
  }
}

const fallback: LoadingController = {
  cancel: unregistered('cancel'),
  cancelAll: unregistered('cancelAll'),
  retry: unregistered('retry'),
  hold: unregistered('hold'),
  resume: unregistered('resume'),
  setPriority: unregistered('setPriority'),
  move: unregistered('move'),
  remove: unregistered('remove'),
  reload: unregistered('reload'),
  dismiss: unregistered('dismiss'),
  clearFinished: unregistered('clearFinished'),
  focus: unregistered('focus'),
  openExisting: unregistered('openExisting'),
  submitFiles: unregistered('submitFiles'),
  findDuplicate: () => null,
  canCreateGroups: () => false,
  getRenderStats: NOOP_STATS,
  listCache: async () => [],
  clearCache: async () => {},
}

let impl: LoadingController = fallback

/** Install (or with `null`, remove) the implementation. Returns an uninstaller. */
export function registerLoadingController(next: LoadingController | null): () => void {
  impl = next ?? fallback
  return () => { if (impl === next) impl = fallback }
}

/** Stable proxy — safe to import anywhere and call at any time. */
export const loadingController: LoadingController = new Proxy({} as LoadingController, {
  get(_t, prop: string) {
    const v = (impl as unknown as Record<string, unknown>)[prop]
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(impl) : v
  },
})
