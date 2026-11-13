// Shape of the copy behind scripts/seo/generate-solution-landings.ts.
//
// Text is plain, with one piece of markup: [link text](key), where key is one
// of LINK_KEYS (pages.ts). The generator turns it into a link in the page's own
// language, so a translation never carries a URL.
//
// Anything said about another vendor must come from its own pages (SOURCES in
// pages.ts, each with the day it was read) and the section that says it must
// name its sources: solution-landings.test.ts fails otherwise.

export type Solution = 'contractors' | 'engineering'
export type Lang = 'en' | 'es' | 'de' | 'fr' | 'pt' | 'it' | 'ca' | 'zh' | 'ja' | 'th'
export type SourceKey =
  | 'ukbimPartC' | 'skanska' | 'cmTier2' | 'bimCorner'
  | 'catenda' | 'dalux' | 'acc' | 'bimcollab' | 'solibri'

/** Paragraphs. */
export interface TextSection { kind: 'text'; label: string; h2: string; ps: string[]; sources?: SourceKey[] }
/** A table; the first column is the row header. `after` is prose under it. */
export interface TableSection { kind: 'table'; label: string; h2: string; sub?: string; head: string[]; rows: string[][]; after?: string[]; sources?: SourceKey[] }
/** Two or three lists side by side. */
export interface ColsSection { kind: 'cols'; label: string; h2: string; sub?: string; cols: { h: string; items: string[] }[] }
/** The flow: one step per capture, in the order of pages.ts FLOW. */
export interface FlowSection { kind: 'flow'; label: string; h2: string; sub?: string; steps: { h: string; p: string; alt: string; cap: string }[] }
export type Section = TextSection | TableSection | ColsSection | FlowSection

export interface PageCopy {
  /** <title>, at most 60 characters. */
  title: string
  /** Meta description, at most 160 characters. */
  desc: string
  /** Short name for links. */
  nav: string
  /** The line above the h1. */
  kicker: string
  /** h1 in two parts: the result, then who it is for. */
  h1: [string, string]
  lead: string
  cta: string
  /** Second link next to the button (the blog post about it). */
  cta2: string
  /** Says plainly that the paid part is a preview. */
  note: string
  hero: { alt: string; cap: string }
  sections: Section[]
  faq: [string, string][]
  faqSources?: SourceKey[]
  bottom: [string, string]
}

/** Strings shared by both pages of a language. */
export interface UiCopy {
  home: string
  sources: string
  /** "read on" — followed by the ISO date. */
  readOn: string
  /** Small tag on the flow steps: none of them is available yet. */
  preview: string
  faqLabel: string
  faqTitle: string
  related: string
  pricing: string
  /** Link texts to the three preview-feature blog posts. */
  postReception: string
  postClash: string
  postBatch: string
  postSupplier: string
}

export interface LangCopy { ui: UiCopy; pages: Record<Solution, PageCopy> }
