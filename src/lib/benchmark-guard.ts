// ─── Which scores may join the public benchmark ───────────────────────────────
// The benchmark is "how healthy are the IFCs people deliver". A sample is one
// delivered file, scored as delivered, once. So a model is skipped when:
//   • it has no score yet;
//   • its result was measured on bytes edited in this browser (`metadata.edits`);
//   • it is one of the gallery's demo files;
//   • it is a file this app wrote (an export or a fixed file, re-opened) — the
//     header's preprocessor_version says so;
//   • its file was already posted this session (Re-validate is not a new file).
// Pending edits on an ORIGINAL result do not block it: that score is still the
// honest score of the file as delivered.

import type { ValidationResult } from '../types'
import { DEMO_FILENAMES } from '../demo-models/models'
import { readIfcHeader } from './ifc-header'
import { modelRegistry } from './model-registry'
import { useValidationStore } from '../stores/validationStore'

export interface BenchmarkGuardDeps {
  getResult(id: string): ValidationResult | undefined
  /** Identity of the file behind the model (the OPFS cache key), so a reload is the same file. */
  getKey(id: string): string
  isOurExport(id: string): boolean
}

export function benchmarkCandidates(
  models: ReadonlyArray<{ id: string; fileName: string }>,
  deps: BenchmarkGuardDeps,
  posted: ReadonlySet<string>,
): Array<{ key: string; score: number }> {
  const out: Array<{ key: string; score: number }> = []
  const seen = new Set<string>()
  for (const m of models) {
    const r = deps.getResult(m.id)
    if (!r || typeof r.qualityScore !== 'number' || !Number.isFinite(r.qualityScore)) continue
    if ((r.metadata?.edits ?? 0) > 0) continue
    if (DEMO_FILENAMES.has(m.fileName)) continue
    const key = deps.getKey(m.id)
    if (posted.has(key) || seen.has(key)) continue
    if (deps.isOurExport(m.id)) continue
    seen.add(key)
    out.push({ key, score: r.qualityScore })
  }
  return out
}

/** The tool string every export stamps into FILE_NAME (diffStore.exportAsIfcDetailed). */
const OUR_PREPROCESSOR = 'IFC Viewer Online'
const HEADER_PROBE = 64 * 1024

const exportVerdicts = new WeakMap<ArrayBuffer, boolean>()

/** True when the file's header says this app wrote it. Memoised per buffer. */
export function isOurExportBuffer(buf: ArrayBuffer | null | undefined): boolean {
  if (!buf || buf.byteLength === 0) return false
  const known = exportVerdicts.get(buf)
  if (known !== undefined) return known
  let verdict = false
  try {
    const header = readIfcHeader(new Uint8Array(buf, 0, Math.min(buf.byteLength, HEADER_PROBE)))
    verdict = header?.name?.preprocessorVersion?.startsWith(OUR_PREPROCESSOR) ?? false
  } catch {
    verdict = false
  }
  exportVerdicts.set(buf, verdict)
  return verdict
}

/** The deps as the validation panel uses them: per-model cached results, registry keys and buffers. */
export function defaultBenchmarkDeps(): BenchmarkGuardDeps {
  const cached = useValidationStore.getState().cachedResultsByModel
  return {
    getResult:   (id) => cached[id],
    getKey:      (id) => modelRegistry.get(id)?.opfsCacheKey || id,
    isOurExport: (id) => isOurExportBuffer(modelRegistry.getBuffer(id)),
  }
}
