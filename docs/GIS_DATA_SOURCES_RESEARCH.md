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
4. **Overture footprints** if we ever want denser building coverage — 59 % more
   footprints, but understand they arrive with no heights and would *increase*
   the share of estimated buildings unless §5 lands first.
5. Nothing on bridge or tunnel elevations. The data does not exist; the
   clearance solver is the answer and already is.
