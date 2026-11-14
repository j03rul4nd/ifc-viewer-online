// One poll of a watched folder: list changes → pull each new IFC → validate it
// with the caller's validator → write the result next to the model → report.
// Pure orchestration: the connector, the validator and the clock are injected.
import { ConnectorError, type Connector, type RemoteFile, type WatchedFolder } from './types'

export const MAX_FAILURES = 3
/** Graph's simple upload and our API both stop here (doc 25b: ≤ 200 MB). */
export const MAX_IFC_BYTES = 200 * 1024 * 1024

export interface ValidationOutcome {
  score: number
  passed: boolean
  issues: number
  /** Full report written next to the model. */
  report: unknown
}

export interface FileResult {
  file: RemoteFile
  status: 'validated' | 'skipped-too-large' | 'failed'
  outcome?: ValidationOutcome
  resultFileId?: string
  error?: string
}

export interface PollResult { folder: WatchedFolder; results: FileResult[] }

export const seenKey = (f: RemoteFile) => `${f.id}@${f.version}`

/** Errors worth another try on the next poll (not a refusal of the file itself). */
export function isTransient(error: string | undefined): boolean {
  return /network|rate_limited|internal|timeout|ECONNRESET|fetch failed|503|502/i.test(error ?? '')
}

export async function pollFolder(
  connector: Connector,
  folder: WatchedFolder,
  token: string,
  validate: (file: RemoteFile, bytes: ArrayBuffer) => Promise<ValidationOutcome>,
  now = () => new Date().toISOString(),
  /** Files handled at once (download → validate → write the report). 1 = one after another. */
  concurrency = 1,
): Promise<PollResult> {
  if (folder.state === 'paused' || folder.state === 'disconnected') return { folder, results: [] }
  let cursor = folder.cursor
  try {
    if (!cursor) cursor = await connector.startCursor(folder.folderId, token)
    const page = await connector.changes(folder.folderId, cursor, token)
    const seen = new Set(folder.seen)
    const todo: RemoteFile[] = []
    for (const file of page.files) {
      const key = seenKey(file)
      if (seen.has(key)) continue
      seen.add(key)
      todo.push(file)
    }
    const one = async (file: RemoteFile): Promise<FileResult> => {
      if (file.size > MAX_IFC_BYTES) return { file, status: 'skipped-too-large' }
      try {
        const bytes = await connector.download(file, token)
        const outcome = await validate(file, bytes)
        const resultFileId = await connector.upload(file, {
          name: `${file.name}.report.json`,
          contentType: 'application/json',
          body: JSON.stringify({ file: file.name, version: file.version, checkedAt: now(), ...outcome }, null, 2),
        }, token)
        return { file, status: 'validated', outcome, resultFileId }
      } catch (e) {
        return { file, status: 'failed', error: (e as Error).message }
      }
    }
    // A small pool: results keep the folder's order whatever finishes first.
    const results: FileResult[] = new Array(todo.length)
    let next = 0
    const worker = async () => { while (next < todo.length) { const i = next++; results[i] = await one(todo[i]) } }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker))
    // A file that failed for a passing reason (network, server busy) is tried again on the next
    // poll; one refused for what it is (its name, its size) is not.
    for (const r of results) if (r.status === 'failed' && isTransient(r.error)) seen.delete(seenKey(r.file))
    // Keep the dedupe list bounded: newest entries win.
    const nextSeen = [...seen].slice(-500)
    return { folder: { ...folder, cursor: page.cursor, seen: nextSeen, state: 'watching', lastPollAt: now(), lastError: undefined, failures: 0 }, results }
  } catch (e) {
    const err = e as ConnectorError
    const failures = folder.failures + 1
    // A rejected token never fixes itself: stop and ask for a new sign-in.
    const state = err.status === 401 || err.status === 403 ? 'disconnected' : failures >= MAX_FAILURES ? 'paused' : 'error'
    return { folder: { ...folder, cursor, state, lastPollAt: now(), lastError: err.message, failures }, results: [] }
  }
}
