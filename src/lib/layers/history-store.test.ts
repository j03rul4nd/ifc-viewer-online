import { describe, it, expect } from 'vitest'
import { memoryBackend, createRecorder, prune } from './history-store'
import { rebuildAt, KEYFRAME_EVERY_MS } from './history-codec'
import { parseGeoJson } from './geojson'
import { resolveIdentity } from './live-feed'

const snap = (k: number) => {
  const r = parseGeoJson({
    type: 'FeatureCollection',
    features: Array.from({ length: 50 }, (_, i) => ({
      type: 'Feature', id: `S${i}`, properties: { bikes: i === k % 50 ? 99 : 5 }, geometry: { type: 'Point', coordinates: [2.1 + i / 1000, 41.4] },
    })),
  })
  if (!r.ok) throw r.error
  return r.value
}

describe('history recorder', () => {
  it('records a day at 30 s, keeps the retention window, and can rebuild its oldest edge', async () => {
    const be = memoryBackend()
    const rec = createRecorder(be)
    const id = resolveIdentity(snap(0))
    const step = 30_000
    const retention = 6 * 3600_000
    const total = 24 * 3600_000
    for (let t = 0; t <= total; t += step) await rec.record('bicing', snap(t / step), id, t, retention)
    await prune(be, 'bicing', total - retention)
    const frames = await be.load('bicing')
    const s = await be.stats('bicing')
    // ~6 h kept (plus at most one keyframe interval of margin)…
    expect(total - s.from!).toBeLessThanOrEqual(retention + KEYFRAME_EVERY_MS)
    expect(total - s.from!).toBeGreaterThanOrEqual(retention)
    // …and the oldest instant still rebuilds (starts on a keyframe).
    expect(frames[0].kind).toBe('key')
    const old = rebuildAt(frames, s.from! + 1)!
    expect(old.features.length).toBe(50)
    // Exactly one station differs between consecutive refreshes: deltas are tiny.
    const deltas = frames.filter((f) => f.kind === 'delta')
    expect(deltas.length).toBeGreaterThan(500)
    expect(Object.keys((deltas[5] as { upsert: object }).upsert).length).toBeLessThanOrEqual(2)
  })

  it('a reload (fresh recorder) starts with a keyframe', async () => {
    const be = memoryBackend()
    const id = resolveIdentity(snap(0))
    await createRecorder(be).record('s', snap(0), id, 0, 1e9)
    await createRecorder(be).record('s', snap(1), id, 30_000, 1e9)
    expect((await be.load('s')).map((f) => f.kind)).toEqual(['key', 'key'])
  })
})
