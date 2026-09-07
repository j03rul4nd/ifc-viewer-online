# Where our 3D city data comes from, and where it should

Research note, measured against the Lujiazui benchmark patch
(31.2280–31.2470 N, 121.4880–121.5150 E — the Oriental Pearl / SWFC district).

Everything below is a number this document actually took, not a citation. The
constraint was **fully free sources — open data, not free tiers**: no API key,
no account, no quota that expires.

---

## 1. The headline

> **In Lujiazui the median *measured* building height is 60.8 m.
> Our fallback for an untagged building is 8 m — the 15th percentile of what
> the district actually measures.**

937 building outlines are mapped in the patch. **4.2 % carry `height`** and
15.8 % carry `building:levels`, so roughly **750 of them are drawn at a type
constant**. In a district whose typical *surveyed* building is 55 m tall, they
are drawn at 8 m.

That single number explains more of "the Shanghai map looks wrong" than roads,
textures and terrain combined. It is also the cheapest thing on this list to
fix, and it needs **no new data source at all** — see §5.

---

## 2. What OSM actually carries here

### Buildings — 937 outlines, 139 `building:part`

| tag | outlines | `building:part` |
|---|---|---|
| `height` | **4.2 %** | **70.5 %** |
| `building:levels` | 15.8 % | 25.9 % |
| `min_height` | — | 39.6 % |
| `roof:shape` | 3.8 % | 20.1 % |
| `name` | 22.4 % | 0.7 % |

`building:part` is by far the richest layer and we already query it. The
outlines are the problem.

Coverage is **not** confined to sheds — it thins with size but never gets good:

| footprint | count | has height or levels |
|---|---|---|
| > 2 ha | 2 | 50 % |
| 0.5–2 ha | 12 | 50 % |
| 1 000–5 000 m² | 102 | 39 % |
| 200–1 000 m² | 238 | **9 %** |
| < 200 m² | 52 | 6 % |

So "the towers are covered, only sheds are missing" is false: half the largest
buildings in Lujiazui have no height either.

### Roads — 1 673 highway ways, 455 vehicular

| tag | coverage on vehicular |
|---|---|
| `oneway` | 79.8 % |
| `lanes` | 63.7 % (trunk 100 %, primary 93 %, secondary 75 %) |
| `width` | **0.0 %** |
| `turn:lanes` | **0 ways** |
| `lanes:forward` / `backward` | 1 way each |
| `tunnel` | 41 (+12 `building_passage`) |
| `service=parking_aisle` | 69 |

Carriageway width is never surveyed anywhere in the patch — it is always
derived from lanes. Worth remembering before anyone "improves" width handling.

### Bridges and tunnels — the structural gap

| | bridges (58) | tunnels (71) |
|---|---|---|
| `layer` | 81 % | 97 % |
| `height` | **1.7 %** | — |
| `ele` | **0 %** | **0 %** |
| `maxheight` | — | 8.5 % |

**No deck elevation is mapped anywhere.** `layer` is a stacking *order*, not a
height — it says a bridge is above what it crosses, and nothing more. Every
elevation in the vertical solver is therefore inferred from clearances, and no
free source changes that. This is a permanent property of the data, not a gap
waiting to be filled.

---

## 3. Sources tested and REJECTED

The most useful part of this note. Both are what a search engine recommends
first for global building heights, and both would have made the map worse.

### Overture Maps — rejected for heights, useful for footprints

Free, no key, ODbL/CDLA, GeoParquet on public S3. Queried release `2026-08-19.0`
with DuckDB over the same bbox:

| | buildings | with `height` | with `num_floors` |
|---|---|---|---|
| **Overture** | 1 494 | **39** (2.6 %) | 132 (8.8 %) |
| OSM | 937 | 39 (4.2 %) | 148 |

Overture has **59 % more footprints and not one additional height** — its China
heights are OSM-derived, and the extra ML-detected footprints carry none. It is
a real option if we ever want denser *footprints*; it is not a height source.

### GHSL `GHS_BUILT_H_ANBH` — rejected outright

JRC, free, no key, 100 m global raster of average net building height. The
Shanghai tile (`R6_C30`, Mollweide 54009) is 19 MB. Sampled at real landmarks:

| location | true height | GHSL says |
|---|---|---|
| Shanghai Tower | 632 m | **15.0 m** |
| SWFC | 492 m | 12.3 m |
| Jin Mao | 421 m | 12.5 m |
| Oriental Pearl | 468 m | 8.9 m |
| low-rise block, east | ~20 m | 17.0 m |
| **middle of the Huangpu river** | 0 m | **15.9 m** |

The product is an *average over a 100 m cell*, so in a district of isolated
supertalls surrounded by plazas it is dominated by open ground: the whole
district reads 9–17 m, the low-rise block scores *higher* than the Shanghai
Tower, and the river has buildings on it. It has no discriminating power at
building scale and would flatten every tower we have. Do not revisit this.

### Others, ruled out without testing

- **Google Open Buildings** — Africa, South Asia, South-East Asia, Latin
  America. China is not in the coverage.
- **Microsoft GlobalMLBuildingFootprints** — has China footprints, heights
  essentially US-only. Same shape of answer as Overture.
- **Copernicus Urban Atlas building heights** — Europe only.

**Conclusion: there is no free per-building height source for Shanghai.** That
is worth stating plainly, because it redirects the effort to §5.

---

## 3b. Can a rejected source be filtered into a useful one?

Worth asking rather than assuming, because "mostly wrong" and "useless" are
different things. Both were tested; they gave opposite answers.

### GHSL — no. There is nothing to calibrate.

A biased estimator can be corrected; an uninformative one cannot. GHSL is
systematically low, which *looks* correctable — it averages building volume over
a 100 m cell including open ground, so dividing by the built-up fraction is the
obvious repair.

Tested against ground truth: for every 100 m cell containing surveyed OSM
buildings, the cell's volume-weighted mean height was compared with GHSL.

| | correlation |
|---|---|
| GHSL vs OSM mean height | **r = +0.004** |
| GHSL vs OSM height × built fraction | r = −0.100 |
| GHSL ÷ built fraction vs OSM height | r = −0.244 |

Zero, and the "correction" makes it worse. Over these cells GHSL spans
6.1–33.3 m while the truth spans 6.4–632 m. There is no signal to recover, so no
filter, threshold or calibration rescues it. (55 cells, only 7 with two or more
surveyed buildings — a small sample, but a 20× range mismatch at r ≈ 0 is not a
sample-size artefact.)

### Overture — yes, and the filter is exact

Overture publishes the **provenance of every building**. Over the core bbox:

| cited source | count |
|---|---|
| OpenStreetMap | 406 |
| `doi:10.5281/zenodo.8174931` (ML footprints) | 308 |

The OpenStreetMap subset is exactly the 406 buildings we already fetch — a clean
cross-check. Taking only the rows Overture does *not* attribute to OSM yields
287 footprints, median 211 m², p90 1 846 m².

**CORRECTION.** An earlier version of this note said provenance made geometric
de-duplication unnecessary — "the dataset says which are ours". That was wrong,
and measuring it is what showed it: of the 308 ML-sourced rows, **47 (15 %) land
on an OSM building anyway**, because Overture kept both where its matcher did
not pair them. Provenance alone would admit those 47 as new buildings, doubling
them on screen.

Both filters are needed. **261 are genuinely new**, not 287. The geometric pass
also belongs at RUNTIME rather than in the extract: OSM grows, and a
de-duplication baked in at build time goes stale against the very data it is
meant to complement.

That is the shape the question was after — keep what the source is good at
(footprint coverage), discard what we measured it to be bad at (heights; only 7
of the 287 carry one).

Two honest costs. Those 287 buildings would all be `estimated`, pushing the
assumed share of the skyline from roughly 80 % to 85 %, so the audit has to keep
showing it. And this cannot be a runtime source: the query above was DuckDB
scanning GeoParquet on S3 for 140 s, which no browser will do. It is a
**build-time extract for chosen demo districts**, shipped as a small file, or it
is nothing.

## 4. Wikidata — small, precise, and it cross-checks us

Free, keyless SPARQL. 33 of 1 076 buildings in the patch carry a `wikidata` tag.
Querying `P2048` (height):

- **7 have a height.**
- **3 are heights OSM does not have**: Oriental Pearl **468 m**, Bocom Financial
  Towers 265 m, One Lujiazui 269 m.
- Where both sources have a value they **agree exactly** — 632/632, 492/492,
  420.5/420.5.

Three buildings out of 937 is nothing as coverage and a lot as *skyline*: the
Oriental Pearl is the landmark of the district and one of our own demo models.

Two cautions. Jin Mao returns **two conflicting claims** (420.5 and 421.0), so
any use has to resolve statement rank rather than take the first row. And
`query.wikidata.org` is rate-limited and occasionally down — this belongs in a
**build-time enrichment file with provenance**, never as a runtime dependency of
the viewer.

---

## 5. The change worth making, which needs no new source

Today an untagged building gets a **global constant by type** — `building=yes`
→ 8 m. Measured against the 276 buildings in this patch whose height *is*
resolvable:

| | median | max |
|---|---|---|
| all | 60.8 m | 632 m |
| `building=yes` (n=207) | **55.0 m** | 632 m |
| `commercial` (n=28) | 182.5 m | 632 m |
| `apartments` (n=6) | 87.8 m | 112 m |
| `residential` (n=22) | 19.2 m | 19.2 m |

Percentiles over the patch: p10 3.2 m, p25 19.2 m, **p50 64.0 m**, p75 185 m,
p90 297 m.

**Proposal — a local prior instead of a global constant.** Take the median
height of buildings *of the same type that carry surveyed heights in the same
patch*, and use that as the fallback. It is derived from measured data, it
adapts to the district automatically (Lujiazui tall, a village low), and it
stays `estimated: true` so the audit and the confidence overlay keep telling the
truth about which buildings are guesses.

Guard rails, because this can go wrong in obvious ways:

- **Require a real sample.** Below ~8 surveyed buildings of that type, keep the
  current constant; a median of three is not a distribution.
- **Never apply it to intrinsically small types** — `shed`, `garage`, `hut`,
  `carport`, `roof`. A shed is 3 m in Lujiazui and 3 m in a village, and a
  55 m shed is a worse error than an 8 m tower.
- **Clamp it.** A patch containing only supertalls must not make every corner
  shop 300 m.
- It is still an estimate. It moves the guess from "wrong everywhere" to
  "typical of here", which is the honest ceiling without a height source.

Expected effect in Lujiazui: ~750 background buildings move from 8 m to roughly
the district median, which is the difference between a skyline with towers
standing in a car park and one with a city under them.

---

## 6. Ranked, by improvement per unit of work

1. **Local height prior (§5).** No new source, no new fetch, biggest visible
   change in the Shanghai view. Do this first.
2. **Type-aware storey height.** `building:levels` is currently multiplied by a
   flat 3.2 m. Office, retail and residential storeys differ by more than a
   metre each; 148 buildings in the patch go through this path.
3. **Wikidata build-time enrichment (§4)** for named landmarks, with provenance
   and rank resolution. Small, precise, and it doubles as a cross-check of OSM
   heights we already trust.
4. **Overture footprints as a build-time extract** — filter to rows not
   attributed to OpenStreetMap and take geometry only; then drop, at runtime,
   the 15 % that land on an OSM building regardless. 261 new buildings in the
   core bbox. Now that §5 has landed they would arrive at district-typical
   heights rather than 8 m, which is what makes this worth doing at all.
5. Nothing on bridge or tunnel elevations. The data does not exist; the
   clearance solver is the answer and already is.

---

## 7. The same measurement on Barcelona — and why it changes the answers

Run over the Vila Olímpica / Poblenou waterfront (41.3730–41.3900 N,
2.1750–2.2010 E): 1 788 building outlines, **6 490 `building:part`**, 3 893
highways, 675 vehicular.

| | Shanghai | Barcelona |
|---|---|---|
| building `height` | 4.2 % | 4.2 % |
| **`building:levels`** | 15.8 % | **83.7 %** |
| `building:material` | 8.2 % | 0.3 % |
| road `oneway` | 79.8 % | 89.9 % |
| road `lanes` | 63.7 % | 49.2 % |
| **road `width`** | **0 %** | **8.4 %** |
| **`turn:lanes`** | **0 ways** | **51 ways** |
| `maxspeed` | 4.4 % | 88.6 % |
| `surface` | 16.7 % | 95.1 % |
| crossing ways | 49 | 537 |

**The data landscape is city-specific, and so is what it is honest to draw.**
Three consequences, all measured:

1. **Barcelona is a `building:levels` city.** 83.7 % of its buildings resolve
   their height through the levels path, against 15.8 % in Shanghai. Whatever
   metres-per-storey we assume is, in Barcelona, the dominant source of height
   error in the whole scene.
2. **Turn arrows are renderable in Barcelona and not in Shanghai.** `turn:lanes`
   is mapped on 51 ways there and zero here. The rule in `lane-markings` should
   therefore stay "draw only what is mapped" rather than "never draw" — it is
   the data that is absent, not the feature.
3. **Carriageway width is surveyed in Barcelona** (8.4 %) and nowhere in
   Shanghai. Width can come from survey there and must stay derived here.

### Metres per storey is regional, and the constant never said so

Measured on the buildings that state BOTH a height and a storey count — the only
ones that can measure it:

| | median m/storey | n |
|---|---|---|
| **Barcelona** | **3.14** (apartments 3.14, residential 2.50) | 41 |
| **Shanghai** | **4.42** (commercial 4.56, `yes` 4.30) | 43 |
| our constant | 3.2 | — |

Nearly right for a European apartment block and **27 % low for a Chinese office
tower**: a 30-storey Lujiazui building tagged only by storey count was drawn
37 m short. Now derived from the patch the same way heights are, declining to
the constant where too few buildings state both.

---

## 8. Tags we already download and were not reading

The cheapest wins in this whole note came from here, not from new sources.
Coverage in the Lujiazui patch:

| tag | coverage | status |
|---|---|---|
| `building:material` | 8.2 % (88) | **unused** — only three values here: `concrete` 41, `glass` 33, `mirror` 14 |
| `roof:material` | 6.0 % (65) | unused |
| **`note:height` = `estimated`** | **5.3 % (57)** | **was unused — now read** |
| `roof:levels` | 3.3 % | unused, and every value is `1` |
| `roof:direction` | 1.1 % | unused; mixes degrees (`309.9`) with compass points (`SSW`) |
| `building:colour`, `roof:colour` | 2.2 %, 1.7 % | already read |
| `crossing:markings`, `crossing:signals` | 2.2 %, 1.2 % | already read |

**`note:height=estimated` was the important one.** 57 buildings carry it, and
all 57 also carry a `height` we were reporting as surveyed — **42 % of every
height in the district**. The mapper had already said the number was a guess and
we were presenting it as a measurement, in the one part of the codebase whose
whole purpose is to distinguish the two. Now read, along with `source:height`,
`height:source` and a `source` containing "estimat" (`estimation;Bing` is a real
value in this patch).

**`building:material` is the best remaining unused tag.** Three values, a
trivial mapping, and it lands on the Lujiazui towers — glass and mirror against
concrete is most of what makes that skyline read as itself.

---

## 9. Non-OSM sources for Shanghai specifically — what was reachable

Tested for reachability with no key, no account and no session.

| source | result |
|---|---|
| **Shanghai open data portal** (`data.sh.gov.cn`) | **HTTP 412** to a plain request — behind a bot/precondition gate. Whatever it holds is not reachable programmatically without a session, so it fails the "no account" constraint. |
| **ESA WorldCover** via Terrascope WMS | Connection reset from here. Untested rather than rejected — the data is genuinely open and the 10 m land-cover classes would help where OSM maps no ground polygon at all. Worth retrying from the build machine. |
| **OpenFreeMap** (`tiles.openfreemap.org`) | **200, keyless, no quota.** See below — an operational fallback, not a richer source. |

### OpenFreeMap — the answer to a different question

It serves the whole planet as OpenMapTiles vector tiles with no key and no rate
limit, which matters because **Overpass rate-limiting is a real production
risk**: this research exhausted the quota for one IP and the viewer's own
context fetches started failing as a result.

But it is not a richer source, and adopting it naively would cost us most of
this session's work. Its schema at z14:

- `building` → `render_height`, `render_min_height`, `colour`. `render_height`
  is OpenMapTiles' **pre-computed** height, which bakes in its own storey
  constant (3.66 m) and its own default. We would inherit a guess we cannot
  inspect, right after building the machinery to derive one from the district.
- `transportation` → `class`, `oneway`, `layer`, `brunnel`, `access`… and **no
  `lanes`**. Every lane divider and direction arrow shipped this week depends on
  `lanes`.

So: a sound emergency fallback for "Overpass is down, draw something", at the
cost of lane markings and of any control over heights. Not a primary source.

### Still worth trying, not yet tested

- **ESA WorldCover 10 m** — ground cover where OSM maps none. The single
  biggest remaining gap in "what is the floor made of".
- **Copernicus GLO-30 DEM** as a cross-check on the terrarium tiles we use.
- **Wikimedia Commons** for landmark facade colour — free, but not automatable
  in any way I would trust.
