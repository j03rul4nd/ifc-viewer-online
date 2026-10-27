import { describe, it, expect } from 'vitest'
import { computeMemoryConstrained, isAppleMobile } from './device-profile'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

function g(ua: string, extra: Record<string, unknown> = {}, search = ''): unknown {
  return { navigator: { userAgent: ua, hardwareConcurrency: 8, ...extra }, location: { search } }
}

describe('device profile', () => {
  it('treats an iPhone as constrained', () => {
    expect(isAppleMobile(g(IPHONE))).toBe(true)
    expect(computeMemoryConstrained(g(IPHONE))).toBe(true)
  })

  it('sees through an iPad that claims to be a Mac', () => {
    expect(isAppleMobile(g(MAC, { maxTouchPoints: 5 }))).toBe(true)
    expect(isAppleMobile(g(MAC, { maxTouchPoints: 0 }))).toBe(false)
  })

  it('leaves a desktop alone unless it reports ≤ 4 GB', () => {
    expect(computeMemoryConstrained(g(WIN, { deviceMemory: 8 }))).toBe(false)
    expect(computeMemoryConstrained(g(WIN))).toBe(false)
    expect(computeMemoryConstrained(g(WIN, { deviceMemory: 4 }))).toBe(true)
  })

  it('honours ?lite= both ways', () => {
    expect(computeMemoryConstrained(g(WIN, { deviceMemory: 16 }, '?lite=1'))).toBe(true)
    expect(computeMemoryConstrained(g(IPHONE, {}, '?lite=0'))).toBe(false)
  })

  it('never throws on an empty global', () => {
    expect(computeMemoryConstrained({})).toBe(false)
    expect(computeMemoryConstrained(null)).toBe(false)
  })
})
