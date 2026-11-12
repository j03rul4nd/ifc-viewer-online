// Google Drive API v3.
//   watch:    GET /changes/startPageToken, then GET /changes?pageToken=… (filtered to the folder)
//   download: GET /files/{id}?alt=media
//   result:   POST upload/drive/v3/files?uploadType=multipart with parents=[folder]
// drive.file alone only reaches files opened or created with the app (picker);
// watching a whole shared folder also needs drive.readonly (a restricted scope:
// Google asks for a verification before going public; fine for a test project).
import { authed, requestJson } from './http'
import { isIfcName, type Connector, type Fetch, type RemoteFile } from './types'

export const DRIVE = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

interface DriveFile { id: string; name: string; size?: string; md5Checksum?: string; version?: string; modifiedTime?: string; parents?: string[]; trashed?: boolean }
interface Change { fileId: string; removed?: boolean; file?: DriveFile }
interface ChangeList { changes: Change[]; nextPageToken?: string; newStartPageToken?: string }

const FIELDS = 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,size,md5Checksum,version,modifiedTime,parents,trashed))'

export function googleDriveConnector(fetchFn: Fetch): Connector {
  return {
    id: 'gdrive',
    name: 'Google Drive',
    oauth: {
      authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
      extraAuthParams: { access_type: 'offline', prompt: 'consent' },
    },
    async startCursor(_folderId, token) {
      const r = await requestJson<{ startPageToken: string }>(fetchFn, `${DRIVE}/changes/startPageToken?supportsAllDrives=true`, token)
      return r.startPageToken
    },
    async changes(folderId, cursor, token) {
      const files: RemoteFile[] = []
      let page: string | undefined = cursor
      let next = cursor
      while (page) {
        const q = new URLSearchParams({ pageToken: page, fields: FIELDS, includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', pageSize: '100' })
        const r: ChangeList = await requestJson<ChangeList>(fetchFn, `${DRIVE}/changes?${q}`, token)
        for (const c of r.changes) {
          const f = c.file
          if (c.removed || !f || f.trashed || !f.parents?.includes(folderId) || !isIfcName(f.name)) continue
          files.push({ id: f.id, name: f.name, size: Number(f.size ?? 0), version: f.md5Checksum ?? f.version ?? '', modifiedAt: f.modifiedTime ?? '', parentId: folderId })
        }
        page = r.nextPageToken
        if (r.newStartPageToken) next = r.newStartPageToken
      }
      return { files, cursor: next }
    },
    async download(file, token) {
      return (await authed(fetchFn, `${DRIVE}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`, token)).arrayBuffer()
    },
    async upload(file, result, token) {
      const boundary = 'ifcvo' + Math.random().toString(36).slice(2)
      const meta = JSON.stringify({ name: result.name, parents: [file.parentId] })
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${result.contentType}\r\n\r\n${result.body}\r\n--${boundary}--`
      const r = await requestJson<{ id: string }>(fetchFn, `${DRIVE_UPLOAD}/files?uploadType=multipart&supportsAllDrives=true`, token, {
        method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      })
      return r.id
    },
  }
}
