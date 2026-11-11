// ─── matrix templates by project type ─────────────────────────────────────────
// What a coordinator would set up on day one for each kind of building. Every
// template only uses the disciplines actually loaded (a test whose side has
// none of them is dropped), so a template never produces empty tests.

import { ANY, newTestId, type ClashMatrix, type ClashSelector, type ClashTestDef } from './model'

export type TemplateId = 'residential' | 'office' | 'hospital' | 'industrial' | 'infrastructure'
export const TEMPLATE_IDS: TemplateId[] = ['residential', 'office', 'hospital', 'industrial', 'infrastructure']

const STRUCT = ['IFCBEAM', 'IFCCOLUMN', 'IFCSLAB', 'IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCFOOTING', 'IFCMEMBER']
const DUCT = ['IFCDUCTSEGMENT', 'IFCDUCTFITTING', 'IFCAIRTERMINAL', 'IFCAIRTERMINALBOX']
const PIPE = ['IFCPIPESEGMENT', 'IFCPIPEFITTING', 'IFCVALVE', 'IFCPUMP']
const ELEC = ['IFCCABLECARRIERSEGMENT', 'IFCCABLECARRIERFITTING', 'IFCCABLESEGMENT']
const CEIL = ['IFCCOVERING']
const DOORS = ['IFCDOOR', 'IFCWINDOW', 'IFCSTAIR', 'IFCSTAIRFLIGHT']

interface Spec { name: string; kind: 'hard' | 'clearance'; mm: number; a: [string[], string[]]; b: [string[], string[]] }
const s = (name: string, kind: Spec['kind'], mm: number, a: Spec['a'], b: Spec['b']): Spec => ({ name, kind, mm, a, b })

const MEP = ['M', 'E', 'P']
const SPECS: Record<TemplateId, Spec[]> = {
  residential: [
    s('S × MEP', 'hard', 10, [['S'], STRUCT], [MEP, []]),
    s('A × MEP', 'hard', 20, [['A'], []], [MEP, []]),
    s('A × S', 'hard', 10, [['A'], []], [['S'], []]),
  ],
  office: [
    s('S × MEP', 'hard', 10, [['S'], STRUCT], [MEP, []]),
    s('Ducts × pipes', 'hard', 10, [MEP, DUCT], [MEP, PIPE]),
    s('MEP ↔ ceiling 50 mm', 'clearance', 50, [MEP, [...DUCT, ...PIPE, ...ELEC]], [['A'], CEIL]),
    s('A × S', 'hard', 10, [['A'], []], [['S'], []]),
  ],
  hospital: [
    s('S × MEP', 'hard', 5, [['S'], STRUCT], [MEP, []]),
    s('Ducts × pipes', 'hard', 5, [MEP, DUCT], [MEP, PIPE]),
    s('Ducts ↔ structure 100 mm', 'clearance', 100, [MEP, DUCT], [['S'], STRUCT]),
    s('Cable trays ↔ pipes 150 mm', 'clearance', 150, [MEP, ELEC], [MEP, PIPE]),
    s('MEP × doors and stairs', 'hard', 5, [MEP, []], [['A'], DOORS]),
  ],
  industrial: [
    s('S × MEP', 'hard', 20, [['S'], STRUCT], [MEP, []]),
    s('Pipes ↔ structure 50 mm', 'clearance', 50, [MEP, PIPE], [['S'], STRUCT]),
    s('A × S', 'hard', 20, [['A'], []], [['S'], []]),
  ],
  infrastructure: [
    s('S × services', 'hard', 20, [['S', 'C'], []], [[...MEP, 'X'], []]),
    s('Services ↔ structure 300 mm', 'clearance', 300, [[...MEP, 'X'], []], [['S', 'C'], []]),
  ],
}

export function templateMatrix(id: TemplateId, disciplines: string[]): ClashMatrix {
  const have = new Set(disciplines)
  const sel = ([models, classes]: [string[], string[]]): ClashSelector | null => {
    const m = models.filter((d) => have.has(d))
    return m.length ? { ...ANY, models: m, classes } : null
  }
  const tests: ClashTestDef[] = []
  for (const sp of SPECS[id]) {
    const a = sel(sp.a), b = sel(sp.b)
    if (!a || !b) continue
    tests.push({ id: newTestId(), name: sp.name, kind: sp.kind, tolerance: sp.mm / 1000, a, b, skipSameModel: a.models.join() !== b.models.join() || false, enabled: true })
  }
  return { version: 1, name: id, tests }
}
