// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { sanitizeAnalyticsUrl } from './analytics-url'

describe('sanitizeAnalyticsUrl', () => {
  it("keeps which features a link used, never another site's file or a packed scene", () => {
    expect(sanitizeAnalyticsUrl('https://www.ifcvieweronline.eu/?model=https%3A%2F%2Fclient.example%2Fprivate%2Ftower.ifc&map=terrain&ui=client'))
      .toBe('https://www.ifcvieweronline.eu/?model&map=terrain&ui=client')
    expect(sanitizeAnalyticsUrl('https://www.ifcvieweronline.eu/#scene=N4IgZg9hIBYgcgawJYDsCcBDAtgUwDYAuAlgPYB2A'))
      .toBe('https://www.ifcvieweronline.eu/#scene')
    expect(sanitizeAnalyticsUrl('https://www.ifcvieweronline.eu/r#report=abc&lang=es')).toBe('https://www.ifcvieweronline.eu/r#report&lang')
  })

  it('leaves a plain page alone and refuses what is not a URL', () => {
    expect(sanitizeAnalyticsUrl('https://www.ifcvieweronline.eu/blog/ifc-validation')).toBe('https://www.ifcvieweronline.eu/blog/ifc-validation')
    expect(sanitizeAnalyticsUrl('not a url')).toBe('')
  })
})
