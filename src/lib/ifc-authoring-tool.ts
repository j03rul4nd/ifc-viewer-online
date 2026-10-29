// ─── Authoring tool from the IFC header ───────────────────────────────────────
// Every IFC file starts with a STEP header whose FILE_NAME record names the
// exporting application (preprocessor_version, originating_system). Reading it
// lets the remediation steps (i18n/rule-remediation.ts) open on the tool the
// model actually came from instead of always on Revit.
//
// Only the first bytes are read: the header precedes DATA; and it is plain
// ASCII, so a byte-for-byte decode is enough (no full-file text decode).
// Revit's exporter leaves its own name out of FILE_NAME ("21.1.0.0 - Exporter
// 21.1.0.0 - Alternate UI 21.1.0.0") and writes it in the IFCAPPLICATION
// entity near the top of DATA, so that entity is read as well.

import type { AuthoringTool } from '../i18n/rule-remediation'

/** The header is tiny; 64 KiB is far more than any FILE_NAME needs. */
const HEADER_BYTES = 64 * 1024

export interface DetectedAuthoringTool {
  tool: AuthoringTool
  /** The application string as written in the file, e.g. "Autodesk Revit 2024 (ESP)". */
  application: string
}

const MATCHERS: { tool: AuthoringTool; re: RegExp }[] = [
  { tool: 'revit', re: /revit/i },
  { tool: 'archicad', re: /archicad|graphisoft/i },
  { tool: 'tekla', re: /tekla/i },
  { tool: 'allplan', re: /allplan/i },
]

/** The first bytes of a STEP file as text (header plus the first entities). */
export function readStepStart(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, HEADER_BYTES))
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x2000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x2000))
  }
  return text
}

/** The header section of a STEP file (text before DATA;). */
export function readStepHeader(buffer: ArrayBuffer): string {
  const text = readStepStart(buffer)
  const end = text.search(/\bDATA\s*;/)
  return end >= 0 ? text.slice(0, end) : text
}

/** The quoted strings of the first record matching `head`, in order. */
function recordStrings(text: string, head: RegExp): string[] {
  const start = text.search(head)
  if (start < 0) return []
  const rec = text.slice(start, text.indexOf(');', start) + 1 || undefined)
  return [...rec.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"))
}

/**
 * Which supported authoring tool exported the file, if any. Looks at
 * FILE_NAME's originating_system, then preprocessor_version, then the rest of
 * FILE_NAME, then the IFCAPPLICATION entity (exporters disagree on which field
 * they fill). `text` is the start of the file (readStepStart).
 */
export function detectAuthoringTool(text: string): DetectedAuthoringTool | null {
  const strings = recordStrings(text, /FILE_NAME\s*\(/)
  // FILE_NAME(name, time_stamp, (author…), (organization…), preprocessor_version, originating_system, authorization)
  const fromFileName = strings.length ? [strings[strings.length - 2], strings[strings.length - 3], ...strings] : []
  // IFCAPPLICATION(#developer, 'version', 'full name', 'identifier'): quoted strings only
  const app = recordStrings(text, /IFCAPPLICATION\s*\(/i)
  for (const s of [...fromFileName, app[1], app[2]].filter((v): v is string => !!v)) {
    const hit = MATCHERS.find((m) => m.re.test(s))
    if (hit) return { tool: hit.tool, application: s.trim() }
  }
  // Revit's exporter signature, when the application name is nowhere else.
  const revitExporter = fromFileName.find((s) => /exporter .* alternate ui/i.test(s))
  if (revitExporter) return { tool: 'revit', application: 'Autodesk Revit' }
  return null
}

export function detectAuthoringToolFromBuffer(buffer: ArrayBuffer | null): DetectedAuthoringTool | null {
  return buffer ? detectAuthoringTool(readStepStart(buffer)) : null
}
