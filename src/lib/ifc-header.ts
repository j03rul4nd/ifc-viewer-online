// ─── ifc-header ───────────────────────────────────────────────────────────────
// Read and rewrite the STEP header of an IFC file.
//
// ── Why this exists
// web-ifc round-trips a model faithfully — including the header — so a file
// edited in this viewer and exported still claims, byte for byte, that it was
// produced by whatever authored it, at the original timestamp, untouched. For a
// viewer that would be harmless. For a tool whose product is DELIVERY AND
// CONFORMANCE it is not: someone renames elements, repairs GUIDs or corrects the
// georeferencing here, and the receiving party has no way to tell the file apart
// from what the authoring tool shipped. The header is the one place STEP puts
// that record, and leaving it untouched makes it a false one.
//
// web-ifc has `GetHeaderLine` but no way to write one back, so the rewrite
// happens on the emitted text.
//
// ── Why the parsing is not a regular expression
// `FILE_NAME` is a STEP argument list, and STEP strings can contain commas,
// parentheses and escaped quotes:
//
//     FILE_NAME('O''Brien, plan (rev C).ifc','2024-01-01T00:00:00',(''),...)
//
// A regex that splits on commas mangles that filename, and one that matches to
// the closing paren stops inside it. The scanner below tracks string state, so
// the only characters that mean anything structurally are the ones outside a
// quoted literal.
//
// ── Why latin1
// The header is decoded and re-encoded as latin1, which is a byte-for-byte map
// over 0-255. Whatever the file's real encoding is — ISO-8859-1, UTF-8, or the
// `\X2\` escapes the spec actually prescribes — every byte we do not deliberately
// change comes back out unchanged. Decoding as UTF-8 would corrupt a header with
// a stray high byte in it, and headers written by CAD exporters are full of them.

/** Where the header ends. Everything from here on is untouched. */
const DATA_MARKER = 'DATA;'

export interface IfcHeaderInfo {
  /** FILE_DESCRIPTION descriptions — usually the view definition / MVD. */
  description: string[]
  /** FILE_NAME arguments, positionally. */
  name: {
    name: string
    timestamp: string
    author: string[]
    organization: string[]
    preprocessorVersion: string
    originatingSystem: string
    authorization: string
  } | null
  /** FILE_SCHEMA — 'IFC4', 'IFC2X3', 'IFC4X3_ADD2'… */
  schema: string[]
}

/** What to write into FILE_NAME. Anything omitted is left as it was. */
export interface IfcHeaderStamp {
  /** ISO 8601. Defaults to now — the moment this physical file was written. */
  timestamp?: string
  author?: string[]
  organization?: string[]
  /**
   * The toolkit that wrote this physical file. Ours, after an export — that is
   * exactly what the field means, and it is the honest half of the record.
   */
  preprocessorVersion?: string
  /**
   * The application the model came from. Deliberately NOT overwritten by
   * default: the geometry and the data still came from the authoring tool, and
   * claiming otherwise would be a different lie from the one being fixed.
   */
  originatingSystem?: string
  authorization?: string
}

// ── STEP text scanning ────────────────────────────────────────────────────────

/**
 * Split a STEP argument list at top-level commas.
 *
 * `depth` tracks parentheses and `inString` tracks quoted literals, because a
 * comma inside either is data rather than a separator. `''` inside a string is
 * an escaped quote, not the end of it — that is the case a naive scanner gets
 * wrong, and filenames with apostrophes are not rare.
 */
export function splitStepArgs(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let inString = false
  let start = 0

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === "'") {
        if (text[i + 1] === "'") { i++; continue }   // escaped quote
        inString = false
      }
      continue
    }
    if (c === "'") { inString = true; continue }
    if (c === '(') { depth++; continue }
    if (c === ')') { depth--; continue }
    if (c === ',' && depth === 0) {
      out.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(text.slice(start).trim())
  return out
}

/** Find `KEYWORD( ... );` in the header, returning the span of its arguments. */
function findEntry(header: string, keyword: string): { argsFrom: number; argsTo: number } | null {
  const re = new RegExp(`\\b${keyword}\\s*\\(`, 'i')
  const m = re.exec(header)
  if (!m) return null
  const argsFrom = m.index + m[0].length

  let depth = 1
  let inString = false
  for (let i = argsFrom; i < header.length; i++) {
    const c = header[i]
    if (inString) {
      if (c === "'") {
        if (header[i + 1] === "'") { i++; continue }
        inString = false
      }
      continue
    }
    if (c === "'") { inString = true; continue }
    if (c === '(') { depth++; continue }
    if (c === ')') {
      depth--
      if (depth === 0) return { argsFrom, argsTo: i }
    }
  }
  return null   // unterminated — malformed header, leave it alone
}

/**
 * Decode ISO 10303-21 character escapes.
 *
 * These are not decoration: a spec-compliant exporter writes every non-ASCII
 * character this way, so a header carrying "Müller" arrives as
 * `M\X2\00FC\X0\ller`. Without decoding, that is what the panel would show the
 * user and what a re-export would preserve as literal text.
 *
 *   \X2\ …hex quads… \X0\  — UTF-16 code units, the modern form
 *   \X\HH                  — one byte, ISO-8859-1
 *   \S\c                   — c + 0x80, the older upper-half form
 */
function decodeStepEscapes(text: string): string {
  return text
    .replace(/\\X2\\([0-9A-Fa-f]{4,})\\X0\\/g, (_, hex: string) => {
      let out = ''
      for (let i = 0; i + 4 <= hex.length; i += 4) {
        out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
      }
      return out
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, ch: string) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x80))
}

/** `'abc'` → `abc`, `$` → ''. Unescapes doubled quotes and STEP escapes. */
export function parseStepString(token: string): string {
  const t = token.trim()
  if (t === '$' || t === '*' || t === '') return ''
  if (!t.startsWith("'") || !t.endsWith("'")) return t
  return decodeStepEscapes(t.slice(1, -1).replace(/''/g, "'"))
}

/** `(a,b)` → the parsed strings inside. A bare token becomes a single entry. */
function parseStepList(token: string): string[] {
  const t = token.trim()
  if (t === '$' || t === '') return []
  if (t.startsWith('(') && t.endsWith(')')) {
    const inner = t.slice(1, -1).trim()
    if (!inner) return []
    return splitStepArgs(inner).map(parseStepString).filter((s) => s !== '')
  }
  const one = parseStepString(t)
  return one ? [one] : []
}

/**
 * Escape a value for a STEP string literal.
 *
 * Quotes double. Anything outside printable ASCII becomes a `\X2\` sequence,
 * which is what the spec prescribes and what keeps the file byte-safe under the
 * latin1 round trip — an accented character written raw would survive here but
 * be read back differently by a parser that assumes the spec's escaping.
 */
export function escapeStepString(value: string): string {
  let out = ''
  let unicodeRun = ''

  const flush = (): void => {
    if (unicodeRun) { out += `\\X2\\${unicodeRun}\\X0\\`; unicodeRun = '' }
  }

  for (const ch of value) {
    const code = ch.codePointAt(0)!
    if (code >= 0x20 && code <= 0x7e) {
      flush()
      out += ch === "'" ? "''" : ch
    } else {
      // UTF-16 code units, four hex digits each — surrogate pairs included.
      for (let i = 0; i < ch.length; i++) {
        unicodeRun += ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')
      }
    }
  }
  flush()
  return `'${out}'`
}

const stepList = (items: string[]): string =>
  items.length === 0 ? "('')" : `(${items.map(escapeStepString).join(',')})`

// ── Public API ────────────────────────────────────────────────────────────────

const decoder = new TextDecoder('latin1')

/** Split a file into its header text and the untouched remainder. */
function splitHeader(bytes: Uint8Array): { header: string; dataAt: number } | null {
  // The header is short; decoding the first 64 kB covers even the most verbose
  // exporter and avoids decoding a 500 MB model to read ten lines.
  const probe = decoder.decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)))
  const idx = probe.indexOf(DATA_MARKER)
  if (idx < 0) return null
  return { header: probe.slice(0, idx), dataAt: idx }
}

/** Read what the header claims. Returns null when there is no STEP header. */
export function readIfcHeader(bytes: Uint8Array): IfcHeaderInfo | null {
  const split = splitHeader(bytes)
  if (!split) return null
  const { header } = split

  const descSpan = findEntry(header, 'FILE_DESCRIPTION')
  const nameSpan = findEntry(header, 'FILE_NAME')
  const schemaSpan = findEntry(header, 'FILE_SCHEMA')

  const description = descSpan
    ? parseStepList(splitStepArgs(header.slice(descSpan.argsFrom, descSpan.argsTo))[0] ?? '')
    : []
  const schema = schemaSpan
    ? parseStepList(splitStepArgs(header.slice(schemaSpan.argsFrom, schemaSpan.argsTo))[0] ?? '')
    : []

  let name: IfcHeaderInfo['name'] = null
  if (nameSpan) {
    const args = splitStepArgs(header.slice(nameSpan.argsFrom, nameSpan.argsTo))
    name = {
      name: parseStepString(args[0] ?? ''),
      timestamp: parseStepString(args[1] ?? ''),
      author: parseStepList(args[2] ?? ''),
      organization: parseStepList(args[3] ?? ''),
      preprocessorVersion: parseStepString(args[4] ?? ''),
      originatingSystem: parseStepString(args[5] ?? ''),
      authorization: parseStepString(args[6] ?? ''),
    }
  }

  return { description, name, schema }
}

/**
 * Rewrite FILE_NAME with an honest record of this export.
 *
 * Returns the bytes unchanged when there is no header to rewrite — a file we
 * cannot parse the header of is a file we must not corrupt the header of.
 * Everything from `DATA;` onward is copied byte for byte; only the header
 * region is re-encoded.
 */
export function stampIfcHeader(bytes: Uint8Array, stamp: IfcHeaderStamp): Uint8Array {
  const split = splitHeader(bytes)
  if (!split) return bytes

  const { header, dataAt } = split
  const span = findEntry(header, 'FILE_NAME')
  if (!span) return bytes

  const args = splitStepArgs(header.slice(span.argsFrom, span.argsTo))
  const current = {
    name: parseStepString(args[0] ?? ''),
    timestamp: parseStepString(args[1] ?? ''),
    author: parseStepList(args[2] ?? ''),
    organization: parseStepList(args[3] ?? ''),
    preprocessorVersion: parseStepString(args[4] ?? ''),
    originatingSystem: parseStepString(args[5] ?? ''),
    authorization: parseStepString(args[6] ?? ''),
  }

  // Only the fields actually being stamped are re-serialised. The rest keep
  // their ORIGINAL TOKEN verbatim, which matters more than it looks: a header
  // may already carry spec-compliant escapes, and round-tripping a value we were
  // not asked to change through parse-then-escape would rewrite its
  // representation for no reason. Untouched means untouched.
  const keep = (i: number, fallback: string): string => args[i] ?? fallback
  const next = [
    keep(0, escapeStepString(current.name)),
    escapeStepString(stamp.timestamp ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')),
    stamp.author ? stepList(stamp.author) : keep(2, "('')"),
    stamp.organization ? stepList(stamp.organization) : keep(3, "('')"),
    stamp.preprocessorVersion !== undefined
      ? escapeStepString(stamp.preprocessorVersion) : keep(4, "''"),
    stamp.originatingSystem !== undefined
      ? escapeStepString(stamp.originatingSystem) : keep(5, "''"),
    stamp.authorization !== undefined
      ? escapeStepString(stamp.authorization) : keep(6, "''"),
  ].join(',')

  const rewritten = header.slice(0, span.argsFrom) + next + header.slice(span.argsTo)

  // Re-encode the header only. latin1 out is the inverse of latin1 in, so every
  // byte we did not touch is identical; the tail is copied without decoding at
  // all, which is what keeps this safe on a 500 MB model.
  const headBytes = new Uint8Array(rewritten.length)
  for (let i = 0; i < rewritten.length; i++) headBytes[i] = rewritten.charCodeAt(i) & 0xff

  const out = new Uint8Array(headBytes.length + (bytes.length - dataAt))
  out.set(headBytes, 0)
  out.set(bytes.subarray(dataAt), headBytes.length)
  return out
}
