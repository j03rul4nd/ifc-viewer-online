# Shanghai editorial series — Spanish originals

Prepared 2026-10-03. Spanish originals in `src/lib/blog-shanghai-es.ts` (registered in `BLOG_POSTS_ES`). English editions in `src/lib/blog-shanghai-en.ts` (registered in `BLOG_POSTS`), whose slugs are the Spanish posts' `translationKey`s — so hreflang clusters them, and the other eight languages (de, fr, pt, it, ca, zh, ja, th) carry them in the translated packs under the English slugs.

## Intent and differentiation

| Page | Primary intent | Original contribution | Next action |
| --- | --- | --- | --- |
| shanghai-mapa-3d-bim-gis | Understand a Shanghai 3D BIM/GIS scene | Separates IFC, mapping and inferred geometry; working Oriental Pearl IFC demo | Inspect the demo, then open Map mode |
| puentes-peatonales-3d-openstreetmap-shanghai | Fix disconnected 3D pedestrian bridges | Lujiazui connection, width and access lessons | Review endpoints and elevations |
| estaciones-tren-shanghai-modelo-3d | Understand station/railway modeling | Open canopies, platforms and illustrative train constraints | Inspect railway geometry and its limitations |
| parques-patios-3d-openstreetmap-shanghai | Fix urban landscape topology | Yuyuan/Jing'an holes, planting exclusions and precinct-vs-building distinctions | Review surfaces before decoration |

Search review on 2026-10-03 found city-model vendors and printable/visual landmark models for Shanghai model queries. The positioning opportunity is an inspectable IFC example plus first-party implementation evidence. This is an editorial inference, not keyword-volume or ranking data. Avoid targeting “Shanghai IFC” alone: it is also the name of the International Finance Centre.

The existing `ver-ifc-mapa-3d-online` page retains coordinate setup intent. These pages link to it rather than reproducing that guide. Four pages address distinct practical problems; none claim to be a complete city download, live railway tracker or surveyed temple reconstruction.

## Assets and provenance

- Four original Spanish SVG teaching diagrams, generated with `node scripts/og/build-shanghai-diagrams.mjs`. They are schematic, not geographic surveys.
- Four unique 1800 × 945 social covers from the existing blog cover pipeline. Text compositions, not images of measured infrastructure.
- Railway and Yuyuan JPEGs are Blender development-review renders from this task's geometry exports. Captions identify approximate elements and distinguish them from photographs/current browser shader output. Underlying mapping: © OpenStreetMap contributors, ODbL.
- Bridge review render is generated from the application mesh, not an independent showcase-only model.
- The Oriental Pearl embedded IFC uses the registered demo ID. Its reconstruction provenance is linked in the article.

Reproduce covers with `node --experimental-strip-types scripts/og/build-blog-covers.mjs` followed by the four slugs above. Asset resizing is ordinary PNG-to-JPEG conversion, not generative image creation.

## Search implementation and measurement

Use the existing static blog generator for canonical URLs, Spanish language metadata, BlogPosting, visible FAQ content, topic-hub discovery and sitemap entries. References and internal links must resolve in both the SPA and generated HTML. Schema does not guarantee a rich result; metadata does not guarantee ranking.

After publication, compare Search Console impressions, clicks, CTR and actual query intent per URL over 28/56/90-day windows. Separate branded searches from non-branded queries. Review indexing before rewriting titles. Do not claim traffic uplift without measured data; this task has no Search Console baseline or keyword-volume tool.

Editorial guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content — original experience, clear evidence and reader utility, not keyword repetition. Technical and geographic references are attached to each article.

## Translations

Done 2026-10-03. English edition written from the Spanish originals; the other eight languages were translated from the English through the blog pipeline (`docs/BLOG_I18N.md`: extract → check → `apply.ts --merge`), so the existing pack posts were left untouched.

| Spanish | English (= translation slug) |
| --- | --- |
| shanghai-mapa-3d-bim-gis | shanghai-city-bim-gis |
| puentes-peatonales-3d-openstreetmap-shanghai | shanghai-pedestrian-bridges |
| estaciones-tren-shanghai-modelo-3d | shanghai-railway-stations |
| parques-patios-3d-openstreetmap-shanghai | shanghai-parks-courtyards |

Diagrams: `build-shanghai-diagrams.mjs` writes the Spanish SVGs and English ones (`shanghai-layers/bridges/stations/courtyards.svg`). Translations reuse the English images, like every other translated post (`blog-i18n.test.ts` pins image sources to the English post); per-language diagrams would need that rule relaxed. English covers were generated with the cover pipeline; other languages reuse them, as documented in `docs/BLOG_I18N.md`.
