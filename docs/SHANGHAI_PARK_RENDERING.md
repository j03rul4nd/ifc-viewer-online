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
