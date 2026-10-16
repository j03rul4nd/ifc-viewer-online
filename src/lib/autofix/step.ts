// ─── Minimal STEP (ISO 10303-21) reader/writer for IFC auto-fix ───────────────
// Pure, dependency-free and isomorphic: the same code runs in a browser worker
// today and in a Node worker if the fix moves server-side for large files
// (docs-planning/11). It only understands what the fixes need — entity
// instances in the DATA section and their attribute lists — and leaves every
// line it does not touch byte-for-byte identical.

export type StepValue =
  | { k: 'ref'; id: number }
  | { k: 'str'; v: string }          // plain text: '' and \X2\ escapes decoded
  | { k: 'enum'; v: string }         // without the dots
  | { k: 'num'; raw: string }
  | { k: 'null' }                    // $
  | { k: 'derived' }                 // *
  | { k: 'list'; items: StepValue[] }
  | { k: 'typed'; type: string; value: StepValue } // IFCLABEL('x')

export interface StepEntity {
  id: number
  type: string           // upper-case, e.g. IFCWALL
  args: StepValue[]
  /** Index of the line in `lines` that holds this entity. */
  line: number
}

export interface StepFile {
  lines: string[]
  entities: Map<number, StepEntity>
  schema: 'IFC2X3' | 'IFC4' | 'IFC4X3' | 'UNKNOWN'
  maxId: number
}

// ── Values ────────────────────────────────────────────────────────────────────

class Cursor {
  i = 0
  constructor(readonly s: string) {}
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++ }
  peek() { this.ws(); return this.s[this.i] }
}

function readValue(c: Cursor): StepValue {
  const ch = c.peek()
  if (ch === '#') {
    c.i++
    const m = /^\d+/.exec(c.s.slice(c.i))
    if (!m) throw new Error(`bad ref at ${c.i}`)
    c.i += m[0].length
    return { k: 'ref', id: Number(m[0]) }
  }
  if (ch === "'") {
    c.i++
    let out = ''
    for (;;) {
      if (c.i >= c.s.length) throw new Error('unterminated string')
      const x = c.s[c.i]
      if (x === "'") {
        if (c.s[c.i + 1] === "'") { out += "'"; c.i += 2; continue }
        c.i++
        break
      }
      out += x
      c.i++
    }
    return { k: 'str', v: decodeStepString(out) }
  }
  if (ch === '.') {
    const end = c.s.indexOf('.', c.i + 1)
    const v = c.s.slice(c.i + 1, end)
    c.i = end + 1
    return { k: 'enum', v }
  }
  if (ch === '$') { c.i++; return { k: 'null' } }
  if (ch === '*') { c.i++; return { k: 'derived' } }
  if (ch === '(') {
    c.i++
    const items: StepValue[] = []
    if (c.peek() === ')') { c.i++; return { k: 'list', items } }
    for (;;) {
      items.push(readValue(c))
      const n = c.peek()
      c.i++
      if (n === ')') break
      if (n !== ',') throw new Error(`expected , or ) at ${c.i}`)
    }
    return { k: 'list', items }
  }
  if (/[A-Za-z]/.test(ch ?? '')) {
    const m = /^[A-Za-z0-9_]+/.exec(c.s.slice(c.i))!
    c.i += m[0].length
    if (c.peek() !== '(') throw new Error(`bad keyword ${m[0]}`)
    c.i++
    const value = readValue(c)
    if (c.peek() !== ')') throw new Error('bad typed value')
    c.i++
    return { k: 'typed', type: m[0].toUpperCase(), value }
  }
  const m = /^[-+0-9.Ee]+/.exec(c.s.slice(c.i))
  if (!m) throw new Error(`unexpected '${ch}' at ${c.i}`)
  c.i += m[0].length
  return { k: 'num', raw: m[0] }
}

/** Parse the attribute list of an entity: the text between its outer parentheses. */
export function parseArgs(text: string): StepValue[] {
  const c = new Cursor(`(${text})`)
  const v = readValue(c)
  return v.k === 'list' ? v.items : []
}

function encodeString(s: string): string {
  // STEP \X2\ encoding for non-ASCII keeps the file valid for strict readers.
  let out = ''
  let wide = ''
  const flush = () => { if (wide) { out += `\\X2\\${wide}\\X0\\`; wide = '' } }
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code >= 0x20 && code < 0x7f) {
      flush()
      out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch
    } else if (code <= 0xffff) {
      wide += code.toString(16).toUpperCase().padStart(4, '0')
    } else {
      const hi = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const lo = ((code - 0x10000) % 0x400) + 0xdc00
      wide += hi.toString(16).toUpperCase() + lo.toString(16).toUpperCase()
    }
  }
  flush()
  return `'${out}'`
}

export function writeValue(v: StepValue): string {
  switch (v.k) {
    case 'ref': return `#${v.id}`
    case 'str': return encodeString(v.v)
    case 'enum': return `.${v.v}.`
    case 'num': return v.raw
    case 'null': return '$'
    case 'derived': return '*'
    case 'list': return `(${v.items.map(writeValue).join(',')})`
    case 'typed': return `${v.type}(${writeValue(v.value)})`
  }
}

export function writeEntity(id: number, type: string, args: StepValue[]): string {
  return `#${id}=${type}(${args.map(writeValue).join(',')});`
}

/** Decode STEP string escapes (\X2\…\X0\, \S\, \X\) into plain text. */
export function decodeStepString(s: string): string {
  return s
    .replace(/\\X2\\([0-9A-Fa-f]+)\\X0\\/g, (_, hex: string) => {
      let out = ''
      for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
      return out
    })
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\S\\(.)/g, (_, ch: string) => String.fromCharCode(ch.charCodeAt(0) + 128))
    .replace(/\\\\/g, '\\')
}

export function strValue(v: StepValue | undefined): string {
  if (!v) return ''
  if (v.k === 'str') return v.v
  if (v.k === 'typed') return strValue(v.value)
  return ''
}

// ── File ──────────────────────────────────────────────────────────────────────

const ENTITY_RE = /^\s*#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(([\s\S]*)\)\s*;\s*$/

/**
 * Split a STEP file into lines where each DATA entity sits on one line.
 * Entities that span several physical lines are joined; everything else
 * (header, comments, blank lines) is preserved as-is.
 */
export function readStep(text: string): StepFile {
  const raw = text.split(/\r?\n/)
  const lines: string[] = []
  const entities = new Map<number, StepEntity>()
  let maxId = 0
  let pending = ''
  let inData = false

  for (const l of raw) {
    if (!inData) {
      lines.push(l)
      if (/^\s*DATA\s*;/i.test(l)) inData = true
      continue
    }
    if (pending) {
      pending += '\n' + l
    } else if (/^\s*#\d+\s*=/.test(l)) {
      pending = l
    } else {
      if (/^\s*ENDSEC\s*;/i.test(l)) inData = false
      lines.push(l)
      continue
    }
    if (!/;\s*$/.test(pending) || insideString(pending)) continue
    const m = ENTITY_RE.exec(pending)
    lines.push(pending)
    if (m) {
      const id = Number(m[1])
      maxId = Math.max(maxId, id)
      try {
        entities.set(id, { id, type: m[2].toUpperCase(), args: parseArgs(m[3]), line: lines.length - 1 })
      } catch {
        // Unparseable entity: keep the line untouched and never edit it.
      }
    }
    pending = ''
  }
  if (pending) lines.push(pending)

  const schemaM = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(text)
  const s = schemaM?.[1].toUpperCase() ?? ''
  const schema = s.startsWith('IFC2X3') ? 'IFC2X3' : s.startsWith('IFC4X3') ? 'IFC4X3' : s.startsWith('IFC4') ? 'IFC4' : 'UNKNOWN'
  return { lines, entities, schema, maxId }
}

/** True when `s` ends inside an open STEP string literal (a ';' inside a name). */
function insideString(s: string): boolean {
  let open = false
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "'") continue
    if (open && s[i + 1] === "'") { i++; continue }
    open = !open
  }
  return open
}

/** Replace an entity's attributes in place (same id, same line). */
export function replaceEntity(f: StepFile, e: StepEntity, args: StepValue[]): void {
  e.args = args
  f.lines[e.line] = writeEntity(e.id, e.type, args)
}

/** Append new entities just before the DATA section's ENDSEC. */
export function appendEntities(f: StepFile, newLines: string[]): void {
  let end = -1
  let seenData = false
  for (let i = 0; i < f.lines.length; i++) {
    if (/^\s*DATA\s*;/i.test(f.lines[i])) seenData = true
    else if (seenData && /^\s*ENDSEC\s*;/i.test(f.lines[i])) { end = i; break }
  }
  if (end < 0) throw new Error('DATA section not closed')
  f.lines.splice(end, 0, ...newLines)
}

export function nextId(f: StepFile): number {
  f.maxId += 1
  return f.maxId
}

export function writeStep(f: StepFile): string {
  return f.lines.join('\n')
}
