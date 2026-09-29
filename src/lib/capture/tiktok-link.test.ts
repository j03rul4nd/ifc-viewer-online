import { describe, expect, it } from 'vitest'
import { formatStart, parseTikTokUrl } from './tiktok-link'
import { metaFromTaps } from './music-analysis'

describe('parseTikTokUrl', () => {
  it('recognises music pages, videos and short links', () => {
    expect(parseTikTokUrl('https://www.tiktok.com/music/original-sound-7123456789012345678?lang=es')).toEqual({
      url: 'https://www.tiktok.com/music/original-sound-7123456789012345678', kind: 'music', title: 'original sound',
    })
    expect(parseTikTokUrl('https://www.tiktok.com/@user/video/7123456789012345678')?.kind).toBe('video')
    expect(parseTikTokUrl('https://vm.tiktok.com/ZMabc123/')?.kind).toBe('short')
  })

  it('reads sound pages with non-Latin titles', () => {
    const link = parseTikTokUrl('https://www.tiktok.com/music/原声-voyaseekcom-7519445668029582093')
    expect(link?.kind).toBe('music')
    expect(link?.title).toBe('原声 voyaseekcom')
    // Pasting the link back into a browser must still open the same sound.
    expect(decodeURI(link!.url)).toBe('https://www.tiktok.com/music/原声-voyaseekcom-7519445668029582093')
  })

  it('rejects anything else', () => {
    expect(parseTikTokUrl('https://evil.com/tiktok.com/music/x-1')).toBeNull()
    expect(parseTikTokUrl('https://nottiktok.com/music/x-1')).toBeNull()
    expect(parseTikTokUrl('javascript:alert(1)')).toBeNull()
    expect(parseTikTokUrl('hola')).toBeNull()
  })

  it('formats the start like the TikTok trimmer', () => {
    expect(formatStart(12.4)).toBe('0:12')
    expect(formatStart(75)).toBe('1:15')
  })
})

describe('metaFromTaps', () => {
  it('needs a few taps', () => {
    expect(metaFromTaps([0.5, 1], null)).toBeNull()
  })

  it('finds tempo and phase through a sloppy tap, and snaps the drop to the beat', () => {
    // 120 BPM, beats at 0.3 + k·0.5; one tap 40 ms late.
    const taps = [0.3, 0.8, 1.34, 1.8, 2.3, 2.8]
    const m = metaFromTaps(taps, 8.37)!
    expect(m.bpm).toBeCloseTo(120, 0)
    expect(m.gridOffsetSec).toBeCloseTo(0.3, 1)
    expect(m.dropSec).toBeCloseTo(8.3, 1)
  })
})
