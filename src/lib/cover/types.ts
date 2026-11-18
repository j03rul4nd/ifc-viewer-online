// ─── Cover Studio types ────────────────────────────────────────────────────────
// Everything a template needs to paint one slide, as plain data. The images are
// opaque decoded handles (ImageBitmap / HTMLImageElement) — the renderer never
// reaches back into the viewer, so a template is a pure function of its spec and
// the same spec paints the live preview, the thumbnails and the export.

import type { CoverDesign } from './design'

export type CoverImage = CanvasImageSource & { width: number; height: number }

/**
 * How a shot sits in its frame. `x`/`y` (0–1) pick which part of the picture
 * survives the object-fit:cover crop (0 = left/top edge, 1 = right/bottom);
 * `zoom` ≥ 1 punches in further around that point.
 */
export interface ShotCrop { x: number; y: number; zoom: number }

/** One capture of the model: the current view or an auto-framed preset. */
export interface CoverShot {
  id: string
  /** Short caption ("Axonometric", "North elevation"…), already translated. */
  label: string
  image: CoverImage
  /** User framing; absent = the template's own default. */
  crop?: ShotCrop
}

/** The text the user fills in. Empty strings are simply not drawn. */
export interface CoverContent {
  title: string
  subtitle: string
  client: string
  location: string
  date: string
  studio: string
  /** One-liner under the title or on the closing slide. */
  tagline: string
  /** Concept statement — the paragraph a jury reads on a board. */
  concept: string
  /** Website / contact line; also what the QR code points at. */
  website: string
  /** Optional uploaded logo, drawn small in the corner the template reserves. */
  logo: CoverImage | null
}

/** Numbers read from the loaded model(s) — the part no stock template has. */
export interface CoverStats {
  elements: number
  categories: number
  models: number
  /** Health Score 0–100 when a validation ran, else null (never invented). */
  score: number | null
  /** Largest categories first, for the data slide's bar chart. */
  topCategories: Array<{ label: string; count: number }>
}

/** One line of a project sheet: "Client — Ajuntament de Barcelona". */
export interface CoverFact {
  label: string
  value: string
}

export interface CoverPalette {
  id: string
  bg: string
  fg: string
  muted: string
  accent: string
  /** Colour of text drawn ON the accent (accent blocks, chips). */
  onAccent: string
  /** Hairlines and grids. */
  line: string
}

export type SlideKind = 'cover' | 'project' | 'statement' | 'view' | 'grid' | 'data' | 'closing'

/** Labels the renderer needs for fixed copy, already translated by the UI. */
export interface CoverLabels {
  client: string
  location: string
  date: string
  studio: string
  elements: string
  categories: string
  models: string
  score: string
  sheet: string
  contents: string
  thanks: string
  concept: string
  /** "{{pct}} % of the model" style suffix is built in the template; this is the noun. */
  ofModel: string
  /** Heading of a facts table ("Project data"). */
  facts: string
  /** Heading of a colour-story strip ("Colour story"). */
  palette: string
  /** Heading of the project slide ("The project"). */
  project: string
  /** Caption next to a QR code ("Scan to view"). */
  scan: string
  /** Film date stamp, already formatted ("'26 09 25"). */
  stamp: string
}

export interface CoverSpec {
  width: number
  height: number
  palette: CoverPalette
  content: CoverContent
  /** Primary shot first; templates that want more take the next ones. */
  shots: CoverShot[]
  stats: CoverStats
  labels: CoverLabels
  kind: SlideKind
  /** Category the shots highlight (spotlight / x-ray looks), if any. */
  focus: { label: string; count: number } | null
  /** 1-based position in a deck and the deck length (cover = 1). */
  index: number
  total: number
  watermark: boolean
  /** Key facts — the model's own numbers plus the user's lines — in display order. */
  facts: CoverFact[]
  /** Colours sampled from the hero shot, light to dark; empty when none yet. */
  swatches: string[]
  /** QR modules (true = dark) for content.website, or null when off / empty. */
  qr: boolean[][] | null
  /** What the user layered over the template: type, texture, photo finish. */
  design: CoverDesign
}
