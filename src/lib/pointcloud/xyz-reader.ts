// ─── xyz-reader ───────────────────────────────────────────────────────────────
// Delimited-text point clouds: .xyz, .pts, .csv, .asc, .txt.
//
// There is no standard here — only conventions — so the reader sniffs the file
// instead of trusting the extension: delimiter, optional header row, optional
// leading point-count line (.pts), and what the columns after XYZ actually mean
// (RGB bytes vs. 0-1 normals vs. intensity). Everything sniffed is reported so
// the UI can say what was assumed rather than silently mis-colouring a cloud.

import {
  readSlice, Bounds, SAMPLE_BYTES, STREAM_SLICE_BYTES,
  type PointReader, type PointConsumer, type ReadOptions, type ReaderHeader,
} from './pc-reader'
import type { PointCloudFormat, SourceFrame } from './pc-types'

export interface XyzLayout {
  delimiter: RegExp
  /** Bytes to skip before the first data row (header and/or count line). */
  skipBytes: number
  /** Column indices, -1 when absent. */
  xi: number; yi: number; zi: number
  ri: number; gi: number; bi: number
  ii: number
  /** Multiplier mapping the colour columns onto 0-255. */
  colorScale: number
  intensityScale: number
  declaredCount: number | null
}

const DELIMITERS: Array<{ re: RegExp; test: RegExp }> = [
  { re: /\s*,\s*/, test: /,/ },
  { re: /\s*;\s*/, test: /;/ },
  { re: /\t+/,     test: /\t/ },
  { re: /\s+/,     test: /\s/ },
]

function splitLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean)
}

/** True when every field parses as a finite number. */
function isNumericRow(parts: string[]): boolean {
  if (parts.length < 3) return false
  for (const p of parts) if (!Number.isFinite(Number(p))) return false
  return true
}

/**
 * Work out the column layout from the first rows of the file.
 * Exported for tests — the column heuristics are the fragile part.
 */
export function sniffXyzLayout(sample: string): XyzLayout {
  const rawLines = sample.split('\n')
  const lines = splitLines(sample)
  if (lines.length === 0) throw new Error('xyzEmpty')

  const probe = lines.slice(0, 40).join('\n')
  const delimiter = (DELIMITERS.find((d) => d.test.test(probe)) ?? DELIMITERS[3]).re

  let skipLines = 0
  let declaredCount: number | null = null

  // .pts convention: a bare integer on line 1 is the point count, not a point.
  const first = lines[0].split(delimiter)
  if (first.length === 1 && /^\d+$/.test(lines[0])) {
    declaredCount = parseInt(lines[0], 10)
    skipLines = 1
  } else if (!isNumericRow(first)) {
    // A header row ("X,Y,Z,R,G,B" or "//X Y Z").
    skipLines = 1
  }

  const dataLines = lines.slice(skipLines).filter((l) => isNumericRow(l.split(delimiter)))
  if (dataLines.length === 0) throw new Error('xyzNoData')

  const cols = dataLines[0].split(delimiter).length
  const layout: XyzLayout = {
    delimiter, skipBytes: 0,
    xi: 0, yi: 1, zi: 2, ri: -1, gi: -1, bi: -1, ii: -1,
    colorScale: 1, intensityScale: 1, declaredCount,
  }

  if (cols === 4) {
    layout.ii = 3
  } else if (cols === 6 || cols === 9) {
    // 6 = x y z + three more; 9 = the same plus normals. Are those three colour
    // bytes, or unit normals? Look at the values.
    if (looksLikeColor(dataLines, delimiter, 3)) { layout.ri = 3; layout.gi = 4; layout.bi = 5 }
    else layout.ii = 3
  } else if (cols >= 7) {
    // The .pts norm: x y z intensity r g b.
    layout.ii = 3
    if (looksLikeColor(dataLines, delimiter, 4)) { layout.ri = 4; layout.gi = 5; layout.bi = 6 }
  }

  // Float colour columns (0-1) need the same stretch PLY floats do.
  if (layout.ri >= 0) layout.colorScale = maxOfColumns(dataLines, delimiter, [layout.ri, layout.gi, layout.bi]) <= 1.001 ? 255 : 1
  if (layout.ii >= 0) {
    const m = maxOfColumns(dataLines, delimiter, [layout.ii])
    layout.intensityScale = m <= 1.001 ? 255 : (m > 255 ? 255 / m : 1)
  }

  // Byte offset of the first data row, computed on the RAW lines so blank lines
  // and CRLF endings are accounted for exactly.
  let consumed = 0
  let seen = 0
  for (const raw of rawLines) {
    if (seen >= skipLines) break
    consumed += raw.length + 1
    if (raw.trim()) seen++
  }
  layout.skipBytes = consumed
  return layout
}

function maxOfColumns(lines: string[], delimiter: RegExp, indices: number[]): number {
  let max = 0
  for (const line of lines.slice(0, 200)) {
    const parts = line.split(delimiter)
    for (const i of indices) {
      const v = Math.abs(Number(parts[i]))
      if (Number.isFinite(v) && v > max) max = v
    }
  }
  return max
}

/**
 * Colour channels are never negative; unit normals routinely are. That single
 * test separates `x y z r g b` from `x y z nx ny nz` in practice — a column
 * triple that stays in [0, ∞) is read as colour.
 */
function looksLikeColor(lines: string[], delimiter: RegExp, start: number): boolean {
  for (const line of lines.slice(0, 200)) {
    const parts = line.split(delimiter)
    for (let i = start; i < start + 3; i++) {
      const v = Number(parts[i])
      if (!Number.isFinite(v)) return false
      if (v < 0) return false
    }
  }
  return true
}

const clamp255 = (v: number): number => v < 0 ? 0 : v > 255 ? 255 : v | 0

export class XyzReader implements PointReader {
  readonly format: PointCloudFormat = 'xyz'

  private layout: XyzLayout | null = null

  constructor(private readonly file: File) {}

  async open(): Promise<ReaderHeader> {
    const headBytes = await readSlice(this.file, 0, Math.min(this.file.size, SAMPLE_BYTES))
    const head = new TextDecoder('latin1').decode(headBytes)
    const layout = sniffXyzLayout(head)
    this.layout = layout

    const bounds = new Bounds()
    // The head slice begins at a line boundary; only its END can be cut short.
    this.accumulateBounds(head.slice(layout.skipBytes), bounds, {
      dropFirst: false, dropLast: this.file.size > SAMPLE_BYTES,
    })

    // Text files are usually written in scan order, so the tail holds the other
    // end of the site. Sampling both ends keeps the origin near the true centre.
    // There it is the START that lands mid-line.
    if (this.file.size > SAMPLE_BYTES * 2) {
      const tailBytes = await readSlice(this.file, this.file.size - SAMPLE_BYTES, this.file.size)
      this.accumulateBounds(new TextDecoder('latin1').decode(tailBytes), bounds, {
        dropFirst: true, dropLast: false,
      })
    }

    const frame: SourceFrame = bounds.toFrame({
      unitScale: 1, unitSource: 'assumed', epsgCode: null, upAxis: 'z',
    })

    return {
      frame,
      attributes: {
        color: layout.ri >= 0,
        intensity: layout.ii >= 0,
        classification: false,
        confidence: false,
      },
      declaredCount: layout.declaredCount,
      boundsEstimated: true,
    }
  }

  /**
   * Accumulate a bbox from a text slice. `dropFirst`/`dropLast` exclude only the
   * lines a byte-range slice may have cut in half — dropping a valid edge line
   * drifts the sampled origin, which is exactly the error float32 vertex
   * positions cannot absorb.
   */
  private accumulateBounds(
    text: string, bounds: Bounds, edges: { dropFirst: boolean; dropLast: boolean },
  ): void {
    const l = this.layout!
    const lines = text.split('\n')
    const from = edges.dropFirst ? 1 : 0
    const to = edges.dropLast ? lines.length - 1 : lines.length
    for (let i = from; i < to; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('#') || line.startsWith('//')) continue
      const parts = line.split(l.delimiter)
      if (parts.length < 3) continue
      const x = +parts[l.xi], y = +parts[l.yi], z = +parts[l.zi]
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) bounds.add(x, y, z)
    }
  }

  async read(consumer: PointConsumer, opts: ReadOptions): Promise<number> {
    const l = this.layout!
    const decoder = new TextDecoder('latin1')
    let cursor = l.skipBytes
    let carry = ''
    let read = 0

    while (read < opts.maxPoints && cursor < this.file.size) {
      if (opts.shouldStop()) break
      const bytes = await readSlice(this.file, cursor, cursor + STREAM_SLICE_BYTES)
      if (bytes.byteLength === 0) break
      cursor += bytes.byteLength
      const atEof = cursor >= this.file.size
      const text = carry + decoder.decode(bytes)
      const lines = text.split('\n')
      carry = atEof ? '' : (lines.pop() ?? '')

      for (const raw of lines) {
        if (read >= opts.maxPoints) break
        const line = raw.trim()
        if (!line || line.startsWith('#') || line.startsWith('//')) continue
        const parts = line.split(l.delimiter)
        if (parts.length < 3) continue
        const x = +parts[l.xi], y = +parts[l.yi], z = +parts[l.zi]
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
        consumer.push(
          x, y, z,
          l.ri >= 0 ? clamp255(+parts[l.ri] * l.colorScale) : 0,
          l.gi >= 0 ? clamp255(+parts[l.gi] * l.colorScale) : 0,
          l.bi >= 0 ? clamp255(+parts[l.bi] * l.colorScale) : 0,
          l.ii >= 0 ? clamp255(+parts[l.ii] * l.intensityScale) : 0,
          0, 255,
        )
        read++
      }
      opts.onProgress(Math.min(1, cursor / this.file.size))
    }
    return read
  }
}
