// ─── clash decisions: where they are kept ─────────────────────────────────────
// One adapter interface, two implementations:
//   local — this browser (localStorage). Pro, and Team until the cloud is on.
//   cloud — the Team workspace on our API (`/clash/records`), so everyone in
//           the team sees the same statuses and assignments. DARK: only used
//           when VITE_FEATURE_CLASH_CLOUD is set and a session token exists;
//           the backend route lives in ifc-cloud-api and is not deployed.
// Merging is last-write-wins per clash key on `updatedAt`.

import type { ClashRecord } from './model'

export interface ClashSync {
  readonly kind: 'local' | 'cloud'
  load(project: string): Promise<Record<string, ClashRecord>>
  /** Saves only the changed keys. */
  save(project: string, changed: Record<string, ClashRecord>): Promise<void>
}

const LOCAL_KEY = 'ifc-clash-records-v1'

export const localSync: ClashSync = {
  kind: 'local',
  async load() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, ClashRecord> } catch { return {} }
  },
  async save(_project, changed) {
    try {
      const all = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}') as Record<string, ClashRecord>
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...all, ...changed }))
    } catch { /* storage blocked: session only */ }
  },
}

export interface CloudSyncOptions {
  baseUrl: string
  getToken: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

/** Cloud adapter for Team. Throws on HTTP errors so the caller can fall back. */
export function cloudSync(o: CloudSyncOptions): ClashSync {
  const f = o.fetchImpl ?? fetch
  const headers = async (): Promise<Record<string, string>> => {
    const token = await o.getToken()
    if (!token) throw new Error('not signed in')
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }
  return {
    kind: 'cloud',
    async load(project) {
      const r = await f(`${o.baseUrl}/clash/records?project=${encodeURIComponent(project)}`, { headers: await headers() })
      if (!r.ok) throw new Error(`clash load ${r.status}`)
      const body = await r.json() as { records?: Record<string, ClashRecord> }
      return body.records ?? {}
    },
    async save(project, changed) {
      const keys = Object.keys(changed)
      for (let i = 0; i < keys.length; i += 500) {
        const chunk = Object.fromEntries(keys.slice(i, i + 500).map((k) => [k, changed[k]]))
        const r = await f(`${o.baseUrl}/clash/records`, { method: 'PUT', headers: await headers(), body: JSON.stringify({ project, records: chunk }) })
        if (!r.ok) throw new Error(`clash save ${r.status}`)
      }
    },
  }
}

/** Last-write-wins merge by `updatedAt` (records without it lose to ones with it). */
export function mergeRecords(a: Record<string, ClashRecord>, b: Record<string, ClashRecord>): Record<string, ClashRecord> {
  const out = { ...a }
  for (const [k, rb] of Object.entries(b)) {
    const ra = out[k]
    if (!ra || (rb.updatedAt ?? '') >= (ra.updatedAt ?? '')) out[k] = rb
  }
  return out
}

/** Keys whose record differs between two maps (what to send). */
export function changedKeys(prev: Record<string, ClashRecord>, next: Record<string, ClashRecord>): Record<string, ClashRecord> {
  const out: Record<string, ClashRecord> = {}
  for (const [k, v] of Object.entries(next)) if (JSON.stringify(prev[k]) !== JSON.stringify(v)) out[k] = v
  return out
}

/** Project key: the loaded file names, sorted, without extension. */
export function projectKey(fileNames: string[]): string {
  return [...fileNames].map((f) => f.replace(/\.ifc$/i, '')).sort().join('+').slice(0, 300)
}

export function isClashCloudEnabled(): boolean {
  const v = import.meta.env.VITE_FEATURE_CLASH_CLOUD as string | undefined
  return v === 'true' || v === '1'
}
