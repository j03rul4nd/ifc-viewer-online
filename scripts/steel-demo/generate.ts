// ─── Steel demo model generator ──────────────────────────────────────────────
// Writes public/models/steel-demo/steel-hall.ifc: a 24 x 40 m duo-pitch steel
// hall in IFC4 (mm), the model behind `/?steel=demo&tour=steel`. Columns HEA300,
// rafters IPE400, purlins IPE160, side rails UPE160, wall bracing L80x8, base
// plates PL20x400 and M20 anchor bolts, one IfcElementAssembly per portal frame.
// Quantities come the way real exports carry them: most parts have
// Qto_*BaseQuantities and Tekla psets, some only "Tekla Quantity" and the bolts
// no weight at all, so the source chain and the missing-weight notice show.
// Deterministic: same bytes on every run. Run: npx tsx scripts/steel-demo/generate.ts

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SPAN = 24000
export const LENGTH = 40000
export const BAY = 5000
export const EAVES = 6000
export const RIDGE = 7500
export const FRAMES = LENGTH / BAY + 1

const KG_M = { HEA300: 88.3, IPE400: 66.3, IPE160: 15.8, UPE160: 17.0, 'L80x8': 9.63 } as const
const PLATE_KG = 0.02 * 0.4 * 0.4 * 7850

const num = (n: number): string => {
  const r = Math.round(n * 10000) / 10000
  const s = String(r)
  return s.includes('.') || s.includes('e') ? s : `${s}.`
}
const str = (s: string): string => `'${s.replace(/'/g, "''")}'`

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function generateSteelHall(): string {
  const lines: string[] = []
  let next = 1
  let guidN = 0
  const add = (body: string): number => { const id = next++; lines.push(`#${id}=${body};`); return id }
  const guid = (): string => {
    let n = ++guidN
    let s = ''
    for (let i = 0; i < 21; i++) { s = GUID_CHARS[n % 64] + s; n = Math.floor(n / 64) }
    return str(`2${s}`)
  }
  const ref = (ids: number[]): string => `(${ids.map((i) => `#${i}`).join(',')})`

  const person = add(`IFCPERSON($,'Demo',$,$,$,$,$,$)`)
  const org = add(`IFCORGANIZATION($,'IFC Viewer Online',$,$,$)`)
  const po = add(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`)
  const app = add(`IFCAPPLICATION(#${org},'1.0','steel-demo generator','steel-demo')`)
  const oh = add(`IFCOWNERHISTORY(#${po},#${app},$,.ADDED.,$,$,$,0)`)
  const OH = `#${oh}`
  const units = [
    add(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`),
    add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`),
    add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`),
    add(`IFCSIUNIT(*,.MASSUNIT.,.KILO.,.GRAM.)`),
    add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`),
  ]
  const ua = add(`IFCUNITASSIGNMENT(${ref(units)})`)

  const pt = (x: number, y: number, z: number): number => add(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`)
  const dir = (x: number, y: number, z: number): number => add(`IFCDIRECTION((${num(x)},${num(y)},${num(z)}))`)
  const origin = pt(0, 0, 0)
  const zUp = dir(0, 0, 1)
  const xDir = dir(1, 0, 0)
  const world = add(`IFCAXIS2PLACEMENT3D(#${origin},#${zUp},#${xDir})`)
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${world},$)`)
  const body = add(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#${ctx},$,.MODEL_VIEW.,$)`)
  const project = add(`IFCPROJECT(${guid()},${OH},'Steel hall demo',$,$,$,$,(#${ctx}),#${ua})`)
  const sitePl = add(`IFCLOCALPLACEMENT($,#${world})`)
  const site = add(`IFCSITE(${guid()},${OH},'Site',$,$,#${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`)
  const bldPl = add(`IFCLOCALPLACEMENT(#${sitePl},#${world})`)
  const bld = add(`IFCBUILDING(${guid()},${OH},'Steel hall 24 x 40 m',$,$,#${bldPl},$,$,.ELEMENT.,$,$,$)`)
  const stPl = add(`IFCLOCALPLACEMENT(#${bldPl},#${world})`)
  const storey = add(`IFCBUILDINGSTOREY(${guid()},${OH},'Level 0',$,$,#${stPl},$,$,.ELEMENT.,0.)`)
  add(`IFCRELAGGREGATES(${guid()},${OH},$,$,#${project},(#${site}))`)
  add(`IFCRELAGGREGATES(${guid()},${OH},$,$,#${site},(#${bld}))`)
  add(`IFCRELAGGREGATES(${guid()},${OH},$,$,#${bld},(#${storey}))`)

  // Profiles
  const prof = {
    HEA300: add(`IFCISHAPEPROFILEDEF(.AREA.,'HEA300',$,300.,290.,8.5,14.,27.,$,$)`),
    IPE400: add(`IFCISHAPEPROFILEDEF(.AREA.,'IPE400',$,180.,400.,8.6,13.5,21.,$,$)`),
    IPE160: add(`IFCISHAPEPROFILEDEF(.AREA.,'IPE160',$,82.,160.,5.,7.4,9.,$,$)`),
    UPE160: add(`IFCUSHAPEPROFILEDEF(.AREA.,'UPE160',$,160.,70.,5.5,9.5,12.,$,$)`),
    'L80x8': add(`IFCLSHAPEPROFILEDEF(.AREA.,'L80x8',$,80.,80.,8.,10.,5.,$)`),
    PL: add(`IFCRECTANGLEPROFILEDEF(.AREA.,'PL20x400',$,400.,400.)`),
  }

  const material = add(`IFCMATERIAL('S355',$,'Steel')`)
  const contained: number[] = []
  const materialOf: number[] = []
  const qtoSets = new Map<string, number[]>()

  /** A straight extrusion from a to b (global mm), profile centred on the axis. */
  const solidAlong = (profile: number, a: [number, number, number], b: [number, number, number], refDir: [number, number, number]): { place: number; rep: number; length: number } => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const length = Math.hypot(d[0], d[1], d[2])
    const p = pt(...a)
    const axis = dir(d[0] / length, d[1] / length, d[2] / length)
    const rd = dir(...refDir)
    const local = add(`IFCAXIS2PLACEMENT3D(#${p},#${axis},#${rd})`)
    const place = add(`IFCLOCALPLACEMENT(#${stPl},#${local})`)
    const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${world},#${zUp},${num(length)})`)
    const shape = add(`IFCSHAPEREPRESENTATION(#${body},'Body','SweptSolid',(#${solid}))`)
    const rep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`)
    return { place, rep, length }
  }

  const single = (name: string, value: string): number => add(`IFCPROPERTYSINGLEVALUE(${str(name)},$,${value},$)`)
  const pset = (owner: number, name: string, props: number[]): void => {
    const set = add(`IFCPROPERTYSET(${guid()},${OH},${str(name)},$,${ref(props)})`)
    add(`IFCRELDEFINESBYPROPERTIES(${guid()},${OH},$,$,(#${owner}),#${set})`)
  }
  const qto = (owner: number, name: string, quantities: number[]): void => {
    const set = add(`IFCELEMENTQUANTITY(${guid()},${OH},${str(name)},$,$,${ref(quantities)})`)
    add(`IFCRELDEFINESBYPROPERTIES(${guid()},${OH},$,$,(#${owner}),#${set})`)
    qtoSets.set(name, [...(qtoSets.get(name) ?? []), owner])
  }

  type Kind = 'column' | 'beam' | 'purlin' | 'rail' | 'brace'
  const CLASS: Record<Kind, { entity: string; type: string; qto: string }> = {
    column: { entity: 'IFCCOLUMN', type: '.COLUMN.', qto: 'Qto_ColumnBaseQuantities' },
    beam: { entity: 'IFCBEAM', type: '.BEAM.', qto: 'Qto_BeamBaseQuantities' },
    purlin: { entity: 'IFCMEMBER', type: '.PURLIN.', qto: 'Qto_MemberBaseQuantities' },
    rail: { entity: 'IFCMEMBER', type: '.MEMBER.', qto: 'Qto_MemberBaseQuantities' },
    brace: { entity: 'IFCMEMBER', type: '.BRACE.', qto: 'Qto_MemberBaseQuantities' },
  }

  let mark = 0
  /** A linear part; `withQto` false → only the Tekla psets carry its quantities. */
  const part = (kind: Kind, profile: keyof typeof KG_M, name: string, a: [number, number, number], b: [number, number, number], refDir: [number, number, number], withQto: boolean): number => {
    const g = solidAlong(prof[profile], a, b, refDir)
    const c = CLASS[kind]
    const tag = `${kind[0].toUpperCase()}${++mark}`
    const id = add(`${c.entity}(${guid()},${OH},${str(name)},$,${str(profile)},#${g.place},#${g.rep},${str(tag)},${c.type})`)
    const weight = (g.length / 1000) * KG_M[profile]
    materialOf.push(id)
    pset(id, 'Tekla Common', [
      single('Part mark', `IFCLABEL(${str(tag)})`),
      single('Profile', `IFCLABEL(${str(profile)})`),
      single('Material', `IFCLABEL('S355')`),
      single('Phase', `IFCINTEGER(1)`),
    ])
    pset(id, 'Tekla Quantity', [
      single('Length', `IFCLENGTHMEASURE(${num(g.length)})`),
      single('Weight', `IFCMASSMEASURE(${num(weight)})`),
    ])
    if (withQto) {
      qto(id, c.qto, [
        add(`IFCQUANTITYLENGTH('Length',$,$,${num(g.length)},$)`),
        add(`IFCQUANTITYWEIGHT('NetWeight',$,$,${num(weight)},$)`),
      ])
    }
    return id
  }

  const roofZ = (x: number): number => EAVES + (RIDGE - EAVES) * (1 - Math.abs(x - SPAN / 2) / (SPAN / 2))
  const Y: [number, number, number] = [0, 1, 0]
  const X: [number, number, number] = [1, 0, 0]

  // Portal frames: two columns, two rafters, two base plates, eight bolts.
  for (let f = 0; f < FRAMES; f++) {
    const y = f * BAY
    const members: number[] = []
    for (const x of [0, SPAN]) {
      members.push(part('column', 'HEA300', 'COLUMN', [x, y, 0], [x, y, EAVES], Y, true))
      // Base plate under the column (only its volume: weight by density).
      const pp = pt(x, y, -20)
      const pl = add(`IFCAXIS2PLACEMENT3D(#${pp},#${zUp},#${xDir})`)
      const place = add(`IFCLOCALPLACEMENT(#${stPl},#${pl})`)
      const solid = add(`IFCEXTRUDEDAREASOLID(#${prof.PL},#${world},#${zUp},20.)`)
      const shape = add(`IFCSHAPEREPRESENTATION(#${body},'Body','SweptSolid',(#${solid}))`)
      const rep = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}))`)
      const tag = `P${++mark}`
      const plate = add(`IFCPLATE(${guid()},${OH},'BASE PLATE',$,'PL20x400',#${place},#${rep},${str(tag)},.BASE_PLATE.)`)
      materialOf.push(plate)
      pset(plate, 'Tekla Common', [single('Part mark', `IFCLABEL(${str(tag)})`), single('Profile', `IFCLABEL('PL20x400')`), single('Material', `IFCLABEL('S355')`)])
      qto(plate, 'Qto_PlateBaseQuantities', [
        add(`IFCQUANTITYAREA('NetArea',$,$,0.16,$)`),
        add(`IFCQUANTITYVOLUME('NetVolume',$,$,${num(PLATE_KG / 7850)},$)`),
      ])
      members.push(plate)
      // Four M20 anchor bolts: no weight anywhere, as many exports leave them.
      for (const [dx, dy] of [[-150, -150], [150, -150], [-150, 150], [150, 150]]) {
        const bp = pt(x + dx, y + dy, -300)
        const bl = add(`IFCAXIS2PLACEMENT3D(#${bp},#${zUp},#${xDir})`)
        const bPlace = add(`IFCLOCALPLACEMENT(#${stPl},#${bl})`)
        const bolt = add(`IFCMECHANICALFASTENER(${guid()},${OH},'ANCHOR BOLT',$,'M20',#${bPlace},$,${str(`F${++mark}`)},20.,350.,.ANCHORBOLT.)`)
        materialOf.push(bolt)
        members.push(bolt)
      }
    }
    members.push(part('beam', 'IPE400', 'RAFTER', [0, y, EAVES], [SPAN / 2, y, RIDGE], Y, true))
    members.push(part('beam', 'IPE400', 'RAFTER', [SPAN, y, EAVES], [SPAN / 2, y, RIDGE], Y, true))
    const ap = pt(0, y, 0)
    const al = add(`IFCAXIS2PLACEMENT3D(#${ap},#${zUp},#${xDir})`)
    const aPlace = add(`IFCLOCALPLACEMENT(#${stPl},#${al})`)
    const asm = add(`IFCELEMENTASSEMBLY(${guid()},${OH},${str(`PORTAL FRAME ${f + 1}`)},$,'PF',#${aPlace},$,${str(`PF${f + 1}`)},.FACTORY.,.RIGID_FRAME.)`)
    add(`IFCRELAGGREGATES(${guid()},${OH},$,$,#${asm},${ref(members)})`)
    pset(asm, 'Tekla Common', [single('Assembly mark', `IFCLABEL(${str(`PF${f + 1}`)})`), single('Profile', `IFCLABEL('PF')`)])
    contained.push(asm)
  }

  // Purlins on the roof: four per slope per bay. The last bay's carry Tekla only.
  for (let b = 0; b < FRAMES - 1; b++) {
    const y0 = b * BAY
    const lastBay = b === FRAMES - 2
    for (const t of [0.05, 0.35, 0.65, 0.95]) {
      for (const x of [t * SPAN / 2, SPAN - t * SPAN / 2]) {
        const z = roofZ(x) + 280
        contained.push(part('purlin', 'IPE160', 'PURLIN', [x, y0, z], [x, y0 + BAY, z], X, !lastBay))
      }
    }
    // Side rails on both long walls.
    for (const x of [-230, SPAN + 230]) {
      for (const z of [2000, 4000]) contained.push(part('rail', 'UPE160', 'SIDE RAIL', [x, y0, z], [x, y0 + BAY, z], X, true))
    }
  }
  // Wall bracing crosses in both end bays, Tekla only.
  for (const y0 of [0, LENGTH - BAY]) {
    for (const x of [-120, SPAN + 120]) {
      contained.push(part('brace', 'L80x8', 'BRACING', [x, y0, 300], [x, y0 + BAY, EAVES - 300], X, false))
      contained.push(part('brace', 'L80x8', 'BRACING', [x, y0 + BAY, 300], [x, y0, EAVES - 300], X, false))
    }
  }

  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${guid()},${OH},$,$,${ref(contained)},#${storey})`)
  add(`IFCRELASSOCIATESMATERIAL(${guid()},${OH},$,$,${ref(materialOf)},#${material})`)

  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    "FILE_NAME('steel-hall.ifc','2026-11-14T00:00:00',(''),('IFC Viewer Online'),'steel-demo','steel-demo generator','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] } catch { return false }
})()
if (isMain) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'models', 'steel-demo', 'steel-hall.ifc')
  mkdirSync(dirname(out), { recursive: true })
  const text = generateSteelHall()
  writeFileSync(out, text, 'latin1')
  console.log(`${out}: ${(text.length / 1024).toFixed(0)} KiB`)
}
