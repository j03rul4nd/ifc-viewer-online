# Translating the core landings

`copy-en.ts` is the source. Each language has `copy-<lang>.ts` exporting `copy: LangCopy` with exactly the same structure (same sections in the same order, same number of rows, list items, steps, questions).

Translate every string. Do not change:

- `kind`, `sources`, `heroSources`, `faqSources` values.
- Link keys: in `[text](key)` translate `text`, keep `(key)` as it is.
- Numbers. Keep every figure as a figure (do not spell numbers out and do not add figures that are not in English); prices, token counts and limits about Solibri and Flinker were read on their sites and must not change. Currency may follow local habit (`2.109 €`).
- Phrases inside straight double quotes "…" in comparison tables and answers: they are verbatim quotes from the vendors' English pages. Keep them in English, in the quotation marks of the language.
- Names of buttons in the captures ("Show in 3D"): the interface in the pictures is English.
- Citations inside answers: `(solibri.com/pricing, read on 2026-11-10)` keeps the address and the ISO date; only "read on" is translated.
- Product and format names: IFC Viewer Online, Solibri, Flinker, Health Score, IDS, BCF, COBie, GlobalId, IfcProject…

Listing limits: `title` at most 60 characters, `desc` at most 160. `h1[0]` is the term people search for in that language; keep the one the page already ranks for.

Voice: plain and specific, the way a colleague would explain the tool. No superlatives, no claims that are not in English, nothing softened or added.

Check a translation with:

    npx tsx scripts/seo/core-landings/check-copy.ts <lang>
