# Shanghai streets and building fabric — 2026-09-24

## References and data

- [Shanghai government: shikumen neighbourhoods](https://english.shanghai.gov.cn/en-ScenicSpots/20231211/98e70b4d4c54401895104e4dee9f16d8.html): brick/wood housing and the distinct historic fabric. This is architectural context, not a survey of individual facades.
- [SOM: Jin Mao Tower](https://www.som.com/projects/jin-mao-tower/): the tower's pagoda-like setbacks illustrate why mapped building parts must remain distinct. This iteration does not introduce a fabricated Jin Mao model.
- [OSM pavement areas](https://wiki.openstreetmap.org/wiki/Key:area:highway): exact outlines supplement road centrelines; pedestrian surfaces and carriageways have different semantics.
- [OSM Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings): parts, heights and minimum heights describe occupied volumes.

`shanghai-xintiandi.json` is an ODbL snapshot of the official OSM map API for
121.471,31.214–121.480,31.222, with source URL and retrieval time in the file.
It contains 323 tagged buildings, including 101 houses and 55 apartment buildings.
It contains no `area:highway` objects or mapped building courtyard relations:
those capabilities are validated with explicit synthetic regression geometries,
not presented as newly discovered Xintiandi survey data.

## Changes

- Fetch/classify explicit road and pedestrian surface polygons and pedestrian
  multipolygons. Respect material tags and mapped interior holes; retain vertical
  metadata and omit underground concourses from the surface view.
- Preserve building courtyard rings through parser, scene assembly and roof
  triangulation; add inward-facing courtyard walls.
- Respect `min_height` without extending a buried foundation skirt into the
  space under a suspended building part. Do not count foundation depth as floors.
- Keep roof equipment out of courtyard voids and compute its anchors relative
  to a local origin to avoid centroid cancellation at Shanghai longitude.
- Distinguish solid residential/civic window bays, sparse high industrial
  windows, and continuous office/glass bands. Tagged glass overrides the type.
  Window positions are illustrative, not observed facade openings.
- Generate facade coordinates relative to the scene anchor before Float32
  conversion, preserving small details at Shanghai longitude. Restore the
  translation on the building mesh; the legacy geometry API remains available.
- Keep individual window bays within 450 m of the anchor and cap bays per wall.
  More distant buildings retain inexpensive floor bands and the same footprint.

## Limitations

Missing map data is not reconstructed as fact. Courtyard buildings use a flat
roof approximation rather than a pitched roof stretched across their voids.
Exact facade decoration, balconies, storefronts, portal excavation and complete
city-wide geometry remain outside this iteration. Explicit pavement polygons can
coexist with road markings from centrelines; this is not a navigation graph change.

## Review

`scripts/qa/shanghai-bridges.html?district=xintiandi` renders the actual builders.
The `lujiazui` district retains bridge/access views and a buildings toggle.

`node scripts/blender/export-shanghai-city.mjs` exports the same production
meshes to `.tmp/shanghai-city/xintiandi/mesh.json` for Blender inspection.
