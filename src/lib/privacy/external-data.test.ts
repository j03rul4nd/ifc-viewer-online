import { describe, it, expect, afterEach, vi } from 'vitest'
import { confirmExternalData, hostsIn, layersSetupHosts, useExternalDataPrompt } from './external-data'

afterEach(() => {
  useExternalDataPrompt.setState({ queue: [] })
  vi.restoreAllMocks()
})

describe('hostsIn', () => {
  it('finds every http(s) / ws(s) host in a layers file, sorted and once each, but not this origin', () => {
    const doc = {
      format: 'ifc-viewer-data-layers',
      layers: [
        { source: { kind: 'url', url: 'https://opendata-ajuntament.barcelona.cat/data/traffic.json' } },
        { source: { kind: 'wfs', url: 'https://ovc.catastro.meh.es/INSPIRE/wfsBU.aspx?bbox=1,2,3,4' } },
        { source: { kind: 'url', url: 'https://opendata-ajuntament.barcelona.cat/other.json' } },
        { note: 'see https://app.local/doc', local: '/models/x.geojson' },
      ],
      twin: [{ url: 'wss://broker.example.org:8884/mqtt' }, { url: 'sim:home' }],
    }
    expect(hostsIn(doc, 'app.local')).toEqual(['broker.example.org:8884', 'opendata-ajuntament.barcelona.cat', 'ovc.catastro.meh.es'])
  })

  it('reads a bare URL and ignores what is not one', () => {
    expect(hostsIn('https://example.com/layers.json', 'x')).toEqual(['example.com'])
    expect(hostsIn({ a: 1, b: null, c: ['ftp://nope', 'http//broken'] }, 'x')).toEqual([])
  })

  it('survives a cycle', () => {
    const a: Record<string, unknown> = { u: 'https://a.test/' }
    a.self = a
    expect(hostsIn(a, 'x')).toEqual(['a.test'])
  })
})

describe('layersSetupHosts', () => {
  it("lists the servers of the ready-made sources a scene names only by id (the demo scenes' way)", async () => {
    const hosts = await layersSetupHosts([{ preset: 'bicing' }, { preset: 'fmi-air-quality' }, { preset: 'no-such-preset' }])
    expect(hosts).toContain('barcelona.publicbikesystem.net')
    expect(hosts).toContain('opendata.fmi.fi')
  })

  it('keeps the URLs a setup spells out', async () => {
    expect(await layersSetupHosts({ layers: [{ source: { url: 'https://example.org/a.geojson' } }] })).toEqual(['example.org'])
  })
})

describe('confirmExternalData', () => {
  it('asks nothing when no foreign server is involved', async () => {
    await expect(confirmExternalData('layers', [])).resolves.toBe(true)
    expect(useExternalDataPrompt.getState().queue).toHaveLength(0)
  })

  it('queues one question per request and answers them in order', async () => {
    const first = confirmExternalData('layersUrl', ['example.com'])
    const second = confirmExternalData('twin', ['broker.example.org'])
    expect(useExternalDataPrompt.getState().queue.map((q) => q.kind)).toEqual(['layersUrl', 'twin'])
    useExternalDataPrompt.getState().answer(false)
    useExternalDataPrompt.getState().answer(true)
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(true)
  })

  it('leaves the decision to the embedding page inside a frame', async () => {
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window)
    await expect(confirmExternalData('layers', ['example.com'])).resolves.toBe(true)
    expect(useExternalDataPrompt.getState().queue).toHaveLength(0)
  })
})
