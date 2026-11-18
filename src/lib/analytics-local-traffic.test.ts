import { describe, expect, it } from 'vitest'
import { isLocalTraffic } from './analytics'

describe('isLocalTraffic', () => {
  it('flags pages served from a local host', () => {
    for (const h of ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'mac.local']) {
      expect(isLocalTraffic(h, '')).toBe(true)
    }
  })

  it('flags production pages opened from a local dev server', () => {
    expect(isLocalTraffic('www.ifcvieweronline.eu', 'http://localhost:3130/blog/')).toBe(true)
    expect(isLocalTraffic('www.ifcvieweronline.eu', 'http://127.0.0.1:5173/')).toBe(true)
  })

  it('keeps real visitors', () => {
    expect(isLocalTraffic('www.ifcvieweronline.eu', '')).toBe(false)
    expect(isLocalTraffic('www.ifcvieweronline.eu', 'https://www.google.com/')).toBe(false)
    expect(isLocalTraffic('www.ifcvieweronline.eu', 'https://localhost.example.com/')).toBe(false)
    expect(isLocalTraffic('www.ifcvieweronline.eu', 'not a url')).toBe(false)
  })
})
