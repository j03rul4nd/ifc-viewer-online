# Digital-twin platform — overview

How ifcvieweronline.eu went from an IFC viewer to a small platform for 3D digital
twins: IFC models on a real map, live open data, devices that colour IFC elements,
and scenes that can be shared, embedded and driven from code. Everything runs in the
visitor's browser. There is no server of ours in any of it
([`DECISIONS.md`](../DECISIONS.md), D-32).

| Read this for… | Document |
|---|---|
| What the R&D package contained and what was reused | [`TWIN_DATA_AUDIT.md`](TWIN_DATA_AUDIT.md) |
| Which public sources work in a browser, measured | [`CITY_DATA_SOURCES.md`](CITY_DATA_SOURCES.md) |
| The scene document (`?scene=`, `#scene=`) | [`SCENE_FORMAT.md`](SCENE_FORMAT.md) |
| Demos, ready for articles | [`DEMOS.md`](DEMOS.md) |
| Driving it from code | [`IFC_VIEWER_SDK.md`](IFC_VIEWER_SDK.md) (v1.17), [`EMBED_URL_PARAMS.md`](EMBED_URL_PARAMS.md) |
| What would need a server (paid tier, not built) | [`TWIN_PREMIUM_ROADMAP.md`](TWIN_PREMIUM_ROADMAP.md) |
| What was verified, and how | [`TWIN_VALIDATION_REPORT.md`](TWIN_VALIDATION_REPORT.md) |

## Architecture

```
            scene document (ifc-viewer-scene v1) ── ?scene= · #scene= · file · SDK openScene
                 │ models · layers · twin · view · meta
   ┌─────────────┼───────────────────────┬─────────────────────────────┐
   ▼             ▼                       ▼                             ▼
 IFC models   data layers              operational twin            view
 (loading     lib/layers/              lib/twin/                   map · camera ·
  manager)    vector-runner ─ feeds    device sources → readings   background · sun
              presets · adapters       bindings → rules → paint
              styles · alerts          labels · alerts
   └─────────────┴──────────┬────────────┴─────────────────────────────┘
                            ▼
               geo frame: one GeoPlacement anchor, DEM per region
               (ICGC MET 5 m in Catalonia, Terrarium elsewhere)
                            ▼
          panels (people)  ·  lib/host-data-api + postMessage (SDK v1.17)
```

- **One anchor for everything** ([`GIS_MAP_MODE.md`](GIS_MAP_MODE.md)). Models,
  layers, scans and the map share one `GeoPlacement`. A model stands on the terrain at
  its own IFC origin. Files that share an `IfcMapConversion` move as one.
- **Providers are data, not code paths.** A source is a `FeedPreset`: URL, kind
  (`geojson` · `gbfs` · `gtfs-rt` · `ods` · `wfs` · `join`), records mapping, table
  transforms, measured refresh, licence. Adapters are pure functions with fixtures.
  Adding a provider means adding data and a test, not editing the runner
  ([`CITY_DATA_SOURCES.md`](CITY_DATA_SOURCES.md) §4).
- **Panels and SDK share one implementation.** The Data layers and Devices panels and
  the SDK run the same functions (`host-data-api.ts`, `scene-snapshot.ts`). A host
  cannot get behaviour the UI does not have.
- **Layers a host adds are session-only.** Neither a scene link nor the SDK writes over
  the visitor's own saved layers.

## Phases

| Phase | Asked for | Delivered | Where |
|---|---|---|---|
| A · Audit | Inventory of IFCs, docs and sources; verify CORS, auth and licences | Package audit, plus every source requested from a browser origin | [`TWIN_DATA_AUDIT.md`](TWIN_DATA_AUDIT.md), [`CITY_DATA_SOURCES.md`](CITY_DATA_SOURCES.md) |
| B · Real demos | Barcelona urban, mobility, environment, BIM+GIS | **Barcelona · Plaça de Catalunya**: 8 IFC, traffic, Bicing, EV charging, air quality, two live bindings on IFC elements | PR #213, [`DEMOS.md`](DEMOS.md) |
| C · Provider manager | Register, configure, transform, refresh, handle errors, reuse | Presets with bbox and "near your site" ordering; JSON records, CSV/WKT, hourly tables, joins, URL time templates; freshness-aware refresh; retry with jitter; 90 s timeout; parallel restore; export/import of setups | PR #207 (+ earlier #184–#191) |
| D · Look and analysis | Visual customisation, analysis tools | Per-preset styles (traffic chevrons by state, EV, air-quality and temperature ramps), style groups, legends, alerts, history/time bar. Twin rules, colours, floating values | PR #207, #213 (+ earlier) |
| E · Performance | Only measurable gains | Restore fetches up to 4 sources at once; an embed with no layers does not load the layer code; the SDK's event payload code loads on the first event | PR #207, #215 |
| F · SDK | Easy init, consistent API, integrations | v1.17: `scene` option, `openScene` / `exportScene` / `packScene`, data-layer API, `getTwin`, `layer-feature-picked` / `alert` events; reference pages ×10 | PR #215 |
| G · Reusable scenes | Declarative, versioned, validated JSON; export/import/link/embed; sources visible | `ifc-viewer-scene` v1 with JSON Schema; URL, link and file; *Share → Digital-twin scene*; source list with attribution; preset entries (`{ "preset": "bicing" }`) | PR #211, #213, #215 |
| H · Demo and SEO material | Structured per demo | [`DEMOS.md`](DEMOS.md) template: what, use case, sources, technology, features, reproduce, embed, captures, limitations, verification, article angles | PR #213 |
| I · Premium roadmap | Backend features in Markdown only | [`TWIN_PREMIUM_ROADMAP.md`](TWIN_PREMIUM_ROADMAP.md) | this PR |
| J · Non-programmers | Usable without code | See below | — |
| K · Validation report | What works, how it was checked | [`TWIN_VALIDATION_REPORT.md`](TWIN_VALIDATION_REPORT.md) | this PR |

## For people who do not write code

**What works today, without code:**
- **Open a twin in one click.** The demo gallery has a *City digital twins* section.
- **Add live data.** *Data layers → Public live sources* lists the sources with data
  around the model first, and says which ones need a key or a proxy.
- **Bind devices to elements.** The *Devices* panel connects a device to IFC
  elements by class and name, with templates, colour rules and alerts.
- **Share the result.** *Share → Digital-twin scene* gives a file, a link that holds
  the whole scene, or an `<iframe>` (client skin by default; the map now shows in
  it). It also lists every source to credit.
- **Credit the sources.** Notes in a scene appear when it opens, so a visitor learns
  what is illustrative.

**Gaps:**
- **The no-code embed builder** (`/embed/`) builds model embeds, not scene embeds. The
  share dialog covers the scene case.
- **No guided "make a twin of my site" flow.** It is still four panels: models, map,
  data layers, devices.
- **Mobile.** The full Barcelona scene has not been measured on a phone.

## Integration paths

| Host | How |
|---|---|
| Any web page, WordPress, Shopify, SharePoint (Embed web part) | `<iframe src="…/?scene=<url>&ui=client">`, or the `#scene=` link from *Share* |
| React, Vue, Angular, plain JS | SDK module `/sdk/ifc-viewer.es.js` (`new IfcViewer(el, { scene })`) or the `<ifc-viewer scene="…">` web component |
| A CDE or dashboard | SDK: `getTwin()`, `getLayers()`, `on('alert')`, `on('layer-feature-picked')`, `exportScene()` to save what the user built |
| IoT | A WebSocket device source (the twin reads it live). Push ingestion such as webhooks or MQTT needs a server: [`TWIN_PREMIUM_ROADMAP.md`](TWIN_PREMIUM_ROADMAP.md) #7 |

The iframe and SDK paths were verified in a plain host page. The named platforms take
an iframe through their usual means (a Custom HTML block, a theme section, the Embed web
part once an admin allows the domain), but none of them was tested here.
