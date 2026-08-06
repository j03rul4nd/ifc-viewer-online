// ─── geo-extract-runner ───────────────────────────────────────────────────────
// Main-thread orchestration for georeferencing extraction (plan T4/T5).
//
// Two tiers:
//   • quickScanGeoref()      — cheap, synchronous token scan of the IFC bytes,
//                              run at load time to power the "georeferenced?"
//                              badge without touching WASM. Definitive only for
//                              files small enough to be scanned in full.
//   • ensureGeorefExtracted() — full extraction in a dedicated web-ifc worker
//                              (src/workers/geo-extract.worker.ts), run lazily
//                              on first map-panel open. Results cached per
//                              modelId in geoStore; concurrent calls dedupe.
//
// Worker rules (mirrors ids-runner.ts): fresh Worker per run, UUID correlation,
// COPY the registry buffer before transfer (never detach the registry's copy),
// terminate on completion, 60 s watchdog.

import { modelRegistry } from '../model-registry'
import { useGeoStore } from '../../stores/geoStore'
import { createLogger } from '../logger'
import type { GeorefExtraction, GeorefStatus } from './geo-types'
import type { GeoExtractOutMessage } from '../../workers/geo-extract.worker'

const log = createLogger('GeoExtract')

const EXTRACT_TIMEOUT_MS = 60_000

/** Bytes scanned from each end of the file by quickScanGeoref. */
export const QUICK_SCAN_BYTES = 8 * 1024 * 1024

// ── Extraction stub ─────────────────────────────────────────────────────────────

function stubExtraction(
  status: GeorefStatus,
  reasons: string[] = [],
  raw: Record<string, number | string | null> = {},
): GeorefExtraction {
  return {
    status,
    rung: status === 'none' ? 4 : null,
    epsgCode: null,
    lat: null, lon: null, heightM: null,
    rotationDeg: 0,
    eastings: null, northings: null, scale: null,
    raw, reasons, largeWcsOffset: false, siteExpressId: null,
  }
}

// ── Tier 1 — quick scan ─────────────────────────────────────────────────────────

/**
 * Token-scan the IFC bytes for georeferencing hints without parsing.
 *
 * Returns a GeorefExtraction stub:
 *   • status 'unknown' + raw.quickScan hint — tokens (or possible tokens) found;
 *     full extraction must still run to know what they mean.
 *   • status 'none' — the ENTIRE file was scanned and contains no
 *     IFCMAPCONVERSION / ePSet_MapConversion / IFCSITE token at all (definitive:
 *     the extraction ladder could only return 'none' too).
 *
 * Scans the first and last `scanBytes` (default 8 MB each); files ≤ 2×scanBytes
 * are covered in full. STEP files are ASCII, so a latin1 decode is lossless.
 */
export function quickScanGeoref(buffer: ArrayBuffer, scanBytes = QUICK_SCAN_BYTES): GeorefExtraction {
  const size = buffer.byteLength
  const fullCoverage = size <= scanBytes * 2

  const decoder = new TextDecoder('latin1')
  let text: string
  if (fullCoverage) {
    text = decoder.decode(buffer)
  } else {
    const head = decoder.decode(new Uint8Array(buffer, 0, scanBytes))
    const tail = decoder.decode(new Uint8Array(buffer, size - scanBytes, scanBytes))
    text = head + '\n' + tail
  }
  const upper = text.toUpperCase()

  const hasConversion = upper.includes('IFCMAPCONVERSION') || upper.includes('EPSET_MAPCONVERSION')
  const hasSite = upper.includes('IFCSITE')

  if (hasConversion) return stubExtraction('unknown', [], { quickScan: 'conversion-hint' })
  if (hasSite)       return stubExtraction('unknown', [], { quickScan: 'site-hint' })
  if (fullCoverage)  return stubExtraction('none',    [], { quickScan: 'full-scan' })
  return stubExtraction('unknown', [], { quickScan: 'no-hint' })
}

/**
 * Load-time hook (loader.ts): quick-scan and stash the hint in geoStore.
 * Never throws — the badge is best-effort and must not affect model loading.
 */
export function quickScanAndStore(modelId: string, buffer: ArrayBuffer): void {
  try {
    useGeoStore.getState().setGeoref(modelId, quickScanGeoref(buffer))
  } catch (e) {
    log.debug('quickScan failed (ignored):', e)
  }
}

// ── Tier 2 — full worker extraction ─────────────────────────────────────────────

/**
 * Run the geo-extract worker against raw IFC bytes. Low-level: throws on worker
 * error or timeout. Prefer ensureGeorefExtracted() which caches per model.
 */
export function runGeoExtract(ifcBuffer: ArrayBuffer | Uint8Array): Promise<GeorefExtraction> {
  const buffer = ifcBuffer instanceof Uint8Array
    ? ifcBuffer.slice().buffer // copy so the transfer doesn't detach the registry's buffer
    : ifcBuffer.slice(0)

  return new Promise<GeorefExtraction>((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/geo-extract.worker.ts', import.meta.url), { type: 'module' })
    const id = crypto.randomUUID()

    let timer: ReturnType<typeof setTimeout> | null = null
    const done = (fn: () => void): void => {
      if (timer !== null) clearTimeout(timer)
      fn()
      worker.terminate()
    }
    timer = setTimeout(
      () => done(() => reject(new Error(`Georeferencing extraction timed out after ${EXTRACT_TIMEOUT_MS / 1000}s`))),
      EXTRACT_TIMEOUT_MS,
    )

    worker.onmessage = (e: MessageEvent<GeoExtractOutMessage>): void => {
      const m = e.data
      if (!m || m.id !== id) return
      if (m.type === 'done') done(() => resolve(m.extraction))
      else done(() => reject(new Error(m.message || 'Georeferencing extraction failed')))
    }
    worker.onerror = (e): void => done(() => reject(new Error(e.message || 'Geo-extract worker error')))

    worker.postMessage({ type: 'extract', id, buffer }, [buffer])
  })
}

// In-flight dedupe so a double panel-open doesn't spawn two workers per model.
const inFlight = new Map<string, Promise<GeorefExtraction>>()

/**
 * Ensure the model's georeferencing has been fully extracted, lazily.
 * Returns the cached result when one exists (any status other than
 * 'unknown'/'extracting'); otherwise runs the worker and stores the result.
 * Never rejects — failures resolve to an 'unknown' stub with a reason key.
 */
export function ensureGeorefExtracted(modelId: string): Promise<GeorefExtraction> {
  const cached = useGeoStore.getState().georefByModel[modelId]
  if (cached && cached.status !== 'unknown' && cached.status !== 'extracting') {
    return Promise.resolve(cached)
  }
  const pending = inFlight.get(modelId)
  if (pending) return pending

  const p = doExtract(modelId).finally(() => { inFlight.delete(modelId) })
  inFlight.set(modelId, p)
  return p
}

async function doExtract(modelId: string): Promise<GeorefExtraction> {
  const store = useGeoStore.getState()
  const buffer = modelRegistry.getBuffer(modelId)
  if (!buffer) {
    // Cache-only load without a persisted IFC backup — extraction is impossible.
    const g = stubExtraction('unknown', ['extract.noSourceBuffer'])
    store.setGeoref(modelId, g)
    return g
  }

  store.setGeoref(modelId, { ...stubExtraction('unknown'), status: 'extracting' })
  let result: GeorefExtraction
  try {
    result = await runGeoExtract(buffer)
  } catch (e) {
    log.warn(`extraction failed for "${modelId}":`, e instanceof Error ? e.message : e)
    result = stubExtraction('unknown', ['extract.failed'])
  }

  // The model may have been removed (navigate-to-landing) while the worker ran;
  // committing then would resurrect a stale georefByModel entry.
  if (modelRegistry.get(modelId)) {
    useGeoStore.getState().setGeoref(modelId, result)
  }
  return result
}
