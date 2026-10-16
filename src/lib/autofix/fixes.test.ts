import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IfcAPI, IFCRELDEFINESBYTYPE, IFCWALLTYPE, IFCWALLSTANDARDCASE, IFCWALL } from 'web-ifc'
import { autoFixIfc, typeNameFor } from './fixes'
import { readStep, writeStep, parseArgs, writeValue } from './step'

let n = 0
const guid = () => `0TestGuid${String(++n).padStart(13, '0')}`

const SMALL = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('t.ifc','2026-10-16T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);
#10=IFCBUILDINGSTOREY('2Storey0000000000000a',#1,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#20=IFCWALL('2Wall00000000000000001',#1,'Basic Wall:Generic 200mm:1001',$,$,$,$,'1001',$);
#21=IFCWALL('2Wall00000000000000002',#1,'Basic Wall:Generic 200mm:1002',$,$,$,$,'1002',$);
#22=IFCWALL('2Wall00000000000000003',#1,'Muro d''obra',$,'Exterior 300',$,$,$,$);
#30=IFCDOOR('2Door00000000000000001',#1,'Door',$,$,$,$,'D1',2.1,0.9,$,$,$);
#31=IFCDOOR('2Door00000000000000002',#1,'Door',$,$,$,$,'D2',2.1,0.9,$,$,$);
#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2Rel000000000000000001',#1,$,$,(#20,#21,#22,#30,#31),#10);
ENDSEC;
END-ISO-10303-21;`

describe('step reader/writer', () => {
  it('round-trips a file it does not edit byte-for-byte', () => {
    expect(writeStep(readStep(SMALL))).toBe(SMALL.replace(/\r\n/g, '\n'))
  })

  it('parses strings with escaped quotes, enums, refs and nested lists', () => {
    const args = parseArgs(`'it''s',.T.,#12,(#1,(2.5,$)),*,IFCLABEL('x')`)
    expect(args.map(writeValue).join(',')).toBe(`'it''s',.T.,#12,(#1,(2.5,$)),*,IFCLABEL('x')`)
  })

  it('reads a semicolon inside a string as text, not as the end of the entity', () => {
    const f = readStep(SMALL.replace("'Level 1'", "'Level;1'"))
    expect(f.entities.get(10)?.args[2]).toEqual({ k: 'str', v: 'Level;1' })
  })
})

describe('autoFixIfc on a synthetic IFC4 file', () => {
  const { text, report } = autoFixIfc(SMALL, { newGuid: guid })
  const f = readStep(text)

  it('groups untyped walls by Revit type name, ObjectType first', () => {
    expect(typeNameFor(f.entities.get(20)!)).toBe('Basic Wall:Generic 200mm')
    expect(typeNameFor(f.entities.get(22)!)).toBe('Exterior 300')
    const wallTypes = [...f.entities.values()].filter((e) => e.type === 'IFCWALLTYPE')
    expect(wallTypes.map((t) => t.args[2])).toEqual(expect.arrayContaining([
      { k: 'str', v: 'Basic Wall:Generic 200mm' }, { k: 'str', v: 'Exterior 300' },
    ]))
  })

  it('links every typed element exactly once', () => {
    const linked = [...f.entities.values()].filter((e) => e.type === 'IFCRELDEFINESBYTYPE')
      .flatMap((r) => (r.args[4].k === 'list' ? r.args[4].items : []).map((x) => (x.k === 'ref' ? x.id : -1)))
    expect(linked.sort()).toEqual([20, 21, 22, 30, 31])
    expect(report.missingType.elementsLinked).toBe(5)
  })

  it('writes IfcDoorType with its 13 IFC4 attributes', () => {
    const door = [...f.entities.values()].find((e) => e.type === 'IFCDOORTYPE')!
    expect(door.args).toHaveLength(13)
  })

  it('makes sibling names unique using the Tag', () => {
    expect(f.entities.get(30)!.args[2]).toEqual({ k: 'str', v: 'Door' })
    expect(f.entities.get(31)!.args[2]).toEqual({ k: 'str', v: 'Door [D2]' })
    expect(report.duplicateName).toEqual({ renamed: 1, groups: 1 })
  })

  it('keeps escaped apostrophes intact', () => {
    expect(text).toContain("'Muro d''obra'")
  })

  it('does not create doors types in IFC2X3, where IfcDoorStyle would be needed', () => {
    const r = autoFixIfc(SMALL.replace("('IFC4')", "('IFC2X3')"), { newGuid: guid }).report
    expect(r.missingType.skippedClasses.IFCDOOR).toBe(2)
    expect(r.missingType.elementsLinked).toBe(3)
  })
})

describe('autoFixIfc on a real model (IFC2X3 Duplex)', () => {
  let api: IfcAPI
  beforeAll(async () => { api = new IfcAPI(); await api.Init() })

  it('produces a file web-ifc opens, with every wall typed', () => {
    const src = readFileSync(resolve(__dirname, '../../../public/Ifc2x3_Duplex_Architecture.ifc'), 'utf8')
    const { text, report } = autoFixIfc(src, { newGuid: guid })

    const before = api.OpenModel(new TextEncoder().encode(src))
    const after = api.OpenModel(new TextEncoder().encode(text))
    const count = (m: number, t: number) => api.GetLineIDsWithType(m, t).size()

    expect(count(after, IFCWALLSTANDARDCASE) + count(after, IFCWALL)).toBe(count(before, IFCWALLSTANDARDCASE) + count(before, IFCWALL))
    expect(count(after, IFCRELDEFINESBYTYPE)).toBe(count(before, IFCRELDEFINESBYTYPE) + report.missingType.typesCreated)
    expect(count(after, IFCWALLTYPE)).toBeGreaterThanOrEqual(count(before, IFCWALLTYPE))

    // Every wall now has a type.
    const typed = new Set<number>()
    const rels = api.GetLineIDsWithType(after, IFCRELDEFINESBYTYPE)
    for (let i = 0; i < rels.size(); i++) {
      const rel = api.GetLine(after, rels.get(i))
      for (const o of rel.RelatedObjects ?? []) typed.add(o.value)
    }
    for (const t of [IFCWALLSTANDARDCASE, IFCWALL]) {
      const ids = api.GetLineIDsWithType(after, t)
      for (let i = 0; i < ids.size(); i++) expect(typed.has(ids.get(i))).toBe(true)
    }
    api.CloseModel(before); api.CloseModel(after)
  })
})
