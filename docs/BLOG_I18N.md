# Blog translations

The English library (45 posts in `src/lib/blog-posts.ts`) is published in
every language the site speaks: Spanish, German, French, Portuguese (Brazil),
Italian, Catalan, Simplified Chinese, Japanese and Thai, under `/<lang>/blog/`.
This is how the translations are built, loaded and checked, and what to do
when an English post changes.

## Shape

- **Same slug as English** (`/ja/blog/how-to-validate-ifc-file/`). Every
  internal link, `related` block and reference in a post then resolves to the
  same article in the same language, with no mapping table; ASCII URLs also
  survive being pasted into chat apps, where percent-encoded CJK paths don't.
- **Same structure.** A translation is the English post with only its words
  replaced — same blocks, code, images, numbers, links. Enforced by
  `src/lib/blog-i18n.test.ts`.
- **Same dates** as the English original: the content is as old as the
  English one, and "New"/"Updated" badges mean the same thing in every language.
- **Keywords**: the localised search phrases first, then the English ones —
  related-post ranking and tool matching compare keywords across posts, and
  the English terms are shared by all of them.
- **hreflang**: a post's cluster is its `translationKey`, or its slug when it
  has none — which is what the translations carry. So each English post and
  its translations point at each other, x-default on English.
- **Posts written directly in a language win.** Spanish, German and French had
  posts written in them before any translation; 14 of them are that
  language's version of an English post and carry its slug as
  `translationKey`. The pack has no translation of those (it would compete
  with the original in search), and every link to the English slug goes to
  the written post instead (`retargetLinks` in `segments.ts`).

## Loading

`Blog.tsx` is imported eagerly by `App.tsx`, so anything `blog-posts.ts`
imports statically ships to every visitor. The packs
(`src/lib/blog-i18n/<lang>.ts`, 0.5–1.3 MB each) are therefore loaded with
`import()` by `loadBlogLanguage()` only when someone opens that language's
blog; `useBlogLanguage()` in `Blog.tsx` shows a short loading state meanwhile.
Build scripts and tests import them all through `src/lib/blog-i18n/index.ts`.
**App code must never import a pack directly** — guarded by a test.

## Pipeline

```
scripts/blog-i18n/
  segments.ts   post ⇄ { path: text }, inline links as <a to="…"> tags; checks
  extract.ts    English posts → <work>/src/<slug>.<n>.json (≤ 7000 chars a part)
  check.ts      <work>/<lang>/ vs source: keys, tags, script, SERP budgets
  apply.ts      <work>/<lang>/ → src/lib/blog-i18n/<lang>.ts
  STYLE.md      the translation brief: voice, typography and glossary per language
```

Commands (the work dir is anywhere outside the repo):

```
node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs scripts/blog-i18n/extract.ts <work> [slug…]
node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs scripts/blog-i18n/check.ts <work> <lang> [slug…]
node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs scripts/blog-i18n/apply.ts <work> <lang>
```

`apply.ts` refuses any post `check.ts` flags, and re-points each `related`
deep link at the heading in the same position of the translated target.

The brief and glossaries (`STYLE.md`) name the local BIM vocabulary per
market: German BAP/AIA for BEP/EIR, Italian ACDat/pGI/CI (UNI 11337), French
convention BIM, Brazilian Portuguese for `pt`.

**When an English post changes:** edit the translation in the pack directly
for a small change. For a rewrite, extract that slug, translate its parts,
check, and apply (apply rewrites the whole pack from the work dir, so keep
the work dir of the last full run, or re-extract every language's current
text from the pack first). **A new English post** needs its three
translations before it ships: `blog-i18n.test.ts` fails while any language lacks
one, since translated posts linking to it would otherwise point at nothing.

## Search budgets

`src/lib/serp-width.ts` measures titles and descriptions in rendered width —
a CJK character counts 2, a Thai vowel/tone mark 0 — so the 60/160 budgets
mean the same thing in every script. The generator's branding rule, the
runtime `<title>` and `serp-budget.test.ts` all use it.

## What was fixed on the way (affects every language)

- `slugify()` kept only `[a-z0-9]`: every CJK/Thai heading got an empty id, so
  the table of contents and section links pointed nowhere. Latin ids unchanged.
- Blog search split on `[^a-z0-9]`, dropping CJK/Thai entirely (and Thai vowel
  marks would have cut words apart). Now any letter + marks; a query in a
  script without spaces matches as a substring.
- The article chrome (nav, reading time, date, table of contents, closing CTA,
  not-found) was hard-coded English even on Spanish posts; it now follows the
  article language (`editorialCopy(lang).post`), and dates are localised.
- Static shells kept `<html lang="en">` for every language; each page now
  declares its own (it also selects the right CJK glyph shapes).
- The BIM glossary block (English definitions) now shows on English articles
  only.

## Not done yet

- **Covers**: translations reuse the English cover (`/blog/covers/<slug>.png`),
  whose title is in English. Localised covers for nine languages would add
  ~200 MB at the current PNG size — worth doing as WebP or text-light variants.
- **Localised slugs** for the Latin-script languages (`/es/blog/como-validar-…/`)
  would add a keyword to the URL; the same-slug design was kept for link
  integrity. Changing it means a slug map in `apply.ts` plus redirects.
- **Native review**: the translations were produced with a glossary and
  automated checks (tags, script, budgets, structure), not by native BIM
  professionals. Worth a review of the highest-traffic posts per market.
- **Mainland China**: Google is not available there; Baidu indexes foreign,
  JS-rendered sites poorly. The zh pages serve Singapore/Malaysia/overseas
  Chinese readers through Google; reaching mainland search needs Baidu
  Webmaster submission at least, and realistically China-side hosting.
