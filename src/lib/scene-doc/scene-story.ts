// ─── scene-story ──────────────────────────────────────────────────────────────
// A guided tour a scene can carry: a few steps that say what the visitor is
// looking at and why it matters, each with its own camera, the binding it is
// about, and text that quotes that binding's live value.
//
//   "story": { "steps": [
//     { "title": { "en": "A bike station that reports itself", "es": "…" },
//       "text":  { "en": "…Right now: {value} bikes available.", "es": "…" },
//       "binding": "bicing-65-docks" },
//     { "title": "…", "text": "…", "camera": { "position": [x, y, z], "target": [x, y, z] } }
//   ] }
//
// Text is per language (a plain string serves every language). `{value}` is
// replaced by the binding's current value, or an ellipsis until it arrives.
// A step with a binding and no camera frames the binding's elements.

export type LocalizedText = string | Record<string, string>

export interface SceneStoryStep {
  title: LocalizedText
  text: LocalizedText
  /** Scene coordinates (metres, Y up), as `view.camera`. */
  camera?: { position: [number, number, number]; target: [number, number, number] }
  /** Id of a twin binding: its elements are framed and its value fills `{value}`. */
  binding?: string
}

export interface SceneStory { steps: SceneStoryStep[] }

const MAX_STEPS = 12
const MAX_TEXT = 600

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)
const vec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

function localized(v: unknown): LocalizedText | null {
  if (typeof v === 'string') return v.trim() ? v.slice(0, MAX_TEXT) : null
  if (!isObj(v)) return null
  const out: Record<string, string> = {}
  for (const [k, s] of Object.entries(v)) if (/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(k) && typeof s === 'string' && s.trim()) out[k] = s.slice(0, MAX_TEXT)
  return Object.keys(out).length ? out : null
}

/** Read `story` from a scene document; invalid steps are dropped with a warning. */
export function parseStory(input: unknown, bindingIds: ReadonlySet<string>, warnings: string[]): SceneStory | undefined {
  if (input === undefined) return undefined
  if (!isObj(input) || !Array.isArray(input.steps)) { warnings.push('story: needs a steps list; ignored.'); return undefined }
  const steps: SceneStoryStep[] = []
  input.steps.slice(0, MAX_STEPS).forEach((s, i) => {
    if (!isObj(s)) { warnings.push(`story.steps[${i}]: not an object; skipped.`); return }
    const title = localized(s.title)
    const text = localized(s.text)
    if (!title || !text) { warnings.push(`story.steps[${i}]: needs a title and a text; skipped.`); return }
    const step: SceneStoryStep = { title, text }
    if (s.camera !== undefined) {
      if (isObj(s.camera) && vec3(s.camera.position) && vec3(s.camera.target)) step.camera = { position: s.camera.position, target: s.camera.target }
      else warnings.push(`story.steps[${i}].camera: needs position and target as [x, y, z]; ignored.`)
    }
    if (s.binding !== undefined) {
      if (typeof s.binding === 'string' && bindingIds.has(s.binding)) step.binding = s.binding
      else warnings.push(`story.steps[${i}].binding: no binding with that id in twin.bindings; ignored.`)
    }
    steps.push(step)
  })
  if (input.steps.length > MAX_STEPS) warnings.push(`story.steps: only the first ${MAX_STEPS} steps are used.`)
  return steps.length ? { steps } : undefined
}

/** The text in `lang`: exact, then its base language, then English, then whatever there is. */
export function pickText(t: LocalizedText, lang: string): string {
  if (typeof t === 'string') return t
  const base = lang.split('-')[0]
  return t[lang] ?? t[base] ?? t.en ?? Object.values(t)[0] ?? ''
}

/** The step's text with `{value}` filled in — an ellipsis while the value is unknown. */
export function fillStoryText(text: string, value: string | null): string {
  return text.replace(/\{value\}/g, value ?? '…')
}
