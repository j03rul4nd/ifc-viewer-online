# Blog landing — architecture, SEO and roadmap

The blog index (`/blog/`) and the topic hubs (`/blog/topic/<slug>/`) as they are
after the September 2026 rework, why each part exists, and what is left to do.
Article-level components are in [BLOG_COMPONENTS.md](BLOG_COMPONENTS.md).

Code: `BlogList`, `TopicHubView`, `BlogFooter` in `src/components/Blog.tsx`;
topics in `src/lib/blog-topics.ts`; copy in `src/lib/blog-hub.ts`; static HTML,
JSON-LD and sitemap in `scripts/seo/generate-blog-pages.ts`.

## 1. Audit — what there was

| Area | Found | Verdict |
|---|---|---|
| Search | Instant, token match over title/excerpt/keywords/category, `/` shortcut | Good — kept |
| Categories | 6 categories, client-side filter only; no URL | **Gap** — topics invisible to search engines, articles had nothing to link up to |
| Taxonomy | `tool-guides` mixed viewer comparisons with Revit export fixes; `best-practices` mixed Health Score, GDPR and handover; `ifc-tips` mixed formats, georeferencing and Python | **Broken** — a category didn't predict its content |
| Guided paths | 6 outcome cards (fuzzy term matching) + 4 question shortcuts, both filtering in place | Good idea, but ≈ 1,500 px on a phone before the first article (estimated from card heights; after the rework it measures 653 px at 375 px wide) |
| Featured | One editor's pick | Kept, plus evidence-based companions |
| Recency / updates | Newest-first sort only; `dateModified` never shown | Gap for returning readers |
| Cards | Cover + category + title + excerpt + date + read time | Fine on desktop; on phones the cover (an OG image repeating the title) cost 138 px per card |
| Hero | `BlurText` animated H1; WebGL `FaultyTerminal` (dark) or `Grainient` + `SoftAurora` (light) running continuously, on every device | **LCP / battery cost** — the H1 is the LCP element and faded in from blur |
| Structured data | Posts: `author` Organization, `publisher` **Person**; index: `Blog` + `FAQPage` | Publisher inverted; no `BreadcrumbList` |
| Template leak | Blog pages are built from the home `index.html` and **kept its JSON-LD** — every article carried the home `WebApplication` and the home `FAQPage` (questions not on the page); articles with their own FAQ had two `FAQPage`s | **Bug** — markup must describe the visible page |
| Category pills | Light-mode text like `#fbbf24` on white ≈ 1.7:1 | Contrast failure |
| Dates | Always `en-US`, also on Spanish pages | Fixed |
| Analytics | No blog events at all | Nothing about content performance could be measured |
| Kept as-is | `<noscript>` static fallback of every page, hreflang, sitemap with images/videos, llms.txt, FAQ section, handbooks, 3D lab | Solid |

## 2. Research — patterns, not designs

Looked at Ahrefs, HubSpot, Smashing Magazine and BIM Corner (sector), plus
known patterns from Medium, Stripe and Linear.

| Pattern | Seen in | Applied here |
|---|---|---|
| Topics are real, indexable URLs (`/blog/category/x/`, `/blog/topic/x`, `/category/x/`) | Ahrefs, HubSpot, Smashing, BIM Corner | Topic hubs `/blog/topic/<slug>/` |
| "Recent" and "fundamental" are separate lanes | Smashing (Guides), BIM Corner (Start learning), HubSpot (pillar report) | "Start here" (editor's pick + most-referenced) vs "New and updated" |
| Minimal cards: title, date, category | All | Cards show at most two extra signals, only when true |
| CTAs are concrete resources, not banners | HubSpot (templates/tools), Smashing (PDF), BIM Corner (report) | Tools per topic from a catalogue of real pages; handbooks |
| Reader history drives "for you" | Medium | "Picked for you" from local read history, no account |
| Newsletter as the retention loop | Everyone | **Not built** — no sending infrastructure (see P2) |
| Popularity lists | Ahrefs, BIM Corner | **Not built** — would need page-view data; not faked |

## 3. Architecture

Built around four intents:

| Reader | Needs | Where it's served |
|---|---|---|
| First visit | What is this, for whom, where to start | Hero (proposition + search + real questions), Start here, Explore by topic |
| Knows what they want | Get there fast | Search (above the fold), question chips, topic filter, topic hubs from Google |
| Explorer | Next thing worth reading | Topic cards with their two most-referenced guides, the 3D lab, end-of-article recommendations |
| Returning | What changed, what's next for *me* | Picked for you (read history), New and updated, "Read" marks |

**Index, in the order a phone reaches it** — each section must earn its place:

1. **Hero** — static H1 (paints immediately), description, search, question
   chips (scroll sideways on a phone), counts.
2. **Picked for you** — only if this browser has read posts: unread
   recommendations from `relatedPosts` of what was read.
3. **Start here** — editor's pick + the two **most-referenced** posts (inbound
   links from other posts: the library's own evidence of what's foundational).
4. **Explore by topic** — one card per topic hub (shown only with ≥ 2 hubs).
   Phone: compact, whole card is the link. Desktop: intro + two direct guides.
5. **New and updated** — five rows by last change, with New / Updated marks;
   handbooks beside it (EN).
6. **Interactive 3D lab** — demos of the digital-twins topic, linking to its hub.
7. **All guides** — search results, topic filter, sort. While searching or
   filtering, 2–6 step aside so results come first.
8. FAQ, then the **editorial footer**: viewer CTA, every topic, the tools.

**Topic hub** (`/blog/topic/<slug>/`): breadcrumb, H1 + intro written for the
topic, **Start with** (the most-referenced post in it), every other guide by
last update, **Tools for this topic**, other topics. The SPA renders it from
the URL (back/forward work); the static generator writes the same content as
HTML for crawlers.

## 4. Taxonomy

Six topics, one per reader intent (was six overlapping categories):

| Slug | Intent | EN posts |
|---|---|---|
| `validation` | Check a model | 10 |
| `export-fixes` | Fix a broken export | 9 |
| `tools` | Choose a tool or format | 11 |
| `delivery` | Deliver to ISO 19650 | 4 |
| `privacy` | Privacy & security | 4 |
| `digital-twins` | Spatial digital twin | 7 |

Rules (`blog-topics.ts`, enforced by tests):
- A category becomes a hub only with **≥ 3 posts in that language** and
  written copy — no thin pages. Today: 6 EN hubs, 1 ES (`digital-twins`).
- Every post must belong to one of the six (test).
- Adding a topic = copy in `TOPIC_COPY` + a colour in `editorial.css`.

## 5. SEO

- **URLs**: `/blog/`, `/blog/<slug>/`, `/blog/topic/<slug>/`, with `/<lang>/`
  prefixes. Depth ≤ 2 from the index; every post is linked from its hub, the
  library and (via the static fallback) from HTML without JS.
- **Internal linking**: post → hub (visible breadcrumb) → pillar and siblings;
  hub → other hubs; footer → all hubs and tools; articles → related sections
  and tools (see BLOG_COMPONENTS).
- **Structured data** — each describes only what the page shows:
  - Index: `Blog` (with posts) + `FAQPage` (the FAQ is visible on the page).
  - Hub: `CollectionPage` with an `ItemList` of its posts + `BreadcrumbList`.
  - Post: `BlogPosting` (author = the byline, **publisher = Organization
    "IFC Viewer Online" with logo** `/brand/logo.svg`) + `BreadcrumbList`
    (Blog › Topic › Post) + its own `FAQPage` / `VideoObject` when present.
  - The home page's JSON-LD is stripped from the template (it used to leak).
- **Head**: per-hub title, description and canonical; hubs are per-language
  (hreflang self + x-default for EN), since topics don't pair across languages.
- **Sitemap**: hubs added with `lastmod` = latest change among their posts.

## 6. Performance

- H1 is static text (was a blur-in animation): the LCP element paints at once.
- Hero WebGL only on ≥ 1024 px, no reduced motion, mounted when idle; a static
  gradient everywhere else and until then. `Grainient` removed (two canvases
  in light mode became one); `BlurText` no longer imported by the blog.
- Phone cards drop the cover image (`display:none` + `loading=lazy` → not
  fetched): library height on a 375 px screen 16,000 → 9,700 px (measured), and
  covers are never downloaded on a phone, even when scrolled past.
- Card images are decorative (`alt=""`); the link text is the title.

## 7. Business path and CTAs

`Google → topic hub → pillar guide → related section / tool card → product`.
CTAs are contextual and come from one catalogue of real pages
(`lib/blog-tools.ts`): tools for the topic on hubs, tool blocks inside
articles, the viewer CTA and tool links in the footer, handbooks on the EN
index. No pop-ups, no interstitials.

## 8. Measurement

Events (PostHog, cookieless, opt-out respected; `src/lib/analytics.ts`):

| Event | Props | Answers |
|---|---|---|
| `blog_post_opened` | `from` (start_here, topic_card, whats_new, library, continue, topic_hub, lab, …), `position`, `lang` | Which surfaces move readers to a second article |
| `blog_topic_opened` | `topic`, `from` (incl. `breadcrumb`) | Whether hubs get used, and from where |
| `blog_search` | `query_length`, `results`, `lang` — **never the query text** | Search use and zero-result rate |
| `blog_tool_clicked` | `tool`, `from` | Blog → product conversion by tool and surface |

Not measured yet and worth adding with care: scroll depth per article, pages
per session from `route_changed`, organic entries per hub (Search Console).
There is no baseline: these events start from zero with this change.

## 9. Roadmap

### P0 — done
| Problem | Solution | Measure |
|---|---|---|
| Home JSON-LD on every blog page | Strip template JSON-LD; per-page schema | Rich Results Test on a post; Search Console enhancements |
| Publisher as Person, no breadcrumbs | Organization publisher + logo; `BreadcrumbList` | Same |
| H1 blur-in, WebGL on phones | Static H1; gated, idle-mounted backdrop | LCP in CrUX / PageSpeed for `/blog/` |
| First article ~1,500 px down on a phone | Journeys/questions folded into hero chips; topics compact | `blog_post_opened` from `start_here` |
| Category pill contrast in light mode | Deeper light-mode shades | Manual contrast check |

### P1 — done
| Problem | Solution | Measure |
|---|---|---|
| Topics not indexable; posts orphaned from any hub | Topic hubs with static HTML, `CollectionPage`, sitemap; post breadcrumbs | Indexed hubs; organic entries per hub |
| Overlapping categories | Intent-based taxonomy (6) | Hub bounce vs article bounce |
| No "where to start" evidence | Most-referenced posts (inbound links) | `start_here` CTR |
| Returning readers see nothing new | New and updated; New/Updated/Read marks; Picked for you | `whats_new` / `continue` opens |
| Nothing measurable | Four blog events | — |

### P2 — deliberately not built yet
| Idea | Why not now | Needed first |
|---|---|---|
| Newsletter | No sending infrastructure; a form that goes nowhere erodes trust | Email provider + consent flow |
| "Popular" / "Trending" | Would be invented without page-view data | ~4 weeks of `blog_post_opened` data |
| Series / reading order | Only the digital-twins guides form a real sequence | Author-declared `series` field |
| Difficulty level | No reliable signal in the content | Editorial tagging |
| Hubs for ES/DE/FR beyond `digital-twins` | Not enough posts per topic (≥ 3 rule) | More translated posts |
| Localised hub copy for DE/FR | Only 3 posts in those languages | Same |
| Pagination / infinite scroll | 45 posts render fine and stay crawlable in one list | Revisit above ~120 posts |
