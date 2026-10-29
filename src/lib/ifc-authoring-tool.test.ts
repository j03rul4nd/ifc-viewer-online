import { describe, it, expect } from 'vitest'
import { detectAuthoringTool, detectAuthoringToolFromBuffer, readStepHeader } from './ifc-authoring-tool'

const header = (fileName: string): string =>
  `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');\n${fileName}\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n#1=IFCPERSON($,$,'',$,$,$,$,$);\n`

const buf = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('detectAuthoringTool', () => {
  it('reads the originating system of each supported tool', () => {
    expect(detectAuthoringTool(header("FILE_NAME('a.ifc','2026-01-01T00:00:00',(''),(''),'The EXPRESS Data Manager Version 5.02.0100.07 : 28 Aug 2013','21.1.0.0 - Exporter 21.1.0.0 - Alternate UI 21.1.0.0','');")))
      .toEqual({ tool: 'revit', application: 'Autodesk Revit' })
    expect(detectAuthoringTool(header("FILE_NAME('a.ifc','2026-01-01T00:00:00',('Ana'),('Estudio'),'ODA SDAI 24.5','Autodesk Revit 2024 (ESP)','');")))
      .toEqual({ tool: 'revit', application: 'Autodesk Revit 2024 (ESP)' })
    expect(detectAuthoringTool(header("FILE_NAME('b.ifc','2026-01-01',(''),(''),'IFC2x3 add-on version: 5503 SPA FULL','Archicad 27','');"))?.tool).toBe('archicad')
    expect(detectAuthoringTool(header("FILE_NAME('c.ifc','2026-01-01',(''),(''),'Tekla Structures','Tekla Structures 2024','');"))?.tool).toBe('tekla')
    expect(detectAuthoringTool(header("FILE_NAME('d.ifc','2026-01-01',(''),(''),'Allplan 2025','Nemetschek Allplan','');"))?.tool).toBe('allplan')
  })

  it('falls back to the preprocessor field and handles escaped quotes', () => {
    expect(detectAuthoringTool(header("FILE_NAME('o''brien.ifc','2026',(''),(''),'GRAPHISOFT IFC','','');"))?.tool).toBe('archicad')
  })

  it('returns null for an unknown tool or a file without FILE_NAME', () => {
    expect(detectAuthoringTool(header("FILE_NAME('e.ifc','2026',(''),(''),'IfcOpenShell 0.8','Bonsai','');"))).toBeNull()
    expect(detectAuthoringTool('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;')).toBeNull()
  })
})

it('reads IFCAPPLICATION when FILE_NAME does not name the tool', () => {
  const text = header("FILE_NAME('a.ifc','2026',(''),(''),'The EXPRESS Data Manager','25.0.0','');") + "#5=IFCAPPLICATION(#4,'2024','Autodesk Revit 2024 (ESP)','Revit');"
  expect(detectAuthoringTool(text)).toEqual({ tool: 'revit', application: 'Autodesk Revit 2024 (ESP)' })
})

describe('readStepHeader', () => {
  it('stops at DATA; and ignores the entity section', () => {
    const h = readStepHeader(buf(header("FILE_NAME('a.ifc','2026',(''),(''),'x','Autodesk Revit 2025','');") + "#2=IFCAPPLICATION('Tekla');"))
    expect(h).toContain('Autodesk Revit 2025')
    expect(h).not.toContain('IFCAPPLICATION')
    expect(detectAuthoringToolFromBuffer(buf(header("FILE_NAME('a.ifc','2026',(''),(''),'x','Autodesk Revit 2025','');")))?.tool).toBe('revit')
    expect(detectAuthoringToolFromBuffer(null)).toBeNull()
  })
})
