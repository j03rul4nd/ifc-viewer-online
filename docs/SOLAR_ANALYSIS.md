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

- **Sensors** (`sensors.ts`): a ground grid around the building (on the terrain
  when the map has one) and points scattered over every window, wall, door,
  roof and slab top, from the element's own triangles. Each knows its IFC
  element.
- **Sun positions** (`sun-paths.ts`): every 10–30 min, on sampled days (every
  7 days in a season, 14 in a year), site wall-clock time.
- **Engine** (`exposure-engine.ts`, GPU): for each instant, three's own shadow
  map from a dedicated directional light — so the model, the OSM buildings and
  the terrain all occlude — then one pass over a texture of sensors adds hours
  and Wh/m². Float ping-pong targets; the viewer's render loop is paused
  during a run (an interleaved frame lost accumulated hours).
- **Sky view**: the same engine over 48 hemisphere directions gives each
  sensor's share of visible sky. It weights the diffuse sky and drops sensors
  buried inside solids (a structural slab under a roof finish).
- **Irradiance** (`irradiance.ts`): Kasten–Young air mass, Meinel DNI,
  Haurwitz GHI, diffuse = GHI − DNI·sin h; scaled per month by the site's
  measured clearness when the climate is loaded.
- **Per element** (`results.ts`): the element is judged by its sunnier face —
  the inside face of a wall or window never sees the sun.

## Limits (said in the UI too)

- A clear-sky model scaled by measured cloudiness: right for comparing façades
  and windows and for orders of magnitude; not an energy simulation or a
  certificate.
- EN 17037 is screened at the window's outer face; the standard measures at a
  reference point inside the room.
- Gain bands (summer 2 / 3.5, winter 1 / 2.5 kWh/m²·day) are indicative.

## Also

- Day timelapse (sun study panel): a 12 s 1080p video of the day, sky on,
  rendered frame-exactly through the shot renderer.
