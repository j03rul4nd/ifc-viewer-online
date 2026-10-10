# Demo catalogue — scenes ready to show, embed and write about

Each demo here is a **scene document** (`docs/SCENE_FORMAT.md`) in `public/scenes/`,
listed in the demo gallery (*Explore demo models* → *City digital twins*, from
`src/demo-models/scene-demos.ts`). A scene is the demo *and* its source code: the
same JSON a developer copies to build their own.

Every entry follows the same template so it can be turned into a blog post, a
landing section or a talk without re-researching it:
name · what it shows · use case · sources · technology · features · how to
reproduce · embed code · captures · limitations · verification · docs.

Nothing in a demo runs on a server of ours: the browser fetches the IFC files from
this site and the live data straight from each provider (`DECISIONS.md`,
frontend-only).

---

## Barcelona · Plaça de Catalunya — open-data digital twin

**Open it:** `https://www.ifcvieweronline.eu/?scene=/scenes/barcelona-placa-catalunya.scene.json`
**Scene file:** [`public/scenes/barcelona-placa-catalunya.scene.json`](../public/scenes/barcelona-placa-catalunya.scene.json)

### What it shows

Eight georeferenced IFC 4.3 models around Plaça de Catalunya and the bottom of
Passeig de Gràcia, standing on the ICGC 5 m terrain with the OpenStreetMap city
around them, and four live open-data layers over the map. Two of the live sources
do more than draw dots: they **paint IFC elements**. The 21 dock posts of Bicing
station 65 take the station's state every minute (green bikes available, amber
≤ 2, red empty, blue full, grey out of service or stale), and the two charging
bays of Endolla location 3762 (Passeig de Gràcia 5) take the charger's state.
Each binding floats its live value above the elements (bikes available, free
ports).

| Model | What it is |
|---|---|
| `catalunya-mobility-hub.ifc` | Plaça de Catalunya – Passeig de Gràcia mobility hub: Bicing station 65 (21 docks, 13 bikes), a bus shelter, the metro access with its lift, street furniture |
| `fonts-bessones.ifc` | The twin fountains of Plaça de Catalunya, with their hydraulic and lighting systems |
| `macia-monument.ifc` | Monument to Francesc Macià (Subirachs), as a heritage asset |
| `pelai-entrance.ifc` | The Pelai entrance to the Catalunya station |
| `rambla-canaletes.ifc` | Top of La Rambla and the Canaletes fountain |
| `granvia-fountain.ifc` | The monumental fountain at Passeig de Gràcia – Gran Via |
| `falques-bench-lamps.ifc` | Pere Falqués' bench-lamps on Passeig de Gràcia |
| `endolla-pg-gracia.ifc` | An on-street Endolla EV charging point (EVSE, connectors, bays) |

All eight are illustrative models (≈ LOD 400 geometry, LOD 500-style asset data
in `Pset_CDE_AssetManagement` with demo values) authored from public sources;
9.9 MB in total.

### Use case

- **City and asset managers:** one view of what the city owns (IFC assets with
  owner, condition and maintenance data) and how it is being used right now
  (live availability, traffic, air quality) — without a GIS server or an IoT
  platform licence.
- **Mobility operators:** a station's live state on the physical asset, with an
  alert rule ("no bikes for 15 minutes").
- **BIM coordinators and consultants:** a reproducible demo of BIM + GIS + live
  data for a proposal or a talk, opened from a link.
- **Developers:** a working example of the scene format, preset layers and device
  bindings to copy.

### Sources

| Layer / device source | Provider | Format | Refresh | Licence |
|---|---|---|---|---|
| Street traffic (`bcn-traffic`) | Ajuntament de Barcelona (CGM), Open Data BCN | status table + 527 street sections, joined | every 5 min | CC BY 4.0 |
| Bicing stations (`bicing`) + device source `bicing-status` | Bicing, Ajuntament de Barcelona | GBFS 3.0 (`station_information` + `station_status`) | layer 30 s; device 60 s | not declared by the feed (`license_url: null`); credited |
| EV charging (`bcn-endolla`) + device source `endolla` | Endolla / B:SM, Open Data BCN | GELFS 0.96 JSON (~440 KB) | layer as published; device 5 min | CC BY 4.0 |
| Air quality (`bcn-air-quality`) | Agència de Salut Pública de Barcelona, Open Data BCN | hourly CSV (H01..H24) joined to the stations CSV | hourly, published 45 min – 3 h late | CC BY 4.0 |
| Terrain | Institut Cartogràfic i Geològic de Catalunya | MET 5 m, terrain-RGB tiles | static | CC BY 4.0 |
| City blocks, streets | OpenStreetMap contributors | Overpass | static | ODbL |

Details and measured behaviour of each source: `docs/CITY_DATA_SOURCES.md`.

### Technology

- **Scene document** `ifc-viewer-scene` v1, opened with `?scene=` before the app
  mounts; its layers are written as `{ "preset": "bcn-traffic" }`, so the source,
  refresh, licence and look come from the preset in the visitor's language.
- **Adapters, all in the browser:** GBFS, GELFS (one record per charging location
  with a state summary), a records reader for plain JSON, CSV with joins, the
  hourly-wide table transform for the Spanish air-quality format.
- **Operational twin:** device sources polled with freshness-aware timing
  (a hidden tab does not poll), bindings resolved by IFC class + name inside each
  model — including the parts of an assembly (`IfcRelAggregates`), which is where
  the dock posts live — and first-match colour rules with an alert.
- **Geo frame:** every model placed from its own georeference
  (`IfcMapConversion`, EPSG:25831) on the ICGC bare-earth DEM; models that share
  an origin stay together; each origin sits on the terrain within 0.02 m.

### Features demonstrated

Federated multi-model loading · IFC on a 3D map with real terrain · live GeoJSON
layers with legends and attribution · IFC elements coloured by live data ·
floating live values · alert rule · camera and map state in a link · embeddable
iframe · scene notes shown on open · works in all 10 interface languages.

### Reproduce it / build your own

1. Download the scene file and edit it: swap the `models` URLs for your IFC
   (any CORS host, or same origin), keep or change the `layers` presets, and
   point the twin `bindings` at your elements (`query.classes` +
   `query.nameContains`, or `targets` by GlobalId).
2. Host the JSON anywhere that sends CORS headers (GitHub Pages, a raw gist, your
   own site) and open `https://www.ifcvieweronline.eu/?scene=<your URL>`.
3. Or skip hosting: load the models, add the layers in the app, then
   *Share → Digital-twin scene* packs the whole scene into the link itself
   (`#scene=…`) when the models are at public URLs.

The format is documented in `docs/SCENE_FORMAT.md` and validated by
`public/schemas/scene-v1.json`.

### Embed

```html
<iframe
  src="https://www.ifcvieweronline.eu/?scene=/scenes/barcelona-placa-catalunya.scene.json&embed=1"
  width="100%" height="600"
  style="border:0;border-radius:12px;max-width:100%"
  loading="lazy" allow="fullscreen"
  title="Barcelona · Plaça de Catalunya — open-data digital twin">
</iframe>
```

Explicit URL parameters win over the scene's, so `&bg=paper` or
`&camera=px,py,pz,tx,ty,tz` can restyle or reframe it for an article.

With the SDK (v1.17), the page can also react to the scene:

```html
<div id="twin" style="height:600px"></div>
<script type="module">
  import { IfcViewer } from "https://www.ifcvieweronline.eu/sdk/ifc-viewer.es.js";
  const viewer = new IfcViewer("#twin", {
    ui: "client",
    scene: "https://www.ifcvieweronline.eu/scenes/barcelona-placa-catalunya.scene.json",
  });
  viewer.on("alert", (a) => console.log(a.kind, a.name, a.rule));
  viewer.on("layer-feature-picked", (f) => console.log(f.layer, f.properties));
</script>
```

### Captures

None are committed yet. Suggested shots, taken in the app with *Capture* (the
live values are painted into PNGs, clips and GIFs):

1. The opening view (the scene's camera): the square from the south-west, Bicing
   markers and the fountains.
2. Close-up of Bicing 65 with its docks coloured and the floating bike count.
3. The air-quality layer with its legend, over the whole Eixample.
4. A 10 s orbit clip for social posts.

### Limitations (say them in any article)

- **The IFC models are reconstructions**, authored from OpenStreetMap
  (positions, ODbL), the ICGC 3D mesh and elevation, and Wikimedia Commons. Their
  asset-management values are illustrative and labelled *(demo)*, *(assumed)* or
  *(fictitious)* in the files; they are not the owners' records. The scene says so
  when it opens.
- The Endolla binding is matched **by position**: the IFC's EVSE ids are
  illustrative, so the bays take the state of the real location 3762 next to
  them, not of a real EVSE id.
- **Open Data BCN is slow**: it can take 15–40 s to answer and sometimes rejects
  concurrent requests (the app retries with backoff). Traffic and EV layers may
  appear late.
- Endolla's `last_updated` is when a port last *changed*, not when it last
  reported (a charger can sit unchanged all night), and the file has no feed
  timestamp. The scene therefore times the charger's freshness by the download
  itself: its bays turn grey only when the file could not be fetched for 2 h.
- Air quality is published 45 min – 3 h behind real time; the layer shows the
  latest published hour, not "now".
- The Bicing feed declares no licence; it is credited to its publisher.
- A hidden browser tab stops polling (by design) and catches up when shown.
- Mobile performance of the full scene (8 models + 4 layers + map) has not been
  measured.

### Verification (2026-10-09, dev build, desktop)

- Opened from the gallery card and from `?scene=…&embed=1`: 8 models, 4 layers
  (names localised), 2 device sources; 677 live device readings after 11 s.
- Bicing 65: 21 dock posts resolved inside the assembly and painted from the
  real GBFS state; floating value "3" (bikes available) anchored above them.
- Endolla 3762: 2 bays resolved and bound; floating value "3" (free ports).
- Each model's IFC origin on the ICGC terrain within 0.00–0.02 m; layers aligned
  to the map within 0.13 m.

### Docs

`docs/SCENE_FORMAT.md` · `docs/CITY_DATA_SOURCES.md` · `docs/EMBED_URL_PARAMS.md`
· `docs/GIS_MAP_MODE.md` · `src/lib/layers/feed-presets.ts` ·
`src/lib/twin/devices.ts`

### Article angles

- "A digital twin of Plaça de Catalunya in the browser, from open data" — the
  how-to, with the scene JSON as the code sample.
- "Bicing on the IFC: colouring BIM elements from GBFS" — the twin binding.
- "What Barcelona's open data can (and cannot) do in a browser" — CORS, latency,
  licences, from `CITY_DATA_SOURCES.md`.

---

## Helsinki · Rautatientori — buses at their bays, live over MQTT

**Open it:** `https://www.ifcvieweronline.eu/?scene=/scenes/helsinki-rautatientori.scene.json`
**Scene file:** [`public/scenes/helsinki-rautatientori.scene.json`](../public/scenes/helsinki-rautatientori.scene.json)

### What it shows

Helsinki Central Station (Eliel Saarinen), the Cathedral and the Elielinaukio bus
terminal as georeferenced IFC models (EPSG:3879) on the OpenStreetMap city, with the
Finnish Meteorological Institute's air-quality and weather stations live. The terminal
follows HSL's buses in real time: the bay a bus stands at lights up — green with its
doors open, blue while it waits, amber while it pulls in or out — with the line number
floating above it. A bay with no bus for 45 s goes grey.

| Model | What it is |
|---|---|
| `helsinki-central-station.ifc` | The station building, platform canopies and tracks (6.8 MB) |
| `helsinki-cathedral.ifc` | Helsinki Cathedral on Senate Square |
| `elielinaukio-bus-terminal.ifc` | The bus terminal west of the station: 17 bays (20–36) with poles and signs, canopy, kiosks |

### Use case

A transport operator or a city sees the state of a terminal on the asset model itself —
which bays are in use right now — without an IoT platform: the bus fleet's own public
feed drives the model.

### Sources

| Source | Provider | Format | Refresh | Licence |
|---|---|---|---|---|
| Bus positions (HFP) | HSL / Digitransit | MQTT over WebSocket, `wss://mqtt.hsl.fi` | ~1 message per bus per second | CC BY 4.0 |
| Air quality (`fmi-air-quality`) | FMI open data, HSY stations | WFS `::simple` | hourly, up to 40 min late | CC BY 4.0 |
| Weather (`fmi-weather`) | FMI open data | WFS `::simple` | every 10 min | CC BY 4.0 |
| Bay → stop ids | HSL GTFS `stops.txt` (2026-10-10) | read once, offline | — | CC BY 4.0 |
| City, terrain | OpenStreetMap; Mapzen Terrarium | — | static | ODbL; various |

### Technology

MQTT 3.1.1 over WebSocket in the browser (`mqtt-ws.ts`), subscribed to one geohash cell
(`…/60;24/19/73/#`) so only the terminal's buses arrive; messages are read once a
second, newest per stop, and a bus between stops (no `stop`) is skipped. Bindings match
`VP.stop` to the bay's HSL stop id; elements are found by name (`Bay 20 …`).
FMI's simple WFS is read by `bswfs.ts`.

### Embed

```html
<iframe src="https://www.ifcvieweronline.eu/?scene=/scenes/helsinki-rautatientori.scene.json&embed=1&ui=client"
  width="100%" height="600" style="border:0;border-radius:12px" loading="lazy" allow="fullscreen"
  title="Helsinki · Rautatientori — open-data digital twin"></iframe>
```

### Limitations

- The models are illustrative, authored from public drawings, OpenStreetMap and the City
  of Helsinki LOD2 model — not surveys.
- Only 9 of the 17 bays have an HSL stop today (20, 22–26, 28–30); the others stay grey.
- The global terrain reads ~18 m above the Finnish N2000 heights here (about the geoid
  undulation), so the models stand on the terrain's surface rather than at their stated
  elevation; relative heights are kept (the Cathedral stands ~10 m above the station).
- At night few buses run; the bays stay grey for long stretches.
- A hidden browser tab reads the MQTT messages less often (browser timer throttling).

### Verification (2026-10-10, dev build)

- 3 models placed by their own georeference; 2 FMI layers live (11 air-quality and
  7 weather stations).
- 9 bindings resolved to 36 elements (pole + 3 signs per bay).
- The MQTT chain end to end: with a broad topic, 69 stops became devices in 30 s
  (line, speed, doors), source state `ok`.
- A reading in HFP's exact shape at stop 1020128 painted bay 20 green with "415N"
  above it; later, a real bus (line 431) appeared at a bay in the live view.

---

## Tokyo · Tochōmae — the Toei Ōedo line on its exit

**Open it:** `https://www.ifcvieweronline.eu/?scene=/scenes/tokyo-tochomae.scene.json`
**Scene file:** [`public/scenes/tokyo-tochomae.scene.json`](../public/scenes/tokyo-tochomae.scene.json)

### What it shows

Exit A4 of Tochōmae station (Toei Ōedo line, E-28), beside the Tokyo Metropolitan
Government Building, as a georeferenced IFC (EPSG:6677) on GSI terrain, with Toei
stations and buses on the map. Three live sources paint the model: the Ōedo line's
status on the Toei marks (green: no delays of 15 min or more), a train at Tochōmae on
the station-name sign (with its train number), and a Toei bus passing the
都庁第一本庁舎 stop on the stop pole.

### Sources

| Source | Provider | Format | Refresh | Licence |
|---|---|---|---|---|
| Trains (`odpt:Train`), line status (`odpt:TrainInformation`) | Toei via ODPT, key-less | JSON-LD | 30 s / 60 s | CC BY 4.0 |
| Buses (`toei-bus`, and the stop binding) | Toei via ODPT | GTFS-Realtime protobuf | 30 s | CC BY 4.0 |
| Stations (`tokyo-toei-stations`) | Toei via ODPT | JSON-LD | static | CC BY 4.0 |
| Terrain | 国土地理院 (GSI) DEM10B | elevation tiles | static | GSI terms |

### Limitations

- ODPT locates a train only as "at A" or "between A and B": the sign lights for a train
  at Tochōmae or one that has just left it.
- Toei buses are not GPS: each is placed at the stop it last passed. The stop lights for
  10 minutes after a bus passed.
- Line status only reports delays of 15 minutes or more; its text is Japanese.
- DEM10B reads ~3 m above the 5 m laser survey here: the model stands on the terrain's
  surface (37.6 m) rather than at its surveyed 34.6 m.

### Verification (2026-10-10 16:48 JST)

All three sources `ok` (93 trains, 6 lines, 541 buses). Ōedo normal → both Toei marks
green; train 1523A at the platform → station sign green with "1523A"; no bus had passed
2248-01 in the last 10 minutes → stop grey. Terrain source `gsi-dem10b`, credited.

---

## Tokyo · Waseda — the Toden Arakawa line's terminus

**Open it:** `https://www.ifcvieweronline.eu/?scene=/scenes/tokyo-waseda.scene.json`
**Scene file:** [`public/scenes/tokyo-waseda.scene.json`](../public/scenes/tokyo-waseda.scene.json)

### What it shows

The Waseda terminus of the Toden Arakawa line (Tokyo Sakura Tram) as a georeferenced
IFC 4.3 railway model on GSI terrain. The platform edges light up while a tram stands at
the stop, with its number floating above, and the departure screens' LED matrices show
the line's status.

### Limitations

- ODPT does not say which platform a tram uses: both edges light up.
- One OpenStreetMap building (way 260395476, the stop's own concourse) is hidden by the
  scene (`view.hide`): a railway model does not suppress buildings automatically.
- DEM10B reads ~2 m above the laser survey here (9.8 m vs 7.9 m).

### Verification (2026-10-10 09:56 JST)

Tram ODPT5254 at Waseda (`toStation` empty) → both platform edges green with
"ODPT5254"; Arakawa normal → both LED matrices green. Terrain `gsi-dem10b`
(9.76 m at the model's origin, as the I+D package measured), credited.

---

## Adding a demo

1. Put the scene in `public/scenes/<id>.scene.json` (models same-origin under
   `public/models/<set>/`, or on any CORS host).
2. Add it to `SCENE_DEMOS` in `src/demo-models/scene-demos.ts` with its model and
   live-source counts.
3. Add `scene.demos.<key>.name` and `.description` to `src/locales/*/layers.json`
   (all 10 languages; the parity test fails otherwise).
4. Document it here with the same template, including what was verified and when.
