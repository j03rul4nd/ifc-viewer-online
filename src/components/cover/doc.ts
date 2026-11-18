// ─── The studio document ───────────────────────────────────────────────────────
// Everything the user decides about a cover or a deck, as one value — so undo
// is a stack of values, a saved style is a slice of one, and what survives a
// reload is the rest of it. Shots (bitmaps) and the project title (it follows
// the loaded model) are never persisted.

import { COVER_FORMAT_IDS, type CoverFormatId } from '../../lib/cover/formats'
import { COVER_TEMPLATE_IDS, type CoverTemplateId } from '../../lib/cover/templates'
import { COVER_PALETTES } from '../../lib/cover/palettes'
import { DEFAULT_DECK, normaliseDeck, type DeckOptions } from '../../lib/cover/deck'
import { DEFAULT_DESIGN, normaliseDesign, type CoverDesign } from '../../lib/cover/design'
import { DEFAULT_AUTO_FACTS, MAX_CUSTOM_FACTS, type AutoFactToggles } from '../../lib/cover/facts'
import { LIGHT_IDS, type LightId } from '../../lib/cover/lighting'
import { LOOK_IDS, type LookId } from '../../lib/cover/looks'
import { isHex } from '../../lib/cover/color'
import type { CoverContent, CoverFact, CoverShot } from '../../lib/cover/types'
import type { CaptureRes } from './useCoverCapture'

export type Mode = 'cover' | 'deck'
export type TextContent = Omit<CoverContent, 'logo'>
export type TextField = keyof TextContent

export const TEXT_FIELDS: TextField[] = ['title', 'subtitle', 'client', 'location', 'date', 'studio', 'tagline', 'concept']

/** Palettes that aren't stock: the user's three picks, or sampled from the hero. */
export type SpecialPalette = 'custom' | 'image' | 'image-dark'
export const SPECIAL_PALETTES: readonly SpecialPalette[] = ['image', 'image-dark', 'custom']

export interface StudioDoc {
  mode: Mode
  template: CoverTemplateId
  /** A stock palette id or a SpecialPalette. */
  paletteId: string
  custom: { bg: string; fg: string; accent: string }
  format: CoverFormatId
  deck: DeckOptions
  /** Keys of slides the user hid (see deck.ts). */
  hidden: string[]
  text: TextContent
  facts: CoverFact[]
  autoFacts: AutoFactToggles
  design: CoverDesign
  shots: CoverShot[]
}

/** Capture-side settings that persist but aren't part of the undoable document. */
export interface CaptureState {
  res: CaptureRes
  light: LightId
  sunAzimuth: number | null
  look: LookId
}

interface Persisted {
  doc: Omit<StudioDoc, 'shots' | 'text'> & { text: Omit<TextContent, 'title'> }
  capture: CaptureState
  logo: string | null
}

const LS_KEY = 'ifc-cover-studio:v2'
const LS_V1 = 'ifc-cover-studio:v1'
const LS_STYLES = 'ifc-cover-studio:styles:v1'

const EMPTY_TEXT: Omit<TextContent, 'title'> = { subtitle: '', client: '', location: '', date: '', studio: '', tagline: '', concept: '', website: '' }

export const DEFAULT_CUSTOM = { bg: '#F4F1EA', fg: '#151412', accent: '#2F55FF' }

export const DEFAULT_CAPTURE: CaptureState = { res: 2, light: 'studio', sunAzimuth: null, look: 'asis' }

function defaults(): Persisted {
  return {
    doc: {
      mode: 'cover', template: 'monolith', paletteId: 'noir', custom: DEFAULT_CUSTOM, format: 'slide',
      deck: DEFAULT_DECK, hidden: [], text: EMPTY_TEXT, facts: [], autoFacts: DEFAULT_AUTO_FACTS, design: DEFAULT_DESIGN,
    },
    capture: DEFAULT_CAPTURE,
    logo: null,
  }
}

function isPaletteId(id: unknown): id is string {
  return typeof id === 'string' && (COVER_PALETTES.some((p) => p.id === id) || (SPECIAL_PALETTES as readonly string[]).includes(id))
}

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function readText(o: unknown): Omit<TextContent, 'title'> {
  const t = (o ?? {}) as Record<string, unknown>
  return {
    subtitle: str(t.subtitle), client: str(t.client), location: str(t.location), date: str(t.date),
    studio: str(t.studio), tagline: str(t.tagline), concept: str(t.concept), website: str(t.website, 500),
  }
}

function readFacts(o: unknown): CoverFact[] {
  if (!Array.isArray(o)) return []
  return o.slice(0, MAX_CUSTOM_FACTS).map((f) => ({ label: str((f as CoverFact)?.label, 80), value: str((f as CoverFact)?.value, 120) }))
}

function readAutoFacts(o: unknown): AutoFactToggles {
  const a = (o ?? {}) as Partial<Record<keyof AutoFactToggles, unknown>>
  const out = { ...DEFAULT_AUTO_FACTS }
  for (const k of Object.keys(out) as Array<keyof AutoFactToggles>) if (typeof a[k] === 'boolean') out[k] = a[k] as boolean
  return out
}

/** Whatever is stored, sanitised; the v1 studio's settings carry over. */
export function readPersisted(): Persisted {
  const d = defaults()
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const o = JSON.parse(raw) as Partial<Persisted>
      const doc = (o.doc ?? {}) as Partial<Persisted['doc']>
      const cap = (o.capture ?? {}) as Partial<CaptureState>
      const custom = doc.custom && isHex(doc.custom.bg ?? '') && isHex(doc.custom.fg ?? '') && isHex(doc.custom.accent ?? '') ? doc.custom : DEFAULT_CUSTOM
      return {
        doc: {
          mode: doc.mode === 'deck' ? 'deck' : 'cover',
          template: doc.template && COVER_TEMPLATE_IDS.includes(doc.template) ? doc.template : d.doc.template,
          paletteId: isPaletteId(doc.paletteId) ? doc.paletteId : d.doc.paletteId,
          custom,
          format: doc.format && COVER_FORMAT_IDS.includes(doc.format) ? doc.format : d.doc.format,
          deck: normaliseDeck(doc.deck),
          hidden: Array.isArray(doc.hidden) ? doc.hidden.filter((k): k is string => typeof k === 'string').slice(0, 200) : [],
          text: readText(doc.text),
          facts: readFacts(doc.facts),
          autoFacts: readAutoFacts(doc.autoFacts),
          design: normaliseDesign(doc.design),
        },
        capture: {
          res: cap.res === 1 || cap.res === 4 ? cap.res : 2,
          light: cap.light && LIGHT_IDS.includes(cap.light) ? cap.light : 'studio',
          sunAzimuth: typeof cap.sunAzimuth === 'number' && Number.isFinite(cap.sunAzimuth) ? cap.sunAzimuth : null,
          look: cap.look && LOOK_IDS.includes(cap.look) ? cap.look : 'asis',
        },
        logo: typeof o.logo === 'string' && o.logo.startsWith('data:image/') ? o.logo : null,
      }
    }
    const v1 = localStorage.getItem(LS_V1)
    if (v1) {
      const o = JSON.parse(v1) as Record<string, unknown>
      return {
        ...d,
        doc: {
          ...d.doc,
          mode: o.mode === 'deck' ? 'deck' : 'cover',
          template: COVER_TEMPLATE_IDS.includes(o.template as CoverTemplateId) ? (o.template as CoverTemplateId) : d.doc.template,
          paletteId: isPaletteId(o.palette) ? o.palette : d.doc.paletteId,
          format: COVER_FORMAT_IDS.includes(o.format as CoverFormatId) ? (o.format as CoverFormatId) : d.doc.format,
          deck: normaliseDeck(o.deck as Partial<DeckOptions>),
          text: readText(o.text),
        },
        capture: { ...d.capture, res: o.res === 1 || o.res === 4 ? o.res : 2 },
        logo: typeof o.logo === 'string' && o.logo.startsWith('data:image/') ? o.logo : null,
      }
    }
  } catch { /* corrupt or blocked storage: start clean */ }
  return d
}

export function writePersisted(doc: StudioDoc, capture: CaptureState, logo: string | null): void {
  const { shots: _shots, text, ...rest } = doc
  const { title: _title, ...keep } = text
  const p: Persisted = { doc: { ...rest, text: keep }, capture, logo }
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)) } catch { /* quota / private mode */ }
}

// ── Saved styles ──────────────────────────────────────────────────────────────
// A studio's house style: template, colours, type, texture, finish, light and
// format — everything but the project's own words and pictures.

export interface SavedStyle {
  id: string
  name: string
  template: CoverTemplateId
  paletteId: string
  custom: { bg: string; fg: string; accent: string }
  format: CoverFormatId
  design: CoverDesign
  light: LightId
  sunAzimuth: number | null
}

export const MAX_STYLES = 24

export function readStyles(): SavedStyle[] {
  try {
    const raw = localStorage.getItem(LS_STYLES)
    const list = raw ? (JSON.parse(raw) as Partial<SavedStyle>[]) : []
    if (!Array.isArray(list)) return []
    return list.slice(0, MAX_STYLES).flatMap((s) => {
      if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') return []
      if (!s.template || !COVER_TEMPLATE_IDS.includes(s.template)) return []
      return [{
        id: s.id, name: s.name.slice(0, 60), template: s.template,
        paletteId: isPaletteId(s.paletteId) ? s.paletteId : COVER_PALETTES[0].id,
        custom: s.custom && isHex(s.custom.bg ?? '') && isHex(s.custom.fg ?? '') && isHex(s.custom.accent ?? '') ? s.custom : DEFAULT_CUSTOM,
        format: s.format && COVER_FORMAT_IDS.includes(s.format) ? s.format : 'slide',
        design: normaliseDesign(s.design),
        light: s.light && LIGHT_IDS.includes(s.light) ? s.light : 'studio',
        sunAzimuth: typeof s.sunAzimuth === 'number' ? s.sunAzimuth : null,
      }]
    })
  } catch {
    return []
  }
}

export function writeStyles(list: SavedStyle[]): void {
  try { localStorage.setItem(LS_STYLES, JSON.stringify(list.slice(0, MAX_STYLES))) } catch { /* quota / private mode */ }
}
