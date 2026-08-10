// ─── ifc-export-prefs ─────────────────────────────────────────────────────────
// What goes in the exported file's STEP header, remembered between sessions.
//
// This is per-person, not per-model: someone types their name and their firm
// once. Asking again on every export is how a field ends up permanently blank —
// and a blank author on a deliverable is exactly the provenance gap the header
// stamp exists to close.
//
// Deliberately localStorage rather than an account setting. It is a preference
// about how THIS browser exports, it contains a name and an organisation, and
// there is no reason for either to leave the machine.

const LS_KEY = 'ifc-export-header:v1'

export interface IfcExportPrefs {
  /**
   * Whether to record this export in FILE_NAME at all.
   *
   * On by default, and turning it off should feel like a decision: an export
   * that keeps the authoring tool's stamp is claiming the file was never
   * touched. The switch exists because a workflow that diffs exports
   * byte-for-byte has a legitimate reason to want the header frozen.
   */
  stampHeader: boolean
  author: string
  organization: string
  /** FILE_NAME authorization — some delivery specifications require one. */
  authorization: string
}

export const DEFAULT_EXPORT_PREFS: IfcExportPrefs = {
  stampHeader: true,
  author: '',
  organization: '',
  authorization: '',
}

/** Trim, and cap the length a STEP header should reasonably carry. */
function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : ''
}

export function parseExportPrefs(raw: string | null): IfcExportPrefs {
  if (!raw) return { ...DEFAULT_EXPORT_PREFS }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_EXPORT_PREFS }
    const o = parsed as Record<string, unknown>
    return {
      // Anything other than an explicit false keeps stamping on. A corrupt entry
      // must not silently restore the behaviour this feature exists to fix.
      stampHeader: o.stampHeader !== false,
      author: clean(o.author),
      organization: clean(o.organization),
      authorization: clean(o.authorization),
    }
  } catch {
    return { ...DEFAULT_EXPORT_PREFS }
  }
}

export function loadExportPrefs(): IfcExportPrefs {
  try { return parseExportPrefs(localStorage.getItem(LS_KEY)) }
  catch { return { ...DEFAULT_EXPORT_PREFS } }
}

export function saveExportPrefs(prefs: IfcExportPrefs): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)) }
  catch { /* quota / private mode — the export still works, it just forgets */ }
}

/**
 * Turn the preferences into the options `exportAsIfc` takes.
 *
 * Empty fields are OMITTED rather than sent as empty strings, because the two
 * mean different things: omitted leaves whatever the file already carried, and
 * an empty string would wipe an author the authoring tool had filled in. Losing
 * information because a form field was blank is not a defensible default.
 */
export function prefsToExportOptions(prefs: IfcExportPrefs): {
  stampHeader: boolean
  author?: string[]
  organization?: string[]
  authorization?: string
} {
  return {
    stampHeader: prefs.stampHeader,
    ...(prefs.author ? { author: [prefs.author] } : {}),
    ...(prefs.organization ? { organization: [prefs.organization] } : {}),
    ...(prefs.authorization ? { authorization: prefs.authorization } : {}),
  }
}
