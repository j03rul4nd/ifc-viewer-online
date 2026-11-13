// ─── The rules studio on a real model ────────────────────────────────────────
// Tests and Coverage run the rules on a list of elements. In the preview that
// list is the sample; in the workspace it comes from an IFC the person opens:
// the IDS worker (same gather as every IDS check) reads every element and
// spatial object with its attributes and property sets. The catch-all spec
// (entity pattern IFC.*) makes the gather take all classes, not only the ones
// the rules name, so Coverage can say what no rule checks. The rules' own specs
// ride along so the classification / material passes run when a rule needs them.

import { runIds } from '../../../../lib/ids/ids-runner'
import type { IdsDocument, IdsElement, IdsSpecification } from '../../../../lib/ids/ids-types'
import { ruleToSpec } from '../../../../lib/eir/eir-compiler'
import type { EirRule } from '../../../../lib/eir/eir-types'

const ALL: IdsSpecification = {
  name: 'All elements', cardinality: 'optional',
  applicability: [{ kind: 'entity', name: { restriction: { pattern: 'IFC.*' } } }],
  requirements: [],
}

export function studioDoc(rules: EirRule[]): IdsDocument {
  const specs = rules.map((r) => ruleToSpec(r)).filter((s): s is IdsSpecification => Boolean(s))
  return { title: 'Rules studio', specifications: [ALL, ...specs] }
}

export interface ModelElements { name: string; elements: IdsElement[] }

/** Read the elements of an IFC in a worker. Throws IdsCheckError when the file does not open. */
export async function modelElements(name: string, buffer: ArrayBuffer, rules: EirRule[], onProgress?: (pct: number) => void): Promise<ModelElements> {
  const out = await runIds(studioDoc(rules), buffer, { returnElements: true, onProgress })
  return { name, elements: out.elements ?? [] }
}
