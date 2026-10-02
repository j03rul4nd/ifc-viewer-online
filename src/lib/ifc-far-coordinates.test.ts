import { describe, it, expect } from 'vitest'
import { hasFarCoordinates, lengthUnitScale, FAR_COORDINATE_THRESHOLD } from './ifc-far-coordinates'

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

describe('length units', () => {
  const MM = `#8=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
`
  const FT = `#11=IFCCONVERSIONBASEDUNIT(#12,.LENGTHUNIT.,'FOOT',#13);
`

  it('reads the declared unit', () => {
    expect(lengthUnitScale(enc(MM))).toBe(0.001)
    expect(lengthUnitScale(enc(`#8=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`))).toBe(1)
    expect(lengthUnitScale(enc(FT))).toBeCloseTo(0.3048, 6)
    expect(lengthUnitScale(enc(`#1=IFCPROJECT('x',$,$,$,$,$,$,$,$);`))).toBe(1)
    // An area unit is not a length unit.
    expect(lengthUnitScale(enc(`#9=IFCSIUNIT(*,.AREAUNIT.,.MILLI.,.SQUARE_METRE.);
#8=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`))).toBe(1)
  })

  it('a 150 m building in millimetres is not far', () => {
    expect(hasFarCoordinates(enc(MM + `#3=IFCCARTESIANPOINT((150000.,42000.,9000.));`))).toBe(false)
  })

  it('UTM in millimetres is far', () => {
    expect(hasFarCoordinates(enc(MM + `#3=IFCCARTESIANPOINT((412706798.9,4593519102.6,149276.));`))).toBe(true)
  })

  it('state plane in feet is far, and its threshold is in metres', () => {
    // 100 km is 328 084 ft: 300 000 ft (91 km) is near, 2 000 000 ft is far.
    expect(hasFarCoordinates(enc(FT + `#3=IFCCARTESIANPOINT((300000.,0.,0.));`))).toBe(false)
    expect(hasFarCoordinates(enc(FT + `#3=IFCCARTESIANPOINT((2000000.,600000.,0.));`))).toBe(true)
  })
})
