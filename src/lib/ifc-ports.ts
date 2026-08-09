// ─── ifc-ports ────────────────────────────────────────────────────────────────
// Which elements in a model carry an IfcDistributionPort.
//
// This is one function and it lives in its own module for one reason: it is the
// answer to a question IFC spells TWO different ways, and reading only the first
// spelling is a bug that reports every correctly-authored IFC4 services model as
// broken. Inside validator.worker.ts that was three lines nobody could test.
//
//   IFC2x3   IfcRelConnectsPortToElement — a relationship joining port to element
//   IFC4     IfcRelNests                 — the port is NESTED under its element,
//                                          and IfcRelConnectsPortToElement is
//                                          DEPRECATED
//
// Both are read, because a validator sees both schemas. The IFC4 form is the one
// IfcOpenShell, Revit and ArchiCAD all write, so missing it meant RULE_CONNECTED_MEP
// fired on every modern duct run it was ever pointed at — including our own
// reference services model, which is how it was finally noticed.
//
// Note what this deliberately does NOT do: decide whether the port is connected
// to ANOTHER port. "Has a port at all" is the question the rule asks, and it is
// the question both schemas answer the same way.

import type { IfcAPI } from 'web-ifc'
import { IFCDISTRIBUTIONPORT, IFCRELCONNECTSPORTTOELEMENT, IFCRELNESTS } from 'web-ifc'

interface Ref { value?: number | null }

/** Express ids of every element that has at least one distribution port. */
export function collectPortedElements(api: IfcAPI, modelId: number): Set<number> {
  const ported = new Set<number>()

  // IFC2x3.
  const legacy = api.GetLineIDsWithType(modelId, IFCRELCONNECTSPORTTOELEMENT)
  for (let i = 0; i < legacy.size(); i++) {
    try {
      const rel = api.GetLine(modelId, legacy.get(i), false) as unknown as { RelatedElement?: Ref | null }
      const id = rel.RelatedElement?.value
      if (id != null) ported.add(id)
    } catch { continue }
  }

  // IFC4. Nesting is used for plenty of things that are not ports, so the
  // related objects are checked against the actual set of ports rather than
  // assumed — an element that nests a covering is not a connected duct.
  const portIds = new Set<number>()
  const ports = api.GetLineIDsWithType(modelId, IFCDISTRIBUTIONPORT)
  for (let i = 0; i < ports.size(); i++) portIds.add(ports.get(i))
  if (portIds.size === 0) return ported

  const nests = api.GetLineIDsWithType(modelId, IFCRELNESTS)
  for (let i = 0; i < nests.size(); i++) {
    try {
      const rel = api.GetLine(modelId, nests.get(i), false) as unknown as {
        RelatingObject?: Ref | null
        RelatedObjects?: Ref[]
      }
      const host = rel.RelatingObject?.value
      if (host == null) continue
      for (const ref of rel.RelatedObjects ?? []) {
        if (ref?.value != null && portIds.has(ref.value)) { ported.add(host); break }
      }
    } catch { continue }
  }

  return ported
}
