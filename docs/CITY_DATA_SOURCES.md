# City data sources — what a browser can actually read

Every public source below was **requested from a browser origin on 2026-10-09** (an
`Origin: https://www.ifcvieweronline.eu` request, then read in the app). A source is
listed as "works in the browser" only when it answered with CORS and the app turned
it into a layer. Documentation alone was never taken as proof.

The product is frontend-only (see `DECISIONS.md`): a source without CORS is **not**
worked around with a server of ours. It is either reached through a proxy the *user*
configures (their own, optional), or recorded here as unavailable in the browser.

## 1. Sources that work today (presets in `src/lib/layers/feed-presets.ts`)

| Preset id | Provider | Format → adapter | Refresh (measured) | Licence / attribution |
|---|---|---|---|---|
| `bicing` | Bicing, Ajuntament de Barcelona | GBFS 3.0 → `gbfsToGeoJson` | ttl 0; polled every 30 s | Licence not declared by the feed (`license_url: null`); credited "Bicing · Ajuntament de Barcelona" |
| `bcn-traffic` | Ajuntament de Barcelona (CGM) | `#` status table + CSV of 527 sections → join | every 5 min | CC BY 4.0 |
| `bcn-endolla` | Endolla / B:SM, Open Data BCN | GELFS 0.96 JSON → `records.ts` + EV summary | ports change-driven; file ~440 KB, the server takes 15–25 s | CC BY 4.0 |
| `bcn-air-quality` | ASPB, Open Data BCN | hourly CSV (H01..H24 / V01..V24) → `hourly-wide` → join to the stations CSV | hourly, 45 min – 3 h late | CC BY 4.0 |
| `cat-meteocat` | Meteocat XEMA via Socrata (Generalitat) | long CSV → `latest-pivot` → join to stations CSV; `{now-3h}` window | half-hourly, ~16 min late; query < 1 s with the window | Generalitat open-data terms (commercial use to be confirmed) |
| `bcn-barris` | Open Data BCN | CSV with WKT (ETRS89 **and** WGS84 columns) | static | CC BY 4.0 |
| `fgc` | FGC Geotren (Opendatasoft) | ODS export GeoJSON | 30 s, **quota 5 000 requests/day/IP** | CC BY 4.0 |
| `madrid-air-quality` | Ayuntamiento de Madrid | same hourly format as ASPB → same transform | hourly | datos.madrid.es terms |
| `tokyo-toei-stations` | ODPT (Toei only on the key-less endpoint) | JSON-LD records (`geo:lat` / `geo:long`) → `records.ts` | static | CC BY 4.0 (ODPT notice) |
| `tmb-*` (4) | TMB | GeoJSON; needs the **user's own** `app_id`/`app_key` | static; iBus 30 s | TMB developer terms |
| `catastro` | Dirección General del Catastro | WFS 2.0, GML only | static | Catastro terms |
| `icgc-municipis` | ICGC | WFS 2.0 | static | CC BY 4.0 |
| `rodalies` | Renfe GTFS-RT (JSON) | **no CORS** → only through the user's proxy | max-age 30 | CC BY 4.0 |
| `toei-bus` | Toei buses, via ODPT (key-less endpoint) | GTFS-Realtime **protobuf** → `gtfs-rt-pb.ts` | `no-store`; polled every 30 s. ~520 vehicles. **Not GPS**: each bus is placed at the stop it last passed, at the time it passed it | CC BY 4.0 (ODPT notice) |
| `fmi-air-quality` | Finnish Meteorological Institute open data (HSY stations) | WFS stored query, `::simple` XML → `bswfs.ts` | hourly means, up to ~40 min late; 3 h window; polled every 15 min. 11 stations in the Helsinki box | CC BY 4.0 (FMI) |
| `fmi-weather` | Finnish Meteorological Institute open data | WFS stored query, `::simple` XML → `bswfs.ts` | 10-min observations; polled every 10 min. 7 stations in the Helsinki box | CC BY 4.0 (FMI) |

FMI publishes a limit of **600 requests per 5 minutes per IP**, shared by everyone
behind that IP; two layers polled every 10–15 min are far from it.

### Device sources (live twins)

Read by the operational twin (`src/lib/twin/`), not drawn as map layers. All verified
from a browser on 2026-10-10.

| Source | URL | Format | What a binding reads |
|---|---|---|---|
| HSL vehicle positions (HFP) | `wss://mqtt.hsl.fi:443/`, topic `/hfp/v2/journey/ongoing/vp/<mode>/…/<geohash>/#` | **MQTT over WebSocket** (`mqtt-ws.ts`), JSON `{ VP: … }`, ~1 message per vehicle per second | `VP.stop` = the HSL stop a vehicle is at (empty between stops), `VP.drst` doors, `VP.spd`, `VP.desi` line. Anonymous; a WebSocket is not subject to CORS |
| Toei trains and trams | `https://api-public.odpt.org/api/v4/odpt:Train?odpt:operator=odpt.Operator:Toei` | JSON-LD, `no-store` | `odpt:fromStation` (the station a train is at or has just left), `odpt:toStation` (empty = at the station), `odpt:trainNumber`, `dc:date`. About 100 trains |
| Toei line status | `https://api-public.odpt.org/api/v4/odpt:TrainInformation?odpt:operator=odpt.Operator:Toei` | JSON-LD | Free Japanese text; `odpt:trainInformationStatus` appears only for delays of **15 min or more** |
| Toei buses | `https://api-public.odpt.org/api/v4/gtfs/realtime/ToeiBus` | GTFS-Realtime protobuf | `entity[].vehicle.stopId` (`2248-01` style, matching the Toei bus GTFS `stops.txt`) and `vehicle.timestamp` (when it passed) |

What a stop id means comes from the operator's static GTFS (HSL:
`infopalvelut.storage.hsldev.com/gtfs/hsl.zip`, 77 MB; Toei buses:
`api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip`, behind a redirect).
They are read once, offline, to pick the ids a scene binds — never by the browser.

Other sources verified with CORS that have no preset yet (good next candidates):

| Source | URL | Notes |
|---|---|---|
| Open-Meteo forecast | `api.open-meteo.com/v1/forecast?latitude=..&longitude=..` | one object per point → `records.ts` reads it; the free API is **non-commercial** |
| RainViewer radar index | `api.rainviewer.com/public/weather-maps.json` | raster tiles, free tier ends at z7 (metropolitan scale) |
| ICGC terrain-RGB (MET 5 m) | `tilemaps.icgc.cat/tileserver/tileserver/terreny-5m-30m-rgb-extent/{z}/{x}/{y}.png` | CC BY 4.0, orthometric; a better DEM for Catalonia than the global one |
| ICGC Barcelona 3D mesh | `tilemaps.icgc.cat/vector/3dtiles/ciutats/v1/Scene-28/tileset.json` | OGC 3D Tiles (b3dm), **ellipsoidal** heights (−49.7 m to orthometric), no licence declared |
| Generalitat road counts (IMD) | `analisi.transparenciacatalunya.cat/resource/xsvx-ym46.json` | Socrata; coordinates are text, so no server-side bbox |
| FMI (Finland) | `opendata.fmi.fi/wfs?...storedquery_id=...::simple` | WFS stored queries; `BsWfsElement` triples need their own reader |
| JMA AMeDAS (Japan) | `www.jma.go.jp/bosai/amedas/...` | not a documented API; lat/lon as `[deg, min]` |
| data.gov.sg real-time | `api-open.data.gov.sg/v2/real-time/api/{dataset}` | stations and readings in one document — the records adapter reads the stations; values need an in-document join |
| Helsinki LOD2 3D Tiles | `kartta.hel.fi/3d/datasource-data/.../tileset.json` | CORS reflects the origin; N2000 heights (+17.61 m) |
| datos.gob.es catalogue API | `datos.gob.es/apidata/catalog/...` | CORS `*`: a national dataset search is possible in the browser |

## 2. Sources that do NOT work in a browser (no CORS)

| Source | What it gives | Status |
|---|---|---|
| Renfe GTFS-RT (`gtfsrt.renfe.com`) | Rodalies train positions | preset marked "proxy"; candidate for a paid-tier proxy |
| HSL GTFS-Realtime (`realtime.hsl.fi/realtime/…/v2/hsl`) | vehicle positions, trip updates, alerts (protobuf) | no CORS; the same vehicles are reachable over HFP MQTT (above) |
| Barcelona itineraries (`www.bcn.cat/transit/dades/dadesitineraris.dat`) | travel times on 78 itineraries | not offered |
| ACA river gauges (`aplicacions.aca.gencat.cat/sdim2/apirest`) | river level / flow | not offered |
| SCT incidents (`www.gencat.cat/transit/opendata/incidenciesGML.xml`) | traffic incidents (GML) | not offered |
| Most CKAN catalogues (Open Data BCN `/api/3/action`, hri.fi, Tokyo) | dataset search | not offered; the *resources* they point at often do have CORS |
| Overpass with an `Origin` header and GET | OSM extracts | the app already uses Overpass by POST from its geo worker |

A user who runs their own proxy can paste a `{url}` template in **Data layers → Proxy**;
hosts that fail directly are retried through it. The proxy is theirs, never ours.

## 3. The adapters that make these work

All pure, all in `src/lib/layers/`, all covered by `city-sources.test.ts` against
responses captured from the real servers (`__fixtures__/`).

- **`records.ts` — JSON that is not GeoJSON.** Finds the largest list of objects that
  carries places and the place inside each record: a GeoJSON geometry, a lon/lat pair
  under one parent (`coordinates.latitude`, `location.longitude`, `geo:lat`), a
  `[lon, lat]` array or WKT text. Judged on values, not only names (bare `x`/`y` are
  never trusted in JSON). An explicit `RecordsSpec` overrides the guess.
  GELFS (EV charging) gets a summary per location: `state` (available / busy /
  out_of_service / unknown), `ports_*`, `max_power_kw`, `fast_charge`.
- **`table-transforms.ts` — status tables that are not one row per place.**
  `hourly-wide` (the Spanish air-quality exchange format: ASPB and Madrid),
  `latest-pivot` (long readings: Meteocat XEMA, most IoT exports), `unique`.
  Local times are converted with the **source's** IANA zone, so a viewer in Tokyo
  does not shift Barcelona's data by 7 hours.
- **`url-template.ts` — time windows in URLs.** `{now-3h:floating}`, `{now:date}`,
  `{now:epoch}`… resolved at each request, so a saved URL never freezes at the
  moment it was saved.
- **`csv.ts`** prefers the WKT column in degrees when a file carries the shape twice,
  drops the redundant copies from the attributes, and picks a unique id column.
- **`join.ts` `uniqueByKey`** de-duplicates geometry tables that list a place once per
  variable, dropping the attributes that differ between those rows.
- **`gtfs-rt-pb.ts` — GTFS-Realtime protobuf.** A small hand-written decoder (header and
  VehiclePosition; trip updates and alerts are skipped field by field) whose output has
  the shape of GTFS-Realtime's JSON mapping, so layers and twin bindings read protobuf
  and JSON feeds the same way.
- **`bswfs.ts` — FMI's "simple" WFS.** (place, time, parameter, value) triples become
  one station per place with the newest **measured** value of each parameter: a `NaN`
  (not yet published) never hides an older number. The answer carries no station names.
- **`../twin/mqtt-ws.ts` — MQTT 3.1.1 over WebSocket**, subscribe-only (QoS 0, PUBACK for
  QoS 1). A twin source with `topics` connects to a broker's WebSocket listener;
  messages are read once a second, newest per device, and a message without the
  device id is skipped.

Twin device sources accept the same formats as layers: JSON, GTFS-Realtime protobuf
and FMI's simple WFS (`deviceBody` in `device-runner.ts`).

## 4. Adding a provider

1. Request it from a browser origin. No CORS → section 2, stop.
2. Capture a trimmed real response into `src/lib/layers/__fixtures__/` and write the
   test first.
3. If the format is new, add a pure adapter (records mapping, table transform) — not a
   special case in the runner.
4. Add a `FeedPreset` with the **measured** refresh, the box it is useful in, and the
   exact licence text. Name and hint go in `src/locales/*/layers.json` (all 10).
5. Record it in the table above.

## 5. Coordinate reference systems added for city models

`src/lib/geo/crs.ts` now resolves, offline:

- **EPSG:3879** (ETRS-GK25FIN, Helsinki) and the other ETRS-GKn zones (3873–3885), plus
  **EPSG:3067** (ETRS-TM35FIN);
- **EPSG:6669–6687** (JGD2011 Japan Plane Rectangular I–XIX; Tokyo is **6677**) and the
  JGD2000 twins 2443–2461;
- **EPSG:23028–23038** (ED50 / UTM), with a 3-parameter shift and a metre-level note.

Each was checked against a real `IfcMapConversion` and its own `IfcSite`
RefLatitude/RefLongitude (Helsinki Cathedral, Waseda tram stop).
