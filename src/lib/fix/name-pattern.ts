// ─── Naming pattern for the batch rename ──────────────────────────────────────
// A pattern is literal text plus tokens: `{class}-{storey}-{n}`. Parsing and
// rendering are pure and know nothing about the model; uniqueness (which
// number each name gets) is batch-rename.ts's job, which is why a rendered
// name comes out in two steps — a STEM with a placeholder where the counter
// goes, then `fillCounter` once the number is known.

import type { BatchRenameRule } from './batch-rename'

export type PatternToken = 'class' | 'ifcclass' | 'storey' | 'name' | 'n'

export type PatternPart =
  | { kind: 'lit'; text: string }
  | { kind: 'tok'; token: PatternToken; pad?: number }

export type PatternErrorCode = 'empty' | 'too_long' | 'brace' | 'unknown_token' | 'type_later' | 'bad_pad'

export interface ParsedPattern {
  source: string
  parts: PatternPart[]
  /** The pattern has at least one `{n}`. */
  hasCounter: boolean
  /** Distinct tokens used, sorted — safe to report (the source text is not). */
  tokens: PatternToken[]
}

export interface NameTokenValues {
  ifcClass: string
  storey: string
  name: string
}

/** IfcLabel's length limit. */
export const NAME_MAX = 255
/** Cap on what `{storey}` and `{name}` contribute, so one long name cannot crowd out the rest. */
export const TOKEN_MAX = 64
export const PATTERN_MAX = 120
export const DEFAULT_PAD = 3
const PAD_MIN = 1
const PAD_MAX = 6

export const DEFAULT_PATTERNS: Record<BatchRenameRule, string> = {
  RULE_EMPTY_NAME:     '{class}-{storey}-{n}',
  RULE_DUPLICATE_NAME: '{name}-{n}',
}

/**
 * Stands in for the counter inside a stem. NUL can never survive sanitising,
 * so it cannot collide with text that came from the model or the pattern.
 */
export const COUNTER_MARK = '\u0000'

const TOKENS: ReadonlySet<string> = new Set<PatternToken>(['class', 'ifcclass', 'storey', 'name', 'n'])
/** Literals made only of these are separators: dropped next to an empty token. */
const SEPARATOR_ONLY = /^[-_./ ]+$/
const EDGE_SEPARATORS = /^[-_./\s]+|[-_./\s]+$/g

type ParseResult =
  | { ok: true; value: ParsedPattern }
  | { ok: false; error: { code: PatternErrorCode; token?: string } }

const fail = (code: PatternErrorCode, token?: string): ParseResult =>
  ({ ok: false, error: token === undefined ? { code } : { code, token } })

/** Parse a naming pattern. Token names are case-insensitive; there is no brace escaping. */
export function parseNamePattern(src: string): ParseResult {
  if (src.trim() === '') return fail('empty')
  if (src.length > PATTERN_MAX) return fail('too_long')

  const parts: PatternPart[] = []
  let lit = ''
  const flushLit = (): void => {
    if (lit) parts.push({ kind: 'lit', text: lit })
    lit = ''
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '}') return fail('brace')
    if (ch !== '{') { lit += ch; continue }

    const close = src.indexOf('}', i + 1)
    if (close < 0) return fail('brace')
    const inner = src.slice(i + 1, close)
    if (inner === '' || inner.includes('{')) return fail('brace')

    const colon = inner.indexOf(':')
    const name  = (colon < 0 ? inner : inner.slice(0, colon)).trim().toLowerCase()
    const arg   = colon < 0 ? undefined : inner.slice(colon + 1)

    // Reserved: the type object's name needs data the issues do not carry yet.
    if (name === 'type') return fail('type_later')
    if (!TOKENS.has(name)) return fail('unknown_token', inner)

    let pad: number | undefined
    if (arg !== undefined) {
      if (name !== 'n') return fail('unknown_token', inner)
      if (!/^\d$/.test(arg)) return fail('bad_pad')
      pad = Number(arg)
      if (pad < PAD_MIN || pad > PAD_MAX) return fail('bad_pad')
    }

    flushLit()
    parts.push(pad === undefined
      ? { kind: 'tok', token: name as PatternToken }
      : { kind: 'tok', token: name as PatternToken, pad })
    i = close
  }
  flushLit()

  const tokens = [...new Set(parts.flatMap((p) => (p.kind === 'tok' ? [p.token] : [])))].sort()
  return {
    ok: true,
    value: { source: src, parts, hasCounter: tokens.includes('n'), tokens },
  }
}

// ── Text clean-up ─────────────────────────────────────────────────────────────

/**
 * Whitespace collapsed to single spaces, C0/C1 control characters removed,
 * NFC-normalised, trimmed. Whitespace goes first so a tab between two words
 * becomes a space rather than gluing them together.
 */
export function sanitizeName(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .normalize('NFC')
    .trim()
}

/** How names are compared for uniqueness: stricter than the rule (which is case-sensitive). */
export function normName(s: string): string {
  return s.trim().toLowerCase()
}

/** `IfcWall` → `Wall`. The prefix only goes when a capital follows, so `Ifc#123` stays as it is. */
export function shortClass(ifcClass: string): string {
  return ifcClass.replace(/^Ifc(?=[A-Z])/, '')
}

/** Cut to `max` UTF-16 units without splitting a surrogate pair. */
function cutTo(s: string, max: number): string {
  if (s.length <= max) return s
  let end = max
  const last = s.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end--
  return s.slice(0, end)
}

const tokenText = (s: string, max?: number): string => {
  const clean = sanitizeName(s)
  return max === undefined ? clean : cutTo(clean, max).trimEnd()
}

/** Same clean-up as sanitizeName, but keeps the counter marks. */
function sanitizeStem(s: string): string {
  return s
    .split(COUNTER_MARK)
    .map((chunk) => chunk
      .replace(/\s+/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      .normalize('NFC'))
    .join(COUNTER_MARK)
    .replace(EDGE_SEPARATORS, '')
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Render everything but the counter. The result holds COUNTER_MARK where each
 * `{n}` goes, and is the key the counter is numbered by: two elements with
 * the same stem get consecutive numbers, different stems each start at 1.
 *
 * A token that renders empty takes the separator after it with it (`{storey}-`
 * on an element with no storey), or the one before it when it is last. If no
 * text is left at all — `{name}` on an element whose name is empty — the stem
 * falls back to the class with a counter, so a name is never blank.
 */
export function renderStem(p: ParsedPattern, v: NameTokenValues): string {
  const values: Record<PatternToken, string> = {
    class:    shortClass(tokenText(v.ifcClass)),
    ifcclass: tokenText(v.ifcClass),
    storey:   tokenText(v.storey, TOKEN_MAX),
    name:     tokenText(v.name, TOKEN_MAX),
    n:        COUNTER_MARK,
  }

  const out: Array<{ text: string; separator: boolean }> = []
  for (let k = 0; k < p.parts.length; k++) {
    const part = p.parts[k]
    if (part.kind === 'lit') {
      out.push({ text: part.text, separator: SEPARATOR_ONLY.test(part.text) })
      continue
    }
    const text = values[part.token]
    if (text !== '') { out.push({ text, separator: false }); continue }

    const next = p.parts[k + 1]
    if (next && next.kind === 'lit' && SEPARATOR_ONLY.test(next.text)) {
      k++ // drop the separator after the empty token
    } else if (!next && out.length > 0 && out[out.length - 1].separator) {
      out.pop() // last part: drop the separator before it instead
    }
  }

  const stem = sanitizeStem(out.map((s) => s.text).join(''))
  if (stem.split(COUNTER_MARK).join('').replace(EDGE_SEPARATORS, '') !== '') return stem
  return `${values.class || 'Element'}-${COUNTER_MARK}`
}

/**
 * Put the number into a stem. A stem without a counter is used as it is for
 * n = 1 and gets `-n` after that — the pattern had no counter, so a suffix is
 * the only way to keep it unique. The result is capped at NAME_MAX by cutting
 * the text, never the number.
 */
export function fillCounter(stem: string, n: number, pad: number = DEFAULT_PAD): string {
  const number = String(n).padStart(pad, '0')
  const hasMark = stem.includes(COUNTER_MARK)
  const chunks = hasMark ? stem.split(COUNTER_MARK) : [stem]
  const counters = hasMark ? chunks.length - 1 : (n === 1 ? 0 : 1)
  const suffix = hasMark || n === 1 ? '' : `-${n}`
  const counterLen = hasMark ? counters * number.length : suffix.length

  // Trim the longest chunk until the whole name fits. The separator run at the
  // end of a chunk stays, so `…Level 1-001` does not become `…Level 1001`.
  let textLen = chunks.reduce((sum, c) => sum + c.length, 0)
  while (textLen + counterLen > NAME_MAX) {
    let longest = 0
    for (let i = 1; i < chunks.length; i++) if (chunks[i].length > chunks[longest].length) longest = i
    const excess = textLen + counterLen - NAME_MAX
    const chunk = chunks[longest]
    if (chunk === '') break // nothing left to cut
    const tail = /[-_./ ]*$/.exec(chunk)?.[0] ?? ''
    const body = chunk.slice(0, chunk.length - tail.length)
    chunks[longest] = body === ''
      ? cutTo(chunk, Math.max(0, chunk.length - excess))
      : cutTo(body, Math.max(0, body.length - excess)).trimEnd() + tail
    textLen -= chunk.length - chunks[longest].length
  }

  return hasMark ? chunks.join(number) : chunks[0] + suffix
}

/** The pad of the pattern's first `{n}`. */
export function counterPad(p: ParsedPattern): number {
  for (const part of p.parts) if (part.kind === 'tok' && part.token === 'n') return part.pad ?? DEFAULT_PAD
  return DEFAULT_PAD
}

/** Render one name in full — stem plus counter. For previews and tests. */
export function renderName(p: ParsedPattern, v: NameTokenValues, n: number): string {
  return fillCounter(renderStem(p, v), n, counterPad(p))
}
