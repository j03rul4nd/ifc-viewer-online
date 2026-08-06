// ─── IFC Export Web Worker ──────────────────────────────────────────────────────
// Applies non-destructive diffs to the original IFC buffer via web-ifc IfcAPI
// and exports a modified IFC STEP file — all off the main thread.
//
// Message protocol
// ─────────────────
// IN  { type: 'export', id: string, buffer: ArrayBuffer, diffs: EditDiff[], wasmBase: string }
// OUT { type: 'done',  id: string, result: Uint8Array }   ← result is Transferred
//     { type: 'error', id: string, message: string }

import { IfcAPI, IFCRELAGGREGATES, IFCRELCONTAINEDINSPATIALSTRUCTURE } from 'web-ifc'
import { degreesToCompoundAngle } from '../lib/geo/geo-math'
import type { EditDiff } from '../types'

// Force single-threaded WASM — nested workers (pthreads) fail inside a worker context
;((): void => {
  const _orig = IfcAPI.prototype.Init
  IfcAPI.prototype.Init = function (locateFile) {
    return _orig.call(this, locateFile, /* forceSingleThread */ true)
  }
})()

// ── Message types ─────────────────────────────────────────────────────────────

type ExportInMsg = {
  type:     'export'
  id:       string
  buffer:   ArrayBuffer
  diffs:    EditDiff[]
  wasmBase: string
}

type ExportOutMsg =
  | { type: 'done';  id: string; result: Uint8Array; skippedDiffs: number }
  | { type: 'error'; id: string; message: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyLine = any

// ── Diff application ─────────────────────────────────────────────────────────

function applyDiff(api: IfcAPI, modelId: number, diff: EditDiff): void {
  if (diff.type === 'RENAME') {
    const line: AnyLine = api.GetLine(modelId, diff.expressId, false)
    const strVal = { type: 1, value: diff.newValue }
    if      (diff.field === 'Name')        line.Name        = strVal
    else if (diff.field === 'LongName')    line.LongName    = strVal
    else if (diff.field === 'Description') line.Description = strVal
    api.WriteLine(modelId, line)

  } else if (diff.type === 'FIX_GUID') {
    const line: AnyLine = api.GetLine(modelId, diff.expressId, false)
    line.GlobalId = { type: 1, value: diff.newGuid }
    api.WriteLine(modelId, line)

  } else if (diff.type === 'SET_PROPERTY') {
    const line: AnyLine = api.GetLine(modelId, diff.propExpressId, false)
    line.NominalValue = { type: 1, value: diff.newValue }
    api.WriteLine(modelId, line)

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
    const line: AnyLine = api.GetLine(modelId, diff.expressId, false)
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
    api.WriteLine(modelId, line)

  } else if (diff.type === 'REPARENT') {
    const aggIds  = api.GetLineIDsWithType(modelId, IFCRELAGGREGATES)
    const contIds = api.GetLineIDsWithType(modelId, IFCRELCONTAINEDINSPATIALSTRUCTURE)

    // Remove from old aggregation
    for (let i = 0; i < aggIds.size(); i++) {
      const rel: AnyLine = api.GetLine(modelId, aggIds.get(i), false)
      if (rel.RelatingObject?.value !== diff.oldParentExpressId) continue
      const before: AnyLine[] = rel.RelatedObjects ?? []
      const after = before.filter((r: AnyLine) => r?.value !== diff.expressId)
      if (after.length === before.length) continue
      rel.RelatedObjects = after
      api.WriteLine(modelId, rel)
      break
    }

    // Remove from old containment
    for (let i = 0; i < contIds.size(); i++) {
      const rel: AnyLine = api.GetLine(modelId, contIds.get(i), false)
      if (rel.RelatingStructure?.value !== diff.oldParentExpressId) continue
      const before: AnyLine[] = rel.RelatedElements ?? []
      const after = before.filter((r: AnyLine) => r?.value !== diff.expressId)
      if (after.length === before.length) continue
      rel.RelatedElements = after
      api.WriteLine(modelId, rel)
      break
    }

    // Add to new parent — try aggregation first, then containment
    let added = false
    for (let i = 0; i < aggIds.size(); i++) {
      const rel: AnyLine = api.GetLine(modelId, aggIds.get(i), false)
      if (rel.RelatingObject?.value !== diff.newParentExpressId) continue
      rel.RelatedObjects = [...(rel.RelatedObjects ?? []), { type: 5, value: diff.expressId }]
      api.WriteLine(modelId, rel)
      added = true
      break
    }
    if (!added) {
      for (let i = 0; i < contIds.size(); i++) {
        const rel: AnyLine = api.GetLine(modelId, contIds.get(i), false)
        if (rel.RelatingStructure?.value !== diff.newParentExpressId) continue
        rel.RelatedElements = [...(rel.RelatedElements ?? []), { type: 5, value: diff.expressId }]
        api.WriteLine(modelId, rel)
        break
      }
    }
  }
}

// ── Main message handler ──────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<ExportInMsg>): Promise<void> => {
  const { id, buffer, diffs, wasmBase } = e.data

  try {
    const api = new IfcAPI()
    api.SetWasmPath(wasmBase)
    await api.Init()

    const modelId = api.OpenModel(new Uint8Array(buffer))

    let skippedDiffs = 0
    for (const diff of diffs) {
      try {
        applyDiff(api, modelId, diff)
      } catch (err) {
        skippedDiffs++
        console.warn('[export.worker] Skipped diff', diff.type, '#' + diff.expressId, '—', String(err))
      }
    }

    const result = api.SaveModel(modelId)
    api.CloseModel(modelId)

    const out: ExportOutMsg = { type: 'done', id, result, skippedDiffs }
    ;(self as unknown as Worker).postMessage(out, { transfer: [result.buffer] })

  } catch (err) {
    const out: ExportOutMsg = { type: 'error', id, message: String(err) }
    self.postMessage(out)
  }
}
