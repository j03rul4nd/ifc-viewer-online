import { describe, expect, it } from 'vitest'
import { projectFromHash, tokenFromHash } from './SupplierUploadPage'
import { supplierProjectFromApi, originatorOf } from './live'
import { namingOf } from './sample'
import { supplierUploadUrl } from '../../../../lib/cloud/paid-client'
import { studioDoc } from '../rules/model-elements'
import { DEFAULT_RULE } from '../rules/rules-lib'
import { ruleFromApi } from '../Automations'

describe('supplier upload page', () => {
  it('reads the token and project from the hash, never from the query', () => {
    const url = supplierUploadUrl('https://x.test', 'sup_abc123', 'tno4rj')
    expect(url).toBe('https://x.test/deliver#t=sup_abc123&p=tno4rj')
    const hash = url.slice(url.indexOf('#'))
    expect(tokenFromHash(hash)).toBe('sup_abc123')
    expect(projectFromHash(hash)).toBe('tno4rj')
    expect(tokenFromHash('#t=evil')).toBe('')
    expect(projectFromHash('#t=sup_a&p=../../x')).toBe('')
  })

  it('checks names against this supplier\'s originator only', () => {
    const p = supplierProjectFromApi({ name: 'Torre', slug: 'tno', min_score: 60, project: 'TNO', due_day: 1, due_hour: 12 }, 'Estructuras Norte')
    expect(originatorOf('Estructuras Norte')).toBe('ESTRUC')
    expect(p).toMatchObject({ code: 'TNO', minScore: 60, dueDay: 1, dueHour: 12 })
    expect(namingOf(p, { fileName: 'TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc' }).ok).toBe(true)
    expect(namingOf(p, { fileName: 'TNO-ARQ-ZZ-02-M3-S-0001-S2-P01.ifc' }).ok).toBe(false)
  })
})

describe('rules studio on a real model', () => {
  it('gathers every class (catch-all spec) plus the rules\' own specs', () => {
    const doc = studioDoc([DEFAULT_RULE])
    expect(doc.specifications[0].applicability[0]).toMatchObject({ kind: 'entity', name: { restriction: { pattern: 'IFC.*' } } })
    expect(doc.specifications).toHaveLength(2)
  })
})

describe('automations', () => {
  it('reads an e-mail action back with its recipient', () => {
    const r = ruleFromApi({ id: 'a', name: 'Mail', enabled: true, trigger: 'delivery.validated', conditions: { score_below: 80 }, actions: [{ type: 'queue_mail', to: 'c@example.com', subject: 's', body: 'b' }], minutes_saved: 5 })
    expect(r).toMatchObject({ act: 'mail', to: 'c@example.com', trigger: 'delivery', cond: 'score_below', value: 80 })
  })
})
