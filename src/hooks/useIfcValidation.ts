// ─── src/hooks/useIfcValidation.ts ───────────────────────────────────────────
// Checks the files of a selection: validation (lib/upload.utils
// `validateIfcFile`), sampled fingerprint and duplicate lookup against what is
// already loaded or queued — one ENTRY_PREPARED per file, in whatever order
// they finish.
//
// No per-pick cancellation any more: files ADD to a selection instead of
// replacing it, so an earlier check is never obsolete. A result for a row that
// no longer exists (after a reset) is ignored by the reducer, since row keys
// are never reused. `abort()` only saves the remaining reads when the dialog
// closes.
//
// Deliberately NOT aborted from an unmount cleanup: StrictMode runs that
// cleanup once right after mount, which would silently drop the results of
// files the dialog was opened with and leave their rows checking forever.
// After a real unmount the few dispatches still in flight are no-ops.

import { useCallback, useRef } from 'react'
import type { UploadEntry, UploadEvent } from '../types/upload.types'
import { prepareUploadFile } from '../lib/upload.utils'
import { PREPARE_CONCURRENCY } from '../lib/upload.constants'
import { loadingController } from '../lib/loading/controller'
import { createLogger } from '../lib/logger'

const log = createLogger('FileValidation')

type Dispatch = (event: UploadEvent) => void
type Job = Pick<UploadEntry, 'key' | 'file'>
/** A queued check, stamped with the epoch it was queued in (see `abort`). */
type QueuedJob = Job & { epoch: number }

export function useIfcValidation(dispatch: Dispatch) {
  // One queue for the dialog's lifetime: files appended while earlier ones are
  // still being checked join the same pool instead of starting a second one.
  const queueRef = useRef<QueuedJob[]>([])
  const activeRef = useRef(0)
  const epochRef = useRef(0)

  const drain = useCallback(async (): Promise<void> => {
    activeRef.current += 1
    try {
      for (let job = queueRef.current.shift(); job; job = queueRef.current.shift()) {
        const { key, file, epoch } = job
        const check = await prepareUploadFile(file, {
          findDuplicate: (fp) => loadingController.findDuplicate(fp),
        })
        // Queued before an abort: drop the result, keep draining what came after.
        if (epoch !== epochRef.current) continue
        if (check.ok) {
          log.debug('Checked:', file.name, check.version ?? '(no schema)',
            check.existing ? `duplicate of ${check.existing.fileName}` : '')
        } else {
          log.warn('Rejected:', file.name, check.error.code, check.error.technical ?? '')
        }
        dispatch({ type: 'ENTRY_PREPARED', key, check })
      }
    } finally {
      activeRef.current -= 1
    }
  }, [dispatch])

  const prepare = useCallback((jobs: readonly Job[]): void => {
    const epoch = epochRef.current
    for (const { key, file } of jobs) queueRef.current.push({ key, file, epoch })
    // A small pool, not Promise.all: a 60-file folder drop from a network share
    // should not issue 120 concurrent reads, and rows complete progressively.
    const spare = Math.min(PREPARE_CONCURRENCY - activeRef.current, queueRef.current.length)
    for (let i = 0; i < spare; i++) void drain()
  }, [drain])

  const abort = useCallback((): void => {
    epochRef.current += 1
    queueRef.current = []
  }, [])

  return { prepare, abort }
}
