# Digital-twin programme — validation report (phase K)

What was checked, how, and with what result, for PRs #207, #211, #212, #213 and #215
(2026-10-09/10). A feature appears under "verified" only if it was exercised in the
running app with real data, or by a test that would fail without it. Everything else is
under "not verified".

## How things were checked

- **Types.** `tsc -b` exited 0 before every merge.
- **Tests.** The full vitest suite ran before every merge. At the last merge (#215):
  365 files and 5425 tests, plus the docs coverage guard. New features came with
  tests built on trimmed real responses (`src/lib/layers/__fixtures__/`).
- **The running app.** The dev build ran in a Chromium-based browser pane against the
  live providers, with no mocks. The SDK was checked from a separate host page that
  imported the built bundle (`public/sdk/ifc-viewer.es.js`), exactly as a third-party
  page would.
- **Numbers rather than pixels.** Positions, heights, counts and states were read from
  the app's stores and the SDK. The browser pane was often hidden, which freezes
  `requestAnimationFrame` (see "Limits of the method").

## Verified

| Area | Check | Result |
|---|---|---|
| Sources (#207) | Each preset in [`CITY_DATA_SOURCES.md`](CITY_DATA_SOURCES.md) §1 requested with a browser `Origin`, then added as a layer | 16 presets. 11 work as they are. The 4 TMB presets need the visitor's own key and were not exercised with one here. Rodalies has no CORS and needs a proxy |
| Adapters (#207) | Fixture tests per format: GBFS, GELFS, Socrata, ODPT JSON-LD, hourly air-quality CSV, long CSV pivot, WKT CSV | Pass. ASPB and Madrid share one transform |
| Scene round-trip (#211) | 4 IFC + 4 layers → *Share* → 3.5 KB `#scene=` link → opened in a fresh tab | Same models, map, layers and exact camera. The visitor's saved layers were left untouched |
| Layer alignment (#211) | A layer's feature vs the map under it | 0.13 m (it was 830 m before the anchor fix) |
| Heights (#212) | Each Barcelona IFC origin vs the ICGC terrain under it, over repeated refreshes | 0.00–0.02 m and stable. Satellites no longer drift (it was +250 m per refresh) |
| Same-project files (#212) | Hotel Vela ARC + STR (one `IfcMapConversion`) | They move as one. The ground floor sits on the terrain, the sea 2.75 m below |
| Barcelona demo (#213) | Opened from the gallery card, and as `?scene=…&embed=1` | 8 models, 4 layers named in the UI language, 2 device sources, 677 live readings in 11 s |
| Twin on IFC parts (#213) | Bicing 65 binding → dock posts (`IfcRelAggregates` parts) | 21 posts resolved and painted from the real station state; floating value "3" anchored above them |
| Endolla freshness (#215) | Endolla 3762 state after the `timeField` fix | "Ports available" (3), no longer reported stale |
| Client mode map (#215) | `ui=client` + a scene with `map` | Map up in 12 s, exact scene camera, OSM and ICGC attribution shown, technical panel hidden. Before the fix it timed out after 60 s |
| SDK scenes (#215) | `openScene` with the same URL, a document, and document → document (only the fragment changes) | Each reloads once, with the right model and exact camera. Calls still waiting are rejected |
| SDK `exportScene` (#215) | On the Barcelona scene with one host layer | 8 models, 5 layers, 2 bindings, camera, 16 sources, 4.7 KB link |
| SDK layers (#215) | `addLayer` with GeoJSON / unknown preset / a source without CORS; visibility; `getTwin` | Ready at once; clear English errors; the visitor's saved layers (15 KB) untouched; twin states match the live feeds |
| SDK events (#215) | Feature selection and alert-log entries inside the frame | `layer-feature-picked` and `alert` arrive with their payloads, also with lazy loading |
| Embed weight (#215) | A plain embed with no layers | The layer runner is not loaded |
| Share dialog (#215 refactor) | *Share → Digital-twin scene* on the Barcelona scene | 8 models, 4 layers, 2 bindings, map, 16 sources, `?ui=client#scene=` iframe |

### Helsinki and Tokyo (2026-10-10)

| Area | Check | Result |
|---|---|---|
| MQTT twin source | HSL HFP over `wss://mqtt.hsl.fi`, broad topic, through the runner | 69 stops became devices in 30 s, state `ok`; a bus between stops is skipped |
| Helsinki bays | 9 bindings; a reading in HFP's exact shape at stop 1020128 | 36 elements resolved; bay 20 green with "415N"; later a real line-431 bus showed at a bay |
| FMI layers | Air quality and weather, simple WFS | 11 and 7 stations, live |
| GTFS-RT protobuf | Toei buses, decoded in the browser | 517–541 vehicles; layer and twin both read it |
| Tochōmae | Three ODPT sources | Ōedo normal → marks green; train 1523A at the platform → sign green |
| Waseda | Tram presence and line status | Tram ODPT5254 at the stop → edges green; Arakawa normal → screens green |
| GSI terrain | DEM10B at the Tokyo models' origins | 9.76 m (Waseda) and 37.63 m (Tochōmae), as the I+D package measured; never chosen for Korea or Vladivostok |

## Bugs found by this verification, and fixed

These would have shipped without the checks above:

- **Twin bindings found 0 elements.** The parts of IFC assemblies were not in the
  spatial tree (#213).
- **A layer was lost after a failed restore**, and some concurrent requests were
  rejected by the BCN portal (#211).
- **Satellite models drifted 250 m on every refresh.** Models also floated 15–19 m
  above Barcelona's terrain (#212).
- **`ui=client` never brought the map up** (#215). This hit every client-skin scene
  embed, which is what *Share* produces by default.
- **Chrome does not navigate when an iframe `src` changes only in its fragment.** A
  second scene opened by document would never have loaded (#215).
- **An `alert` payload field named `source` overwrote the message envelope**, so every
  alert would have been dropped (#215).
- **Endolla's `last_updated` is a port's last change**, which made a quiet charger look
  stale (#215).

## Not verified

- **Other browsers.** Only Chromium was used; Safari and Firefox were not tested.
  `#scene=` links and the SDK's `packScene` rely on
  `CompressionStream('deflate-raw')`; its support in those browsers was not checked.
- **Phones and tablets.** The full Barcelona scene's frame rate and memory on a phone
  were not measured.
- **Long runs.** Polling stability over hours, behaviour across provider outages,
  and quotas (FGC: 5 000 requests a day per IP) were not observed.
- **Third-party hosts.** WordPress, Shopify and SharePoint were not tried; only a
  plain host page was.
- **Visual QA.** With the pane hidden, frames do not run, so most checks read numbers
  instead of pixels. Screenshots confirmed the Barcelona view, the twin pill and the
  gallery card.
- **Accessibility** of the new gallery section and labels was not audited.
- **Helsinki and Tokyo at every hour.** Checked at one moment each; at night the
  Helsinki bays stay grey for long stretches (few buses).

## Known issues at the time of writing

- **Flaky flood test.** `src/features/flood/core/cpu-inertial.test.ts` (from #214, not
  this programme) timed out at 5 s once under full-suite load. It passes alone.
- **Slow Open Data BCN.** It takes 15–40 s a file, so traffic and EV layers can appear
  late.
