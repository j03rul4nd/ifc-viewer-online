import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { profileNamesFromStep } from './profiles'

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
