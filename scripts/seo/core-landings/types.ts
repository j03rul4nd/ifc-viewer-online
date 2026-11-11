// Shape of the copy behind scripts/seo/generate-core-landings.ts.
//
// Text is plain, with one piece of markup: [link text](key), where key is one
// of LINK_KEYS (pages.ts). The generator turns it into a link in the page's own
// language, so a translation never carries a URL.
//
// Anything said about Solibri or Flinker must come from their own pages
// (SOURCES in pages.ts, read on COMPARED_ON) and the section that says it must
// name its sources: core-landings.test.ts fails the build otherwise.

export type Family = 'validator' | 'cloud' | 'onprem' | 'solibri' | 'webchecker' | 'mac'
export type Lang = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'it' | 'ca' | 'zh' | 'ja' | 'th'
export type SourceKey =
  | 'solibriPricing' | 'solibriLegacy' | 'solibriStarter' | 'solibriEssential' | 'solibriAdvanced' | 'solibriWebchecker'
  | 'flinkerViewer'

/** Two or three lists side by side: what it checks / what it does not. */
export interface ColsSection { kind: 'cols'; label: string; h2: string; sub?: string; cols: { h: string; items: string[] }[]; sources?: SourceKey[] }
/** A table; the first column is the row header. `after` is prose under it (the verdict). */
export interface TableSection { kind: 'table'; label: string; h2: string; sub?: string; head: string[]; rows: string[][]; after?: string[]; sources?: SourceKey[] }
/** Paragraphs. */
export interface TextSection { kind: 'text'; label: string; h2: string; ps: string[]; sources?: SourceKey[] }
/** Numbered steps. */
export interface StepsSection { kind: 'steps'; label: string; h2: string; sub?: string; steps: [string, string][] }
/** The second capture and the live demo. */
export interface ShotSection { kind: 'shot'; label: string; h2: string; sub?: string }
/** The pilot request form (on-premise only). */
export interface FormSection {
  kind: 'form'; label: string; h2: string; sub: string
  org: string; sector: string; sectors: string[]; deploy: string; deploys: string[]; hw: string; hws: string[]
  need: string; submit: string; direct: string; subject: string
}
export type Section = ColsSection | TableSection | TextSection | StepsSection | ShotSection | FormSection

export interface PageCopy {
  /** <title>, at most 60 characters. */
  title: string
  /** Meta description, at most 160 characters. */
  desc: string
  /** Short name for links to this page (footer, related pages). */
  nav: string
  /** The line of facts above the h1. */
  kicker: string
  /** h1 in two parts: the searched term, then the rest. */
  h1: [string, string]
  lead: string
  cta: string
  /** Second, quieter link next to the button (opens the sample model). Empty on the on-premise page. */
  cta2: string
  note: string
  /** Sources for anything the first screen says about a competitor. */
  heroSources?: SourceKey[]
  /** The two captures: alt text and visible caption. */
  shots: [{ alt: string; cap: string }, { alt: string; cap: string }]
  sections: Section[]
  faq: [string, string][]
  faqSources?: SourceKey[]
  bottom: [string, string]
}

/** Strings shared by every page of a language. */
export interface UiCopy {
  home: string
  /** "Sources" */
  sources: string
  /** "read on" — followed by the ISO date. */
  readOn: string
  faqLabel: string
  faqTitle: string
  related: string
  fix: string
  /** Link text to the long comparison article in the blog. */
  blogSolibri: string
  pricing: string
  embedCta: string
  embedSub: string
}

export interface LangCopy { ui: UiCopy; pages: Record<Family, PageCopy> }
