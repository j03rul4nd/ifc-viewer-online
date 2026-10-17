import { beforeAll, describe, expect, it } from 'vitest'
import { IfcAPI, IFCDOOR, IFCWALL, IFCBUILDINGELEMENTPROXY, IFCRELCONTAINEDINSPATIALSTRUCTURE } from 'web-ifc'
import { suggestTarget } from './proxy'
import { autoFixIfc } from './fixes'
import { readStep } from './step'

describe('suggestTarget', () => {
  it.each([
    ['Door:Single-Flush:812', 'IFCDOOR', 'high'],
    ['Puerta abatible 90', 'IFCDOOR', 'high'],
    ['Fenster 120x140', 'IFCWINDOW', 'high'],
    ['Barandilla vidrio', 'IFCRAILING', 'high'],
    ['Stair Railing:Handrail - Rectangular', 'IFCRAILING', 'high'],
    ['Forjado reticular 30', 'IFCSLAB', 'high'],
    ['Pilar HA 30x30', 'IFCCOLUMN', 'high'],
    ['Muro de carga', 'IFCWALL', 'high'],
    ['Generic Model:Feature with wall opening', 'IFCWALL', 'medium'],
  ])('%s → %s (%s)', (name, target, confidence) => {
    expect(suggestTarget(name)).toMatchObject({ target, confidence })
  })

  it('does not guess from fragments of other words', () => {
    expect(suggestTarget('Doorbell sensor')).toBeNull()
    expect(suggestTarget('Murano lamp')).toBeNull()
    expect(suggestTarget('Generic Model:Box')).toBeNull()
    expect(suggestTarget('')).toBeNull()
  })
})

const FILE = (schema: string) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION((''),'2;1');
FILE_NAME('p.ifc','2026-10-17T00:00:00',(''),(''),'','','');
FILE_SCHEMA(('${schema}'));
ENDSEC;
DATA;
#1=IFCOWNERHISTORY($,$,$,.ADDED.,$,$,$,0);
#10=IFCBUILDINGSTOREY('2Storey0000000000000a',#1,'Level 1',$,$,$,$,$,.ELEMENT.,0.);
#20=IFCBUILDINGELEMENTPROXY('2Prox00000000000000001',#1,'Door:Single-Flush:812',$,$,$,$,'812',${schema === 'IFC2X3' ? '$' : '.NOTDEFINED.'});
#21=IFCBUILDINGELEMENTPROXY('2Prox00000000000000002',#1,'Door:Single-Flush:813',$,$,$,$,'813',${schema === 'IFC2X3' ? '$' : '.NOTDEFINED.'});
#22=IFCBUILDINGELEMENTPROXY('2Prox00000000000000003',#1,'Muro de carga',$,$,$,$,$,${schema === 'IFC2X3' ? '$' : '.NOTDEFINED.'});
#23=IFCBUILDINGELEMENTPROXY('2Prox00000000000000004',#1,'Generic Model:Box',$,$,$,$,$,${schema === 'IFC2X3' ? '$' : '.NOTDEFINED.'});
#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2Rel000000000000000001',#1,$,$,(#20,#21,#22,#23),#10);
ENDSEC;
END-ISO-10303-21;`

let n = 0
const guid = () => `0TestGuid${String(++n).padStart(13, '0')}`

describe('proxy reclassification', () => {
  let api: IfcAPI
  beforeAll(async () => { api = new IfcAPI(); await api.Init() })

  it('only suggests; nothing changes without confirmation', () => {
    const { text, report } = autoFixIfc(FILE('IFC4'), { newGuid: guid, fixMissingType: false })
    expect(report.proxySuggestions.map((g) => [g.label, g.ids])).toEqual([['IfcDoor', [20, 21]], ['IfcWall', [22]]])
    expect(report.proxiesReclassified).toBe(0)
    expect(readStep(text).entities.get(20)?.type).toBe('IFCBUILDINGELEMENTPROXY')
  })

  for (const schema of ['IFC4', 'IFC2X3']) {
    it(`${schema}: confirmed groups become valid entities web-ifc reads, same ids, still contained, then typed`, () => {
      const { text, report } = autoFixIfc(FILE(schema), { newGuid: guid, reclassify: [{ ids: [20, 21], target: 'IFCDOOR' }, { ids: [22], target: 'IFCWALL' }] })
      expect(report.proxiesReclassified).toBe(3)
      // Remaining suggestions exclude what was applied.
      expect(report.proxySuggestions).toEqual([])

      const m = api.OpenModel(new TextEncoder().encode(text))
      const ids = (t: number) => { const v = api.GetLineIDsWithType(m, t); return Array.from({ length: v.size() }, (_, i) => v.get(i)) }
      expect(ids(IFCDOOR)).toEqual([20, 21])
      expect(ids(IFCWALL)).toEqual([22])
      expect(ids(IFCBUILDINGELEMENTPROXY)).toEqual([23])
      const door = api.GetLine(m, 20)
      expect(door.Name.value).toBe('Door:Single-Flush:812')
      const rel = api.GetLine(m, ids(IFCRELCONTAINEDINSPATIALSTRUCTURE)[0])
      expect(rel.RelatedElements.map((r: { value: number }) => r.value)).toEqual([20, 21, 22, 23])
      api.CloseModel(m)
      // IFC4 doors get an IfcDoorType; IFC2X3 doors are reported as skipped instead.
      if (schema === 'IFC4') expect(report.changes.some((c) => c.includes('IfcDoorType'))).toBe(true)
      else expect(report.missingType.skippedClasses.IFCDOOR).toBe(2)
    })
  }
})
