// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
import { placementFromExtraction } from '../../src/lib/geo/placement'
import type { GeorefExtraction } from '../../src/lib/geo/geo-types'
const require = createRequire(import.meta.url)
const web = require('web-ifc')

describe('Shanghai map alignment', () => {
  for (const [slug, file] of [['oriental-pearl','SHA-IVO-ORIENTAL-PEARL-A-0001.ifc'],['swfc','SHA-IVO-SWFC-A-0001.ifc']]) {
    it(`${slug}: reads the shipped MapConversion and projects the tower axis onto the mapped footprint`, async () => {
      const site = JSON.parse(readFileSync(`scripts/blender/sites/${slug}.json`, 'utf8'))
      const api = new web.IfcAPI(); await api.Init()
      const id = api.OpenModel(new Uint8Array(readFileSync(`public/models/${slug}/${file}`)))
      try {
        const ids = api.GetLineIDsWithType(id, web.IFCMAPCONVERSION)
        expect(ids.size()).toBe(1)
        const c = api.GetLine(id, ids.get(0))
        const crs = api.GetLine(id,c.TargetCRS.value)
        expect(crs.Name.value).toBe('EPSG:32651')
        const rotation = Math.atan2(c.XAxisOrdinate.value,c.XAxisAbscissa.value)*180/Math.PI
        expect(rotation).toBeCloseTo(site.rotationDeg, 6)
        const extraction = {lat:null,lon:null,eastings:c.Eastings.value,northings:c.Northings.value,scale:c.Scale.value,rotationDeg:rotation,epsgCode:crs.Name.value,heightM:0,status:'found'} as GeorefExtraction
        const result = placementFromExtraction(extraction,null)
        expect(result.ok).toBe(true)
        if(result.ok) {
          expect(result.value.lon).toBeCloseTo(site.lonlat[0],7)
          expect(result.value.lat).toBeCloseTo(site.lonlat[1],7)
        }
        // The viewer must account for asymmetric geometry instead of moving the tower axis.
        const shifted=placementFromExtraction(extraction,{center:{x:15,y:200,z:-9},size:{x:100,y:468,z:100}})
        expect(shifted.ok).toBe(true)
        if(shifted.ok && result.ok) expect(shifted.value.lon).not.toBe(result.value.lon)
      } finally {api.CloseModel(id)}
    })
  }
})
