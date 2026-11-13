import { describe, expect, it } from 'vitest'
import { deliveryFromApi, projectsFromApi, suppliersFromApi } from './live'
import type { ApiDelivery } from '../../../../lib/cloud/paid-client'

const set = { id: 's1', name: 'Hospital', slug: 'abcdefghij', min_score: 70, content: JSON.stringify({ project: 'hca', due_day: 3, due_hour: 9, profile: 'EIR', profile_version: 2 }) }
const del: ApiDelivery = { id: 'd1', file_name: 'A.ifc', file_hash: 'f'.repeat(64), size_bytes: 2_500_000, supplier: 'Estructuras Ebro', supplier_id: 'u1', requirement_set: 'Hospital', requirement_set_id: 's1', score: 81, required_score: 70, failed_specs: 0, verdict: 'rejected', reason: 'Wrong origin', received_at: '2026-11-12T10:00:00Z', sealed_at: '2026-11-12T11:00:00Z', decided_at: '2026-11-12T11:00:00Z', decided_by: 'user_x' }

describe('Reception on server data', () => {
  it('a requirement set is a project with its deadline and code', () => {
    const [p] = projectsFromApi([set])
    expect(p).toMatchObject({ id: 's1', name: 'Hospital', code: 'HCA', minScore: 70, dueDay: 3, dueHour: 9, profile: 'EIR', profileVersion: 2 })
    expect(p.naming.f[0].v).toEqual(['HCA'])
    expect(projectsFromApi([{ ...set, content: 'not json' }])[0].code).toBe('ABCDEF')
  })

  it('suppliers appear in the projects they delivered to', () => {
    const ps = projectsFromApi([set, { ...set, id: 's2', name: 'School' }])
    const sup = suppliersFromApi([{ id: 'u1', name: 'Estructuras Ebro', discipline: 'EST', deliveries: 1, decided: 1, firstTimeRate: 0, avgScore: 81, trend: [81], created_at: '2026-11-01T00:00:00Z' }], [del], ps)
    expect(sup).toHaveLength(1)
    expect(sup[0]).toMatchObject({ id: 'u1', projectId: 's1', state: 'active', invitedAt: '2026-11-01' })
  })

  it('a delivery keeps the real file hash and the decision', () => {
    const d = deliveryFromApi(del)
    expect(d).toMatchObject({ projectId: 's1', supplierId: 'u1', verdict: 'returned', fileHash: del.file_hash, decidedBy: 'user_x', sizeMb: 2.5 })
  })
})
