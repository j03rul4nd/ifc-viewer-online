# Rain & slopes (slope hazard)

How much rain makes the slopes fail, shown as a maquette and a table. A
"Rain & slopes" section inside the flood panel, behind `VITE_FEATURE_HAZARD`
(needs `VITE_FEATURE_FLOOD`). Everything runs in the browser; code in
`src/features/hazard/`.

It is an **indicative** tool to communicate the hazard. It does not replace an
official risk assessment (e.g. EVAR per CENEPRED in Peru), a site
investigation, or an early-warning system's own calibration. The panel says so.

## Flow

1. Load the study area as **KMZ/KML** (optional). With no model loaded, the KMZ
   anchors the scene (`anchor.ts`, like a georeferenced scan) so the map can
   open there.
2. Map on with **relief**, then "Build the grid" in the flood panel: the grid
   covers the KMZ's area (`PrepareOptions.extentPoints`), and works with no
   model at all.
3. "Compute": the flood grid is block-averaged to ≤ 160 000 cells, the KMZ
   (or OSM) gives the exposed elements, OSM cover the curve numbers, and a
   worker sweeps the rain step by step.
4. Timeline (play the storm), layers (landslides / runoff / debris), maquette
   (block cut out with earth walls, map and its names hidden), labels, the
   critical-rain table, CSV / GeoJSON.

## Method (`core/`)

| Step | Model | File |
|---|---|---|
| Runoff | SCS curve number (TR-55), AMC I/II/III, λ = 0.2 | `scs-cn.ts` |
| Slopes | Horn slope on a DEM smoothed over ~15 m, D8, flow accumulation | `terrain.ts`, `system.ts` (`smooth`) |
| Wetness | Infiltrated rain over drainable porosity × upslope concentration (1 + (a/b)/L, capped) | `infinite-slope.ts` |
| Failure | Infinite slope FS, P(FS < 1) by Monte Carlo (200 shared, seeded samples of c′, φ′, γ, z) | `infinite-slope.ts` |
| Debris | D8 path from rain-triggered failures, stops at the travel angle (Fahrböschung), keeps heading over flats | `debris.ts` |
| Critical rain | First cumulative rain at which an element's cells fail, are reached by debris, or exceed a runoff threshold | `storm.ts` |

The rain steps are the flood panel's storm, then a ladder beyond its total up
to "Rain to test up to" (`rain.ts`), so every element gets a value.

**Fails without rain.** Cells whose FS < 1 with the antecedent moisture alone
(too steep for the soil: rock faces, cliffs) are kept apart (purple). They set
no critical rain and start no debris flow; an element on them is flagged. On
the Chosica test, with default soil, that was 13.6 ha.

## Gotchas

- Global relief (Terrarium, ~30 m) resampled to 5 m comes in terraces: slopes
  read as stripes of 0° and 50° without the smoothing.
- The map engine re-creates its `screen-labels` group (scene root, not under
  the map) when tiles reload: the maquette hides it on every frame it draws.
- The section unmounts when the panel closes; the study must stay. It is only
  cleared when the flood grid changes (or the flood panel unmounts).
- QA: `globalThis.__hazard` (dev) is the live system: `frame()`,
  `setStep(k)`, `setLayer('runoff')`.

## Not yet (L4)

Eight more languages (en/es only for now), article, demo scene.
