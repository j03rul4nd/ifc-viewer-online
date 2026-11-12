// SharePoint / OneDrive through Microsoft Graph v1.0.
//   watch:    GET /drives/{driveId}/items/{folderId}/delta  (deltaLink = cursor)
//   download: GET /drives/{driveId}/items/{id}/content
//   result:   PUT /drives/{driveId}/items/{parentId}:/{name}:/content (≤ 4 MB)
// A folder id is `driveId|itemId` (SharePoint drive ids contain "!"), so
// OneDrive and any SharePoint document library work.
import { authed, requestJson } from './http'
import { isIfcName, type Connector, type Fetch, type RemoteFile } from './types'

export const GRAPH = 'https://graph.microsoft.com/v1.0'

interface DriveItem {
  id: string
  name: string
  size?: number
  eTag?: string
  cTag?: string
  lastModifiedDateTime?: string
  file?: unknown
  deleted?: unknown
  parentReference?: { id?: string; driveId?: string }
}
interface DeltaResponse { value: DriveItem[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }

export function splitFolder(id: string): { driveId: string; itemId: string } {
  const [driveId, itemId] = id.split('|')
  if (!driveId || !itemId) throw new Error(`Graph id must be "driveId|itemId", got "${id}"`)
  return { driveId, itemId }
}

const toFile = (i: DriveItem, driveId: string): RemoteFile => ({
  id: `${driveId}|${i.id}`,
  name: i.name,
  size: i.size ?? 0,
  // cTag changes only when the content changes (eTag also on rename/metadata).
  version: i.cTag ?? i.eTag ?? '',
  modifiedAt: i.lastModifiedDateTime ?? '',
  parentId: `${driveId}|${i.parentReference?.id ?? ''}`,
})

export function microsoftGraphConnector(fetchFn: Fetch, tenant = 'common'): Connector {
  return {
    id: 'sharepoint',
    name: 'SharePoint / OneDrive',
    oauth: {
      authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      // Files.ReadWrite.All reaches SharePoint libraries; offline_access gives a refresh token.
      scopes: ['Files.ReadWrite.All', 'offline_access'],
    },
    async startCursor(folderId, token) {
      const { driveId, itemId } = splitFolder(folderId)
      // token=latest returns no items and a deltaLink meaning "from now on".
      const r = await requestJson<DeltaResponse>(fetchFn, `${GRAPH}/drives/${driveId}/items/${itemId}/delta?token=latest`, token)
      return r['@odata.deltaLink'] ?? ''
    },
    async changes(folderId, cursor, token) {
      const { driveId, itemId } = splitFolder(folderId)
      let url: string | undefined = cursor || `${GRAPH}/drives/${driveId}/items/${itemId}/delta`
      const files: RemoteFile[] = []
      let next = cursor
      while (url) {
        const r: DeltaResponse = await requestJson<DeltaResponse>(fetchFn, url, token)
        for (const i of r.value) if (i.file && !i.deleted && isIfcName(i.name)) files.push(toFile(i, driveId))
        url = r['@odata.nextLink']
        if (r['@odata.deltaLink']) next = r['@odata.deltaLink']
      }
      return { files, cursor: next }
    },
    async download(file, token) {
      const { driveId, itemId } = splitFolder(file.id)
      return (await authed(fetchFn, `${GRAPH}/drives/${driveId}/items/${itemId}/content`, token)).arrayBuffer()
    },
    async upload(file, result, token) {
      const { driveId, itemId: parent } = splitFolder(file.parentId)
      const url = `${GRAPH}/drives/${driveId}/items/${parent}:/${encodeURIComponent(result.name)}:/content`
      const item = await requestJson<DriveItem>(fetchFn, url, token, { method: 'PUT', headers: { 'Content-Type': result.contentType }, body: result.body })
      return `${driveId}|${item.id}`
    },
  }
}
