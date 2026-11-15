import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { geometryFromStep, profileNamesFromStep } from './profiles'

const fixture = readFileSync(join(__dirname, '__fixtures__', 'steel-small.ifc'), 'latin1')

describe('profileNamesFromStep', () => {
  it('reads IfcProfileDef.ProfileName through the body swept solid', () => {
    const m = profileNamesFromStep(fixture)
    expect(m.get(100)).toBe('IPE300')
    expect(m.get(101)).toBe('IPE300')
    expect(m.get(102)).toBe('HEA200')
    expect(m.get(103)).toBe('PL10x200')
    expect(m.has(104)).toBe(false) // the bolt has no representation
  })

  it('follows mapped items and boolean clipping', () => {
    const text = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCISHAPEPROFILEDEF(.AREA.,'UB 203x133x25',$,1.,1.,1.,1.,1.,$,$);
#2=IFCEXTRUDEDAREASOLID(#1,$,$,1.);
#3=IFCHALFSPACESOLID($,.F.);
#4=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,#2,#3);
#5=IFCSHAPEREPRESENTATION($,'Body','Clipping',(#4));
#6=IFCREPRESENTATIONMAP($,#5);
#7=IFCMAPPEDITEM(#6,$);
#8=IFCSHAPEREPRESENTATION($,'Body','MappedRepresentation',(#7));
#9=IFCPRODUCTDEFINITIONSHAPE($,$,(#8));
#10=IFCMEMBER('g',$,'M',$,$,$,#9,$,$);
#11=IFCWALL('h',$,'W',$,$,$,#9,$,$);
ENDSEC;
END-ISO-10303-21;`
    const m = profileNamesFromStep(text)
    expect(m.get(10)).toBe('UB 203x133x25')
    expect(m.has(11)).toBe(false)
  })

  it('garbage in, empty map out', () => {
    expect(profileNamesFromStep('not an ifc').size).toBe(0)
  })
})

const step = (data: string) => `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
${data}
ENDSEC;
END-ISO-10303-21;`

/** One member per profile def: #10+i profile, #20+i solid (Depth 1000 mm), #30+i rep, #40+i shape, #50+i member. */
function members(profiles: string[]): string {
  return profiles.map((p, i) => [
    `#${10 + i}=${p};`,
    `#${20 + i}=IFCEXTRUDEDAREASOLID(#${10 + i},$,$,1000.);`,
    `#${30 + i}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#${20 + i}));`,
    `#${40 + i}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${30 + i}));`,
    `#${50 + i}=IFCMEMBER('g${i}',$,'M',$,$,$,#${40 + i},$,$);`,
  ].join('\n')).join('\n')
}

describe('geometryFromStep: length and area', () => {
  it('fixture (mm): IPE300 6 m, area 5188.06 mm2; HEA200 3 m; plate 200x400 x 10 mm', () => {
    const g = geometryFromStep(fixture)
    expect(g.get(100)!.length).toBeCloseTo(6, 9)
    // 2*150*10.7 + (300 - 2*10.7)*7.1 = 3210 + 1978.06
    expect(g.get(100)!.area).toBeCloseTo(5188.06e-6, 12)
    // 2*200*10 + (190 - 20)*6.5 = 4000 + 1105
    expect(g.get(102)!.area).toBeCloseTo(5105e-6, 12)
    expect(g.get(102)!.length).toBeCloseTo(3, 9)
    expect(g.get(103)!.area).toBeCloseTo(0.08, 12)
    expect(g.get(103)!.length).toBeCloseTo(0.01, 12)
  })

  it('areas by hand for L, U, T, RHS, circle and CHS', () => {
    const g = geometryFromStep(step(members([
      "IFCLSHAPEPROFILEDEF(.AREA.,'L100x80x10',$,100.,80.,10.,$,$,$,$)",   // 10*(100+80-10) = 1700
      "IFCLSHAPEPROFILEDEF(.AREA.,'L100x10',$,100.,$,10.,$,$,$,$)",        // equal legs: 10*190 = 1900
      "IFCUSHAPEPROFILEDEF(.AREA.,'UPN200',$,200.,75.,8.5,11.5,$,$,$)",    // 2*75*11.5 + 177*8.5 = 3229.5
      "IFCTSHAPEPROFILEDEF(.AREA.,'T100',$,100.,100.,10.,10.,$,$,$,$,$)",  // 100*10 + 90*10 = 1900
      "IFCRECTANGLEHOLLOWPROFILEDEF(.AREA.,'RHS100x50x5',$,100.,50.,5.,$,$)", // 5000 - 90*40 = 1400
      "IFCCIRCLEPROFILEDEF(.AREA.,'D20',$,10.)",                           // pi*100
      "IFCCIRCLEHOLLOWPROFILEDEF(.AREA.,'CHS100x5',$,50.,5.)",             // pi*(2500-2025) = pi*475
      "IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,$)",                          // no area, length only
    ])))
    const area = (i: number) => g.get(50 + i)!.area
    expect(area(0)).toBeCloseTo(1700e-6, 12)
    expect(area(1)).toBeCloseTo(1900e-6, 12)
    expect(area(2)).toBeCloseTo(3229.5e-6, 12)
    expect(area(3)).toBeCloseTo(1900e-6, 12)
    expect(area(4)).toBeCloseTo(1400e-6, 12)
    expect(area(5)).toBeCloseTo(Math.PI * 100e-6, 12)
    expect(area(6)).toBeCloseTo(Math.PI * 475e-6, 12)
    expect(g.get(57)).toEqual({ profile: null, length: 1, area: null })
    for (let i = 0; i < 8; i++) expect(g.get(50 + i)!.length).toBeCloseTo(1, 12)
  })

  const duplex = join(__dirname, '..', '..', '..', 'public', 'Ifc2x3_Duplex_Architecture.ifc')
  it.skipIf(!existsSync(duplex))('Duplex (Revit, metres): every beam gets a length > 0', () => {
    const text = readFileSync(duplex, 'latin1')
    const beams = [...text.matchAll(/^#(\d+)=IFCBEAM\(/gm)].map((m) => Number(m[1]))
    expect(beams.length).toBeGreaterThan(0)
    const g = geometryFromStep(text)
    for (const id of beams) expect(g.get(id)?.length ?? 0, `#${id}`).toBeGreaterThan(0)
    expect(g.get(36686)!.length).toBeCloseTo(7.4213, 4)
  }, 30_000)
})
