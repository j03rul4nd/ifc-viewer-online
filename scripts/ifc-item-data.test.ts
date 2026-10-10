// ─── element data through the REAL converter ──────────────────────────────────
// What the properties panel and the SDK's getElement() show is whatever
// fragments' getItemsData() hands back, and that shape is decided by the
// converter: GlobalId moved to `_guid`, IfcRelDefinesByType filed under
// `IsDefinedBy`, reference attributes turned into relations that only expand
// when asked for by name. Every one of those broke the panel silently, so this
// runs the real thing — web-ifc's WASM, fragments' IfcImporter with the
// viewer's class additions, getItemsData with the viewer's request — on
// catalogue objects shaped like BESCOF's (IFC4, millimetres, a type carrying
// the manufacturer psets) and on an IFC2x3 window typed by an IfcWindowStyle.
//
// The BESCOF files themselves (V-70-PR.ifc, PTA-EXT-80.ifc) are not in the
// repo; drop them in test/fixtures/bescof/ and the `real file` cases run too.
// The synthetic stand-ins reproduce what is known of them: the window is #67
// with GlobalId 2c161Q3PMaELK1P$GnzTUr, typed by 'Ventana V-70 practicable'
// with four psets and 35 properties.
//
// Lives in scripts/ for node:fs (see far-coordinates-ifc.test.ts).

import { describe, it, expect, beforeAll } from 'vitest'
import * as WEBIFC from 'web-ifc'
import { IfcImporter, SingleThreadedFragmentsModel } from '@thatopen/fragments'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import {
  ITEM_DATA_CONFIG, PROJECT_UNITS_CONFIG, parseItemData, parseProjectUnits,
  type IFCItemData, type IFCPropertySet,
} from '../src/lib/ifc-item-data'
import { EXTRA_IMPORTER_CLASSES, addImporterClasses } from '../src/lib/ifc-importer-classes'

const WASM = path.join(process.cwd(), 'node_modules', 'web-ifc') + path.sep
const FIXTURES = path.join(process.cwd(), 'test', 'fixtures', 'bescof')
const fixture = (name: string): string => path.join(FIXTURES, name)

/** Convert like ifc-parser.worker does (classes included unless told not to). */
async function convert(file: string, opts: { extraClasses?: boolean } = {}): Promise<SingleThreadedFragmentsModel> {
  const importer = new IfcImporter()
  importer.wasm = { path: WASM, absolute: true }
  if (opts.extraClasses !== false) addImporterClasses(importer)
  const log = console.log
  console.log = () => { /* the importer narrates every class */ }
  try {
    const frag = await importer.process({ bytes: new Uint8Array(readFileSync(file)) })
    return new SingleThreadedFragmentsModel(path.basename(file), frag)
  } finally {
    console.log = log
  }
}

/** viewer.getItemData, minus the worker: project units + the element. */
function elementData(model: SingleThreadedFragmentsModel, id: number): IFCItemData {
  const projectIds = Object.values(model.getItemsOfCategories([/^IFCPROJECT$/])).flat()
  const [project] = projectIds.length ? model.getItemsData([projectIds[0]], PROJECT_UNITS_CONFIG) : []
  const [raw] = model.getItemsData([id], ITEM_DATA_CONFIG)
  return parseItemData(raw as Record<string, unknown>, parseProjectUnits(project))
}

function idsOf(model: SingleThreadedFragmentsModel, cls: RegExp): number[] {
  return Object.values(model.getItemsOfCategories([cls])).flat()
}

function prop(sets: IFCPropertySet[], pset: string, name: string) {
  return sets.find((s) => s.name === pset)?.properties.find((p) => p.name === name)
}

describe('importer class additions', () => {
  it('carry web-ifc\'s own type codes', () => {
    for (const [name, code] of Object.entries(EXTRA_IMPORTER_CLASSES)) {
      expect((WEBIFC as unknown as Record<string, number>)[name], name).toBe(code)
    }
  })
})

describe('V-70-PR window (IFC4, mm, type with 4 psets)', () => {
  let model: SingleThreadedFragmentsModel
  let data: IFCItemData
  beforeAll(async () => {
    model = await convert(fixture('V-70-PR.synthetic.ifc'))
    data = elementData(model, 67)
  }, 60_000)

  it('the occurrence #67 is the window, with its GlobalId', () => {
    expect(data.ifcClass).toBe('IFCWINDOW')
    expect(data.globalId).toBe('2c161Q3PMaELK1P$GnzTUr')
    expect(data.storey).toBe('Planta 0')
  })

  it('resolves its type through IsDefinedBy → IfcRelDefinesByType', () => {
    expect(data.typeName).toBe('Ventana V-70 practicable')
    expect(data.typeClass).toBe('IFCWINDOWTYPE')
    expect(data.typeId).toBe(80)
    expect(data.typeGlobalId).toBe('3cfKND$pWhWny7J81Zuoio')
  })

  it('expands the type\'s HasPropertySets down to every property', () => {
    expect(data.propertySets).toEqual([])
    expect(data.typeProperties.map((s) => s.name)).toEqual([
      'Pset_WindowCommon', 'Pset_DoorWindowGlazingType', 'Pset_ManufacturerTypeInformation', 'BESCOF_EN14351',
    ])
    expect(data.typeProperties.reduce((n, s) => n + s.properties.length, 0)).toBe(35)
  })

  it('acceptance: U-value, wind load class and manufacturer', () => {
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'ThermalTransmittance')).toMatchObject({
      value: 1.2, type: 'IFCTHERMALTRANSMITTANCEMEASURE', unit: 'W/(m²·K)',
    })
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'WindLoadRating')?.value).toBe('C4')
    expect(prop(data.typeProperties, 'Pset_ManufacturerTypeInformation', 'Manufacturer')?.value).toBe('ACME Ventanas')
  })

  it('gives values their IFC type and the project\'s unit', () => {
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'IsExternal')).toMatchObject({ value: true, type: 'IFCBOOLEAN' })
    expect(prop(data.typeProperties, 'Pset_DoorWindowGlazingType', 'GlassThickness1')).toMatchObject({
      value: 4, type: 'IFCPOSITIVELENGTHMEASURE', unit: 'mm',
    })
    // A label has no unit, and none is invented for it.
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'WindLoadRating')?.unit).toBeUndefined()
  })

  it('with nothing on the occurrence, the effective view is the type\'s', () => {
    const wc = data.effectivePropertySets.find((s) => s.name === 'Pset_WindowCommon')!
    expect(wc.properties.every((p) => p.source === 'type')).toBe(true)
    expect(wc.properties.find((p) => p.name === 'ThermalTransmittance')?.value).toBe(1.2)
  })

  it('reads the type without dragging the type\'s other occurrences along', () => {
    const type = (data.raw.IsDefinedBy as Array<Record<string, unknown>>)[0]
    expect(type.ObjectTypeOf).toBeUndefined()
    // and the payload is plain data (it crosses postMessage to the SDK host)
    expect(() => JSON.stringify(data.raw)).not.toThrow()
  })

  it('the request the panel used to make reproduces the reported bug', () => {
    const [raw] = model.getItemsData([67], {
      attributesDefault: false,
      attributes: ['Name', 'LongName', 'Description', 'GlobalId', 'ObjectType', 'Tag'],
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        ContainedInStructure: { attributes: true, relations: false },
        DefinesOccurrence: { attributes: false, relations: false },
        IsTypedBy: { attributes: true, relations: true },
        HasAssociations: { attributes: true, relations: true },
      },
    }) as Array<Record<string, unknown>>
    expect(raw.GlobalId).toBeUndefined()
    const type = (raw.IsDefinedBy as Array<Record<string, unknown>>)[0]
    const psets = type.HasPropertySets as Array<Record<string, unknown>>
    expect(psets).toHaveLength(4)
    expect(psets.every((p) => p.HasProperties === undefined)).toBe(true)
  })
})

describe('PTA-EXT-80 door (occurrence overrides part of its type)', () => {
  let data: IFCItemData
  beforeAll(async () => {
    const model = await convert(fixture('PTA-EXT-80.synthetic.ifc'))
    data = elementData(model, 67)
  }, 60_000)

  it('resolves the door type and its psets', () => {
    expect(data.ifcClass).toBe('IFCDOOR')
    expect(data.globalId).toBe('36RSQ5m_VCNnKU83$Up2N5')
    expect(data.typeName).toBe('Puerta PTA-EXT-80')
    expect(data.typeClass).toBe('IFCDOORTYPE')
    expect(prop(data.typeProperties, 'Pset_DoorCommon', 'ThermalTransmittance')?.value).toBe(1.4)
    expect(prop(data.typeProperties, 'Pset_ManufacturerTypeInformation', 'Manufacturer')?.value).toBe('ACME Puertas')
  })

  it('the occurrence\'s value wins over the type\'s', () => {
    const eff = data.effectivePropertySets.find((s) => s.name === 'Pset_DoorCommon')!
    expect(eff.properties.find((p) => p.name === 'Reference')).toMatchObject({ value: 'PTA-EXT-80-01', source: 'occurrence' })
    // inherited from the type where the occurrence says nothing
    expect(eff.properties.find((p) => p.name === 'ThermalTransmittance')).toMatchObject({ value: 1.4, source: 'type' })
    // defined only on the occurrence
    expect(eff.properties.find((p) => p.name === 'FireExit')).toMatchObject({ value: true, source: 'occurrence' })
    // one entry per property, never both
    expect(eff.properties.filter((p) => p.name === 'Reference')).toHaveLength(1)
  })

  it('keeps the type\'s own value, marked as overridden', () => {
    expect(prop(data.typeProperties, 'Pset_DoorCommon', 'Reference')).toMatchObject({ value: 'PTA-EXT-80', overridden: true })
    expect(prop(data.typeProperties, 'Pset_DoorCommon', 'ThermalTransmittance')?.overridden).toBeUndefined()
    expect(prop(data.propertySets, 'Pset_DoorCommon', 'Reference')?.value).toBe('PTA-EXT-80-01')
  })

  it('reads enumerated values and a property\'s own unit', () => {
    expect(prop(data.typeProperties, 'Pset_ManufacturerTypeInformation', 'AssemblyPlace')).toMatchObject({ value: 'FACTORY', type: 'IFCLABEL' })
    expect(prop(data.typeProperties, 'BESCOF_EN14351', 'AnchoLibrePaso')).toMatchObject({ value: 820, unit: 'mm' })
  })

  it('quantities carry their values and the project\'s length unit', () => {
    const q = data.quantitySets.find((s) => s.name === 'Qto_DoorBaseQuantities')!
    expect(q.quantities.find((x) => x.name === 'Width')).toMatchObject({ value: 1000, quantityType: 'Length', unit: 'mm' })
  })
})

describe('IFC2x3 window typed by an IfcWindowStyle', () => {
  it('resolves the style, its psets, and the occurrence override', async () => {
    const model = await convert(fixture('window-ifc2x3.synthetic.ifc'))
    const data = elementData(model, 67)
    expect(data.globalId).toBe('16IGzsEfTI3MOS$RGm$SXc')
    expect(data.typeName).toBe('Ventana V-60 abatible')
    expect(data.typeClass).toBe('IFCWINDOWSTYLE')
    expect(prop(data.typeProperties, 'Pset_ManufacturerTypeInformation', 'Manufacturer')?.value).toBe('ACME Ventanas')
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'ThermalTransmittance')).toMatchObject({ value: 1.6, overridden: true })
    const eff = data.effectivePropertySets.find((s) => s.name === 'Pset_WindowCommon')!
    expect(eff.properties.find((p) => p.name === 'ThermalTransmittance')).toMatchObject({ value: 1.5, source: 'occurrence' })
  }, 60_000)

  it('without the class additions the style is not stored — why they exist', async () => {
    const model = await convert(fixture('window-ifc2x3.synthetic.ifc'), { extraClasses: false })
    const data = elementData(model, 67)
    expect(data.typeName).toBeNull()
    expect(data.typeProperties).toEqual([])
  }, 60_000)
})

// ── The BESCOF files themselves, when someone has dropped them in ────────────

const REAL_WINDOW = fixture('V-70-PR.ifc')
const REAL_DOOR = fixture('PTA-EXT-80.ifc')

describe.runIf(existsSync(REAL_WINDOW))('real file: V-70-PR.ifc', () => {
  it('acceptance values', async () => {
    const data = elementData(await convert(REAL_WINDOW), 67)
    expect(data.globalId).toBe('2c161Q3PMaELK1P$GnzTUr')
    expect(data.typeName).toBe('Ventana V-70 practicable')
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'ThermalTransmittance')?.value).toBe(1.2)
    expect(prop(data.typeProperties, 'Pset_WindowCommon', 'WindLoadRating')?.value).toBe('C4')
    expect(prop(data.typeProperties, 'Pset_ManufacturerTypeInformation', 'Manufacturer')?.value).toBe('ACME Ventanas')
  }, 60_000)
})

describe.runIf(existsSync(REAL_DOOR))('real file: PTA-EXT-80.ifc', () => {
  it('resolves the door\'s type and its psets', async () => {
    const model = await convert(REAL_DOOR)
    const [door] = idsOf(model, /^IFCDOOR$/)
    const data = elementData(model, door)
    expect(data.globalId).toMatch(/^[0-9A-Za-z_$]{22}$/)
    expect(data.typeName).toBeTruthy()
    expect(data.typeProperties.map((s) => s.name)).toContain('Pset_DoorCommon')
    expect(data.typeProperties.map((s) => s.name)).toContain('Pset_ManufacturerTypeInformation')
  }, 60_000)
})
