# Solar & climate analysis

The sun study shows one instant. The analysis measures a day, a season or the
year on the IFC itself, with the city around it when map mode is on.

## What it answers

| Question | Where |
|---|---|
| What is the climate here? Which months are hot, which cold? | Climate card — 10 years of ERA5 daily data (Open-Meteo), monthly normals, degree-days, wind, rain, clearness |
| Where does the sun reach, and for how long? | Heatmap of direct-sun hours per day on the site, façades, windows and roofs |
| Where does it heat up? | Heatmap of irradiation (kWh/m²) over the period |
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
     (`climate.ts` `TypicalSky`, ~6 KB cached per place);
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
the run on screen (open sensors, their position/normal/area/element and all
four metrics). After a change — protections, another IFC version, the sky —
"Compare" pairs each current sensor with the nearest variant sensor facing the
same way (within ¾ of the sensor spacing, normals within ~45°; spatial hash),
paints B − A on the model with a diverging ramp (red = better, blue = worse;
for irradiation the user says whether more is better), and reports the change
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

- A typical (averaged) sky, not a year of weather: right for comparing façades
  and windows and for credible annual totals; not an energy simulation or a
  certificate. Ground reflection assumes an unobstructed, uniformly lit ground.
- EN 17037 is screened at the window's outer face; the standard measures at a
  reference point inside the room.
- Gain bands (summer 2 / 3.5, winter 1 / 2.5 kWh/m²·day) are indicative.

## Also

- Day timelapse (sun study panel): a 12 s 1080p video of the day, sky on,
  rendered frame-exactly through the shot renderer.
