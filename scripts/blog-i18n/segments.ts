// ─── Blog translation segments ───────────────────────────────────────────────
// A post is mostly structure — block types, slugs, links, code, images,
// numbers — wrapped around prose. Handing the object literal to a translator
// invites the failures that are hard to see in review: a dropped block, a
// "translated" slug or code sample, a link that silently points nowhere.
//
// So a post is split into the strings a translator should see, each keyed by
// where it lives (`content.12.items.3`), and a translation is put back onto a
// COPY of the source. The translated post has the source's structure by
// construction; only its words differ.
//
// Inline links, citations and defined terms travel inside the text as tags, so
// a translator can move them where the sentence needs them:
//   <a to="slug">…</a>   link to another post        { text, to }
//   <a href="url">…</a>  external link                { text, href }
//   <t id="0">…</t>      term with a definition       { text, def } (def is its own key: `<key>@def0`)
//   <cite id="x"/>       citation of post.references  { cite }
//   <cite id="x">…</cite>                            { cite, text }
// checkSegments() verifies every tag survived, unchanged.

import type { BlogPost, ContentBlock, InlineSegment, RichText } from '../../src/lib/blog-posts'

export type Segments = Record<string, string>

type Kind = 'plain' | 'rich'
interface Field { path: string; kind: Kind }

/** A value worth translating: a string with letters, not a symbol or a number. */
const WORDY = /\p{L}/u

function blockFields(b: ContentBlock, at: string, add: (path: string, value: unknown, kind?: Kind) => void): void {
  switch (b.type) {
    case 'p': add(`${at}.text`, b.text, 'rich'); break
    case 'h2': case 'h3': add(`${at}.text`, b.text); break
    case 'ul': case 'ol': b.items.forEach((x, i) => add(`${at}.items.${i}`, x)); break
    case 'code': break
    case 'callout': add(`${at}.text`, b.text, 'rich'); add(`${at}.title`, b.title); break
    case 'takeaways': add(`${at}.title`, b.title); b.items.forEach((x, i) => add(`${at}.items.${i}`, x, 'rich')); break
    case 'steps':
      b.items.forEach((s, i) => {
        add(`${at}.items.${i}.title`, s.title)
        add(`${at}.items.${i}.body`, s.body, 'rich')
        add(`${at}.items.${i}.detail`, s.detail, 'rich')
        add(`${at}.items.${i}.detailLabel`, s.detailLabel)
      })
      break
    case 'decision':
      add(`${at}.question`, b.question)
      b.options.forEach((o, i) => {
        add(`${at}.options.${i}.label`, o.label)
        add(`${at}.options.${i}.verdict`, o.verdict)
        add(`${at}.options.${i}.body`, o.body, 'rich')
        add(`${at}.options.${i}.linkText`, o.linkText)
      })
      break
    // `section` names a heading of the TARGET post; it is re-pointed at the
    // target's translated heading by relinkSections(), never translated here.
    case 'related': add(`${at}.why`, b.why); break
    case 'tool': add(`${at}.why`, b.why); break
    case 'bars':
      add(`${at}.title`, b.title); add(`${at}.unit`, b.unit); add(`${at}.caption`, b.caption)
      b.items.forEach((x, i) => { add(`${at}.items.${i}.label`, x.label); add(`${at}.items.${i}.note`, x.note) })
      break
    case 'image':
      add(`${at}.alt`, b.alt); add(`${at}.caption`, b.caption)
      b.annotations?.forEach((x, i) => { add(`${at}.annotations.${i}.label`, x.label); add(`${at}.annotations.${i}.text`, x.text) })
      break
    case 'spatial-demo':
      add(`${at}.title`, b.title); add(`${at}.description`, b.description); add(`${at}.posterAlt`, b.posterAlt)
      add(`${at}.launchLabel`, b.launchLabel); add(`${at}.readyLabel`, b.readyLabel)
      break
    case 'video': add(`${at}.title`, b.title); add(`${at}.description`, b.description); add(`${at}.caption`, b.caption); break
    case 'ifc-demo': add(`${at}.title`, b.title); add(`${at}.description`, b.description); break
    case 'embed-configurator': add(`${at}.title`, b.title); add(`${at}.description`, b.description); break
    case 'stat-row':
      b.stats.forEach((s, i) => { add(`${at}.stats.${i}.label`, s.label); add(`${at}.stats.${i}.prefix`, s.prefix); add(`${at}.stats.${i}.suffix`, s.suffix) })
      break
    case 'feature-grid': b.items.forEach((x, i) => { add(`${at}.items.${i}.title`, x.title); add(`${at}.items.${i}.body`, x.body) }); break
    case 'comparison':
      for (const side of ['left', 'right'] as const) {
        add(`${at}.${side}.label`, b[side].label)
        b[side].items.forEach((x, i) => add(`${at}.${side}.items.${i}`, x))
      }
      break
    case 'health-score': b.items.forEach((x, i) => add(`${at}.items.${i}.label`, x.label)); break
    case 'pull-quote': add(`${at}.text`, b.text); add(`${at}.cite`, b.cite); break
    case 'ebook-cta': add(`${at}.headline`, b.headline); add(`${at}.body`, b.body); add(`${at}.cta`, b.cta); break
    case 'table':
      b.headers.forEach((x, i) => add(`${at}.headers.${i}`, x))
      b.rows.forEach((row, r) => row.forEach((x, c) => add(`${at}.rows.${r}.${c}`, x)))
      add(`${at}.caption`, b.caption)
      break
  }
}

/** Every translatable place in a post, in reading order. */
export function translatableFields(post: BlogPost): Field[] {
  const fields: Field[] = []
  const add = (path: string, value: unknown, kind: Kind = 'plain'): void => {
    const wordy = typeof value === 'string'
      ? WORDY.test(value)
      : Array.isArray(value) && value.some((s) => typeof s === 'string' ? WORDY.test(s) : 'text' in s && WORDY.test(s.text ?? ''))
    if (wordy) fields.push({ path, kind })
  }
  add('title', post.title)
  add('excerpt', post.excerpt)
  add('seoTitle', post.seoTitle)
  add('seoDescription', post.seoDescription)
  add('heroAlt', post.heroAlt)
  post.keywords?.forEach((k, i) => add(`keywords.${i}`, k))
  post.faqs?.forEach((f, i) => { add(`faqs.${i}.q`, f.q); add(`faqs.${i}.a`, f.a) })
  post.references?.forEach((r, i) => { add(`references.${i}.title`, r.title); add(`references.${i}.note`, r.note) })
  post.videos?.forEach((v, i) => { add(`videos.${i}.name`, v.name); add(`videos.${i}.description`, v.description) })
  post.content.forEach((b, i) => blockFields(b, `content.${i}`, add))
  return fields
}

/* eslint-disable @typescript-eslint/no-explicit-any -- walking a known shape by path */
function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => o?.[k], obj)
}
function setPath(obj: any, path: string, value: unknown): void {
  const keys = path.split('.')
  const last = keys.pop()!
  keys.reduce((o, k) => o[k], obj)[last] = value
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Inline tags ─────────────────────────────────────────────────────────────

const TAG = /<a to="([^"]+)">([\s\S]*?)<\/a>|<a href="([^"]+)">([\s\S]*?)<\/a>|<t id="(\d+)">([\s\S]*?)<\/t>|<cite id="([^"]+)"\s*\/>|<cite id="([^"]+)">([\s\S]*?)<\/cite>/g
const STRAY_TAG = /<\/?(?:a|t|cite)\b[^>]*>/

function encodeRich(text: RichText, key: string, out: Segments): void {
  if (typeof text === 'string') { out[key] = text; return }
  let defs = 0
  out[key] = text.map((seg: InlineSegment) => {
    if (typeof seg === 'string') return seg
    if ('cite' in seg) return seg.text ? `<cite id="${seg.cite}">${seg.text}</cite>` : `<cite id="${seg.cite}"/>`
    if ('def' in seg) {
      const n = defs++
      out[`${key}@def${n}`] = seg.def
      return `<t id="${n}">${seg.text}</t>`
    }
    if ('to' in seg) return `<a to="${seg.to}">${seg.text}</a>`
    return `<a href="${seg.href}">${seg.text}</a>`
  }).join('')
}

function decodeRich(text: string, key: string, segs: Segments, asArray: boolean): RichText {
  const out: InlineSegment[] = []
  let last = 0
  for (const m of text.matchAll(TAG)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    if (m[1]) out.push({ text: m[2], to: m[1] })
    else if (m[3]) out.push({ text: m[4], href: m[3] })
    else if (m[5]) out.push({ text: m[6], def: segs[`${key}@def${m[5]}`] })
    else if (m[7]) out.push({ cite: m[7] })
    else out.push({ cite: m[8], text: m[9] })
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  // A source that was an array stays one, even with no tags left in it.
  return out.length === 0 || (!asArray && out.length === 1 && typeof out[0] === 'string') ? text : out
}

/** The tags a string carries, as a sorted list — equal lists mean no link was lost or changed. */
function tagSignature(text: string): string {
  return [...text.matchAll(TAG)]
    .map((m) => (m[1] ? `to:${m[1]}` : m[3] ? `href:${m[3]}` : m[5] ? `def:${m[5]}` : m[7] ? `cite:${m[7]}` : `cite:${m[8]}+text`))
    .sort()
    .join(' ')
}

// ── Extract / apply ─────────────────────────────────────────────────────────

/**
 * The strings of a post, keyed by path. With `listing`, `seoTitle` and
 * `seoDescription` are always present (falling back to title/excerpt): a
 * translation needs its own search-listing copy, since the budget that a
 * source title fits is not the budget its translation fits.
 */
export function extractSegments(post: BlogPost, { listing = false } = {}): Segments {
  const out: Segments = {}
  for (const { path, kind } of translatableFields(post)) {
    const value = getPath(post, path)
    if (kind === 'rich') encodeRich(value as RichText, path, out)
    else out[path] = value as string
  }
  if (listing) {
    out.seoTitle ??= post.title
    out.seoDescription ??= post.excerpt
  }
  return out
}

/** A copy of `source` carrying the translated strings. Structure is the source's. */
export function applySegments(source: BlogPost, segs: Segments): BlogPost {
  const post = structuredClone(source)
  for (const { path, kind } of translatableFields(source)) {
    const text = segs[path]
    if (text === undefined) throw new Error(`${source.slug}: no translation for ${path}`)
    setPath(post, path, kind === 'rich' ? decodeRich(text, path, segs, Array.isArray(getPath(source, path))) : text)
  }
  if (segs.seoTitle) post.seoTitle = segs.seoTitle
  if (segs.seoDescription) post.seoDescription = segs.seoDescription
  return post
}

// ── Checks ──────────────────────────────────────────────────────────────────

export type Script = 'zh' | 'ja' | 'th' | 'latin'

const SCRIPT_OF: Record<string, RegExp> = {
  zh: /\p{Script=Han}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,
  th: /\p{Script=Thai}/u,
}
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u
/** Three or more ordinary words: prose, not a product name or an entity like IfcWallStandardCase. */
const ENGLISH_PROSE = /(?:\b[a-z]{3,}\b[^a-z]+){3,}/i
/**
 * English grammar words. A value left in Latin script is fine when it is a
 * list of names ("IFC Viewer Online, Solibri, IfcOpenShell") — those have
 * none of these; an untranslated sentence has several.
 */
const FUNCTION_WORDS = /\b(?:the|and|or|of|to|for|with|is|are|was|be|in|on|at|by|from|your|you|this|that|it|not|can|will|when|what|how)\b/gi
/** The subset that is a word in none of es/de/fr/pt/it/ca ("was", "will", "in", "an" are German). */
const ENGLISH_ONLY = /\b(?:the|and|with|your|you|this|that|is|are|from|what|how|when|which|should|would|could|they|their|there)\b/gi

export interface SegmentProblem { key: string; problem: string }

/**
 * What can be checked without reading the language: every key translated,
 * every inline tag intact, and the text actually in the target script.
 */
export function checkSegments(source: Segments, translated: Segments, lang: string): SegmentProblem[] {
  const problems: SegmentProblem[] = []
  const script = SCRIPT_OF[lang]
  for (const [key, src] of Object.entries(source)) {
    const out = translated[key]
    if (out === undefined) { problems.push({ key, problem: 'missing' }); continue }
    if (typeof out !== 'string' || out.trim() === '') { problems.push({ key, problem: 'empty' }); continue }
    if (tagSignature(src) !== tagSignature(out)) {
      problems.push({ key, problem: `inline tags changed: [${tagSignature(src)}] → [${tagSignature(out)}]` })
    }
    if (STRAY_TAG.test(out.replace(TAG, ''))) problems.push({ key, problem: 'malformed inline tag' })
    const grammar = out.replace(TAG, '').match(FUNCTION_WORDS)?.length ?? 0
    if (script && ENGLISH_PROSE.test(src.replace(TAG, '')) && !script.test(out) && grammar >= 2) {
      problems.push({ key, problem: 'looks untranslated' })
    }
    // Latin-script targets can't be told from English by their letters; an
    // English sentence left in place still has English grammar words.
    if (!script && lang !== 'en' && ENGLISH_PROSE.test(src.replace(TAG, '')) && (out.replace(TAG, '').match(ENGLISH_ONLY)?.length ?? 0) >= 3) {
      problems.push({ key, problem: 'looks untranslated' })
    }
    if (lang === 'ja' && script && out.length > 24 && SCRIPT_OF.zh.test(out) && !KANA.test(out)) {
      problems.push({ key, problem: 'no kana — Chinese instead of Japanese?' })
    }
    if (lang === 'zh' && KANA.test(out)) problems.push({ key, problem: 'contains kana — Japanese instead of Chinese?' })
  }
  for (const key of Object.keys(translated)) {
    if (!(key in source)) problems.push({ key, problem: 'not in source' })
  }
  return problems
}

// ── Cross-post links ────────────────────────────────────────────────────────

/**
 * `related` blocks name a heading of ANOTHER post, by its exact text, to deep
 * link to it. In a translation that heading has a new text, so each one is
 * re-pointed at the heading in the same position of the translated target.
 * A section the source itself no longer finds is dropped (the link then opens
 * the post at the top) rather than left pointing at English text.
 */
export function relinkSections(
  translated: BlogPost[],
  sourceBySlug: Map<string, BlogPost>,
): Array<{ slug: string; to: string; section: string; reason: 'target not translated' | 'heading gone' }> {
  const bySlug = new Map(translated.map((p) => [p.slug, p]))
  const h2s = (p: BlogPost) => p.content.filter((b) => b.type === 'h2').map((b) => (b as { text: string }).text)
  const dropped: Array<{ slug: string; to: string; section: string; reason: 'target not translated' | 'heading gone' }> = []
  for (const post of translated) {
    for (const block of post.content) {
      if (block.type !== 'related' || !block.section) continue
      const srcTarget = sourceBySlug.get(block.to)
      const trTarget = bySlug.get(block.to)
      const index = srcTarget ? h2s(srcTarget).indexOf(block.section) : -1
      const heading = index >= 0 && trTarget ? h2s(trTarget)[index] : undefined
      if (heading) { block.section = heading; continue }
      dropped.push({ slug: post.slug, to: block.to, section: block.section, reason: index < 0 ? 'heading gone' : 'target not translated' })
      delete block.section
    }
  }
  return dropped
}

/**
 * Point links at a different post: a language whose library already has a
 * hand-written version of an English post keeps that post and gets no
 * translation of it, so every link to the English slug must go to the
 * hand-written one instead. A deep link into such a post loses its section —
 * its headings are its own, not the English ones in the same order.
 */
export function retargetLinks(post: BlogPost, bySlug: Map<string, string>): void {
  const retargetRich = (text: RichText | undefined): void => {
    if (!text || typeof text === 'string') return
    for (const seg of text) if (typeof seg !== 'string' && 'to' in seg && bySlug.has(seg.to)) seg.to = bySlug.get(seg.to)!
  }
  for (const b of post.content) {
    switch (b.type) {
      case 'p': case 'callout': retargetRich(b.text); break
      case 'takeaways': b.items.forEach(retargetRich); break
      case 'steps': b.items.forEach((i) => { retargetRich(i.body); retargetRich(i.detail) }); break
      case 'decision': b.options.forEach((o) => { retargetRich(o.body); if (o.to && bySlug.has(o.to)) o.to = bySlug.get(o.to) }); break
      case 'related':
        if (bySlug.has(b.to)) { b.to = bySlug.get(b.to)!; delete b.section }
        break
    }
  }
  post.references?.forEach((r) => { if (r.to && bySlug.has(r.to)) r.to = bySlug.get(r.to) })
}
