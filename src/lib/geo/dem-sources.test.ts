import { afterEach, describe, expect, it } from 'vitest'
import { demSourceFor, markDemSourceFailed, resetDemSourceFailures } from './dem-sources'

const BCN = { lat: 41.3884, lon: 2.1695 }

describe('demSourceFor', () => {
  afterEach(() => resetDemSourceFailures())

  it('prefers the regional source that covers the site', () => {
    expect(demSourceFor(BCN.lat, BCN.lon).id).toBe('icgc-met5')
  })

  it('falls back to the global mosaic once the regional source has failed', () => {
    markDemSourceFailed('icgc-met5')
    expect(demSourceFor(BCN.lat, BCN.lon).id).toBe('terrarium')
    // Other regions are unaffected.
    expect(demSourceFor(35.69, 139.69).id).toBe('gsi-dem10b')
  })

  it('never retires the global mosaic itself', () => {
    markDemSourceFailed('terrarium')
    expect(demSourceFor(0, 0).id).toBe('terrarium')
  })
})
