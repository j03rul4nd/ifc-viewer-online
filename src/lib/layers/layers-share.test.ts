import { describe, it, expect } from 'vitest'
import { scrubUrl, isLayersFile, importLayersFile } from './vector-runner'

describe('sharing a layer setup', () => {
  it('removes credential-looking parameters from URLs and counts them', () => {
    expect(scrubUrl('https://api.tmb.cat/v1/transit/parades?app_id=a&app_key=b')).toEqual({ url: 'https://api.tmb.cat/v1/transit/parades', removed: 2 })
    expect(scrubUrl('https://x.org/wfs?service=WFS&TOKEN=s3cret&typeName=a')).toEqual({ url: 'https://x.org/wfs?service=WFS&typeName=a', removed: 1 })
    expect(scrubUrl('https://x.org/data.geojson?limit=10')).toEqual({ url: 'https://x.org/data.geojson?limit=10', removed: 0 })
    expect(scrubUrl('not a url')).toEqual({ url: 'not a url', removed: 0 })
  })
  it('recognises its own files and refuses others', async () => {
    expect(isLayersFile('{"format": "ifc-viewer-data-layers", "v": 1}')).toBe(true)
    expect(isLayersFile('{"type": "FeatureCollection"}')).toBe(false)
    expect(await importLayersFile('{"type":"FeatureCollection","features":[]}')).toEqual({ ok: false, errorKey: 'error.notLayersFile' })
    expect(await importLayersFile('{"format":"ifc-viewer-data-layers","v":2,"layers":[]}')).toEqual({ ok: false, errorKey: 'error.layersFileVersion' })
    expect(await importLayersFile('nope')).toEqual({ ok: false, errorKey: 'error.notLayersFile' })
  })
})

describe('import says which layers failed, and why', () => {
  it('names a TMB layer without keys and gives the key reason', async () => {
    const { setTmbKeys } = await import('./tmb')
    setTmbKeys(null)
    const file = JSON.stringify({
      format: 'ifc-viewer-data-layers', v: 1, exportedAt: '2026-10-09T00:00:00Z',
      layers: [{ name: 'TMB · Metro', source: { type: 'url', url: 'https://api.tmb.cat/v1/transit/linies/metro', format: 'geojson' },
        style: { color: '#f00', opacity: 1, widthM: 3, fill: true, extrudeM: 0, pointRadiusM: 2 }, heightMode: 'ground', visible: true,
        fetchUrl: 'https://api.tmb.cat/v1/transit/linies/metro' }],
    })
    const r = await importLayersFile(file)
    expect(r.ok && r.failed).toBe(1)
    expect(r.ok && r.problems).toEqual([{ name: 'TMB · Metro', errorKey: 'error.tmbKey' }])
  })
})
