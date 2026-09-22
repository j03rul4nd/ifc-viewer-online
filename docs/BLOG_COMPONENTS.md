# Blog component system

Posts are **data**, not MDX: each post is an array of `ContentBlock` objects in
`src/lib/blog-posts.ts`, rendered by `RenderBlock` in `src/components/Blog.tsx`.
That is the authoring API. Every block is also serialised twice, and a new block
type must be added to all three places:

| Where | Why |
|---|---|
| `src/components/Blog.tsx` → `RenderBlock` | the interactive page |
| `src/components/blog/CopyForAI.tsx` → `blockToMarkdown` | "Copy for AI" Markdown |
| `scripts/seo/generate-blog-pages.ts` → `renderFallbackBlock` | `<noscript>` HTML for crawlers |

TypeScript makes the last one exhaustive, so a missing case fails the build.

## Rule zero: every block answers a reader problem

If a post doesn't have the problem, it doesn't use the block. A block that is only
decorative is a bug in the post.

## Tables — `type: 'table'`

```ts
{ type: 'table', headers: [...], rows: [[...]], caption?: '...', rowHeaders?: true, layout?: 'auto' }
```

Tables are the one block that adapts itself, because they break on phones for
different reasons depending on their shape. `src/lib/blog-table.ts` classifies
each one (pure, tested in `blog-table.test.ts`), and `SmartTable.tsx` picks a
presentation from that **and the width of its own column** (ResizeObserver, not
media queries):

| Shape | Detected as | Fits | Doesn't fit, ≥ 600 px | < 600 px (phone) |
|---|---|---|---|---|
| ≤ 3 columns of prose | `stack` | table | scroll | one card per row, all fields |
| ≥ 4 columns of prose | `records` | table | scroll | cards: 2 fields + "N more details" disclosure |
| ≥ 4 columns, ≥ 40 % short verdicts (✓ ✗ Partial…) | `matrix` | table | scroll | **Compare by** chips: row names next to one chosen column; "All" falls back to scroll |

- **scroll** = sticky first column, edge shadows on whichever side hides content,
  a "scroll sideways" hint, and the scroller becomes a focusable, labelled region
  (keyboard users can scroll it) only when it actually overflows.
- **≥ 6 rows** → header sorting (`aria-sort`; verdicts sort yes › partial › no,
  prices/numbers numerically). **≥ 8 rows** → a filter box with a live row
  count and an empty state. **> 10 rows** → the table scrolls inside itself with
  a pinned header.
- **Verdict cells** (`✅`, `✓`, `❌`, `✗`, `⚠️`, and the words Yes/No/Partial/Limited
  in en/es/de/fr) render as an icon + text. The glyph becomes an icon; the word
  is always kept or added, so colour never carries meaning alone. "None"/"Full"
  are deliberately *not* verdicts ("Install: None" is good news).
- `layout: 'scroll'` forces the grid when reading across rows is the point;
  `layout: 'cards'` forces cards when rows are independent records.

## Callout — `type: 'callout'`

```ts
{ type: 'callout', variant: 'tip' | 'warning' | 'info', text: RichText, title?: 'TL;DR' }
```
An aside the reader must not miss. `role="note"`, SVG icon, tinted from the
theme tokens (`--ok`, `--warn`, `--accent-2`). `text` now accepts links and
terms. One or two per section at most — a page of callouts has no emphasis.

## Takeaways — `type: 'takeaways'`
```ts
{ type: 'takeaways', title?: 'What to remember', items: RichText[] }
```
**Problem:** a 20-minute read with no statement of what the reader leaves with.
3–5 items, near the top or at the end. Static, no JS.

## Steps — `type: 'steps'`
```ts
{ type: 'steps', items: [{ title, body?: RichText, detail?: RichText, detailLabel?: 'Why?' }] }
```
**Problem:** a procedure written as an `ol` of long sentences can't be scanned.
Bold action + short body; the "why" goes in `detail`, folded in a native
`<details>` (keyboard/AT support for free). Used in `how-to-validate-ifc-file`.
Prefer a plain `ol` for lists that aren't sequences.

## Decision — `type: 'decision'`
```ts
{ type: 'decision', question: '…?', options: [{ label, verdict, body: RichText, to?: 'slug', linkText? }] }
```
**Problem:** an article whose honest answer is "it depends". The reader picks
the situation closest to theirs and gets one verdict. Native radio inputs in a
`fieldset` (arrow keys, announced state), result in an `aria-live` region.
2–6 options; on phones they stack as 48 px targets. Used as the interactive
TL;DR of `best-free-ifc-viewer`. Keep the full comparison table in the post —
the decision is the entry point, not a replacement.

## Bars — `type: 'bars'`
```ts
{ type: 'bars', title?, unit?: ' min', max?, caption?, items: [{ label, value, note?, highlight? }] }
```
**Problem:** magnitudes the reader would otherwise compare in their head from a
table (33 min vs 0.7 min). An HTML list, not a canvas: every value is text, the
bars are `aria-hidden`. Numbers are formatted in the article's locale. The
bars grow once on first view (off with reduced motion). One highlighted item
at most. Used in `browser-vs-cloud-ifc-validation`. Use `stat-row` for
independent headline numbers, `bars` only when they share a unit and scale.

## Inline term — `{ text, def }` inside any `RichText`
```ts
{ type: 'p', text: ['Never straight to the ', { text: 'CDE', def: 'Common Data Environment — …' }, '.'] }
```
**Problem:** jargon a newcomer doesn't know and an expert doesn't want spelled
out. A toggletip (tap/click, Escape or outside tap closes) — not a hover
tooltip, because touch has no hover. Stays inside the viewport on phones.
Crawler fallback: `<dfn title>`. Define a term once per post, at first use.

## Images — `type: 'image'` (+ `annotations`)

```ts
{ type: 'image', src, alt, width, height, caption?,
  annotations?: [{ x: 61, y: 23, label: 'Video surface', text: '…' }] }   // x/y in % of the image
```
**Problem:** screenshots and diagrams drawn for 720 px are unreadable on a
phone, and "look at the panel on the right" makes the reader hunt.
- **Every image** opens full-screen on tap (`ImageViewer.tsx`, on top of the
  shared `Modal`, so focus/Escape/scroll-lock come from Radix): zoom with
  +/− buttons, wheel (anchored at the cursor), pinch, double-tap; drag to pan;
  keyboard `+ − 0` and arrows. Up to 6×.
- **`annotations`** put numbered hotspots on the image and a legend below it.
  Desktop: a hotspot opens its note in place. Phone: hotspots shrink and tapping
  one highlights its legend entry right below instead of covering the image.
  The legend is the accessible version; hotspots are a shortcut into it.
  Measure x/y on the real image — 3–5 points, only for what the text discusses.

## References — `post.references` + `{ cite: id }`

```ts
references: [{ id: 'iso19650', title: 'ISO 19650-2…', source: 'ISO', year: '2018',
               url: 'https://…', note: 'Why it matters here.' },
             { id: 'ids', title: 'IFC model checker…', to: 'ifc-model-checker-guide' }],
// in any RichText:
['…upload to the CDE', { cite: 'iso19650' }, '.']
```
**Problem:** niche posts lean on standards and earlier guides; a bare link
makes the reader leave to find out whether it's worth leaving. Like a study
Bible's cross-references, a numbered marker opens a **context card** — what
the source is, the `note` on why it matters here (for `to` references the
target post's excerpt is used when there is no note), and links to open it,
read the related guide, or jump to the list. A **References** section closes
the post; each entry links back to where it was cited (focus moves and the
spot briefly highlights). Crawler fallback: `<sup>` links + an `<ol>`;
"Copy for AI": Markdown footnotes.

**Internal links** (`{ text, to }`) also preview their target post (category,
read time, title, excerpt) after a short hover or on keyboard focus. Touch
devices skip the preview and just navigate.

## Recommendations — `Recommendations.tsx`, `lib/blog-related.ts`, `lib/blog-tools.ts`

**Problem:** "More articles" used to be the first three posts of the language,
unrelated to what was just read, and tools were never offered at all.

### Point of interest — `type: 'related'` (author-placed)
```ts
{ type: 'related', to: 'revit-ifc-export-breaks', section: 'The Diagnostic Workflow',
  why: 'If the issues trace back to a Revit export, this is the order to check…' }
```
Place it where the paragraph raises a question another post answers. It names
the SECTION (deep-links to it; quotes its opening line if there's no `why`),
with **Go to section** and **Quick look**. `section` must be the target h2's
exact text — a test fails the build otherwise. One or two per post.

### Tool — `type: 'tool'` (author-placed)
```ts
{ type: 'tool', id: 'guid-fixer', why: 'Finds duplicate GlobalIds…' }
```
Where the text explains a problem a tool on this site solves. Tools are a
curated catalogue of pages that exist (`BLOG_TOOLS`: validator, GUID fixer, fix
guides, viewer, embed builder, SDK, the two handbooks), with per-language
hrefs and copy.

### Quick look (article peek)
A dialog (the shared `Modal`) with another post's summary and its sections,
each with its opening line; picking a section opens that post AT that
section. Lets the reader consult a post and come back without losing their place.

### Continue reading (end of every post, automatic)
- **Ranking** (`relatedPosts`): linked from this post (6) › links to this post
  (4) › shared specific keywords (2 each; generic ones like "ifc" ignored) ›
  same category (1.5). Each pick shows its reason: "Referenced in this
  article", "Builds on this article", "Also about: duplicate guid"…
- **Next up**: the top pick, large, with Quick look. **Keep exploring**: the
  next four, each with Quick look. **Tools for this topic**: up to 3 catalogue
  tools matched from the post's title, category and keywords.
- **Read history** (localStorage, per browser): a post counts as read when its
  end section is reached; read posts sink (×0.35) and are marked "Read".

## Arriving at a post

Opening a post lands at the top; a URL with `#section-id` (shared section
links, references) lands on that heading below the sticky header, and re-aims
for ~1.5 s while images above it load and shift the layout — until the reader
scrolls themselves. Text-fragment links (`#:~:text=`) are left to the browser.

## Share kit (automatic, no authoring needed) — `ShareKit.tsx`

The community-blog patterns worth keeping, because each one carries what the
reader already wants to do. No counters, claps or third-party scripts.

- **Select to share** (Medium's highlight menu): select 12–320 characters of
  the article body → *Copy quote* (quote + title + link) and LinkedIn / X, or the
  native share sheet where it exists. The link is a **text fragment**
  (`#:~:text=start,end`) so the recipient lands on the exact sentence,
  highlighted. Desktop: floating bar above the selection. Touch: a docked
  bottom bar, because phones draw their own menu at the selection. Ignores
  code, inputs and buttons.
- **Share a pull-quote**: every `pull-quote` gets a quiet "Share this quote".
- **Link to a section**: every h2/h3 gets a copy-link button — revealed on
  hover/focus with a mouse, always visible on touch (no hover there).

## Visual language

All editorial blocks share one vocabulary, drawn from the landing/blog tokens so
`.lp-light` re-themes them without extra CSS:

- **Surfaces:** `--surface` card on `--bg`; `--surface-2` for inset/secondary.
- **Borders:** 1 px `--border`; state colours via `color-mix()` with the token.
- **Radii:** 12 px (`rounded-xl`) for blocks inside the text column, 16 px
  (`rounded-2xl`) for standalone modules (takeaways, decision, bars).
- **Type:** body 14–15.5 px / 1.6–1.8; labels 10.5–12 px uppercase, tracked.
- **Semantics by colour** only with a redundant icon or word: `--ok`, `--warn`,
  `--danger`, accent for "selected / recommended".
- **Touch targets:** chips 36 px (44 px on coarse pointers), options 48 px.
- **Motion:** only for state change (disclosure caret, decision result, bars
  growing). All of it is disabled by `prefers-reduced-motion`.

Shared CSS lives in `src/components/blog/editorial.css`; control copy in
`src/lib/blog-editorial-copy.ts`, keyed by the **article** language (en/es/de/fr).

## Considered and not built

| Idea | Why not (yet) |
|---|---|
| Before/after image slider (still) | No post has paired before/after images. Build it with the first post that does. |
| Interactive charts library | `bars` covers the only chartable data in the corpus; no dependency needed. |
| Accordion / tabs block | Hiding article prose behind tabs hurts scanning and in-page search; `<details>` in steps/records covers the real need. |
| Calculator | The obvious one (upload time) is answered by a static `bars`. Revisit with a genuinely parametric question. |
| New TOC / reading progress | Already exist (`TableOfContents`, `ReadingProgress`). |
| Claps / likes / view counters | Vanity signals with no reader benefit and they need a backend. |
| Callout `key` variant | Overlapped with `info`; dropped during review. |
