// ─── IFC pre-flight validation utilities ──────────────────────────────────────
// Pure functions used by BOTH the main-thread loader and the Web Workers to
// validate IFC buffers before starting expensive WASM operations.
//
// Extracted into this shared module so that:
//   1. The validation logic is defined exactly once (DRY).
//   2. Workers can import it without bundling duplicates.
//   3. The functions can be unit-tested independently.
//
// IMPORTANT: This file must stay dependency-free (no React, no Zustand, no DOM).
// Workers run in a separate global scope; any import here must be safe in that
// context.

// ── ASCII header reader ───────────────────────────────────────────────────────

/**
 * Reads the first `maxBytes` bytes of `buffer` as ASCII characters.
 * Stops at NUL bytes (binary data) to avoid garbage output.
 */
export function readAsciiHeader(buffer: ArrayBuffer, maxBytes = 64): string {
  const view = new Uint8Array(buffer, 0, Math.min(maxBytes, buffer.byteLength))
  let str = ''
  for (let i = 0; i < view.length; i++) {
    const code = view[i]
    if (code === 0) break   // NUL terminator — binary data starts here
    str += String.fromCharCode(code)
  }
  return str
}

// ── IFC / STEP signature check ────────────────────────────────────────────────

/**
 * Returns `true` when the buffer begins with a valid IFC / STEP-21 header.
 *
 * Valid headers (case-sensitive, per the ISO 10303-21 standard):
 *   - "ISO-10303-21;" — used by IFC2x3, IFC4, IFC4x3
 *   - "STEP;"         — alternative used by some generators
 *
 * The check tolerates leading whitespace / BOM and carriage-return variants
 * that some exporters produce.
 */
export function hasIfcSignature(buffer: ArrayBuffer): boolean {
  const header = readAsciiHeader(buffer, 128).trimStart()
  return header.startsWith('ISO-10303-21') || header.startsWith('STEP;')
}

// ── Full buffer validation ────────────────────────────────────────────────────

export interface BufferValidationResult {
  ok: boolean
  /** Human-readable error description. Only set when `ok` is false. */
  reason?: string
}

/**
 * Validates that `buffer` is a plausible IFC file before triggering WASM init.
 *
 * @param buffer   - The ArrayBuffer to validate.
 * @param fileName - Optional display name used in error messages.
 * @returns `{ ok: true }` when the buffer passes all checks.
 *          `{ ok: false, reason: string }` with an actionable message when it fails.
 */
export function validateIfcBuffer(
  buffer: ArrayBuffer | null | undefined,
  fileName = 'the file',
): BufferValidationResult {
  // 1. Null / undefined (should not happen, but guards against undefined state)
  if (!buffer) {
    return { ok: false, reason: `No buffer available for "${fileName}". Load an IFC model first.` }
  }

  // 2. Zero-length transfer (corrupt transfer or empty file slipping through)
  if (buffer.byteLength === 0) {
    return {
      ok: false,
      reason: `"${fileName}" is empty (0 bytes). Please provide a valid IFC file.`,
    }
  }

  // 3. Suspiciously small — even the most minimal valid IFC header is ~50 bytes
  if (buffer.byteLength < 64) {
    return {
      ok: false,
      reason: (
        `"${fileName}" is too small (${buffer.byteLength} bytes) to be a valid IFC file. ` +
        'The file may be truncated or corrupted.'
      ),
    }
  }

  // 4. ISO-10303-21 / STEP signature check
  if (!hasIfcSignature(buffer)) {
    const preview = readAsciiHeader(buffer, 40).replace(/[\r\n]/g, ' ').trim().slice(0, 40)
    const sizekb  = (buffer.byteLength / 1024).toFixed(1)
    return {
      ok: false,
      reason: (
        `"${fileName}" does not appear to be a valid IFC file. ` +
        `Expected an ISO-10303-21 header but found: "${preview}…" ` +
        `(${sizekb} KB). Make sure you are opening an .ifc file, not a .pdf, .zip, or other format.`
      ),
    }
  }

  return { ok: true }
}

// ── Worker state assertions ───────────────────────────────────────────────────

/**
 * Asserts that a web-ifc model ID is valid (not -1).
 * Returns a descriptive error string when the assertion fails, null otherwise.
 */
export function assertModelId(modelId: number, context = 'operation'): string | null {
  if (modelId === -1) {
    return (
      `Cannot run ${context}: web-ifc model ID is -1 (model not opened). ` +
      'The IFC file may be corrupted or use an unsupported schema version.'
    )
  }
  return null
}
