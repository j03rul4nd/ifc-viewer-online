import { describe, expect, it } from 'vitest'
import { estimateBytes, exportBitrate, exportSize } from './export-settings'

describe('export settings', () => {
  it('names the short side, like phones do', () => {
    expect(exportSize({ width: 1080, height: 1920 }, 720)).toEqual({ width: 720, height: 1280 })
    expect(exportSize({ width: 1080, height: 1920 }, 1440)).toEqual({ width: 1440, height: 2560 })
    expect(exportSize({ width: 1920, height: 1080 }, 720)).toEqual({ width: 1280, height: 720 })
    // Always even (H.264).
    expect(exportSize({ width: 1080, height: 1350 }, 720).height % 2).toBe(0)
  })

  it('scales bitrate with quality and estimates size from it', () => {
    const size = { width: 1080, height: 1920 }
    const small = exportBitrate(size, { resolution: 1080, fps: 30, quality: 'small' })
    const rec = exportBitrate(size, { resolution: 1080, fps: 30, quality: 'recommended' })
    const high = exportBitrate(size, { resolution: 1080, fps: 30, quality: 'high' })
    expect(small).toBeLessThan(rec)
    expect(high).toBeGreaterThan(rec)
    const mb = estimateBytes(size, { resolution: 1080, fps: 30, quality: 'recommended' }, 15, true) / 1e6
    expect(mb).toBeGreaterThan(5)
    expect(mb).toBeLessThan(40)
  })
})
