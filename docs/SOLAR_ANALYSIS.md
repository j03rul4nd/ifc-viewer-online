# Solar & climate analysis

The sun study shows one instant. The analysis measures a day, a season or the
year on the IFC itself, with the city around it when map mode is on.

## What it answers

| Question | Where |
|---|---|
| What is the climate here? Which months are hot, which cold? | Climate card — 10 years of ERA5 daily data (Open-Meteo), monthly normals, degree-days, wind, rain, clearness |
| Where does the sun reach, and for how long? | Heatmap of direct-sun hours per day on the site, façades, windows and roofs |
| Where does it heat up? | Heatmap of irradiation (kWh/m²) over the period |
| Where is the sun welcome, and where is it a harm? | Passive impact (SOLARCHVISION's method): each hour's sun × (base − outdoor °C), kWh·°C/m² per day — blue let it in, red shade it |
| Do the windows get enough sun? | EN 17037 sunlight exposure screening per window (1.5 / 3 / 4 h on 21 March, minimum sun altitude selectable) |
| Which glazing will overheat, which earns winter heat? | Average daily irradiation per m² of glazing over the site's hot and cold seasons |
| Where does each room belong? | Façade orientations ranked by winter sun and summer gain, with the passive-design reading |

Findings export as BCF (warnings) and CSV (every window).

## How

- **Sun position** (`solar/solar-position.ts`): NOAA/Meeus with refraction
  scaled by pressure (site elevation) and temperature — within 0.02° of NREL
  SPA's reference case (tested). Replaced suncalc (~0.3°) for the sun; suncalc
  stays for the moon.
- **Sensors** (`sensors.ts`): a ground grid around the building (on the terrain
  when the map has one) and points scattered over every window, wall, door,
  roof and slab top, from the element's own triangles. Each knows its IFC
  element.
- **Sun positions** (`sun-paths.ts`): a day is walked every 2–15 min. A season
  or a year walks EVERY day and bins the positions into ~1–3° sky patches
  (precision Fast/Standard/Fine), one shadow render per patch carrying the
  hours and energy of all its instants. A year at Standard: ~26 000 instants
  → ~2 100 renders, totals exact (tested). Before: 1 day in 14, a ~5° swing.
- **Sky** — three sources, the best one loaded wins:
  1. *Measured*: 5 years of ERA5 hourly GHI/DNI/DHI + sunshine duration
     (Open-Meteo archive) folded into a 12 × 24 UTC typical-hour table
     (`climate.ts` `TypicalSky`, ~6 KB cached per place) — and, when the
     hours themselves are loaded (ERA5's real years or an EPW file), hour by
     hour (see "Weather" below);
  2. *Clearness*: Ineichen clear sky × the month's measured clearness, split
     into beam/diffuse by Erbs;
  3. *Clear sky*: Ineichen–Perez (Linke 3, site elevation).
- **On a surface** (`irradiance.ts`): Hay–Davies — the circumsolar diffuse
  travels with the beam and is shadowed with it; the isotropic part is
  weighted by the sensor's cosine-weighted sky view factor; ground reflection
  with a chosen albedo.
- **Engine** (`exposure-engine.ts`, GPU): three's own shadow map per patch, then
  one pass over a sensor texture: R sun hours, G beam+circumsolar Wh, B sky
  view (sky pass), A expected sun hours (× the chance of sunshine). Slope-scaled
  depth bias, normal offset tied to the texel size, 2×2 PCF.
- **Sky view**: 144 hemisphere directions (was 48). The plain share finds buried
  sensors; the cosine-weighted factor weights the diffuse and is a metric.
- **Metrics**: sun hours (geometric, what EN 17037 counts), expected sun,
  irradiation (beam + sky + ground), sky view %. Hover shows the split.
- **Exports**: BCF, per-window CSV (now with sky view), and the full sensor
  grid CSV (position, normal, every metric).

## Solar-climatic impact (SOLARCHVISION's active and passive views)

Mojtaba Samimi's method, reimplemented from its published math (not from his
code): *Intelligent Design using Solar-Climatic Vision* (Samimi & Nasrollahi,
TU Berlin, 2014), the "Degree of Need to Shade/Shine" (Samimi & Tahbaz, 2007),
and his open-source SOLARCHVISION-BIM
(<https://github.com/archmoj/solarchvision_bim>). The Sun tab's
"Solar-climatic impact" block switches between his two views:

- **Active** — the sun as energy to collect: the plain `irradiation` metric.
  More is more.
- **Passive** — the sun as something a building wants in some hours and not
  in others: every hour's sun on a surface weighted by how far the outdoor
  air is from a base temperature.

### The method

Per hour h and surface point, with T the outdoor air (°C) and Tb the base
temperature: w = Tb − T(h). w ≥ 0 is a cold hour (sun welcome), w < 0 a warm
one (sun unwelcome). B0 is the beam the point would get unobstructed (our
beam is Hay–Davies beam + circumsolar, `beamNormal` × max(0, n·s)), B = vis ·
B0 the beam it does get, F the diffuse sky + ground-reflected light it
receives (isotropic diffuse × its cosine-weighted sky view + reflected).

| Hour | Benefit P gets | Harm N gets |
|---|---|---|
| w ≥ 0 (cold) | w · (B + F) — welcome sun received | w · (B0 − B) — welcome sun blocked |
| w < 0 (warm) | \|w\| · (B0 − B) — unwelcome sun blocked | \|w\| · (B + F) — unwelcome sun received |

Blocking unwanted sun counts as a benefit and blocking wanted sun as a harm:
a shading device is judged by both seasons at once. The four cases collapse
exactly, hour by hour, so they hold for any sum of hours:

```
P − N = Σ w · (2B + F − B0)        P + N = Σ |w| · (B0 + F)
```

So the GPU needs ONE extra accumulator, Σ w · vis · beam · cos · h — the only
shaded term with a sign. It rides in channel B of the sun pass, which that
pass did not use (no extra shadow render, `exposure-engine.ts`, read before
the clamp). B0 depends on the normal alone (CPU, `composePassive` in
`passive.ts`, cached per normal rounded to 1e-3: a façade facing four ways
costs four passes over the samples), F on the sky view (scalars × the view
factor). P and N come back as ((P+N) ± (P−N)) / 2. The weights are computed
per INSTANT in `sun-paths.ts` (exact UTC and month, before binning) and
binned like the energy — conserved exactly (tested against a brute-force
per-hour reference).

**Score** — his "Ratio · Total": S = (P − N) · |P − N| / (P + N), 0 when
P + N ≤ 1e-6: the net effect, scaled by how one-sided it is. S(kP, kN) = k·S,
so the score of the period's totals ÷ days equals the score of the daily
means — how his app aggregates a period (days first, score after). An
element's (and a surface kind's) figure is the score of its AREA-SUMMED P and
N, never a mean of scores — in the Sun pane, the report and the variant
comparison alike (a variant keeps each sensor's P and N for that). The window
lists keep to their sign: "Most unwanted sun" holds only negative scores and
"Most welcome sun" only positive ones, so in a one-sided climate one of them
can be empty rather than list a blue window as unwanted.

**Units** — kWh·°C/m² per day (the period's Wh·°C/m² ÷ 1000 ÷ days), his
own unit. The hover card shows the score, the benefit, the harm and the net
received effect Σ w · (B + F) (his "effect" layers, on the surface).

**Base temperature** — default **18 °C**, SOLARCHVISION-BIM's own value (its
code weighs the sun by 18 − T), so a reader comparing with his app gets the
same question. Presets: **15 °C** (his Montréal study, Jean-Brébeuf, in the
book) and **21 °C** (the book's "required base temperature", the middle of an
18–24 °C comfort band); any value from −10 to 40 °C can be typed. The book
notes the base may follow the season, internal gains or local habits; it is
held constant so places and designs compare. A run records its base: when the
base changes the panel says "run again", a variant keeps it (a passive
comparison warns when the two bases differ; the other metrics ignore it), and
the CSV and the PDF print it.

**Colours** — his diverging palette, harm to benefit: dark red (63,0,0) →
red → yellow → near-white (245,245,240) at zero → cyan → blue → dark blue
(0,0,63). The stops sit where his ramp breaks (±1, ±2, ±2.75 of 2.75), so the
strong colours keep most of the range; the legend is symmetric, ± a round
number at the 98th percentile of |S|. In his words, red does not mean hot and
blue does not mean cold: **red is sun when it is warm (shade it), blue is sun
when it is cold (let it in)**. A run without air temperature draws grey.

**Where the air comes from** — the real hours when loaded (ERA5's five years,
each year a layer, or an EPW's one): the weight at an instant is the mean over
the layers of each layer's w × that layer's own sun, an expectation over real
hours — a cold cloudy morning and a warm clear one stay what they were.
Without the hours, the typical sky's hour-of-month mean (the average sun with
the average air: an approximation, said in the panel). Without either, no
passive map, and the panel says to load the climate or a weather file.

### What we do differently from SOLARCHVISION-BIM

Numbers will not match his app to the decimal; the method is his. On purpose:

- **Sky view** — the diffuse sky is weighted by each point's cosine-weighted
  sky view (144 directions, the rest of the analysis' view factor); his vertex
  shading averages sky directions without the cosine (about half the
  isotropic value).
- **Circumsolar** — Hay–Davies: circumsolar diffuse travels with the beam and
  is shadowed with it.
- **Reflected light** — ground reflection with the chosen albedo (his albedo
  is 0).
- **Classification** — an hour is cold or warm by the sign of Tb − T, not of
  (Tb − T) · DNI: an hour with no beam but warm air is a warm hour, and its
  diffuse counts as unwanted.
- **Period** — every day of the period (binned into sky patches), not 12
  representative days, one per ±15-day window; no first sunlit hour dropped.
- **Statistic** — the mean over every real hour of every weather layer, each
  with its own air, instead of the one day per window that comes closest to a
  chosen statistic (his default: the median). Without the real hours the
  typical-hour means stand in, and the panel says so.
- **Sun** — NOAA/Meeus with refraction at the site's longitude and time zone.
- **Geometry** — the IFC's own openings are cut, and glazing casts shadows
  like any other surface (in his importer glass casts none).

### Where

`lib/solar-analysis/passive.ts` (score, colours, range, `composePassive`),
`sun-paths.ts` (weights per instant, binning), `exposure-engine.ts` (signed
beam in channel B), `analysis-system.ts` (`result.passive`, hover),
`results.ts` (`metricValue('passive')`, element stats from sums),
`compare.ts` (variants: higher is better, an absolute 5 % tolerance of the
reference's p98 |S|, per-kind and per-element figures scored from summed P and
N, each element judged on its outside face as the element lists do; older
variants without the metric count as unpaired). The composition runs after
the GPU pass in slices, so the page and Cancel stay alive on a meshed shell
whose every sensor faces its own way.
UI: `components/solar/SolarAnalysisPanel.tsx` (the block, the legend, "Most
unwanted sun" / "Most welcome sun", the hover), `VariantCompare.tsx` (the
change drawn in the passive colours: blue better, red worse). The sensor CSV
adds `passive_kwhC_m2_day, passive_benefit, passive_harm, passive_net,
passive_base_c`; the PDF draws the diverging ramp, the method and the credit.
A link can open it: `?analysis=year:passive:base18` (see
`docs/EMBED_URL_PARAMS.md`) — it runs at once when the device already holds
the weather its metric needs (sun hours and sky view need none), and
otherwise asks for the one click the climate needs, in the panel or, when the
panel stays closed (an embed, a tour), in a card over the view. If the hours
fail while the daily climate comes, the card and the "Load the real hours"
button say so instead of going quiet.

Sources: M. Samimi, M. Nasrollahi, *Intelligent Design using Solar-Climatic
Vision — Energy and Comfort Improvement in Architecture and Urban Planning
using SOLARCHVISION*, Young Cities Research Paper Series 9, TU Berlin, 2014,
DOI 10.14279/depositonce-3946 (ch. I.5–I.6, the base temperatures, the
palette); *Weather Data and Solar Orientations*, Springer, 2015, DOI
10.1007/978-3-319-15030-7_12; SOLARCHVISION-BIM (GPL-2.0; read as
documentation only, nothing copied).

## Weather: hour by hour (ERA5) and weather files (EPW)

### ERA5, hour by hour

The one hourly request (Open-Meteo archive, 5 years, after the "Load the
climate" click) is now kept two ways (`climate.ts` `fetchEra5Weather`):

- the 12 × 24 UTC typical sky, as before (localStorage, ~6 KB a place) — what
  the daylight's typical year and the panels' monthly shape read;
- the hours themselves, year by year (`weather.ts` `HourlyWeather`, IndexedDB
  `ifc-weather` via `weather-store.ts`, ~0.9 MB a place, the 4 most recent
  places): every layer is 8 760 hours of a non-leap UTC year.

Open-Meteo labels radiation with the END of its hour, so each value goes to
the hour before its label; temperature is the air AT its label, so an hour's
air is the mean of the values at its start and its end (the typical table now
splits each temperature half and half between the slots around its label,
and a missing temperature no longer counts as 0 °C). 29 February is dropped;
an analysis instant on 29 February reads the 28th. With the hours, the
analysis evaluates every layer at every instant (`SunPathOptions.hourly`):
the Hay–Davies terms per layer, averaged — the passive weights pair each
layer's sun with its own air. A climate cached before the hours were kept
offers "Load the real hours" (one request).

The climate belongs to a place: when the study moves more than ~10 km (another
model, a manual location, a link's `?site=`) the ERA5 climate, sky and hours
of the old place are dropped, and the new place's come back from the device
if they are there — no request without a click.

### Weather files

"Load a weather file (.epw, .zip)" in the Sun tab's climate, or a drop on the
viewer (App routes `.epw`, and zips named like a weather set — `TMYx`,
`CWEC`, `IWEC`, `EPW` as a token — to the panel). Read on the device
(`epw.ts`), never uploaded and never fetched by us: climate.onebuilding.org
(CWEC, TMYx, IWEC for most stations) sends no CORS headers, so the user
downloads the zip and drops it. A zip is opened with fflate (already in the
bundle): the first `.epw` inside, `__MACOSX` and `._` entries skipped, 30 MB
cap per file and per entry.

- **Format** — 8 header lines, LOCATION first (city, region, country, source,
  WMO, latitude, longitude, time zone in hours from GMT, elevation), then one
  row per hour: dry bulb (field 6), GHI/DNI/DHI (13–15, Wh/m² over the hour
  before the timestamp), wind direction and speed (20–21), liquid
  precipitation (33, often absent). Missing codes become NaN. A file needs
  exactly 8 760 distinct hours after dropping 29 February (a leap file has
  8 784 rows); a design day, a month or a sub-hourly file is refused with a
  message that says why.
- **Time zone** — rows are hour-ENDING in local STANDARD time (never daylight
  saving); the file's own offset moves them onto the UTC grid (Toronto −5: its
  first local hour of 1 January lands at 05:00 UTC; a typical year wraps).
  Zones a half hour off average the two neighbouring local hours. The air at
  an hour's middle is the mean of the timestamps around it.
- **Sunshine** — an EPW records none: the WMO counts sunshine while the beam
  exceeds 120 W/m², so an hour's share is min(1, DNI / 120).
- **One file, every tool** — the hours drive the radiation and the passive
  weights; `typicalFromHourly` gives the 12 × 24 sky the daylight and PV
  tools read; `climateFromHourly` gives the daily normals the climate card,
  the seasons and the degree-days read (days cut at the station's local
  midnight). Rows a file does not record (rain, wind) are left off the card
  and the PDF rather than shown as zero.
- **Far-station rule** — a weather file is another place's sun clock and
  clouds: a station more than 100 km from the site would pair this site's sun
  with hours that do not line up with it. The panel asks first: "Study the
  model at the station" moves the SOLAR location to the station (never the
  map), keeps the model's north (yaw and its source) and sets the station's
  time zone (unless one was picked by hand); "Cancel" changes nothing. A model
  with no location yet gets the same offer. "Back to ERA5" drops the file.
- **Status** — the chip and the climate card name the source in use (ERA5
  years, or the station, the file and its years); the run's sky line says
  "Measured, hour by hour (…)" when real hours drove it.

## Daylight in the rooms

`daylight.ts`, `components/solar/DaylightRooms.tsx`. Every IfcSpace (world box
and Name/LongName via `getSpaces()`) gets the windows that sit on its box's
boundary and face out of it. Average daylight factor (BRE / CIBSE LG10):
DF = T·Aw·θ / (A·(1−R²)), θ ≈ 180° × the window's measured cosine-weighted sky
view (city, terrain and the building itself included). BRE limiting depth
L/W + L/H ≤ 2/(1−Rb) flags rooms whose back half stays dim. EN 17037 by the
daylight-factor method: targets for 300/500/750 lx from the median external
diffuse illuminance of daylight hours, computed from the sky in use (DHI ×
120 lm/W). One window-only run of the EN day gives the sky views. Report page
and CSV. A curtain-wall tower comes out with a high average and every floor
flagged too deep — the formula's honest answer for a 20 m-deep glazed plate.

### Point by point (EN 17037 as written)

`daylight-grid.ts` + `daylightPass` in the analysis system. A grid on every
room's working plane (0.85 m, 0.5 m off the walls) inside its REAL footprint
(the IfcSpace's downward faces, so an L is not its box); ≤ ~25 000 points.
Sky component: 400 hemisphere directions weighted by the CIE overcast sky
((1 + 2 sin h)/3 × solid angle), the glass and the IfcSpace volumes hidden for
the pass (only what was visible, restored exactly) and full geometry forced,
normalised by the unobstructed horizontal illuminance (7π/9) × T. Internally
reflected component: BRE split-flux, T·W·(C·Rfw + 5·Rcw)/(A(1−R)) — the 0.85
of the textbook form IS clear glass, so T replaces it — with R counting the
glazing at 0.1 and C from the windows' obstruction angle. Level per room:
target over ≥ 50 % of the plane AND the minimum target (100 lx) over ≥ 95 %.
Rooms that pass only with the reflected component are flagged (a narrow pass,
since split-flux is uniform over the room). Hover shows DF = sky + reflected.

Torre Poblenou (32 850 points, ~20 s): sky component 9.9 % at 0.6 m from the
façade, 2.6 % at 5 m, 0.8 % at 18 m; typical floors pass on the sky alone, the
podium and the entrance hall only on reflections.

### Plan view

"Plan view" picks a floor (rooms grouped by floor level, `floorsOf`): the
presentation cut removes everything 1.6 m above it, only that floor's grid is
drawn, and the camera looks straight down. The report gets an off-screen plan
picture: the worst floor by default, the one picked after.

### Two robustness fixes the plan view exposed

- Clipping never reaches a measurement: every pass (sun, sky, daylight, point
  mask) turns the renderer's clipping planes off and restores them. Before,
  the floor cut — or the Section tool — let the sky through every slab
  (floor centre 16.8 % instead of 0.76 %).
- Forcing full geometry waits until no model is busy (repeated
  `core.update(true)`), not one update: the first daylight map after a load
  missed the slabs the camera had culled behind the façade.

### Over the year (climate-based)

`daylight-annual.ts`. Daylight coefficients: for every grid point (~1 m, ≤ ~8 000
points) and every one of the 145 Tregenza patches, Σ visible·cos·dω through the
glass (GPU, once). A second pass at the actual sun position of each typical
hour gives direct-sun visibility per point and hour (the sun is a point; a
12° patch share smeared it). 12 × 24 typical hours from the sky in use (ERA5
when loaded): diffuse with the CIE overcast shape scaled to the hour's DHI ×
120 lm/W, sun DNI × 100 lm/W, BRE inter-reflection of the DIFFUSE only
(reflected sunlight left out — conservative). Per room: EN 17037 by hourly
illuminance (300/100 lx for 50 % of daylight hours over 50 %/95 % of the
plane), sDA300/50 % (08–18 h) and ASE1000,250 h as IES LM-83 / LEED v4 (no
blinds), DA300 map on the floors. Torre Poblenou, clear sky: ~30 s; every
floor passes EN 17037 by the hour and fails LEED on ASE (~64 %: an unshaded
glazed tower lets direct sun deep in).

Typical hours are means: an hour with the sun out 60 % of the time is split
into two states — sun out (probability = ERA5 sunshine share, beam DNI / p,
capped at 1 361 W/m²) and covered — for every threshold and for ASE. Using the
mean beam every hour counted cloudy hours as sunny (Torre Poblenou, ERA5:
ASE 63 % → 56 %). Each annual run is compared with the previous one, room by
room (sDA/ASE change in points, in the panel and the report): louvres (6
slats, 0.3 m, 30°) on every façade take ASE from 56 % to 33 %, DA300 from 90 %
to 86 %; a 0.6 m overhang at ceiling level changes nothing on the working
plane (the slab already blocks those rays) — it protects the glass, not the
room.

Operable blinds (IES LM-83, on by default — LEED's sDA requires them): each
hour, in each room, they come down when over 2 % of its points get more than
1000 lx of direct sun; grouped by façade, only the windows facing the sun
close (no sun, 20 % of their diffuse), the others keep the sky coming in
(`blindGroupFactor`). sDA with blinds, ASE without (as LM-83 asks); the share
of occupied hours with blinds down is reported per room. Closing a whole
four-side-glazed floor at once had taken the Torre's sDA from 100 % to 38 %;
by façade it stays 100 %, DA300 90 % → 80 %, blinds down 81 % of the
occupied hours.

### Finding the protection

`shading-optimizer.ts`: 8 standard designs (none, overhangs 0.6/1.2 m, fins,
three louvre screens, louvres + fins) put on the sun-facing façades (E–W
through the equator side), each measured with the full annual method on a
~2 000-point grid (~11 s each), ranked as LEED reads it — ASE ≤ 10 % first,
then the most DA300, then sDA. The winner goes on the model; any row can be
applied. Report page and a summary verdict. Torre Poblenou, ERA5: louvres ×8 ·
0.4 m · 45° bring ASE from 54 % to 13 % keeping DA300 at 74 % (from 78 %) and
blinds down 27 % of the hours instead of 73 %; overhangs and fins change
nothing on the working plane; none reaches 10 %.

## The analysis' own geometry (no fragments meshes in any pass)

Measured: items hidden with fragments' `setVisible(false)` kept casting in a
shadow pass (with all 19 241 items hidden, an interior point still could not
see a 30° sun), on top of tiles/LOD that follow the user's camera and clipping
planes. Every pass now draws the analysis' OWN occluders, built once per model
from `getItemsGeometry` of every item except spatial/abstract ones (IfcSpace,
openings…), in two meshes — glazing and the rest — placed at the model's
world matrix; the fragments pivots are hidden for the pass. Light passing
THROUGH the glass (daylight) uses the opaque mesh only. Checked against the
independent sky mask: from 0.6 m inside the south façade the sun is visible
from 10° to 60° (the ceiling cuts 75°), from 3 m up to 20°, outside always.
Exterior results move with it (Torre Poblenou: EN 17037 windows 298/432,
rooftop PV 36.9 kWp) — the geometry is now complete and stable.

## Report

Summary page after the cover: one verdict per computed check (meets /
review / narrow pass / result) with its key figure, the no-climate warning and
the contents; an annual daylight page (DA300 plan of the worst floor, DA,
sDA, ASE and the hourly EN level per room); the method covers geometry,
daylight and the annual method.

## Glass or spandrel

IfcPlate holds both glazed units and opaque spandrels. Plates are classified
by Name, Description, ObjectType and type name (`plateIsGlass`: "spandrel",
"opaque", "ciego"… → façade; "glazed", "vidrio"… → window). Before this every
spandrel was a window in EN 17037, the gain bands, shading and daylight
(Torre Poblenou: 52 → 28 windows a floor).

## Design variants

`compare.ts`, `components/solar/VariantCompare.tsx`. "Save as variant" freezes
the run on screen (open sensors, their position/normal/area/element and
every metric). After a change — protections, another IFC version, the sky —
"Compare" pairs each current sensor with the nearest variant sensor facing the
same way (within ¾ of the sensor spacing, normals within ~45°; spatial hash),
paints B − A on the model with a diverging ramp (red = better, blue = worse;
for irradiation the user says whether more is better; the passive impact keeps
its own map's colours — blue better, red worse — and a variant keeps its base
temperature, `Variant.passiveBaseC`, shown next to its period when the
passive impact is compared), and reports the change
per surface type, the share of area better/worse (> 5 %), the elements that
moved most and the share of surfaces paired (unpaired = grey). Variants are
kept on the device (IndexedDB, `variant-store.ts`, the last 8) and survive a
model change and a reload, so two IFC versions compare.
The comparison is a page of the PDF report.

## PDF report

"Download the PDF report" (analysis panel) gathers whatever has been computed
— each part publishes its latest result to `stores/solarReportStore.ts` — and
`lib/report/solar-report.ts` composes A4 pages on a canvas (200 dpi): cover
with key figures, sun path and almanac table, climate, heatmap with legend,
EN 17037 and overheating checks, point diagram with month × hour table,
protections before/after, panels with monthly production, and method &
sources. `lib/report/pdf-writer.ts` packs one JPEG per page into a PDF 1.4
(no dependency; any script renders). 3D pictures come from `framed-shot.ts`:
an off-screen aerial view from the equator side framing the model, so they do
not depend on where the user left the camera.

## Full geometry during runs

Fragments streams tiles and simplifies far items for the user's camera. The
shadow pass draws the same meshes, so before this every result depended on
the view (measured: a roof PV run gave 128 kWp first and 54 kWp after a
framed shot had loaded the rest). Runs and point masks now switch every model
to `LodMode.ALL_VISIBLE` and back (`setFullGeometry` in the viewer context).

## Solar panels

`pv.ts`, `components/solar/PvDesigner.tsx`. Roof sensors facing up, minus
those with another upward surface above them in plan (floor slabs under the
storey above — they glimpse sky sideways through glass, so sky view alone
let them in) and those under 2 m above the lowest sensor (paving, plazas).
Flat roofs (< 10°) are re-aimed at the optimal tilt for the latitude facing the
equator; pitches keep their own slope. One yearly run on that plane gives
kWh/m² with every shadow. Usable: ≥ a share (default 80 %) of the roof's 98th
percentile. Flat-roof rows are spaced for the winter-solstice noon sun
(coverage ratio). Yield = irradiation on whole modules × efficiency × PR;
kWp = module area × efficiency. Months from the panel plane's unshaded sky
(CPU), scaled to the run. Efficiency, PR, threshold and CO₂ factor recompute
without a new run. A clear sky overstates by ~10–20 %: the panel says so.

## Solar protections

Designed by façade (`shading-devices.ts`, `components/solar/ShadingDesigner.tsx`):
choose orientations and an overhang (depth, height above the window, side
overhang), vertical fins (depth) and/or louvres (count, depth, tilt). Every
matching window gets the devices, sized from its own geometry (vertex extents
along 16 horizontal directions, stored per window while sampling — sensors are
too sparse for a 40 cm strip). They are drawn as one InstancedMesh and occlude
every later run, the sky view included. "Measure" runs the hot season, the cold
season and the EN 17037 day on the windows only, without and with the devices,
and reports summer gain cut, winter gain lost and EN 17037 hours kept, per
orientation and overall (glazed-area weighted). "Suggest depth" sizes the
overhang to shade the window fully at summer-solstice noon.

Per-element figures (all checks) now pick the sunniest of the element's REAL
faces: a facing under a quarter of its largest one (the top edge of a glass
plate) no longer judges the window, and among the real faces the outside one
is the one that sees the most sky (the inner face of a pane can catch sun
through the opposite façade, but has the slab above it).

## Shading diagram of a point

Pick any point (model, OSM buildings, terrain, or the ground plane): five 90°
renders from the point with every occluder drawn white on black give a 2° × 2°
sky mask (`sky-mask.ts`, `renderSkyMask` in `analysis-system.ts`). Over it:
the 21st-of-each-month sun paths and hour lines, a month × hour table of the
share of each hour in sun, sun per day over the year vs. an open sky, EN 17037
hours on 21 March at that exact point, and the sky view. Exports as CSV.

## Almanac (Sun & Moon panel)

Sunrise/sunset with azimuth, solar noon altitude, civil/nautical/astronomical
twilight, day length and its daily change, declination, shadow of a 10 m
object, moonrise/moonset (site day, can be none), moon distance, next four
principal phases, and a polar sun-path diagram (solstices, equinox, today with
hours, sun and moon now) drawn to true north. `solar/astronomy.ts`: every
event is a threshold crossing over the site's calendar day, bisected to 1 s.

## Limits (said in the UI too)

- Measured weather (ERA5's real years, or a typical/real year from an EPW
  file), not a simulation of the building's thermal response: right for
  comparing façades, windows and protections and for credible annual totals;
  not an energy simulation or a certificate. Ground reflection assumes an
  unobstructed, uniformly lit ground.
- The passive impact weighs the sun by the OUTDOOR air against a fixed base
  temperature — SOLARCHVISION's screening, not a heat balance (no internal
  gains, inertia or ventilation).
- EN 17037 is screened at the window's outer face; the standard measures at a
  reference point inside the room.
- Gain bands (summer 2 / 3.5, winter 1 / 2.5 kWh/m²·day) are indicative.

## Also

- Day timelapse (sun study panel): a 12 s 1080p video of the day, sky on,
  rendered frame-exactly through the shot renderer.
