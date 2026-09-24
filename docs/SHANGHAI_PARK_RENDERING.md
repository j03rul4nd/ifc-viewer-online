# Shanghai park rendering

The Shanghai regional treatment augments mapped parks, water and pedestrian paths. It runs in Detailed and Showcase views within 30.65–31.9 N, 120.85–122.05 E. Barcelona does not receive this treatment.

## Geometry and appearance

- Detailed: low shoreline banks derived from small mapped lake outlines, reeds and border shrubs. Large rivers and the sea keep their existing shoreline treatment. Sheltered Shanghai water polygons below 150,000 m² use finer, slower waves with much less surf; this is an appearance heuristic, not measured hydrology or bathymetry.
- Showcase: an optional approximately 720 KiB regional Blender pack, separate from the existing shared prop download. Camphor-, ginkgo-, metasequoia- and willow-inspired silhouettes have branched trunks and irregular foliage masses. They are illustrative species choices, not a surveyed tree inventory.
- At most 1,800 nearby trees use the regional meshes, within 850 m of the model. Distant trees retain the existing cheaper meshes. Positions do not disappear when the mesh budget is reached. Mapped lawns and road corridors are kept clear of generated trees.
- Border planting respects water, buildings, road widths and the IFC exclusion footprint. A maximum of 3,200 small landscape instances and 24,000 bank vertices bounds the additional work. One instanced draw per asset type.
- Fountain points and basins now survive OSM extraction. Animated jets appear only for `amenity=fountain`, at the mapped position. Jet layout, height and operation are representative, since these are not supplied by the map. Ordinary ponds do not gain invented fountains.
- Benches, lanterns and occasional pergolas are additional **optional scenery**, using the existing scenery switch. Placement along park footpaths is illustrative; it must not be mistaken for surveyed infrastructure. No new monuments or heritage pavilions are asserted.
- Existing water/green layer switches own their associated details; scenery retains its separate switch. Optional asset failures fall back to working-view planting. GPU geometry and materials are disposed when layers rebuild.

## Sources and fixture

`src/lib/geo/__fixtures__/shanghai-parks.json` contains OpenStreetMap data retrieved through Overpass on 2026-09-07 (initial park/water/path/fountain query and subsequent planting/building enrichment). Attribution: **© OpenStreetMap contributors**, [ODbL 1.0](https://www.openstreetmap.org/copyright). The fixture retains element IDs, tags and geometry. Central Lujiazui park is [way 40779542](https://www.openstreetmap.org/way/40779542); the central lake is [way 134626455](https://www.openstreetmap.org/way/134626455). The wider fixture contains nine mapped fountain nodes and one fountain polygon; the view radius determines which are rendered.

The [Shanghai government description](https://english.shanghai.gov.cn/en-Latest-WhatsNew/20240417/c0b59775389643688fca7502ba2d3587.html) confirms Lujiazui Central Green's public-park identity. It does not provide a landscape survey. Original Blender geometry is authored for this repository; no third-party models or photographs are redistributed.

## Reproduction and validation

Generate the pack with `blender -b --python-exit-code 1 --python scripts/blender/build-shanghai-park-props.py -- public/models/props/shanghai`. The manifest records bytes and triangles; each mesh stays below 4,000 triangles and is exported as one coloured Z-up metre mesh.

Run `npx vitest run src/lib/geo src/locales scripts/blender/shanghai-park-assets.test.ts scripts/blender/props-assets.test.ts --maxWorkers=4`, followed by `npm run build`.

With Vite running, `/scripts/qa/shanghai-parks.html` compares the existing shared prop geometry with the regional pack on the same OSM fixture and scene. It displays frame rate, draw calls, triangle count and construction time. It is a development comparison, not a historical screenshot of production; both modes use the current surface renderer. Local checks observed approximately 2.49 million triangles and 16 draw calls with regional planting, 18 draws with path scenery, and 60 FPS after shader warm-up on the test machine. Frame rate dropped during concurrent test workloads; these figures are not a device-independent performance guarantee.

Rollback: revert the regional rendering release. IFC model assets are not changed.


## September 24 topology and historic districts

- Green and water surfaces now triangulate inner rings in both quality modes. Detailed shoreline distance includes island boundaries; seeded foliage excludes green holes.
- Park decoration uses the same paved-area and rail clearances as procedural trees. Ground furniture does not follow elevated/tunnel ways or paved polygon perimeters. Random pergolas were removed: they were not mapped structures.
- Fountain symbols are fitted to the actual nearest basin edge (including holes); concave basins use an interior sample when the vertex average is outside. Very narrow basins omit jets.
- Explicit `building=roof` is rendered as an open canopy with slender illustrative supports, not a solid room. Equipment is excluded from those roofs.
- Mapped mansard roofs keep a steep skirt and raised cap. Pitch, breakpoint and supports are approximate, not surveyed architectural detail. Roofs with courtyard holes retain the conservative flat treatment.
- New official OSM API snapshots cover Jing'an and Yuyuan. Each JSON records source URL, retrieval time and ODbL attribution. Religious site polygons must not be extruded as a single building; actual individual building outlines remain authoritative. The snapshots do not establish exact facade detail or a complete restoration model.

### Research and limits

The [Shanghai municipal garden reference](https://english.shanghai.gov.cn/en-Parks/20241118/3ab0a509201343a59102f9bc63a3aab4.html) describes Yuyuan's white walls, dark tiles, pavilions, rockeries and ponds. These references guide review, but no synthetic rockery or pavilion layout is inserted as surveyed data.

The [municipal Jing'an square update](https://english.shanghai.gov.cn/en-Latest-WhatsNew/20240320/1793a6e62ca445c3aefab0bb1f3b7f32.html) reports the 2024 reopening and a raised plaza. It does not give a usable elevation measurement: the implementation does not invent an exact raised datum from that article.

OSM identity checks: Jing'an site `w13981430`, main hall `w1246090668`, Yuyuan garden `w40036584`, Huxinting `w228035340`. Never apply one temple style to every religious building: this area also includes the Fuyou Road mosque.

### Reproduce review

Use `/scripts/qa/shanghai-bridges.html?district=yuyuan` or `district=jingan`. Export production geometry with `node scripts/blender/export-shanghai-city.mjs yuyuan`; render the resulting directory with `scripts/blender/render-shanghai-rail.py`. Blender review is a geometry/material inspection, not a screenshot of the browser's shader output.
