// Reception on server data (local / cloud mode): the API's requirement sets,
// suppliers and deliveries in the shapes the screen already uses, so every tab
// (overview, inbox, suppliers, register, project) reads the same real data.
// Pure: tested without a backend.

import type { ApiDelivery, ApiRequirementSet, ApiSupplier } from '../../../../lib/cloud/paid-client'
import { SAMPLE_PROJECTS, type RxDelivery, type RxProject, type RxSupplier } from './sample'

interface SetContent { project?: string; profile?: string; profile_version?: number; due_day?: number; due_hour?: number; client?: string; place?: string }

function contentOf(set: ApiRequirementSet & { content?: string }): SetContent {
  try { return set.content ? JSON.parse(set.content) as SetContent : {} } catch { return {} }
}

/** A requirement set is a project: its name, minimum, profile and weekly deadline. */
export function projectsFromApi(sets: (ApiRequirementSet & { content?: string })[]): RxProject[] {
  const naming = SAMPLE_PROJECTS[1].naming
  return sets.map((s) => {
    const c = contentOf(s)
    const code = (c.project ?? s.slug.slice(0, 6)).toUpperCase()
    return {
      id: s.id, name: s.name, place: c.place ?? '', code, client: c.client ?? '',
      profile: c.profile ?? '—', profileVersion: c.profile_version ?? 1, minScore: s.min_score,
      dueDay: c.due_day ?? 1, dueHour: c.due_hour ?? 12,
      naming: { ...naming, f: naming.f.map((f, i) => (i === 0 ? { ...f, v: [code] } : f)) },
    }
  })
}

/** Suppliers belong to the workspace; each is shown in the projects it delivered to (or the first one). */
export function suppliersFromApi(suppliers: (ApiSupplier & { created_at?: string })[], deliveries: ApiDelivery[], projects: RxProject[]): RxSupplier[] {
  const out: RxSupplier[] = []
  for (const s of suppliers) {
    const projectIds = [...new Set(deliveries.filter((d) => d.supplier_id === s.id || d.supplier === s.name).map((d) => d.requirement_set_id).filter((x): x is string => Boolean(x)))]
    const ids = projectIds.length ? projectIds : projects[0] ? [projects[0].id] : []
    for (const projectId of ids) {
      out.push({
        id: s.id, projectId, name: s.name, originator: s.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'XXX',
        discipline: s.discipline ?? 'Architecture', contact: s.name, email: '', invitedAt: (s.created_at ?? new Date().toISOString()).slice(0, 10),
        state: s.deliveries > 0 ? 'active' : 'invited',
      } as RxSupplier)
    }
  }
  return out
}

export function deliveryFromApi(d: ApiDelivery): RxDelivery {
  return {
    id: d.id, projectId: d.requirement_set_id ?? '', supplierId: d.supplier_id ?? d.supplier, fileName: d.file_name, receivedAt: d.received_at, score: d.score,
    sizeMb: d.size_bytes ? Math.round(d.size_bytes / 1e5) / 10 : 0, profileVersion: 1, failures: [],
    verdict: d.verdict === 'rejected' ? 'returned' : d.verdict, reasons: d.reason ? [d.reason] : [],
    decidedBy: d.decided_by ?? undefined, decidedAt: d.decided_at ?? undefined, fileHash: d.file_hash,
  }
}
