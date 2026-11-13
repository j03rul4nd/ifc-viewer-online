// ─── scripts/compare-fixtures/make.ts ─────────────────────────────────────────
// Golden fixtures for revision compare (spec 10 §6): small IFCs of the repo,
// mutated the way a new delivery would differ, with the expected changes.
//
//   node --experimental-strip-types --no-warnings --import ./scripts/ebook/ts-hook.mjs scripts/compare-fixtures/make.ts
//
// Writes tests/fixtures/revision/<case>/{a.ifc,b.ifc,expected.json}
// (F8, a set of three files: <case>/{a,b}/<file>.ifc).
//
// web-ifc reads every model (navigation: element → placement → point, element →
// representation → solid → profile) and re-exports F1. The edits themselves are
// applied to the STEP lines by express id, so everything that is not mutated
// stays byte-identical. Each mutation checks that what it edits is not shared
// with another element (else it would change more than the expected element).
//
// expected.json is written from the mutations applied, never from running the
// diff: it is the ground truth the engine is tested against.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as WebIFC from 'web-ifc'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'tests', 'fixtures', 'revision')
const TUNNEL = 'public/models/realtime-lidar/IVO-Utility-Tunnel.ifc'
const PAVILION = 'public/models/video-demo/IVO-Operations-Pavilion.ifc'
const POBLENOU = ['A', 'S', 'M'].map((d) => `public/models/poblenou/BCN-IVO-ZZ-XX-M3-${d}-0001.ifc`)

type Kind = 'added' | 'removed' | 'moved' | 'reshaped' | 'type_changed' | 'properties_changed' | 'relations_changed'
interface Expected { globalIdA?: string; globalIdB?: string; kind: Kind; method: 'guid' | 'tag' | 'geometry' | 'split' | 'none'; file?: string; direction?: string; rotationDeg?: number }

const api = new WebIFC.IfcAPI()
await api.Init()

// ── STEP text, one entity per line ───────────────────────────────────────────

class Step {
  private head: string[] = []
  private tail: string[] = []
  private lines = new Map<number, string>()
  private order: number[] = []
  private max = 0
  readonly model: number
  private guidSeq = 0

  readonly tag: string

  constructor(text: string, tag: string) {
    this.tag = tag
    let inData = false
    for (const raw of text.split(/\r?\n/)) {
      const m = /^#(\d+)\s*=\s*(.*)$/.exec(raw)
      if (m) { inData = true; const id = Number(m[1]); this.lines.set(id, m[2]); this.order.push(id); this.max = Math.max(this.max, id); continue }
      ;(inData ? this.tail : this.head).push(raw)
    }
    this.model = api.OpenModel(new TextEncoder().encode(text))
  }
  close(): void { api.CloseModel(this.model) }

  get(id: number): string { const l = this.lines.get(id); if (l == null) throw new Error(`#${id} missing`); return l }
  set(id: number, body: string): void { if (!this.lines.has(id)) throw new Error(`#${id} missing`); this.lines.set(id, body) }
  add(body: string): number { const id = ++this.max; this.lines.set(id, body); this.order.push(id); return id }
  remove(id: number): void { this.lines.delete(id); this.order = this.order.filter((x) => x !== id) }
  /** Ids of lines that reference #id. */
  referrers(id: number): number[] {
    const re = new RegExp(`#${id}(?![0-9])`)
    return this.order.filter((x) => x !== id && re.test(this.lines.get(x)!))
  }
  only(id: number, by: number, what: string): void {
    const r = this.referrers(id)
    if (r.length !== 1 || r[0] !== by) throw new Error(`${this.tag}: ${what} #${id} is shared (${r.join(',')})`)
  }
  line(id: number): Record<string, any> { return api.GetLine(this.model, id) as Record<string, any> }
  idOf(gid: string): number {
    for (const id of this.order) if (this.lines.get(id)!.includes(`'${gid}'`)) return id
    throw new Error(`${gid} not found`)
  }
  guid(): string { return `0RevCmp${this.tag}${String(++this.guidSeq).padStart(15 - this.tag.length, '0')}` }
  /** Every line id, in file order. */
  ofClassAll(): number[] { return [...this.order] }
  /** Elements of the given IFC classes, in file order. */
  ofClass(...classes: string[]): Array<{ id: number; gid: string }> {
    const out: Array<{ id: number; gid: string }> = []
    for (const id of this.order) {
      const m = /^(IFC[A-Z0-9]+)\('([^']{22})'/.exec(this.lines.get(id)!)
      if (m && classes.includes(m[1])) out.push({ id, gid: m[2] })
    }
    return out
  }
  toString(): string {
    return [...this.head, ...this.order.map((id) => `#${id}=${this.lines.get(id)}`), ...this.tail].join('\n')
  }
}

const num = (v: number): string => { const s = String(Math.round(v * 1e9) / 1e9); return s.includes('.') || s.includes('e') ? s : `${s}.` }

// ── Mutations ────────────────────────────────────────────────────────────────

/** Translate one element: clone its point + axis placement, repoint its local placement. */
function moveElement(s: Step, elId: number, d: [number, number, number], exclusive = true): void {
  const el = s.line(elId)
  const lp = el.ObjectPlacement.value as number
  // exclusive: nothing else is placed relative to it (else children move too).
  if (exclusive) s.only(lp, elId, 'placement')
  const a2p = s.line(lp).RelativePlacement.value as number
  const pt = s.line(a2p).Location.value as number
  const c = (s.line(pt).Coordinates as Array<{ value: number }>).map((v) => v.value)
  const np = s.add(`IFCCARTESIANPOINT((${[0, 1, 2].map((k) => num((c[k] ?? 0) + d[k])).join(',')}));`)
  const na = s.add(s.get(a2p).replace(`#${pt},`, `#${np},`))
  s.set(lp, s.get(lp).replace(new RegExp(`#${a2p}\\)`), `#${na})`))
}

/** The IfcExtrudedAreaSolid of an element's body, checked to be its own. */
function ownSolid(s: Step, elId: number): number {
  const rep = s.line(elId).Representation?.value as number | undefined
  if (!rep) throw new Error('no representation')
  s.only(rep, elId, 'product shape')
  const reps = (s.line(rep).Representations as Array<{ value: number }>).map((r) => r.value)
  for (const r of reps) {
    const sr = s.line(r)
    if (sr.RepresentationIdentifier?.value !== 'Body') continue
    const items = (sr.Items as Array<{ value: number }>).map((i) => i.value)
    if (items.length !== 1 || !/^IFCEXTRUDEDAREASOLID\(/.test(s.get(items[0]))) throw new Error('body is not one extrusion')
    s.only(items[0], r, 'solid')
    return items[0]
  }
  throw new Error('no body')
}

/** Scale the extrusion depth of an element (a wall gets taller, a beam longer). */
function reshapeElement(s: Step, elId: number, factor: number): void {
  const solid = ownSolid(s, elId)
  const body = s.get(solid)
  const m = /,([-0-9.E+]+)\);$/.exec(body)
  if (!m) throw new Error('no depth')
  s.set(solid, body.replace(/,([-0-9.E+]+)\);$/, `,${num(Number(m[1]) * factor)});`))
}

/** Same solid, other mesh: insert the midpoint of every profile edge (collinear points). */
function retessellate(s: Step, elId: number): void {
  const solid = ownSolid(s, elId)
  const prof = s.line(solid).SweptArea.value as number
  s.only(prof, solid, 'profile')
  const curve = s.line(prof).OuterCurve.value as number
  if (!/^IFCINDEXEDPOLYCURVE\(/.test(s.get(curve))) throw new Error('profile is not an indexed polycurve')
  s.only(curve, prof, 'curve')
  const list = s.line(curve).Points.value as number
  s.only(list, curve, 'point list')
  const pts = (s.line(list).CoordList as Array<Array<{ value: number }>>).map((p) => p.map((v) => v.value))
  const dense: number[][] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    dense.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
  }
  s.set(list, `IFCCARTESIANPOINTLIST2D((${dense.map((p) => `(${num(p[0])},${num(p[1])})`).join(',')}));`)
  const idx = [...dense.map((_, i) => i + 1), 1]
  s.set(curve, s.get(curve).replace(/\(IFCLINEINDEX\(\([0-9,]+\)\)\)/, `(IFCLINEINDEX((${idx.join(',')})))`))
}

/** Change one property value of a Pset only this element uses, and give it another material. */
function changeProperties(s: Step, elId: number): string {
  let changed: string | null = null
  for (const rel of s.referrers(elId)) {
    const body = s.get(rel)
    if (!body.startsWith('IFCRELDEFINESBYPROPERTIES(')) continue
    const r = s.line(rel)
    if ((r.RelatedObjects as unknown[]).length !== 1) continue
    const pset = r.RelatingPropertyDefinition.value as number
    if (!s.get(pset).startsWith('IFCPROPERTYSET(')) continue
    for (const p of (s.line(pset).HasProperties as Array<{ value: number }>).map((x) => x.value)) {
      const pb = s.get(p)
      if (!pb.startsWith('IFCPROPERTYSINGLEVALUE(') || s.referrers(p).length !== 1) continue
      const label = /IFC(LABEL|TEXT|IDENTIFIER)\('([^']*)'\)/.exec(pb)
      if (label) { s.set(p, pb.replace(label[0], `IFC${label[1]}('${label[2]} rev B')`)); changed = pb; break }
      const bool = /IFCBOOLEAN\(\.(T|F)\.\)/.exec(pb)
      if (bool) { s.set(p, pb.replace(bool[0], `IFCBOOLEAN(.${bool[1] === 'T' ? 'F' : 'T'}.)`)); changed = pb; break }
    }
    if (changed) break
  }
  if (!changed) throw new Error('no own property to change')
  const mat = s.add(`IFCMATERIAL('Revision B material',$,$);`)
  s.add(`IFCRELASSOCIATESMATERIAL('${s.guid()}',$,$,$,(#${elId}),#${mat});`)
  return changed
}

/** Delete an element and every reference to it in relationship lists. */
function deleteElement(s: Step, elId: number): void {
  const refs = s.referrers(elId)
  for (const r of refs) {
    const body = s.get(r)
    if (!body.startsWith('IFCREL')) throw new Error(`referenced by a non-relationship #${r}`)
    if (/^IFCREL(VOIDS|FILLS|CONNECTS|NESTS|AGGREGATES)/.test(body)) throw new Error('element is connected')
  }
  for (const r of refs) {
    const body = s.get(r)
    const next = body.replace(new RegExp(`#${elId},|,#${elId}(?![0-9])`), '')
    if (next === body) s.remove(r) // the element was the only member → drop the relationship
    else s.set(r, next)
  }
  s.remove(elId)
}

/** Copy an element (same shape, offset), with a new GlobalId, in the same container. */
function addCopy(s: Step, srcId: number, d: [number, number, number]): string {
  const src = s.get(srcId)
  const el = s.line(srcId)
  const lp = el.ObjectPlacement.value as number
  const a2p = s.line(lp).RelativePlacement.value as number
  const pt = s.line(a2p).Location.value as number
  const c = (s.line(pt).Coordinates as Array<{ value: number }>).map((v) => v.value)
  const np = s.add(`IFCCARTESIANPOINT((${[0, 1, 2].map((k) => num((c[k] ?? 0) + d[k])).join(',')}));`)
  const na = s.add(s.get(a2p).replace(`#${pt},`, `#${np},`))
  const nl = s.add(s.get(lp).replace(new RegExp(`#${a2p}\\)`), `#${na})`))
  const gid = s.guid()
  const oldGid = /^IFC[A-Z0-9]+\('([^']{22})'/.exec(src)![1]
  const body = src.replace(`'${oldGid}'`, `'${gid}'`).replace(`#${lp},`, `#${nl},`)
    .replace(/^(IFC[A-Z0-9]+\('[^']+',[^,]*,)'([^']*)'/, `$1'$2 (added)'`)
  const id = s.add(body)
  const cont = s.referrers(srcId).find((r) => s.get(r).startsWith('IFCRELCONTAINEDINSPATIALSTRUCTURE('))
  if (!cont) throw new Error('source not contained')
  s.set(cont, s.get(cont).replace(new RegExp(`#${srcId}(?![0-9])`), `#${srcId},#${id}`))
  return gid
}

/** Give every rooted entity but the project a new GlobalId (an author "regenerating ids" on export). Old → new. */
function regenerateGuids(s: Step, keepClasses: string[] = ['IFCPROJECT']): Record<string, string> {
  const map: Record<string, string> = {}
  for (const id of [...s.ofClassAll()]) {
    const body = s.get(id)
    const m = /^(IFC[A-Z0-9]+)\('([^']{22})'/.exec(body)
    if (!m || keepClasses.includes(m[1])) continue
    const gid = s.guid()
    map[m[2]] = gid
    s.set(id, body.replace(`'${m[2]}'`, `'${gid}'`))
  }
  return map
}

/** Turn one element in plan about its placement origin (new RefDirection). */
function rotateElement(s: Step, elId: number, deg: number): void {
  const lp = s.line(elId).ObjectPlacement.value as number
  s.only(lp, elId, 'placement')
  const a2p = s.line(lp).RelativePlacement.value as number
  s.only(a2p, lp, 'axis placement')
  const body = s.get(a2p)
  const m = /^IFCAXIS2PLACEMENT3D\((#\d+),(#\d+|\$),(#\d+|\$)\);$/.exec(body)
  if (!m) throw new Error('unexpected axis placement')
  if (m[3] !== '$' && !/^IFCDIRECTION\(\(1\.,0\.,0\.\)\);$/.test(s.get(Number(m[3].slice(1))))) throw new Error('already turned')
  if (m[2] !== '$' && !/^IFCDIRECTION\(\(0\.,0\.,1\.\)\);$/.test(s.get(Number(m[2].slice(1))))) throw new Error('not vertical')
  const r = deg * Math.PI / 180
  const dir = s.add(`IFCDIRECTION((${num(Math.cos(r))},${num(Math.sin(r))},0.));`)
  s.set(a2p, `IFCAXIS2PLACEMENT3D(${m[1]},${m[2]},#${dir});`)
}

/**
 * Split a slab whose body is one extrusion of a rectangular point list in two
 * halves along the profile's x: the original line keeps the first half under a
 * new GlobalId, a new slab (same placement, container, psets) takes the other.
 * Returns the two new GlobalIds.
 */
function splitSlab(s: Step, elId: number): [string, string] {
  const solid = ownSolid(s, elId)
  const prof = s.line(solid).SweptArea.value as number
  s.only(prof, solid, 'profile')
  const curve = s.line(prof).OuterCurve.value as number
  s.only(curve, prof, 'curve')
  const list = s.line(curve).Points.value as number
  s.only(list, curve, 'point list')
  const pts = (s.line(list).CoordList as Array<Array<{ value: number }>>).map((p) => p.map((v) => v.value))
  const xs = [...new Set(pts.map((p) => p[0]))], ys = [...new Set(pts.map((p) => p[1]))]
  if (pts.length !== 4 || xs.length !== 2 || ys.length !== 2) throw new Error('profile is not a rectangle')
  const [x0, x1] = xs.sort((a, b) => a - b), [y0, y1] = ys.sort((a, b) => a - b)
  const xm = (x0 + x1) / 2
  const rect = (a: number, b: number): string => `IFCCARTESIANPOINTLIST2D(((${num(a)},${num(y0)}),(${num(b)},${num(y0)}),(${num(b)},${num(y1)}),(${num(a)},${num(y1)})));`
  s.set(list, rect(x0, xm))
  // Second half: its own representation chain.
  const nl = s.add(rect(xm, x1))
  const nc = s.add(s.get(curve).replace(`#${list},`, `#${nl},`))
  const np = s.add(s.get(prof).replace(`#${curve})`, `#${nc})`))
  const ns = s.add(s.get(solid).replace(`#${prof},`, `#${np},`))
  const rep = s.line(elId).Representation.value as number
  const sr = (s.line(rep).Representations as Array<{ value: number }>).map((r) => r.value).find((r) => s.get(r).includes(`(#${solid})`))!
  const nsr = s.add(s.get(sr).replace(`(#${solid})`, `(#${ns})`))
  const npds = s.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${nsr}));`)
  const src = s.get(elId)
  const oldGid = /^IFC[A-Z0-9]+\('([^']{22})'/.exec(src)![1]
  const g1 = s.guid(), g2 = s.guid()
  s.set(elId, src.replace(`'${oldGid}'`, `'${g1}'`))
  const id2 = s.add(src.replace(`'${oldGid}'`, `'${g2}'`).replace(new RegExp(`#${rep},`), `#${npds},`))
  // Same relationships as the original (container, type, psets, material).
  for (const r of s.referrers(elId)) {
    if (r === id2 || !s.get(r).startsWith('IFCREL')) continue
    s.set(r, s.get(r).replace(new RegExp(`#${elId}(?![0-9])`), `#${elId},#${id2}`))
  }
  return [g1, g2]
}

/** Try candidates in order until a mutation applies cleanly. */
function firstThat<T>(cands: Array<{ id: number; gid: string }>, fn: (c: { id: number; gid: string }) => T, skip: Set<number> = new Set()): { id: number; gid: string; out: T } {
  for (const c of cands) {
    if (skip.has(c.id)) continue
    try { return { ...c, out: fn(c) } } catch { /* next */ }
  }
  throw new Error('no candidate fits')
}

// ── Cases ────────────────────────────────────────────────────────────────────

const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

function writeCase(id: string, desc: string, a: string | Record<string, string>, b: string | Record<string, string>, changes: Expected[], extra: Record<string, unknown> = {}): void {
  const dir = join(OUT, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  if (typeof a === 'string') { writeFileSync(join(dir, 'a.ifc'), a); writeFileSync(join(dir, 'b.ifc'), b as string) } else {
    mkdirSync(join(dir, 'a')); mkdirSync(join(dir, 'b'))
    for (const [n, t] of Object.entries(a)) writeFileSync(join(dir, 'a', n), t)
    for (const [n, t] of Object.entries(b as Record<string, string>)) writeFileSync(join(dir, 'b', n), t)
  }
  const counts: Record<string, number> = {}
  for (const c of changes) counts[c.kind] = (counts[c.kind] ?? 0) + 1
  writeFileSync(join(dir, 'expected.json'), JSON.stringify({ id, description: desc, changes, counts, ...extra }, null, 2) + '\n')
  console.log(`${id}: ${changes.length} change(s) ${JSON.stringify(counts)}`)
}

const tunnel = read(TUNNEL)
const walls = (s: Step) => s.ofClass('IFCWALL')

// F1 — re-export with web-ifc, nothing changed.
{
  const s = new Step(tunnel, 'F1')
  const out = new TextDecoder().decode(api.SaveModel(s.model))
  s.close()
  writeCase('F1', 'Re-export (web-ifc SaveModel), no change', tunnel, out, [])
}

// F2 — move one wall 120 mm along +X.
{
  const s = new Step(tunnel, 'F2')
  const w = firstThat(walls(s), (c) => moveElement(s, c.id, [0.12, 0, 0]))
  writeCase('F2', 'One wall moved 120 mm in +X', tunnel, s.toString(), [{ globalIdA: w.gid, globalIdB: w.gid, kind: 'moved', method: 'guid', direction: 'E' }])
  s.close()
}

// F3 — one wall 500 mm taller.
{
  const s = new Step(tunnel, 'F3')
  const w = firstThat(walls(s), (c) => reshapeElement(s, c.id, 6.5 / 6))
  writeCase('F3', 'One wall 6.0 → 6.5 m high', tunnel, s.toString(), [{ globalIdA: w.gid, globalIdB: w.gid, kind: 'reshaped', method: 'guid' }])
  s.close()
}

// F4 — one Pset value and the material of one element.
{
  const s = new Step(tunnel, 'F4')
  const e = firstThat(s.ofClass('IFCBUILDINGELEMENTPROXY', 'IFCSLAB', 'IFCWALL'), (c) => changeProperties(s, c.id))
  writeCase('F4', 'One property value + a material changed on one element', tunnel, s.toString(), [{ globalIdA: e.gid, globalIdB: e.gid, kind: 'properties_changed', method: 'guid' }])
  s.close()
}

// F5 — one added, one removed.
{
  const s = new Step(tunnel, 'F5')
  const proxies = s.ofClass('IFCBUILDINGELEMENTPROXY')
  const del = firstThat([...proxies].reverse(), (c) => deleteElement(s, c.id))
  const add = firstThat(proxies, (c) => addCopy(s, c.id, [0, 0, -0.6]), new Set([del.id]))
  writeCase('F5', 'One service proxy added, another removed', tunnel, s.toString(), [
    { globalIdB: add.out, kind: 'added', method: 'none' },
    { globalIdA: del.gid, kind: 'removed', method: 'none' },
  ])
  s.close()
}

// F6 — IfcWallStandardCase (A) → IfcWall (B): a schema spelling, not a change.
{
  const s = new Step(tunnel, 'F6')
  for (const w of walls(s)) s.set(w.id, s.get(w.id).replace(/^IFCWALL\(/, 'IFCWALLSTANDARDCASE('))
  writeCase('F6', 'IfcWallStandardCase in A, IfcWall in B', s.toString(), tunnel, [])
  s.close()
}

// F7 — whole model 10 m east (site placement).
{
  const s = new Step(tunnel, 'F7')
  const site = s.ofClass('IFCSITE')[0]
  moveElement(s, site.id, [10, 0, 0], false)
  writeCase('F7', 'Whole model shifted 10 m in +X (site placement)', tunnel, s.toString(), [], { originShift: [10, 0, 0] })
  s.close()
}

// F8 — F2+F3+F4+F5 spread over the three Poblenou disciplines.
{
  const names = POBLENOU.map((p) => p.split('/').pop()!)
  const texts = POBLENOU.map(read)
  const [A, S, M] = texts.map((t, i) => new Step(t, `F8${'ASM'[i]}`))
  const exp: Expected[] = []
  // A: one wall moved 120 mm west, one wall copy added.
  const mv = firstThat(A.ofClass('IFCWALL', 'IFCSLAB'), (c) => moveElement(A, c.id, [-0.12, 0, 0]))
  exp.push({ globalIdA: mv.gid, globalIdB: mv.gid, kind: 'moved', method: 'guid', file: names[0], direction: 'W' })
  const ad = firstThat(A.ofClass('IFCWALL', 'IFCSLAB'), (c) => addCopy(A, c.id, [0, 0, 20]), new Set([mv.id]))
  exp.push({ globalIdB: ad.out, kind: 'added', method: 'none', file: names[0] })
  // S: one column 25 % longer, one footing removed.
  const rs = firstThat(S.ofClass('IFCCOLUMN', 'IFCBEAM'), (c) => reshapeElement(S, c.id, 1.25))
  exp.push({ globalIdA: rs.gid, globalIdB: rs.gid, kind: 'reshaped', method: 'guid', file: names[1] })
  const rm = firstThat([...S.ofClass('IFCFOOTING', 'IFCBEAM')].reverse(), (c) => deleteElement(S, c.id), new Set([rs.id]))
  exp.push({ globalIdA: rm.gid, kind: 'removed', method: 'none', file: names[1] })
  // M: one air terminal / duct, property + material.
  const pr = firstThat(M.ofClass('IFCAIRTERMINAL', 'IFCDUCTSEGMENT', 'IFCDUCTFITTING'), (c) => changeProperties(M, c.id))
  exp.push({ globalIdA: pr.gid, globalIdB: pr.gid, kind: 'properties_changed', method: 'guid', file: names[2] })
  const a = Object.fromEntries(names.map((n, i) => [n, texts[i]]))
  const b = Object.fromEntries(names.map((n, i) => [n, [A, S, M][i].toString()]))
  ;[A, S, M].forEach((s) => s.close())
  writeCase('F8', 'Poblenou A/S/M: move + add in A, reshape + remove in S, properties in M', a, b, exp)
}

// F9 — every GlobalId regenerated (project kept), one wall moved 120 mm +X.
{
  const s = new Step(tunnel, 'F9')
  const w = firstThat(walls(s), (c) => moveElement(s, c.id, [0.12, 0, 0]))
  const guidMap = regenerateGuids(s)
  writeCase('F9', 'All GlobalIds regenerated (IfcProject kept) + one wall moved 120 mm in +X', tunnel, s.toString(),
    [{ globalIdA: w.gid, globalIdB: guidMap[w.gid], kind: 'moved', method: 'geometry', direction: 'E' }], { guidMap })
  s.close()
}

// F10 — the pavilion floor slab split in two halves (construction joint).
{
  const pav = read(PAVILION)
  const s = new Step(pav, 'F10')
  const sl = firstThat(s.ofClass('IFCSLAB'), (c) => splitSlab(s, c.id))
  writeCase('F10', 'One slab split in two halves along its profile x (1 → 2)', pav, s.toString(),
    [{ globalIdA: sl.gid, globalIdB: sl.out[0], kind: 'reshaped', method: 'split' }], { parts: sl.out })
  s.close()
}

// F12 — one pavilion column turned 5° in plan about its placement origin.
{
  const pav = read(PAVILION)
  const s = new Step(pav, 'F12')
  const col = firstThat(s.ofClass('IFCCOLUMN'), (c) => rotateElement(s, c.id, 5))
  writeCase('F12', 'One column turned 5° in plan (counter-clockwise)', pav, s.toString(),
    [{ globalIdA: col.gid, globalIdB: col.gid, kind: 'moved', method: 'guid', rotationDeg: 5 }])
  s.close()
}

// F11 — re-tessellation of the Pavilion: same solids, denser profiles.
{
  const pav = read(PAVILION)
  const s = new Step(pav, 'F11')
  let n = 0
  for (const e of s.ofClass('IFCSLAB', 'IFCCOLUMN', 'IFCBEAM')) { try { retessellate(s, e.id); n++ } catch { /* not a polycurve profile */ } }
  if (n === 0) throw new Error('F11: nothing re-tessellated')
  writeCase('F11', `Re-tessellation: ${n} profiles densified with collinear midpoints (same solids)`, pav, s.toString(), [], { retessellated: n })
  s.close()
}
