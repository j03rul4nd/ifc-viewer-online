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
