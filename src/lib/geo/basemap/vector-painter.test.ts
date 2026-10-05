import { describe, expect, it } from 'vitest'
import { boxesOverlap, placeLabels, toPaintTile, type LabelCandidate } from './vector-painter'
import { getMapStyle, type LabelLayer } from './map-styles'

const layer = getMapStyle('standard').layers.find((l) => l.id === 'place') as LabelLayer

function cand(text: string, priority: number, x: number, y: number, w = 40, extra: Partial<LabelCandidate> = {}): LabelCandidate {
  return {
    text, priority, layer, props: {}, x, y, angle: 0, fontSize: 12,
    box: { x0: x - w / 2, y0: y - 8, x1: x + w / 2, y1: y + 8 }, ...extra,
  }
}

describe('placeLabels', () => {
  it('lets the higher priority label win a collision', () => {
    const kept = placeLabels([cand('Low', 1, 100, 100), cand('High', 9, 110, 104)], 512, 512, 2, 1)
    expect(kept.map((k) => k.text)).toEqual(['High'])
  })
  it('never keeps a label the tile edge would cut', () => {
    expect(placeLabels([cand('Edge', 5, 10, 100)], 512, 512, 2, 1)).toHaveLength(0)
  })
  it('respects the per-tile budget', () => {
    const many = Array.from({ length: 10 }, (_, i) => cand(`P${i}`, i, 40 + i * 45, 200, 40, { budget: 3 }))
    expect(placeLabels(many, 512, 512, 2, 1)).toHaveLength(3)
  })
  it('drops nearby repeats of the same street name', () => {
    const road = { ...layer, id: 'road-name', repeatDistance: 300 }
    const kept = placeLabels([
      cand('Gran Via', 5, 100, 100, 40, { layer: road }),
      cand('Gran Via', 4, 200, 300, 40, { layer: road }),
    ], 512, 512, 2, 1)
    expect(kept).toHaveLength(1)
  })
})

describe('boxesOverlap', () => {
  it('treats touching edges as clear', () => {
    expect(boxesOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false)
  })
})

describe('toPaintTile', () => {
  it('flattens geometry once and caches by identity', () => {
    const vt = {
      layers: {
        water: {
          length: 1, extent: 4096,
          feature: () => ({
            type: 3, properties: { class: 'lake' },
            loadGeometry: () => [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]],
          }),
        },
      },
    }
    const t = toPaintTile(vt)
    const f = t.layers.get('water')![0]
    expect([f.minX, f.minY, f.maxX, f.maxY]).toEqual([0, 0, 100, 50])
    expect(Array.from(f.parts[0])).toEqual([0, 0, 100, 0, 100, 50])
    expect(toPaintTile(vt)).toBe(t)
  })
})
