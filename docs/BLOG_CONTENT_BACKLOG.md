# Blog Content Backlog — IFC/BIM SEO

> Source: deep community research (buildingSMART forums, Autodesk Community, Graphisoft
> Community, GitHub issues for ThatOpen / IfcOpenShell / xeokit / xBim, OSArch, Dynamo,
> Esri Community). Created 2026-06-03.
>
> **Working language: English only.** Translations to es/de/fr/etc. are handled in a
> separate workstream — do NOT translate here. New posts go into `BLOG_POSTS` in
> `src/lib/blog-posts.ts`; the build (`scripts/seo/generate-blog-pages.ts`) auto-creates
> the crawlable static page, sitemap entry, and `llms.txt` line.

---

## Positioning thesis

> *"The place you drag your IFC to find out if it's broken — before your client does."*

The real pain is **trust in the file** ("is it broken? why is it 1 GB? why is it 2 km from the
origin?"), not "I lack a viewer". Every article closes on the same low-commitment CTA: open the
IFC (no login, 100% client-side) → see the Health Score → share the crawlable report. This aligns
with the moats (Health Score as a cited number, remediation corpus, crawlable report loop), not
the commodity viewer.

## ⚠️ Anti-cannibalization rule (read before writing)

A programmatic `/fix/<rule>/` silo already exists (38 rules × 10 languages). **The blog must NOT
compete for the atomic per-rule query.** The blog does broad troubleshooting / informational /
comparison content and links *down* to `/fix/`. Before writing any post:

1. Check it doesn't duplicate an existing `BLOG_POSTS` entry. Existing EN posts:
   `view-ifc-online-free`, `ifc-health-score-guide`, `duplicate-guids-ifc`, `ifc-vs-rvt-vs-nwd`,
   `common-ifc-validation-errors`, `ifc-health-score-explained`, `clean-ifc-export-revit`,
   `ifc2x3-vs-ifc4`, `iso19650-ifc-checklist`.
2. Check it doesn't duplicate a `/fix/<rule>/` page.
3. If overlap exists, re-angle on a distinct primary keyword and cross-reference.

> Example applied: `duplicate-guids-ifc` already covers *duplicate* GUIDs, so the new GUID post is
> angled on *GUID instability / regenerated on every export* (keyword: "ifc guid changes every
> export"), a distinct query, and references the duplicate post rather than repeating it.

---

## Prioritized backlog (by ROI = intent × product-proximity × low difficulty)

| # | Working title | Slug | Cat | Intent | Funnel | Status |
|---|---|---|---|---|---|---|
| 3 | Why IFC GUIDs Change on Every Export (and How to Keep Them Stable) | `ifc-guids-changing-every-export` | validation | Troubleshooting | MOFU/BOFU | ✅ DRAFTED (EN) |
| 2 | IFC Properties Missing After Export From Revit? The Fix Checklist | `ifc-properties-missing-after-export` | tool-guides | Troubleshooting | MOFU | ✅ DRAFTED (EN) |
| 4 | How to Validate an IFC File Before You Send It (Free, No Upload) | `how-to-validate-ifc-file` | validation | Commercial-Info | BOFU | ✅ DRAFTED (EN) |
| 5 | Why Large IFC Files Crash Your Browser (and How to View a 1 GB Model) | `large-ifc-file-browser-crash` | tool-guides | Commercial | MOFU/BOFU | ✅ DRAFTED (EN) |
| 1 | Why Your Revit IFC Export Breaks (and How to Fix Each Cause) | `revit-ifc-export-breaks` | tool-guides | Troubleshooting | MOFU | ✅ DRAFTED (EN) |
| 7 | IFC Coordinates Wrong: Survey Point, Base Point & Georeferencing | `ifc-coordinates-georeferencing` | ifc-tips | Troubleshooting | MOFU | ✅ DRAFTED (EN) |
| 8 | Revit ↔ Archicad via IFC: The Round-Trip Problems Nobody Warns You About | `revit-archicad-ifc-roundtrip` | ifc-tips | Comparison/Trbl | MOFU | ✅ DRAFTED (EN) |
| 6 | Free Online IFC Viewers Compared (2026) — re-angled to comparison to avoid cannibalizing `view-ifc-online-free` | `free-online-ifc-viewers-compared` | tool-guides | Comparison | TOFU/MOFU | ✅ DRAFTED (EN) |
| 11 | How to Reduce IFC File Size (Without Breaking the Model) | `reduce-ifc-file-size` | tool-guides | Troubleshooting | MOFU | ✅ DRAFTED (EN) |
| 9 | Read IFC Property Sets in Python with IfcOpenShell (get_psets cookbook) | `read-ifc-property-sets-python` | ifc-tips | Dev | TOFU | ✅ DRAFTED (EN) |
| 10 | How to View IFC in the Browser with three.js, web-ifc & Fragments | `view-ifc-web-threejs-fragments` | tool-guides | Dev | MOFU | ✅ DRAFTED (EN) |
| — | PILLAR: The Complete Guide to IFC Quality | `ifc-quality-guide` | best-practices | Info | hub | ✅ DRAFTED (EN) |

**Backlog fully drafted in EN (2026-06-03): 12 spokes + 1 pillar = 13 new posts.** Next workstream: translations (separate chat), then add the inline-`link` block for real internal linking, then instrument the PostHog events below.

> Difficulty/volume are heuristic (no live SERP data). Quick wins first = #3 and #2 (drafted).

---

## Cluster strategy (hub-and-spoke)

```
                 PILLAR: IFC QUALITY / HEALTH  (the moat)
                 ┌──────────────┼──────────────┐
   EXPORT FIXES          VIEW & PERFORMANCE        /fix/<rule>/ silo (programmatic)
   #1 #2 #3 #7 #8        #5 #6 #10 #11             /fix/category/<cat>/
        └──────── all link DOWN to /fix/ ──────────┘
```

Rules: each spoke links ↑ to pillar, ↔ to 2 sibling spokes, ↓ to 1–3 `/fix/` pages, → CTA to
viewer. The crawlable report (`/r`) is part of the SEO surface: content drives uploads → uploads
produce shareable indexable reports → more SEO surface + backlinks.

---

## Funnel & tracking (extend existing PostHog — see memory `project_analytics_system`)

Funnel: `Organic → Blog → CTA → viewer (upload) → health_score_viewed → report_shared`.

New events to add:

| Event | Key props |
|---|---|
| `blog_post_viewed` | `slug`, `cluster`, `lang`, `referrer_is_organic` |
| `blog_scroll_depth` | `slug`, `pct` (25/50/75/100) |
| `blog_cta_clicked` | `slug`, `cta_type` (upload/validate/demo), `cta_position` |
| `viewer_opened_from_blog` | `source_slug` |
| `ifc_uploaded` (exists) | + `entry_source=blog:<slug>` |
| `health_score_viewed` | `score_bucket`, `entry_source` |
| `report_shared` (exists) | + `entry_source` |

Persist `entry_source` on the first blog hit and propagate to `ifc_uploaded`/`health_score_viewed`
so PostHog gives a native blog→viewer→health-score funnel. No Supabase (consistent with prior
decision); Search Console for organic CTR/position.

---

## Internal linking — DONE (2026-06-03)

Inline links are implemented. `p` blocks now accept rich text: `text` is either a `string` or an
array of `InlineSegment`s (`string` | `{ text, to }` internal post link | `{ text, href }` external).
- Type: `RichText` / `InlineSegment` in `src/lib/blog-posts.ts`.
- Render: `RenderInline` in `Blog.tsx` — internal links carry a real crawlable `href`
  (`postHref(slug, lang)` → `/<base>/<lang?>/blog/<slug>/`) and navigate in-SPA on click
  (modifier/middle-clicks fall through to native new-tab). External links open in a new tab.
- Serialization: `CopyForAI` `blockToMarkdown` flattens rich text to markdown links.
- ~30 internal links wired across the cluster (pillar ↔ spokes). Verified: links render with
  correct hrefs and SPA navigation works.

Remaining follow-ups:
- Links *down to `/fix/<rule>/`* still need wiring — those are real URLs outside the blog router,
  so use an `{ text, href }` segment pointing at `/<base>/fix/...` (or extend with a dedicated
  fix-link helper). Not yet added.
- `ul`/`callout` blocks don't support inline links yet (a few references there remain plain prose).
- Instrument the PostHog events listed above.
