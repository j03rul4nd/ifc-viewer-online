import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSiteColors, activeSiteColorMode, clearSiteColors, onSiteColorModeChange, paintSiteColors, toBatches,
  type SiteColorViewer,
} from './site-colors'

function fakeViewer() {
  const model = { setColor: vi.fn(async () => {}) }
  const restore = vi.fn(async () => {})
  const viewer = {
    getFragmentsModel: (id: string) => (id === 'm' ? model : null),
    restoreDefaultColors: restore,
  } as unknown as SiteColorViewer
  return { viewer, model, restore }
}

describe('site colours', () => {
  beforeEach(() => __resetSiteColors())

  it('groups batches by model and colour', () => {
    const b = toBatches([{ modelId: 'm', color: '#f00', ids: [1] }, { modelId: 'm', color: '#f00', ids: [2] }, { modelId: 'n', color: '#0f0', ids: [3] }])
    expect(b.get('m')!.get('#f00')).toEqual([1, 2])
    expect(b.get('n')!.get('#0f0')).toEqual([3])
  })

  it('paints, then restores the default palette for exactly what it painted', async () => {
    const { viewer, model, restore } = fakeViewer()
    await paintSiteColors(viewer, 'units', toBatches([{ modelId: 'm', color: '#f00', ids: [1, 2] }]))
    expect(model.setColor).toHaveBeenCalledTimes(1)
    await clearSiteColors('units')
    expect(restore).toHaveBeenCalledWith('m', [1, 2])
    expect(activeSiteColorMode()).toBeNull()
  })

  it('keeps one mode at a time and tells the other panel', async () => {
    const { viewer, restore } = fakeViewer()
    const seen: Array<string | null> = []
    onSiteColorModeChange((m) => seen.push(m))
    await paintSiteColors(viewer, 'units', toBatches([{ modelId: 'm', color: '#f00', ids: [1] }]))
    await paintSiteColors(viewer, 'progress', toBatches([{ modelId: 'm', color: '#0f0', ids: [5] }]))
    expect(seen).toEqual(['units', 'progress'])
    expect(restore).toHaveBeenCalledWith('m', [1])
    // Clearing a mode that is not active does nothing.
    await clearSiteColors('units')
    expect(activeSiteColorMode()).toBe('progress')
    expect(restore).toHaveBeenCalledTimes(1)
  })
})
