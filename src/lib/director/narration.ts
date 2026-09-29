// ─── Narration — one short spoken-style line per shot, as subtitles ───────────
// Pure. The planner records WHAT a shot is about as a typed fact (numbers read
// from the IFC, nothing invented); the UI turns the fact into a localised
// sentence; this module cuts the sentence into subtitle cues that fit the shot
// and read at a comfortable speed.

/** What a shot says, as data. Every number comes from the model facts. */
export type NarrationFact =
  | { kind: 'intro'; name: string; elements: number; storeys: number }
  | { kind: 'rise'; storeys: number; heightM: number }
  | { kind: 'footprint'; widthM: number; depthM: number }
  | { kind: 'storey'; name: string; elements: number; index: number; total: number }
  | { kind: 'system'; label: string; elements: number; percent: number }
  | { kind: 'issue'; label: string; count: number; severity: 'error' | 'warning' | 'info' }
  | { kind: 'ids'; label: string; count: number }
  | { kind: 'fixed'; label: string; count: number }
  | { kind: 'bcf'; label: string }
  | { kind: 'detail'; label: string }
  | { kind: 'inside'; name: string }
  | { kind: 'context'; name: string }
  | { kind: 'sectionCut'; storeys: number; from: string; to: string }
  | { kind: 'sectionSweep'; lengthM: number }
  | { kind: 'exploded'; storeys: number }
  | { kind: 'plan'; name: string; rooms: number; elements: number }
  | { kind: 'interior'; name: string; rooms: number }
  | { kind: 'closing'; name: string; score: number | null }

export type NarrationKind = NarrationFact['kind']

export interface SubtitleCue { text: string; startSec: number; endSec: number }

/** Comfortable subtitle reading speed (characters per second, broadcast guidance ~15–17). */
export const READ_CPS = 17
/** A cue shorter than this flickers. */
export const MIN_CUE_SEC = 1
/** Line length that still reads on a phone held upright / on a wide screen. */
export const MAX_CUE_CHARS = { vertical: 30, wide: 44 } as const

/**
 * Cut `text` into cues of at most `maxChars` (breaking at sentence, then
 * clause, then word boundaries) and share [start, end] among them by length.
 * When the window is too short to read everything at READ_CPS, whole
 * sentences are dropped from the end — the first sentence always stays.
 */
export function subtitleCues(text: string, startSec: number, endSec: number, maxChars: number): SubtitleCue[] {
  const span = endSec - startSec
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || span < MIN_CUE_SEC) return []
  let sentences = splitSentences(clean)
  while (sentences.length > 1 && chars(sentences) / READ_CPS > span) sentences = sentences.slice(0, -1)
  const chunks = sentences.flatMap((s) => wrapChunks(s, maxChars))
  // Never more cues than the window can show at the minimum length.
  const fit = Math.max(1, Math.floor(span / MIN_CUE_SEC))
  while (chunks.length > fit) {
    // Merge the shortest neighbouring pair (longer lines beat flicker).
    let best = 0
    for (let i = 1; i < chunks.length - 1; i++) if (chunks[i].length + chunks[i + 1].length < chunks[best].length + chunks[best + 1].length) best = i
    chunks.splice(best, 2, `${chunks[best]} ${chunks[best + 1]}`)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const cues: SubtitleCue[] = []
  let at = startSec
  for (let i = 0; i < chunks.length; i++) {
    // Every cue gets the minimum; the rest of the window is shared by length.
    const end = i === chunks.length - 1 ? endSec : at + MIN_CUE_SEC + (span - chunks.length * MIN_CUE_SEC) * (chunks[i].length / total)
    cues.push({ text: chunks[i], startSec: round3(at), endSec: round3(end) })
    at = end
  }
  return cues
}

function splitSentences(s: string): string[] {
  // A full stop ends a sentence only before a space or the end — "19.203" is a number.
  return s.split(/(?<=[.!?])\s+|(?<=[。！？])/u).map((x) => x.trim()).filter(Boolean)
}

/** Break at clause marks first (", · ; —"), then spaces; CJK text without spaces by characters. */
export function wrapChunks(s: string, max: number): string[] {
  if (s.length <= max) return [s]
  const out: string[] = []
  let rest = s
  while (rest.length > max) {
    const window = rest.slice(0, max + 1)
    let cut = Math.max(...[': ', ', ', ' · ', '; ', ' — ', '：', '、', '，'].map((m) => {
      const i = window.lastIndexOf(m)
      return i > max * 0.25 ? i + m.trimEnd().length : -1
    }))
    if (cut < 0) {
      // Two lines' worth left: break at the space nearest the middle, so no
      // lone word is left over for the next cue.
      const spaces = [...rest.slice(0, max + 1).matchAll(/ /g)].map((m) => m.index!)
      const aim = rest.length <= max * 2 ? rest.length / 2 : max
      const near = spaces.filter((i) => i > max * 0.3 && rest.length - i - 1 <= max * (rest.length <= max * 2 ? 1 : Infinity))
      cut = near.length ? near.reduce((a, b) => (Math.abs(b - aim) < Math.abs(a - aim) ? b : a)) : max
    }
    out.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(rest)
  return out
}

const chars = (list: string[]) => list.reduce((n, s) => n + s.length + 1, 0)
const round3 = (n: number) => Math.round(n * 1000) / 1000
