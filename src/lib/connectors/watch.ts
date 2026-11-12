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

export async function pollFolder(
  connector: Connector,
  folder: WatchedFolder,
  token: string,
  validate: (file: RemoteFile, bytes: ArrayBuffer) => Promise<ValidationOutcome>,
  now = () => new Date().toISOString(),
): Promise<PollResult> {
  if (folder.state === 'paused' || folder.state === 'disconnected') return { folder, results: [] }
  let cursor = folder.cursor
  try {
    if (!cursor) cursor = await connector.startCursor(folder.folderId, token)
    const page = await connector.changes(folder.folderId, cursor, token)
    const seen = new Set(folder.seen)
    const results: FileResult[] = []
    for (const file of page.files) {
      const key = seenKey(file)
      if (seen.has(key)) continue
      seen.add(key)
      if (file.size > MAX_IFC_BYTES) { results.push({ file, status: 'skipped-too-large' }); continue }
      try {
        const bytes = await connector.download(file, token)
        const outcome = await validate(file, bytes)
        const resultFileId = await connector.upload(file, {
          name: `${file.name}.report.json`,
          contentType: 'application/json',
          body: JSON.stringify({ file: file.name, version: file.version, checkedAt: now(), ...outcome }, null, 2),
        }, token)
        results.push({ file, status: 'validated', outcome, resultFileId })
      } catch (e) {
        results.push({ file, status: 'failed', error: (e as Error).message })
      }
    }
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
