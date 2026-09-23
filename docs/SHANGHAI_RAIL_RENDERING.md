# Shanghai railway rendering — 2026-09-23

## Evidence and scope

- [AREP: Shanghai South](https://www.arep.fr/en/our-projects/shanghai-train-station/): circular station, square waiting area and a lightweight roof with external sunshades, polycarbonate and inner perforated metal. The reference model introduces a shallow circular roof, concentric material bands, radial ribs and a glazed drum. It is not a reconstruction of fabrication drawings.
- [Shanghai Railway Administration / UIC Nextstation, 2013](https://nextstation.org/IMG/pdf/5_-_ppt_-_intermodality_of_shanghai_hongqiao_station_concepts_and_practices_-_jianping_shi.pdf): Hongqiao's integrated interchange, separate waiting space and platform canopies, and 30 tracks/platform faces. Its historical service statistics and proposed metro lines are NOT treated as current facts.
- [CRRC metro vehicle catalogue](https://www.crrcgc.cc/Portals/73/Uploads/Files/2017/4-26/636288002734565604.pdf): distinct vehicle families; a single generic car cannot be asserted to reproduce every Shanghai fleet. The new 19 m assets are illustrative rolling stock, not certified replicas of CR400 or a specific metro series.
- Official OSM map API snapshots are stored in `shanghai-hongqiao.json` and `shanghai-south.json`, with exact bounding-box source URLs, retrieval dates and ODbL attribution. The snapshot returns complete intersecting ways, including parts outside the requested box. Production continues to use live requested features, not these QA fixtures.

## Implemented

- Rail gauge is parsed in millimetres, defaulting to 1435 mm; rails have a 70 mm head, web and foot, instead of a 440 mm wide painted ribbon. Concrete sleepers follow distance along the alignment, including segment transitions.
- Web, foot and sleeper detail is limited to 450 m around the requested map anchor. Remote rails retain the running heads. All parts share the layer's batched geometry and depth-writing pass.
- Overhead-electrified ways receive contact and messenger wires. Third-rail electrification no longer implies overhead masts. Legacy callers with only an electrified boolean retain their previous fallback.
- Platform polygons retain their vertical tags, including underground levels. Surface review excludes underground railways/platforms; it does not invent excavated interiors. Platform slabs have side faces and a mapped height where supplied, otherwise an explicit 0.55 m fallback.
- Exact identity plus geographic bounds select Hongqiao main hall and its two mapped roof footprints, and Shanghai South's circular building. Other station buildings retain the generic builder. This avoids applying Shanghai architecture to similarly named stations elsewhere.
- The landmark models follow their mapped outline. Hongqiao's hall is raised above the tracks; its canopy is an open structure rather than a solid building obstructing them. South uses its circular outline as the diameter constraint.
- Blender authors separate car and cab assets, windows, doors, blue belt, gangways, bogies and wheelsets. They remain instanced. 620 triangles/car and 644/cab; total prop download approximately 427 KiB, including all existing non-rail assets.
- Trains are bounded to four cars per sampled way and a global 160-car cap; every consist fits within its source way, with 20 m pitch. Yaw follows the bogie chord across mapped nodes, and rail elevation is sampled from the same vertical profile. Underground rolling stock is omitted from the surface scene. Scenery remains opt-in and decorative.

## Inference limits

Roof heights (Hongqiao hall 30 m, canopies 10 m; South edge 24 m / crown 36 m), column layouts, roof panel widths, glazing and train fleet/livery are approximate modeling choices. OSM does not provide structural sections or operating train positions. Mapped tracks retain their branch topology, but switches do not yet include surveyed blade/frog mechanisms. Station interiors, escalator banks, underground interchange passages and detailed MEP are not documented by these inputs and have not been fabricated as survey geometry.

Platform loading gauges and vertical datums vary. The untagged platform height is a fallback, not a claim that all Shanghai platforms are 0.55 m. Replacing it with a high platform everywhere would be equally misleading without associated track/route data.

## Reproduce and inspect

1. Set `PROPS_ONLY=train-carriage,train-cab`, then run Blender with `--factory-startup --background --python scripts/blender/build-props.py -- public/models/props`.
2. Run `node scripts/blender/export-shanghai-rail.mjs hongqiao` and the same with `south`.
3. Render each export with `blender --factory-startup --background --python scripts/blender/render-shanghai-rail.py -- .tmp/shanghai-rail/hongqiao` (or `south`). These are the application-generated meshes, not a parallel showcase-only generator.
4. Open `/scripts/qa/shanghai-rail.html` on the local Vite server. The railway section deliberately hides buildings; it is a review view, not an assertion that roofs are absent.

Exports include approximately 515k triangles for Hongqiao and 439k for South, including surrounding buildings, railway detail and optional rolling stock. Blender crops the review to the immediate station surroundings. No production deployment is part of this change.

## Validation

The complete geo and Blender-asset suite passed: 57 files, 1,442 tests. After the final catenary correction, the two affected railway/surface suites passed again (122 tests). The correction captures each mast's elevation while its own rail profile is active, rebases its instance coordinates before Float32 conversion, and rejects poles within 1.9 m of an adjacent mapped track. Complex yard gantries still require surveyed support layouts.

Browser review loaded both stations at approximately 60 FPS with six draw calls and no console errors on the tested machine. This is the exported-mesh review, not a claim about production performance on every device. TypeScript and whitespace checks are recorded separately in the task's tool results.

