// ─── Diff application for the IFC export ──────────────────────────────────────
// Writes non-destructive EditDiffs into an open web-ifc model. Kept apart from
// export.worker.ts so it can run in node against a real IfcAPI: the worker
// module installs `self.onmessage` on import, which a node test cannot load.
// Pure apart from the `api` argument.
//
// Two things about web-ifc 0.0.77's writer that this module works around, both
// measured in export-apply.test.ts against the real library:
//
//  1. Text encoding is only half done. SaveModel doubles a quote and writes
//     BMP non-ASCII as \X2\…\X0\, but writes a backslash RAW (which the STEP
//     reader then takes as the start of an escape, so the name reads back
//     wrong or empty) and aborts the whole save on a character outside the
//     BMP (an emoji in a storey name). Reading decodes all of these, so every
//     text value on a line we rewrite — not only the one we changed — goes back
//     through `encodeStepText` first.
//  2. Reading a line back after writing it is not faithful: once a value with a
//     quote has been written, GetLine returns that value as ''. A second diff on
//     the same element (a GUID fix after a rename to "O'Brien") would then
//     write the empty Name into the file. `applyDiffs` keeps its own copy of
//     every line it wrote and reads from that instead.
//  3. Reading the ORIGINAL file is not faithful either for text that is not
//     valid STEP: a backslash that starts no escape ('a\b', an unescaped
//     Windows path in a Description) reads back as ''. Rewriting such a line
//     to change its Name would write that '' and silently blank the other
//     text. `findLossyLines` spots those lines from the file bytes, and
//     `applyDiffs` skips (and counts) a diff on one, so the loss shows up as
//     "N edits could not be written" instead of vanishing. REPARENT rewrites
//     relationship lines found while applying, which this does not cover.

import { IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE, type IfcAPI } from 'web-ifc'
import { degreesToCompoundAngle } from '../lib/geo/geo-math'
import type { EditDiff } from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLine = any

/** Lines one export has written so far, keyed by expressId, as decoded text. */
export type WrittenLines = Map<number, AnyLine>

/** web-ifc's value tag for STRING (IfcLabel, IfcText, IfcIdentifier…). */
const STRING_TAG = 1

/**
 * Encode the part of STEP string escaping web-ifc leaves undone: the
 * backslash, and characters outside the BMP (\X4\). Quotes and BMP non-ASCII
 * are left alone because the writer does those itself — encoding them here as
 * well would put the escape sequence into the file as literal text.
 */
export function encodeStepText(s: string): string {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    if (ch === '\\') out += '\\\\'
    else if (cp > 0xffff) out += `\\X4\\${cp.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`
    else out += ch
  }
  return out
}

function encodeValue(v: AnyLine): AnyLine {
  if (v && typeof v === 'object' && v.type === STRING_TAG && typeof v.value === 'string') {
    return { ...v, value: encodeStepText(v.value) }
  }
  return v
}

/** A copy of `line` with every text value encoded for the writer. */
function encodeLineText(line: AnyLine): AnyLine {
  const out: AnyLine = { ...line }
  for (const key of Object.keys(out)) {
    const v = out[key]
    out[key] = Array.isArray(v) ? v.map(encodeValue) : encodeValue(v)
  }
  return out
}

function readLine(api: IfcAPI, modelId: number, expressId: number, written?: WrittenLines): AnyLine {
  const mine = written?.get(expressId)
  // A copy, so a diff that throws half way leaves the stored line as written.
  return mine ? structuredClone(mine) : api.GetLine(modelId, expressId, false)
}

function writeLine(api: IfcAPI, modelId: number, line: AnyLine, written?: WrittenLines): void {
  api.WriteLine(modelId, encodeLineText(line))
  written?.set(line.expressID, line)
}

/**
 * Apply one diff. Pass the same `written` map for every diff of one export —
 * `applyDiffs` does — or a later diff on the same element can undo an earlier one.
 */
export function applyDiff(api: IfcAPI, modelId: number, diff: EditDiff, written?: WrittenLines): void {
  if (diff.type === 'RENAME') {
    const line: AnyLine = readLine(api, modelId, diff.expressId, written)
    const strVal = { type: STRING_TAG, value: diff.newValue }
    if      (diff.field === 'Name')        line.Name        = strVal
    else if (diff.field === 'LongName')    line.LongName    = strVal
    else if (diff.field === 'Description') line.Description = strVal
    writeLine(api, modelId, line, written)

  } else if (diff.type === 'FIX_GUID') {
    const line: AnyLine = readLine(api, modelId, diff.expressId, written)
    line.GlobalId = { type: STRING_TAG, value: diff.newGuid }
    writeLine(api, modelId, line, written)

  } else if (diff.type === 'SET_PROPERTY') {
    const line: AnyLine = readLine(api, modelId, diff.propExpressId, written)
    line.NominalValue = { type: STRING_TAG, value: diff.newValue }
    writeLine(api, modelId, line, written)

  } else if (diff.type === 'SET_GEOREF') {
    // Value shapes here are NOT interchangeable — web-ifc's serializer reads
    // `type` (and, for NumberHandle-derived measures, `name`) off each value,
    // so a plausible-looking wrapper silently throws during SaveModel:
    //   RefLatitude/RefLongitude — IfcCompoundPlaneAngleMeasure: ONE object
    //     wrapping the whole integer list, `{ type: 10, value: number[] }`.
    //     (An array of per-element tagged values is the intuitive guess and is
    //     wrong — verified against web-ifc's own class definitions.)
    //   RefElevation — IfcLengthMeasure: `{ type: 4, value, name }`.
    // Existing objects are mutated in place where present, so anything the
    // schema carries that we do not model survives the round-trip.
    const line: AnyLine = readLine(api, modelId, diff.expressId, written)
    const lat = degreesToCompoundAngle(diff.lat)
    const lon = degreesToCompoundAngle(diff.lon)
    if (!lat || !lon) throw new Error('invalid georeference coordinates')

    const setCompound = (field: 'RefLatitude' | 'RefLongitude', parts: number[]): void => {
      const existing = line[field]
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) existing.value = parts
      else line[field] = { type: 10, value: parts }
    }
    setCompound('RefLatitude', lat)
    setCompound('RefLongitude', lon)

    if (diff.elevationM !== null) {
      const existing = line.RefElevation
      if (existing && typeof existing === 'object') existing.value = diff.elevationM
      else line.RefElevation = { type: 4, value: diff.elevationM, name: 'IFCLENGTHMEASURE' }
    }
    writeLine(api, modelId, line, written)

  } else if (diff.type === 'REPARENT') {
    const aggIds  = api.GetLineIDsWithType(modelId, IFCRELAGGREGATES)
    const contIds = api.GetLineIDsWithType(modelId, IFCRELCONTAINEDINSPATIALSTRUCTURE)

    // Remove from old aggregation
    for (let i = 0; i < aggIds.size(); i++) {
      const rel: AnyLine = readLine(api, modelId, aggIds.get(i), written)
      if (rel.RelatingObject?.value !== diff.oldParentExpressId) continue
      const before: AnyLine[] = rel.RelatedObjects ?? []
      const after = before.filter((r: AnyLine) => r?.value !== diff.expressId)
      if (after.length === before.length) continue
      rel.RelatedObjects = after
      writeLine(api, modelId, rel, written)
      break
    }

    // Remove from old containment
    for (let i = 0; i < contIds.size(); i++) {
      const rel: AnyLine = readLine(api, modelId, contIds.get(i), written)
      if (rel.RelatingStructure?.value !== diff.oldParentExpressId) continue
      const before: AnyLine[] = rel.RelatedElements ?? []
      const after = before.filter((r: AnyLine) => r?.value !== diff.expressId)
      if (after.length === before.length) continue
      rel.RelatedElements = after
      writeLine(api, modelId, rel, written)
      break
    }

    // Add to new parent — try aggregation first, then containment
    let added = false
    for (let i = 0; i < aggIds.size(); i++) {
      const rel: AnyLine = readLine(api, modelId, aggIds.get(i), written)
      if (rel.RelatingObject?.value !== diff.newParentExpressId) continue
      rel.RelatedObjects = [...(rel.RelatedObjects ?? []), { type: 5, value: diff.expressId }]
      writeLine(api, modelId, rel, written)
      added = true
      break
    }
    if (!added) {
      for (let i = 0; i < contIds.size(); i++) {
        const rel: AnyLine = readLine(api, modelId, contIds.get(i), written)
        if (rel.RelatingStructure?.value !== diff.newParentExpressId) continue
        rel.RelatedElements = [...(rel.RelatedElements ?? []), { type: 5, value: diff.expressId }]
        writeLine(api, modelId, rel, written)
        break
      }
    }
  }
}

// ── Lines web-ifc cannot read back whole ─────────────────────────────────────

/** The line a diff rewrites, when it is known up front (REPARENT finds its own). */
export function targetLineOf(diff: EditDiff): number | undefined {
  switch (diff.type) {
    case 'RENAME':
    case 'FIX_GUID':
    case 'SET_GEOREF':    return diff.expressId
    case 'SET_PROPERTY':  return diff.propExpressId
    default:              return undefined
  }
}

/** Every line `diffs` rewrite that is known up front. */
export function lineIdsOf(diffs: readonly EditDiff[]): Set<number> {
  const ids = new Set<number>()
  for (const d of diffs) {
    const id = targetLineOf(d)
    if (id !== undefined) ids.add(id)
  }
  return ids
}

/** Text values among raw line arguments: strings and typed text (IFCLABEL('x')), never enums. */
function textValues(args: unknown, out: string[] = []): string[] {
  if (Array.isArray(args)) {
    for (const a of args) textValues(a, out)
  } else if (args && typeof args === 'object') {
    const v = args as { type?: unknown; value?: unknown }
    if ((v.type === 1 || v.type === 2) && typeof v.value === 'string') out.push(v.value)
    else if (Array.isArray(v.value)) textValues(v.value, out)
  }
  return out
}

/** Quoted literals with something between the quotes, in one instance's STEP text. */
export function nonEmptyLiterals(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "'") continue
    let length = 0
    i++
    while (i < text.length) {
      if (text[i] === "'") {
        if (text[i + 1] === "'") { length++; i += 2; continue } // '' is an escaped quote
        break
      }
      length++
      i++
    }
    if (length > 0) count++
  }
  return count
}

const latin1 = new TextDecoder('latin1')

/**
 * The STEP text of each wanted instance ("#12=IFCWALL(…);"), read straight
 * from the file bytes in one pass. Strings and comments are skipped as such,
 * so a ';' or a '#' inside them never starts or ends an instance.
 */
export function instanceTexts(bytes: Uint8Array, ids: ReadonlySet<number>): Map<number, string> {
  const out = new Map<number, string>()
  if (ids.size === 0) return out
  const n = bytes.length
  let inString = false
  let atStatement = true // just after ';' (or at the start), whitespace aside
  let i = 0
  while (i < n) {
    const c = bytes[i]
    if (inString) {
      if (c === 0x27) inString = false // a doubled quote closes and reopens: same result
      i++
      continue
    }
    if (c === 0x27) { inString = true; atStatement = false; i++; continue }
    if (c === 0x2f && bytes[i + 1] === 0x2a) { // /* comment */
      i += 2
      while (i < n && !(bytes[i] === 0x2a && bytes[i + 1] === 0x2f)) i++
      i += 2
      continue
    }
    if (c === 0x3b) { atStatement = true; i++; continue }
    if (atStatement && c === 0x23) { // '#' opening an instance
      let j = i + 1
      let id = 0
      while (j < n && bytes[j] >= 0x30 && bytes[j] <= 0x39) { id = id * 10 + (bytes[j] - 0x30); j++ }
      atStatement = false
      if (j > i + 1 && ids.has(id)) {
        let k = j
        let str = false
        while (k < n) {
          const d = bytes[k]
          if (str) { if (d === 0x27) str = false }
          else if (d === 0x27) str = true
          else if (d === 0x3b) break
          k++
        }
        out.set(id, latin1.decode(bytes.subarray(i, Math.min(n, k + 1))))
        if (out.size === ids.size) break
        i = k + 1
        atStatement = true
        continue
      }
      i = j
      continue
    }
    if (c !== 0x20 && c !== 0x0a && c !== 0x0d && c !== 0x09) atStatement = false
    i++
  }
  return out
}

/**
 * The lines among `ids` whose text web-ifc read as '' although the file holds
 * something there (see point 3 at the top). Only lines with an empty text
 * value are looked up in the bytes, so a file without any costs one
 * GetRawLineData per edited line and no scan at all.
 */
export function findLossyLines(api: IfcAPI, modelId: number, bytes: Uint8Array, ids: Iterable<number>): Set<number> {
  const decodedNonEmpty = new Map<number, number>()
  for (const id of ids) {
    let values: string[]
    try { values = textValues(api.GetRawLineData(modelId, id)?.arguments) } catch { continue }
    if (!values.includes('')) continue // nothing read as empty: nothing lost
    decodedNonEmpty.set(id, values.filter((v) => v !== '').length)
  }
  const lossy = new Set<number>()
  if (decodedNonEmpty.size === 0) return lossy
  for (const [id, text] of instanceTexts(bytes, new Set(decodedNonEmpty.keys()))) {
    if (nonEmptyLiterals(text) > (decodedNonEmpty.get(id) ?? 0)) lossy.add(id)
  }
  return lossy
}

/**
 * Apply every diff of one export in order, sharing one line store between
 * them. A diff web-ifc refuses is skipped and counted, never fatal: the rest
 * of the edits still reach the file. Diffs are not deduplicated; the last one
 * on a field wins, as the editor history means it to.
 *
 * `lossy` (from findLossyLines) names lines a rewrite would damage: a diff on
 * one is skipped and counted the same way.
 */
export function applyDiffs(
  api: IfcAPI,
  modelId: number,
  diffs: readonly EditDiff[],
  onSkip?: (diff: EditDiff, err: unknown) => void,
  lossy?: ReadonlySet<number>,
): number {
  const written: WrittenLines = new Map()
  let skipped = 0
  for (const diff of diffs) {
    try {
      const target = targetLineOf(diff)
      if (target !== undefined && lossy?.has(target)) {
        throw new Error(`#${target} holds text the IFC reader cannot read back; rewriting it would blank that text`)
      }
      applyDiff(api, modelId, diff, written)
    } catch (err) {
      skipped++
      onSkip?.(diff, err)
    }
  }
  return skipped
}
