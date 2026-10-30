// ─── bulk-bind ────────────────────────────────────────────────────────────────
// A real building does not have six sensors, it has six hundred — and nobody
// binds them one click at a time. The facts that connect them usually already
// exist on both sides: the BMS calls a meter "FLAT-101", the IFC has a space
// named "Flat 101"; the parking API reports "P-07", the model has "Parking P7".
//
// This pairs a source's devices with elements by comparing a device field (its
// id by default) with an element's Name or GlobalId, and makes one binding per
// device that finds its elements, sharing the rules of a template binding.
//
// Comparison is by TOKENS, not substrings: "bay-1" matches "Bay 1" but never
// "Bay 10"; numbers lose leading zeros ("P01" = "P1"); case, accents and
// separators do not count.

import { classMatches, newTwinId, type Binding, type CatalogEntry, type ElementRef, type Reading } from './devices'

export type MatchElementKey = 'name' | 'globalId'
export type MatchMode = 'equals' | 'contains'

export interface BulkMatchOptions {
  /** Device field compared ('' = the device id). */
  deviceField: string
  elementKey: MatchElementKey
  /** equals: same tokens; contains: the element's tokens include the device's, in order. */
  mode: MatchMode
  /** Only elements of these classes (`Prefix*` allowed); empty = any. */
  classes: string[]
}

export interface BulkMatch { reading: Reading; value: string; targets: ElementRef[] }

export interface BulkPlan {
  matched: BulkMatch[]
  /** Devices whose value found no element (value shown to the user). */
  unmatched: Array<{ deviceId: string; value: string }>
  /** Distinct elements reached. */
  elements: number
}

/** "Flat 101-B" → ["flat", "101", "b"]; "P01" → ["p", "1"]. */
export function matchTokens(s: string): string[] {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Split letters from digits ("p01" → "p 01") so "P01" and "P-1" compare equal.
    .replace(/([a-z])(\d)/g, '$1 $2').replace(/(\d)([a-z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? String(Number(t)) : t))
}

function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

function deviceValue(r: Reading, field: string): string {
  if (!field) return r.deviceId
  const p = r.props.find((x) => x.field === field && !x.joined && x.value !== null)
  return p ? p.display : ''
}

interface Candidate { ref: ElementRef; tokens: string[]; guid: string }
interface BulkIndex { byExact: Map<string, ElementRef[]>; byToken: Map<string, Candidate[]> }

const indexCache = new WeakMap<CatalogEntry[], Map<string, BulkIndex>>()

/** The catalog ready to match against, remembered per catalog and per set of options. */
function bulkIndex(catalog: CatalogEntry[], o: BulkMatchOptions): BulkIndex {
  let perOptions = indexCache.get(catalog)
  if (!perOptions) indexCache.set(catalog, perOptions = new Map())
  const key = JSON.stringify([o.elementKey, o.mode, o.classes])
  const hit = perOptions.get(key)
  if (hit) return hit
  // One candidate per GlobalId: a binding by GlobalId already reaches every model that has it.
  const seen = new Set<string>()
  const byToken = new Map<string, Candidate[]>()
  const byExact = new Map<string, ElementRef[]>()
  for (const e of catalog) {
    if (!e.globalId || seen.has(e.globalId)) continue
    if (o.classes.length && !o.classes.some((c) => classMatches(c, e.ifcClass))) continue
    seen.add(e.globalId)
    const raw = o.elementKey === 'name' ? e.name : e.globalId
    if (!raw) continue
    const c: Candidate = { ref: { globalId: e.globalId, label: e.name || e.ifcClass }, tokens: matchTokens(raw), guid: e.globalId }
    if (o.mode === 'equals') {
      const k = o.elementKey === 'globalId' ? c.guid : c.tokens.join(' ')
      const list = byExact.get(k)
      if (list) list.push(c.ref); else byExact.set(k, [c.ref])
    } else {
      for (const tok of new Set(c.tokens)) {
        const list = byToken.get(tok)
        if (list) list.push(c); else byToken.set(tok, [c])
      }
    }
  }
  const index = { byExact, byToken }
  perOptions.set(key, index)
  return index
}

/** Pair devices with elements. Pure; the panel previews it before creating anything. */
export function planBulkBind(readings: Reading[], catalog: CatalogEntry[], o: BulkMatchOptions): BulkPlan {
  const { byExact, byToken } = bulkIndex(catalog, o)
  const plan: BulkPlan = { matched: [], unmatched: [], elements: 0 }
  const reached = new Set<string>()
  for (const r of readings) {
    const value = deviceValue(r, o.deviceField)
    const tokens = matchTokens(value)
    let targets: ElementRef[] = []
    if (tokens.length) {
      if (o.mode === 'equals') targets = byExact.get(o.elementKey === 'globalId' ? value.trim() : tokens.join(' ')) ?? []
      else {
        // Only elements holding the device's RAREST token can contain the whole
        // run: comparing every device with every element took 6.6 s for 1 000
        // devices and 200 k elements, on each new reading.
        let pool: Candidate[] = []
        for (let i = 0; i < tokens.length; i++) {
          const list = byToken.get(tokens[i]) ?? []
          if (i === 0 || list.length < pool.length) pool = list
        }
        targets = pool.filter((c) => containsRun(c.tokens, tokens)).map((c) => c.ref)
      }
    }
    if (targets.length === 0) { plan.unmatched.push({ deviceId: r.deviceId, value }); continue }
    targets.forEach((t) => reached.add(t.globalId))
    plan.matched.push({ reading: r, value, targets })
  }
  plan.elements = reached.size
  return plan
}

/**
 * One binding per matched device, with the template's rules (fresh ids), label,
 * image metric and staleness. Devices that already have a binding in
 * `existing` are skipped, so running it twice does not duplicate anything.
 */
export function bulkBindings(plan: BulkPlan, template: Binding | null, existing: Binding[]): Binding[] {
  const bound = new Set(existing.map((b) => `${b.sourceId}/${b.deviceId}`))
  const out: Binding[] = []
  for (const m of plan.matched) {
    const { sourceId, deviceId } = m.reading
    if (bound.has(`${sourceId}/${deviceId}`)) continue
    const first = m.targets[0].label
    out.push({
      id: newTwinId('b'),
      name: m.targets.length > 1 ? `${first} +${m.targets.length - 1} · ${deviceId}` : `${first} · ${deviceId}`,
      sourceId, deviceId,
      targets: m.targets,
      rules: (template?.rules ?? []).map((r) => ({ ...r, id: newTwinId('r'), filters: r.filters.map((f) => ({ ...f })), effect: { ...r.effect } })),
      staleColor: template?.staleColor ?? null,
      staleAfterS: template?.staleAfterS ?? 0,
      label: template?.label ?? null,
      media: template?.media ?? null,
    })
  }
  return out
}
