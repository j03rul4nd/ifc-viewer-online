// ─── Connector framework: shared types ────────────────────────────────────────
// A connector links one folder in a company's own storage (SharePoint/OneDrive,
// Google Drive…) to the validator: sign in with OAuth, watch the folder, pull
// each new IFC, and put the result back next to it. Every network call goes
// through an injected `fetch`, so the same code runs against the real API, a
// sandbox or a contract mock. Nothing here holds credentials: tokens are passed
// in by the caller and never persisted by this module. Built dark: nothing in
// production switches a connector on.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

export type ConnectorId = 'sharepoint' | 'gdrive'

export interface OAuthConfig {
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  /** Extra query params the provider needs (e.g. access_type=offline on Google). */
  extraAuthParams?: Record<string, string>
}

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  /** Epoch ms. */
  expiresAt: number
}

/** A file seen in the watched folder. `version` changes when the content does. */
export interface RemoteFile {
  id: string
  name: string
  size: number
  version: string
  modifiedAt: string
  parentId: string
}

export interface ChangePage {
  files: RemoteFile[]
  /** Opaque cursor for the next poll (Graph deltaLink / Drive pageToken). */
  cursor: string
}

export interface ResultUpload {
  /** Name of the file written next to the model, e.g. `Model.ifc.report.json`. */
  name: string
  body: string
  contentType: string
}

export interface Connector {
  id: ConnectorId
  name: string
  oauth: OAuthConfig
  /** First cursor for a folder: only changes after this moment are reported. */
  startCursor(folderId: string, token: string): Promise<string>
  /** IFC changes since `cursor` inside `folderId` (deleted ones dropped). */
  changes(folderId: string, cursor: string, token: string): Promise<ChangePage>
  download(file: RemoteFile, token: string): Promise<ArrayBuffer>
  /** Writes the result next to the model; returns the new file's id. */
  upload(file: RemoteFile, result: ResultUpload, token: string): Promise<string>
}

export type ConnectorState = 'disconnected' | 'connected' | 'watching' | 'error' | 'paused'

export interface WatchedFolder {
  connector: ConnectorId
  folderId: string
  folderName: string
  cursor?: string
  /** `${fileId}@${version}` already processed, so a re-poll never validates twice. */
  seen: string[]
  state: ConnectorState
  lastPollAt?: string
  lastError?: string
  /** Consecutive failed polls; the folder pauses after MAX_FAILURES. */
  failures: number
}

export class ConnectorError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message)
    this.name = 'ConnectorError'
  }
}

export const isIfcName = (name: string) => /\.(ifc|ifczip|ifcxml)$/i.test(name)
