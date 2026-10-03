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
