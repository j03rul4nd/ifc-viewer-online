import { describe, it, expect } from 'vitest'
import { toStored, nextFrame, rebuildAt, frameBytes, KEYFRAME_EVERY_MS, type Frame } from './history-codec'
import { parseGeoJson } from './geojson'
import { resolveIdentity } from './live-feed'

const station = (id: string, bikes: number, lon = 2.17) =>
  ({ type: 'Feature', id, properties: { bikes }, geometry: { type: 'Point', coordinates: [lon, 41.39] } })
const layer = (fs: unknown[]) => {
  const r = parseGeoJson({ type: 'FeatureCollection', features: fs })
  if (!r.ok) throw r.error
  return r.value
}
const stored = (fs: unknown[]) => { const l = layer(fs); return toStored(l, resolveIdentity(l)) }

// 500 stations; each refresh changes 10 of them.
const N = 500
const base = Array.from({ length: N }, (_, i) => station(`S${i}`, 10))
const at = (k: number) => base.map((f, i) => (i < 10 * k && i >= 10 * (k - 1) ? station(`S${i}`, 10 + k) : f))

describe('history codec', () => {
  it('stores a keyframe first, then only what changed', () => {
    const t0 = 1_000_000
    const s0 = stored(base)
    const k = nextFrame(null, s0, t0, null)!
    expect(k.kind).toBe('key')
    const s1 = stored(at(1))
    const d = nextFrame(s0, s1, t0 + 30_000, t0)!
    expect(d.kind).toBe('delta')
    if (d.kind === 'delta') expect(Object.keys(d.upsert).length).toBe(10)
    // A delta is a small fraction of the layer.
    expect(frameBytes(d)).toBeLessThan(frameBytes(k) / 20)
    // Nothing changed: nothing stored.
    expect(nextFrame(s1, stored(at(1)), t0 + 60_000, t0)).toBeNull()
  })

  it('forces a keyframe after the interval', () => {
    const s0 = stored(base)
    expect(nextFrame(s0, stored(at(1)), KEYFRAME_EVERY_MS + 1, 0)!.kind).toBe('key')
  })

  it('rebuilds any instant, including removals and additions', () => {
    const frames: Frame[] = []
    let prev: ReturnType<typeof stored> | null = null
    let lastKey: number | null = null
    const push = (fs: unknown[], t: number) => {
      const s = stored(fs)
      const f = nextFrame(prev, s, t, lastKey)
      if (f) { frames.push(f); if (f.kind === 'key') lastKey = t }
      prev = s
    }
    push(base, 0)
    push(at(1), 30_000)
    push([...at(2).slice(1), station('NEW', 3)], 60_000) // S0 removed, NEW added
    const r0 = rebuildAt(frames, 15_000)!
    expect(r0.at).toBe(0)
    expect(r0.features.find((f) => f.id === 'S0')!.properties.bikes).toBe(10)
    const r1 = rebuildAt(frames, 30_000)!
    expect(r1.features.find((f) => f.id === 'S0')!.properties.bikes).toBe(11)
    const r2 = rebuildAt(frames, 99_000)!
    expect(r2.features.some((f) => f.id === 'S0')).toBe(false)
    expect(r2.features.find((f) => f.id === 'NEW')!.properties.bikes).toBe(3)
    expect(r2.features.length).toBe(N)
    expect(rebuildAt(frames, -1)).toBeNull()
    // The rebuilt state parses back into a layer.
    expect(parseGeoJson({ type: 'FeatureCollection', features: r2.features }).ok).toBe(true)
  })
})
