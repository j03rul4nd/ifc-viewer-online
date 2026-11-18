import { describe, it, expect } from 'vitest'
import { hasFarCoordinates, FAR_COORDINATE_THRESHOLD } from './ifc-far-coordinates'

const enc = (s: string) => new TextEncoder().encode(s)

describe('hasFarCoordinates', () => {
  it('flags UTM baked into cartesian points (Civil 3D export)', () => {
    const ifc = `#3=IFCCARTESIANPOINT((0.,0.,0.));\n#81=IFCCARTESIANPOINT((412706.79891006311,4593519.1026265575,149.2766));\n`
    expect(hasFarCoordinates(enc(ifc))).toBe(true)
  })

  it('leaves a model near the origin alone', () => {
    const ifc = `#3=IFCCARTESIANPOINT((0.,0.,0.));\n#4=IFCCARTESIANPOINT((-5.9,12.25,99999.));\n#5=IFCPROPERTYSINGLEVALUE('Area',$,IFCREAL(250000.),$);\n`
    expect(hasFarCoordinates(enc(ifc))).toBe(false)
  })

  it('reads exponent notation and negative values', () => {
    expect(hasFarCoordinates(enc(`#1=IFCCARTESIANPOINT((-4.5E+06,0.,0.));`))).toBe(true)
    expect(hasFarCoordinates(enc(`#1=IFCCARTESIANPOINT((2.54E-08,1.E+02));`))).toBe(false)
  })

  it('scans point lists (IFC4 tessellation) without reading the 3 of LIST3D as a coordinate', () => {
    expect(hasFarCoordinates(enc(`#9=IFCCARTESIANPOINTLIST3D(((1.,2.,3.),(412700.,4593500.,0.)),$);`))).toBe(true)
    expect(hasFarCoordinates(enc(`#9=IFCCARTESIANPOINTLIST3D(((1.,2.,3.)),$);`))).toBe(false)
  })

  it('ignores big numbers outside point entities and honours the threshold', () => {
    expect(hasFarCoordinates(enc(`#2=IFCMAPCONVERSION(#1,#3,412700.,4593500.,0.,$,$,$);`))).toBe(false)
    expect(hasFarCoordinates(enc(`#1=IFCCARTESIANPOINT((${FAR_COORDINATE_THRESHOLD},0.,0.));`))).toBe(true)
    expect(hasFarCoordinates(enc(`#1=IFCCARTESIANPOINT((5000.,0.,0.));`), 1000)).toBe(true)
  })
})
