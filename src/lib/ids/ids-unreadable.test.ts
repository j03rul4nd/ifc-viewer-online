// ─── ids-unreadable tests ─────────────────────────────────────────────────────
// The gather wraps every per-entity read so one bad line cannot abort a check
// over the rest of the model. That is correct. What is not correct is doing it
// silently: a skipped element never becomes applicable to any specification, so
// it leaves BOTH sides of the score's ratio and every spec can still report
// `pass`. These tests pin the counter that makes that visible.
//
// Built on a real buildingSMART fixture (loaded through Vite's glob — no node:fs,
// which would break `tsc -b` under src/), grown to ten walls and then damaged one
// line at a time. Synthetic IdsElement[] could not exercise this: the skips only
// happen inside web-ifc's line reader, and whether it tolerates a given damage or
// throws is a property of web-ifc, not of our code.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { IfcAPI } from 'web-ifc'
import { parseIds } from './ids-parser'
import { runIdsChecks } from './ids-engine'
import { gatherIdsElements } from './ids-gather'
import type { IdsDocument } from './ids-types'

const FIX = 'property/pass-a_property_set_to_true_will_pass_a_name_check'
const idsFiles = import.meta.glob('./ids-fixtures/**/*.ids', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ifcFiles = import.meta.glob('./ids-fixtures/**/*.ifc', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function fixture(map: Record<string, string>, rel: string): string {
  const content = map[`./ids-fixtures/${rel}`]
  if (content == null) throw new Error(`Fixture not found: ${rel} — run node scripts/ids/fetch-testcases.mjs`)
  return content
}

/**
 * The one-wall fixture grown to `n` walls, each with the Foo_Bar/Foo property the
 * fixture's IDS requires. Ten walls make the failure mode legible: nine of ten
 * checked still reports a flawless 100.
 */
function grow(clean: string, n: number): string {
  const head = clean.slice(0, clean.indexOf('#7=IFCWALL'))
  const body: string[] = []
  let next = 7
  for (let w = 0; w < n; w++) {
    const wall = next++, pset = next++, rel = next++, prop = next++
    const tag = String(w).padStart(2, '0')
    body.push(`#${wall}=IFCWALL('2nJrDaLQfJ1QPhdJR0o9${tag}',$,$,$,$,$,$,$,$);`)
    body.push(`#${pset}=IFCPROPERTYSET('16MocU_IDOF8_x3Iqllz${tag}',$,'Foo_Bar',$,(#${prop}));`)
    body.push(`#${rel}=IFCRELDEFINESBYPROPERTIES('1xdwj8qGXK4hzoNbvMdX${tag}',$,$,$,(#${wall}),#${pset});`)
    body.push(`#${prop}=IFCPROPERTYSINGLEVALUE('Foo',$,IFCBOOLEAN(.T.),$);`)
  }
  return `${head}${body.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`
}

/** Replace the entity keyword of the line carrying `marker` with an unknown one. */
function damage(ifc: string, marker: string): string {
  const lines = ifc.split('\n')
  const i = lines.findIndex((l) => l.includes(marker))
  if (i < 0) throw new Error(`marker not in fixture: ${marker}`)
  lines[i] = lines[i].replace(/=IFC([A-Z]+)\(/, '=IFC$1ZZ(')
  return lines.join('\n')
}

let api: IfcAPI
let doc: IdsDocument
let tenWalls: string

beforeAll(async () => {
  api = new IfcAPI()
  await api.Init()
  doc = parseIds(fixture(idsFiles, `${FIX}.ids`))
  tenWalls = grow(fixture(ifcFiles, `${FIX}.ifc`), 10)
}, 30_000)

afterAll(() => {
  api?.Dispose?.()
})

/** Gather + check one IFC source, counting what the gather could not read. */
async function check(ifc: string): Promise<{ unreadable: number; gathered: number; score: number; status: string }> {
  const modelId = api.OpenModel(new TextEncoder().encode(ifc))
  try {
    let unreadable = 0
    const elements = await gatherIdsElements(api, modelId, doc, { onUnreadable: () => { unreadable++ } })
    const result = runIdsChecks(doc, elements, { modelSchema: api.GetModelSchema(modelId) })
    return { unreadable, gathered: elements.length, score: result.score, status: result.specs[0].status }
  } finally {
    api.CloseModel(modelId)
  }
}

describe('gather honesty: unreadable entities', () => {
  it('counts nothing on an intact model', async () => {
    const clean = await check(tenWalls)
    expect(clean.gathered).toBe(10)
    expect(clean.unreadable).toBe(0)
    expect(clean.score).toBe(100)
  })

  it('counts the element it silently dropped — the score alone cannot show it', async () => {
    const broken = await check(damage(tenWalls, '2nJrDaLQfJ1QPhdJR0o904'))

    // The element is gone from the check entirely…
    expect(broken.gathered).toBe(9)
    // …and this is the whole point: the report still reads as a flawless pass.
    // Nine of ten walls were verified and the score says 100 either way, so the
    // count is the ONLY thing standing between the user and a false all-clear.
    expect(broken.score).toBe(100)
    expect(broken.status).toBe('pass')
    expect(broken.unreadable).toBeGreaterThan(0)
  })

  // Exact counts on purpose. Damaging a property-set line trips TWO different
  // routes — the main walk cannot resolve that line's class, and the pset pass
  // throws inside web-ifc's line reader — so the number distinguishes them: drop
  // the counter from either site and this reads 1 instead of 2.
  it('counts an unreadable property-set line from both routes that see it', async () => {
    const broken = await check(damage(tenWalls, '16MocU_IDOF8_x3Iqllz04'))
    expect(broken.gathered).toBe(10)
    expect(broken.unreadable).toBe(2)
    // The wall is now reported as missing the property — but the property is
    // there; it just could not be read. Without the count the user would go fix
    // the model data instead of the file.
    expect(broken.score).toBe(90)
    expect(broken.status).toBe('fail')
  })

  it('counts an unreadable property line from both routes that see it', async () => {
    const broken = await check(damage(tenWalls, "PROPERTYSINGLEVALUE('Foo'"))
    expect(broken.gathered).toBe(10)
    expect(broken.unreadable).toBe(2)
    expect(broken.score).toBe(90)
  })

  it('counts an unreadable relationship, which costs the element its properties', async () => {
    // Different shape: the wall is readable but its pset link is not, so the
    // property requirement fails for a reason that is not the model's fault.
    const broken = await check(damage(tenWalls, '1xdwj8qGXK4hzoNbvMdX07'))
    expect(broken.gathered).toBe(10)
    expect(broken.score).toBeLessThan(100)
    expect(broken.unreadable).toBeGreaterThan(0)
  })

  it('reports the count even when every element is unreadable', async () => {
    let ifc = tenWalls
    for (let w = 0; w < 10; w++) ifc = damage(ifc, `2nJrDaLQfJ1QPhdJR0o9${String(w).padStart(2, '0')}`)
    const broken = await check(ifc)
    expect(broken.gathered).toBe(0)
    expect(broken.unreadable).toBeGreaterThanOrEqual(10)
  })

  // The counter is only useful if it stays quiet on valid files. Detection works
  // by class-name shape (isResolvedIfcClass), so this sweeps every real
  // buildingSMART fixture in the repo to prove the shape test never mistakes a
  // legitimate entity for an unreadable one.
  it('stays at zero across every buildingSMART fixture', async () => {
    const noisy: string[] = []
    for (const [path, text] of Object.entries(ifcFiles)) {
      const modelId = api.OpenModel(new TextEncoder().encode(text))
      try {
        let unreadable = 0
        await gatherIdsElements(api, modelId, doc, { onUnreadable: () => { unreadable++ } })
        if (unreadable > 0) noisy.push(`${path} → ${unreadable}`)
      } finally {
        api.CloseModel(modelId)
      }
    }
    expect(Object.keys(ifcFiles).length).toBeGreaterThan(20) // the sweep is real
    expect(noisy).toEqual([])
  }, 60_000)

  it('leaves the hook optional — callers that pass none still gather', async () => {
    const modelId = api.OpenModel(new TextEncoder().encode(damage(tenWalls, '2nJrDaLQfJ1QPhdJR0o903')))
    try {
      await expect(gatherIdsElements(api, modelId, doc)).resolves.toHaveLength(9)
    } finally {
      api.CloseModel(modelId)
    }
  })
})
