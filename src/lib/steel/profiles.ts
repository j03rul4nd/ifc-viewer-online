// ─── profile names from the geometry ──────────────────────────────────────────
// Pure: IFC STEP text → expressId → IfcProfileDef.ProfileName of the element's
// body (IfcExtrudedAreaSolid.SweptArea). Uses the dependency-free STEP reader
// of the auto-fix; runs in a worker (workers/steel-profiles.worker.ts).
// Follows mapped items and boolean results to the first swept solid.
// Besides the name it returns the extrusion length (Depth x project length
// unit, in m) and, for parameterised profiles, the section area (m2): what
// the takeoff falls back to when no Qto or pset gives length or weight.
//
// Areas are nominal: root/toe/edge radii (FilletRadius, EdgeRadius...) are
// ignored, so a rolled I section reads ~2-4 % light. Arbitrary profiles
// (IfcArbitraryClosedProfileDef...) give a length but no area.

import { readStep, strValue, type StepEntity, type StepFile, type StepValue } from '../autofix/step'

const STEEL_CLASSES = new Set(['IFCBEAM', 'IFCCOLUMN', 'IFCMEMBER', 'IFCPLATE', 'IFCMECHANICALFASTENER', 'IFCELEMENTASSEMBLY',
  'IFCBEAMSTANDARDCASE', 'IFCCOLUMNSTANDARDCASE', 'IFCMEMBERSTANDARDCASE', 'IFCPLATESTANDARDCASE'])

/** IfcProduct attribute index of Representation (GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation). */
const PRODUCT_REPRESENTATION = 6

export interface GeometryInfo {
  profile: string | null
  /** metres */
  length: number | null
  /** square metres */
  area: number | null
}

const num = (v: StepValue | undefined): number | null => {
  if (!v) return null
  if (v.k === 'num') { const n = Number(v.raw); return Number.isFinite(n) ? n : null }
  if (v.k === 'typed') return num(v.value)
  return null
}

/** Project length unit -> metres (first IfcSiUnit / conversion-based LENGTHUNIT). */
export function lengthUnitFactor(f: StepFile): number {
  const PREFIX: Record<string, number> = { MILLI: 1e-3, CENTI: 1e-2, DECI: 1e-1, KILO: 1e3 }
  for (const e of f.entities.values()) {
    const kind = e.args[1]
    if (!kind || kind.k !== 'enum' || kind.v !== 'LENGTHUNIT') continue
    if (e.type === 'IFCSIUNIT') {
      const pre = e.args[2]?.k === 'enum' ? (e.args[2] as { v: string }).v : ''
      return PREFIX[pre] ?? 1
    }
    if (e.type === 'IFCCONVERSIONBASEDUNIT') {
      const name = strValue(e.args[2]).toUpperCase()
      if (name.includes('FOOT') || name === 'FT') return 0.3048
      if (name.includes('INCH') || name === 'IN') return 0.0254
    }
  }
  return 1
}

/** Section area in project units squared, or null for profiles we cannot measure. */
export function profileArea(p: StepEntity): number | null {
  const a = (i: number) => num(p.args[i])
  const pos = (...xs: Array<number | null>) => xs.every((x) => x !== null && x > 0)
  switch (p.type) {
    case 'IFCRECTANGLEPROFILEDEF': { const [x, y] = [a(3), a(4)]; return pos(x, y) ? x! * y! : null }
    case 'IFCRECTANGLEHOLLOWPROFILEDEF': {
      const [x, y, t] = [a(3), a(4), a(5)]
      return pos(x, y, t) && 2 * t! < Math.min(x!, y!) ? x! * y! - (x! - 2 * t!) * (y! - 2 * t!) : null
    }
    case 'IFCCIRCLEPROFILEDEF': { const r = a(3); return pos(r) ? Math.PI * r! * r! : null }
    case 'IFCCIRCLEHOLLOWPROFILEDEF': {
      const [r, t] = [a(3), a(4)]
      return pos(r, t) && t! < r! ? Math.PI * (r! * r! - (r! - t!) * (r! - t!)) : null
    }
    case 'IFCISHAPEPROFILEDEF': { // OverallWidth b, OverallDepth h, WebThickness tw, FlangeThickness tf
      const [b, h, tw, tf] = [a(3), a(4), a(5), a(6)]
      return pos(b, h, tw, tf) ? 2 * b! * tf! + (h! - 2 * tf!) * tw! : null
    }
    case 'IFCLSHAPEPROFILEDEF': { // Depth, Width ($ = Depth), Thickness
      const d = a(3); const w = a(4) ?? d; const t = a(5)
      return pos(d, w, t) ? t! * (d! + w! - t!) : null
    }
    case 'IFCUSHAPEPROFILEDEF': { // Depth, FlangeWidth, WebThickness, FlangeThickness
      const [d, fw, tw, tf] = [a(3), a(4), a(5), a(6)]
      return pos(d, fw, tw, tf) ? 2 * fw! * tf! + (d! - 2 * tf!) * tw! : null
    }
    case 'IFCTSHAPEPROFILEDEF': { // Depth, FlangeWidth, WebThickness, FlangeThickness
      const [d, fw, tw, tf] = [a(3), a(4), a(5), a(6)]
      return pos(d, fw, tw, tf) ? fw! * tf! + (d! - tf!) * tw! : null
    }
    default: return null
  }
}

const ref = (v: StepValue | undefined): number | null => (v && v.k === 'ref' ? v.id : null)
const refs = (v: StepValue | undefined): number[] =>
  v && v.k === 'list' ? v.items.map(ref).filter((x): x is number => x !== null) : []

function solidOfItem(f: StepFile, id: number | null, depth: number): StepEntity | null {
  if (id === null || depth > 8) return null
  const e = f.entities.get(id)
  if (!e) return null
  switch (e.type) {
    case 'IFCEXTRUDEDAREASOLID':
    case 'IFCEXTRUDEDAREASOLIDTAPERED':
    case 'IFCREVOLVEDAREASOLID':
    case 'IFCSURFACECURVESWEPTAREASOLID':
    case 'IFCFIXEDREFERENCESWEPTAREASOLID':
      return e
    case 'IFCBOOLEANRESULT':
    case 'IFCBOOLEANCLIPPINGRESULT':
      return solidOfItem(f, ref(e.args[1]), depth + 1)
    case 'IFCMAPPEDITEM': {
      const map = f.entities.get(ref(e.args[0]) ?? -1)
      const rep = map ? f.entities.get(ref(map.args[1]) ?? -1) : undefined
      return rep ? solidOfRep(f, rep, depth + 1) : null
    }
    default:
      return null
  }
}

function solidOfRep(f: StepFile, rep: StepEntity, depth: number): StepEntity | null {
  for (const item of refs(rep.args[3])) {
    const p = solidOfItem(f, item, depth)
    if (p) return p
  }
  return null
}

export function geometryFromStepFile(f: StepFile): Map<number, GeometryInfo> {
  const unit = lengthUnitFactor(f)
  const out = new Map<number, GeometryInfo>()
  for (const e of f.entities.values()) {
    if (!STEEL_CLASSES.has(e.type)) continue
    const shape = f.entities.get(ref(e.args[PRODUCT_REPRESENTATION]) ?? -1)
    if (!shape) continue
    const reps = refs(shape.args[2]).map((id) => f.entities.get(id)).filter((r): r is StepEntity => !!r)
    // Body first, then whatever else carries a swept solid.
    reps.sort((a, b) => Number(strValue(b.args[1]) === 'Body') - Number(strValue(a.args[1]) === 'Body'))
    for (const rep of reps) {
      const solid = solidOfRep(f, rep, 0)
      if (!solid) continue
      const prof = f.entities.get(ref(solid.args[0]) ?? -1)
      const name = prof ? strValue(prof.args[1]).trim() : ''
      const extruded = solid.type === 'IFCEXTRUDEDAREASOLID' || solid.type === 'IFCEXTRUDEDAREASOLIDTAPERED'
      const depth = extruded ? num(solid.args[3]) : null
      const length = depth !== null && depth > 0 ? depth * unit : null
      const rawArea = prof && solid.type === 'IFCEXTRUDEDAREASOLID' ? profileArea(prof) : null
      const area = rawArea !== null ? rawArea * unit * unit : null
      if (!name && length === null) continue
      out.set(e.id, { profile: name || null, length, area })
      break
    }
  }
  return out
}

export function geometryFromStep(text: string): Map<number, GeometryInfo> {
  return geometryFromStepFile(readStep(text))
}

/** expressId -> ProfileName only. */
export function profileNamesFromStep(text: string): Map<number, string> {
  const out = new Map<number, string>()
  for (const [id, g] of geometryFromStep(text)) if (g.profile) out.set(id, g.profile)
  return out
}
