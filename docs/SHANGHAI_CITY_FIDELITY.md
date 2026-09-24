# Shanghai: surface, underground routes and planting

Research checked 2026-09-24. This iteration uses the mapped outlines and solved
vertical profiles already used by the production renderer.

## Evidence and interpretation

- [Shanghai SASAC, Pudong Avenue opening, 2022-12-31](https://www.gzw.sh.gov.cn/shgzw_zxzx_gqdt/20221231/73a5e19620c34ab987a4aca92e46e1bd.html)
  describes a 7.8 km project with a 6.1 km underground section, nine access
  points, and a separate 1.7 km surface widening. Rendering the underground
  alignment as pavement over the surface misrepresents this arrangement.
- [Lujiazui waterfront public space, Pudong government, 2023](https://www.pudong.gov.cn/zwgk/cxjsgl-ljzjdzdgz/2023/201/312786.html)
  identifies pedestrian waterfront spaces, viewing platforms and separated
  passages. It supports preserving mapped paved circulation within green areas;
  it does not provide individual tree positions or construction dimensions.
- [AREP, Shanghai South station](https://www.arep.fr/en/our-projects/shanghai-train-station/)
  remains the architectural reference for the station reconstruction documented
  in `SHANGHAI_RAIL_RENDERING.md`.

## Implemented

- Detailed 3D omits buried road traces. Simple map mode retains its schematic
  alignment. Ground streets and the visible parts of approaches remain separate.
- Procedural tree trunks avoid mapped roads, paths, railway corridors, platforms
  and paved areas, in addition to water and buildings. A spatial grid bounds
  query cost. Mapped trees remain authoritative; underground tunnels do not clear
  planting above them. Bridge footprints exclude procedural trunks conservatively.
- Explicit railway bridges receive a closed 1.1 m illustrative deck section and
  opaque depth writing. Ground railway retains its shallow ballast section.
- Side catenary masts are omitted when their foundations would sit outside a
  narrow viaduct. No unsupported cantilever bracket is invented.

## Limits

The deck depth and planting margins (0.5 m beside roads, 1 m beside rail) are
visual fallback parameters, not surveyed dimensions. Canopies may overhang paths.
This does not excavate terrain for tunnel portals, reconstruct surveyed railway
gantries/supports, or establish the exact fleet, train timetable or garden design.
Existing OSM fixtures are snapshots, not a claim of complete current city coverage.

## Reproduction

`npx vitest run src/lib/geo/planting-clearance.test.ts src/lib/geo/city-infrastructure.test.ts`

`node scripts/blender/export-shanghai-rail.mjs hongqiao`

`blender --factory-startup --background --python scripts/blender/render-shanghai-rail.py -- .tmp/shanghai-rail/hongqiao`

The Blender export uses the production geometry builders; it is a review artifact,
not a separate model substituted for the web renderer.
