// ─── Sample data for the "coming soon" sections ───────────────────────────────
// Fixtures shaped like lib/plans/types.ts so the screens can switch to real
// queries without changing. Nothing here is fetched or stored.

import type { ReceptionDelivery, SupplierRecord, TeamIssue, WebhookEvent } from '../../lib/plans/types'

export const SAMPLE_ISSUES: TeamIssue[] = [
  { id: 'ISS-214', title: 'Fire doors without FireRating in level 2', status: 'open', priority: 'high', assignee: 'Marc Puig', project: 'Hospital Comarcal — Ampliación', due: '2026-11-04', fromRule: 'IDS · Fire safety', hasViewpoint: true },
  { id: 'ISS-213', title: 'Duct crosses beam B-12', status: 'in_progress', priority: 'critical', assignee: 'Laura Méndez', project: 'Hospital Comarcal — Ampliación', due: '2026-11-01', hasViewpoint: true },
  { id: 'ISS-209', title: 'Spaces missing area and number', status: 'open', priority: 'normal', assignee: 'Anna Soler', project: 'CEIP Les Moreres', fromRule: 'RULE_SPACE_DATA', hasViewpoint: false },
  { id: 'ISS-201', title: 'Proxy elements in structure', status: 'resolved', priority: 'normal', assignee: 'Marc Puig', project: 'Nave logística Zona Franca', fromRule: 'RULE_PROXY_OVERUSE', hasViewpoint: true },
]

export const SAMPLE_DELIVERIES: ReceptionDelivery[] = [
  { id: 'D-0931', supplier: 'Instal·lacions Vallès', file: 'HCA_MEP_v5.ifc', receivedAt: '2026-10-28 18:02', score: 84, requiredScore: 80, failedSpecs: 0, verdict: 'accepted', sealedAt: '2026-10-28 18:03' },
  { id: 'D-0930', supplier: 'Estructuras Ebro', file: 'HCA_EST_v4.ifc', receivedAt: '2026-10-28 11:40', score: 71, requiredScore: 80, failedSpecs: 3, verdict: 'rejected', reason: '3 IDS specs fail: LoadBearing, FireRating, Classification' },
  { id: 'D-0929', supplier: 'Arquitectura Norte', file: 'HCA_ARQ_v6.ifc', receivedAt: '2026-10-27 16:15', score: 88, requiredScore: 80, failedSpecs: 0, verdict: 'pending' },
  { id: 'D-0927', supplier: 'Fachadas Lumen', file: 'HCA_FAC_v2.ifc', receivedAt: '2026-10-25 09:20', score: 79, requiredScore: 80, failedSpecs: 1, verdict: 'rejected', reason: 'Score 79 below 80' },
]

export const SAMPLE_SUPPLIERS: SupplierRecord[] = [
  { id: 's1', name: 'Arquitectura Norte', discipline: 'ARQ', deliveries: 14, firstTimeRate: 0.86, avgScore: 87, trend: [78, 82, 85, 84, 88, 88] },
  { id: 's2', name: 'Instal·lacions Vallès', discipline: 'MEP', deliveries: 11, firstTimeRate: 0.73, avgScore: 81, trend: [70, 74, 79, 80, 82, 84] },
  { id: 's3', name: 'Estructuras Ebro', discipline: 'EST', deliveries: 9, firstTimeRate: 0.44, avgScore: 72, trend: [80, 77, 74, 70, 72, 71] },
  { id: 's4', name: 'Fachadas Lumen', discipline: 'FAC', deliveries: 4, firstTimeRate: 0.5, avgScore: 78, trend: [74, 81, 76, 79] },
]

export const WEBHOOK_EVENTS: { event: WebhookEvent; when: string }[] = [
  { event: 'delivery.received', when: 'A supplier submits a model' },
  { event: 'delivery.accepted', when: 'A delivery passes or a reviewer accepts it' },
  { event: 'delivery.rejected', when: 'A delivery is rejected, with the reason' },
  { event: 'validation.completed', when: 'A validation finishes on our servers' },
  { event: 'score.dropped', when: 'A project\'s score falls below its threshold' },
  { event: 'issue.created', when: 'A BCF issue is opened' },
  { event: 'issue.closed', when: 'A BCF issue is closed' },
  { event: 'link.opened', when: 'A client or tracked link is opened' },
]

export const SAMPLE_AUDIT: { at: string; who: string; what: string }[] = [
  { at: '2026-10-28 18:03', who: 'System', what: 'Sealed HCA_MEP_v5.ifc (qualified timestamp)' },
  { at: '2026-10-28 17:51', who: 'Laura Méndez', what: 'Approved HCA_ARQ_v6.ifc → Published (A1)' },
  { at: '2026-10-28 11:41', who: 'System', what: 'Blocked HCA_EST_v4.ifc: score 71 below 80' },
  { at: '2026-10-27 09:12', who: 'Marc Puig', what: 'Changed the house profile: added IDS CatSalut 2026' },
]
