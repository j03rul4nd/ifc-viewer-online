// ─── Samples in the API's own shapes ──────────────────────────────────────────
// The paid screens render API responses (lib/cloud/paid-client). When there is
// no live connection they render these, so there is one rendering path and the
// switch to real data changes nothing on screen but the numbers.

import type { ApiAuditEvent, ApiCredits, ApiDelivery, ApiEndpoint, ApiIssue, ApiMe, ApiMember, ApiStandard, ApiSupplier, ApiVersion } from '../../lib/cloud/paid-client'
import { SAMPLE_AUDIT, SAMPLE_DELIVERIES, SAMPLE_ISSUES, SAMPLE_SUPPLIERS } from './plan-sample-data'

const at = (d: string) => new Date(d.replace(' ', 'T') + ':00Z').toISOString()

export const SAMPLE_ME: ApiMe = { user_id: 'user_laura', org_id: 'org_sample', role: 'owner', can: [] }

export const SAMPLE_MEMBERS = {
  members: [
    { user_id: 'Laura Méndez', role: 'owner', since: '2026-06-01T09:00:00Z' },
    { user_id: 'Marc Puig', role: 'editor', since: '2026-06-03T09:00:00Z' },
    { user_id: 'Anna Soler', role: 'reviewer', since: '2026-07-11T09:00:00Z' },
    { user_id: 'Pere Vila (client)', role: 'viewer', since: '2026-09-20T09:00:00Z' },
  ] as ApiMember[],
  seats: { paid: 3, used: 2 },
}

export const SAMPLE_API_ISSUES: { issues: ApiIssue[] } = {
  issues: SAMPLE_ISSUES.map((i, n) => ({
    number: Number(i.id.replace(/\D/g, '')) || n + 1, title: i.title, status: i.status, priority: i.priority,
    assignee_id: i.assignee, element_guids: [], due_at: i.due ? `${i.due}T00:00:00Z` : null, rule_id: i.fromRule ?? null,
    delivery_id: null, created_at: '2026-10-20T09:00:00Z', updated_at: '2026-10-28T09:00:00Z',
  })),
}

export const SAMPLE_VERSIONS: { versions: ApiVersion[] } = {
  versions: [
    { id: 's3', container: 'HCA-NOR-ZZ-XX-M3-A-0001', revision: 3, file_name: 'HCA_ARQ_v6.ifc', state: 'shared', suitability: 'S3', score: 88, failed_specs: 0, uploaded_by: 'Marc Puig', created_at: '2026-10-27T16:15:00Z', validated_at: '2026-10-27T16:17:00Z' },
    { id: 's2', container: 'HCA-NOR-ZZ-XX-M3-A-0001', revision: 2, file_name: 'HCA_ARQ_v5.ifc', state: 'published', suitability: 'A1', score: 84, failed_specs: 0, uploaded_by: 'Marc Puig', created_at: '2026-10-14T09:12:00Z', validated_at: '2026-10-14T09:14:00Z' },
    { id: 's4', container: 'HCA-NOR-ZZ-XX-M3-M-0001', revision: 1, file_name: 'HCA_MEP_v1.ifc', state: 'shared', suitability: 'S2', score: 71, failed_specs: 2, uploaded_by: 'Marc Puig', created_at: '2026-10-25T09:20:00Z', validated_at: '2026-10-25T09:22:00Z' },
  ],
}

export const SAMPLE_STANDARD: { standard: ApiStandard } = { standard: { min_score: 80, require_review: true, auto_issues: true, requirement_set_id: null } }

export const SAMPLE_API_AUDIT: { events: ApiAuditEvent[] } = {
  events: SAMPLE_AUDIT.map((a) => ({ type: 'note', actor_id: a.who, from: null, to: null, details: { text: a.what }, at: at(a.at) })),
}

export const SAMPLE_API_DELIVERIES: { deliveries: ApiDelivery[] } = {
  deliveries: SAMPLE_DELIVERIES.map((d) => ({
    id: d.id, file_name: d.file, supplier: d.supplier, requirement_set: 'EIR Hospital Comarcal 2026', score: d.score,
    required_score: d.requiredScore, failed_specs: d.failedSpecs, verdict: d.verdict, reason: d.reason ?? null,
    received_at: at(d.receivedAt), sealed_at: d.sealedAt ? at(d.sealedAt) : null,
  })),
}

export const SAMPLE_API_SUPPLIERS: { suppliers: ApiSupplier[] } = {
  suppliers: SAMPLE_SUPPLIERS.map((s) => ({ id: s.id, name: s.name, discipline: s.discipline, deliveries: s.deliveries, decided: s.deliveries, firstTimeRate: s.firstTimeRate, avgScore: s.avgScore, trend: s.trend })),
}

export const SAMPLE_CREDITS: ApiCredits = { plan: 'team', balances: { cloud: 64, ai: 130, api: 1360 }, monthly: { cloud: 100, ai: 200, api: 2000 } }

export const SAMPLE_ENDPOINTS: { endpoints: ApiEndpoint[] } = {
  endpoints: [{ id: 'e1', url: 'https://n8n.estudionorte.example/webhook/ifc', events: ['delivery.rejected', 'score.dropped'], created_at: '2026-10-02T10:00:00Z' }],
}
