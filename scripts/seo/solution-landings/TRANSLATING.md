# Translating the solution pages

`copy-en.ts` is the source. Each `copy-<lang>.ts` has exactly the same shape: same sections, same `kind`, same number of rows, steps, items and questions, same `sources` arrays (copied as they are). `solution-landings.test.ts` fails otherwise.

- Keep `[text](key)` links: translate the text, never the key.
- Numbers, prices and dates stay the same. Write them the way the language does (`€1,428` → `1.428 €` in es/de/it/pt/ca, `1 428 €` in fr). Vendor figures must keep the same digits.
- Quotes from a vendor's page (in "…") stay in English inside quotation marks, followed by a translation in brackets if useful.
- Product and plan names stay in English: IFC Viewer Online, Reception, Team, Pro, Health Score, IDS, BCF, CDE, Catenda Hub, Dalux Box, Autodesk Construction Cloud, BIMcollab, Solibri.
- Say it plainly. Everything paid is a **preview**: never write that something is available, included or ready if the English says preview. Never mention artificial intelligence.
- `title` at most 60 characters, `desc` at most 160 (count characters, CJK included).
- Quick check: `npx tsx scripts/seo/solution-landings/check-copy.ts <lang>`.
