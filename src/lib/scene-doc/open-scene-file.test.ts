import { describe, it, expect } from 'vitest'
import { sceneUrlFromText } from './open-scene-file'
import { SCENE_FORMAT } from './scene-doc'

const MINIMAL = { format: SCENE_FORMAT, v: 1, meta: { title: 'Plaza' }, models: [{ url: '/models/a.ifc' }], layers: [], view: {} }

describe('sceneUrlFromText', () => {
  it('reports why a file is not a scene', async () => {
    const r = await sceneUrlFromText('nope')
    expect(r.ok).toBe(false)
    if (r.ok || r.reason !== 'invalid') throw new Error('expected invalid')
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('packs a valid scene into a #scene= link', async () => {
    const r = await sceneUrlFromText(JSON.stringify(MINIMAL))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.url).toMatch(/#scene=[A-Za-z0-9_-]+$/)
  })

  it('refuses a scene too big for a link', async () => {
    const text = Array.from({ length: 30000 }, (_, i) => `${i}:${Math.sin(i)}`).join(',')
    const layer = { name: 'Big', visible: true, source: { type: 'url', url: 'https://example.com/a.geojson', format: 'geojson' }, text }
    const r = await sceneUrlFromText(JSON.stringify({ ...MINIMAL, layers: [layer] }))
    expect(r).toEqual({ ok: false, reason: 'tooBig' })
  })
})
