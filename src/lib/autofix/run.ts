// Main-thread wrapper around the auto-fix worker.

import type { AutoFixReport, AutoFixOptions } from './fixes'

export interface AutoFixResult { bytes: Uint8Array; report: AutoFixReport }

/** Above this the text no longer fits comfortably in a browser string: a cloud job's job. */
export const BROWSER_AUTOFIX_LIMIT_MB = 300

export function runAutoFix(buffer: ArrayBuffer, options?: Pick<AutoFixOptions, 'reclassify'>): Promise<AutoFixResult> {
  if (buffer.byteLength > BROWSER_AUTOFIX_LIMIT_MB * 1024 * 1024) {
    return Promise.reject(new Error(`Files over ${BROWSER_AUTOFIX_LIMIT_MB} MB need the cloud version of auto-fix.`))
  }
  const worker = new Worker(new URL('../../workers/autofix.worker.ts', import.meta.url), { type: 'module' })
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ id: string; ok: boolean; bytes?: Uint8Array; report?: AutoFixReport; message?: string }>) => {
      if (e.data.id !== id) return
      worker.terminate()
      if (e.data.ok && e.data.bytes && e.data.report) resolve({ bytes: e.data.bytes, report: e.data.report })
      else reject(new Error(e.data.message ?? 'Auto-fix failed'))
    }
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'Auto-fix worker failed to start')) }
    worker.postMessage({ id, buffer: buffer.slice(0), options })
  })
}
