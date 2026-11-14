// ─── profile names from the geometry ──────────────────────────────────────────
// Pure: IFC STEP text → expressId → IfcProfileDef.ProfileName of the element's
// body (IfcExtrudedAreaSolid.SweptArea). Uses the dependency-free STEP reader
// of the auto-fix; runs in a worker (workers/steel-profiles.worker.ts).
// Follows mapped items and boolean results to the first swept solid.

import { readStep, strValue, type StepEntity, type StepFile, type StepValue } from '../autofix/step'

const STEEL_CLASSES = new Set(['IFCBEAM', 'IFCCOLUMN', 'IFCMEMBER', 'IFCPLATE', 'IFCMECHANICALFASTENER', 'IFCELEMENTASSEMBLY',
  'IFCBEAMSTANDARDCASE', 'IFCCOLUMNSTANDARDCASE', 'IFCMEMBERSTANDARDCASE', 'IFCPLATESTANDARDCASE'])

/** IfcProduct attribute index of Representation (GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation). */
const PRODUCT_REPRESENTATION = 6

const ref = (v: StepValue | undefined): number | null => (v && v.k === 'ref' ? v.id : null)
const refs = (v: StepValue | undefined): number[] =>
  v && v.k === 'list' ? v.items.map(ref).filter((x): x is number => x !== null) : []

function profileOfItem(f: StepFile, id: number | null, depth: number): string | null {
  if (id === null || depth > 8) return null
  const e = f.entities.get(id)
  if (!e) return null
  switch (e.type) {
    case 'IFCEXTRUDEDAREASOLID':
    case 'IFCEXTRUDEDAREASOLIDTAPERED':
    case 'IFCREVOLVEDAREASOLID':
    case 'IFCSURFACECURVESWEPTAREASOLID':
    case 'IFCFIXEDREFERENCESWEPTAREASOLID': {
      const prof = f.entities.get(ref(e.args[0]) ?? -1)
      const name = prof ? strValue(prof.args[1]).trim() : ''
      return name || null
    }
    case 'IFCBOOLEANRESULT':
    case 'IFCBOOLEANCLIPPINGRESULT':
      return profileOfItem(f, ref(e.args[1]), depth + 1)
    case 'IFCMAPPEDITEM': {
      const map = f.entities.get(ref(e.args[0]) ?? -1)
      const rep = map ? f.entities.get(ref(map.args[1]) ?? -1) : undefined
      return rep ? profileOfRep(f, rep, depth + 1) : null
    }
    default:
      return null
  }
}

function profileOfRep(f: StepFile, rep: StepEntity, depth: number): string | null {
  for (const item of refs(rep.args[3])) {
    const p = profileOfItem(f, item, depth)
    if (p) return p
  }
  return null
}

export function profileNamesFromStepFile(f: StepFile): Map<number, string> {
  const out = new Map<number, string>()
  for (const e of f.entities.values()) {
    if (!STEEL_CLASSES.has(e.type)) continue
    const shape = f.entities.get(ref(e.args[PRODUCT_REPRESENTATION]) ?? -1)
    if (!shape) continue
    const reps = refs(shape.args[2]).map((id) => f.entities.get(id)).filter((r): r is StepEntity => !!r)
    // Body first, then whatever else carries a swept solid.
    reps.sort((a, b) => Number(strValue(b.args[1]) === 'Body') - Number(strValue(a.args[1]) === 'Body'))
    for (const rep of reps) {
      const p = profileOfRep(f, rep, 0)
      if (p) { out.set(e.id, p); break }
    }
  }
  return out
}

export function profileNamesFromStep(text: string): Map<number, string> {
  return profileNamesFromStepFile(readStep(text))
}
