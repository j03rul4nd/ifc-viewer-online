# Shanghai Tower reference IFC

This is a reproducible architectural reconstruction of **Shanghai Tower / Shanghai Zhongxin Dasha (上海中心大厦)**, distinct from Shanghai IFC and Shanghai World Financial Center.

## Evidence and scope

- [Gensler project](https://www.gensler.com/projects/shanghai-tower): architectural identity and double facade.
- [Gensler facade design paper, 2010](https://www.gensler.com/uploads/document/242/file/Shanghai_Tower_Facade_Design_Process_11_10_2011.pdf): Figures 3–4 guide the arc profile and height-dependent rotation; the paper is design-stage evidence, not an as-built facade schedule.
- [Thornton Tomasetti](https://www.thorntontomasetti.com/project/shanghai-tower): 632 m, 128 storeys, 90-by-90-foot concrete core, supercolumns/outriggers and tuned mass damper.
- User attachments: vertical zoning, structural assembly, double-skin atrium section, crown section/plans, level-nine plan and landscape/podium plan. These are reference evidence, not operational instructions. Original drawings and photographs are not redistributed.

## Authored geometry

The exterior is a rotating rounded-triangular skin, independent of the upright internal floors and core. Its base profile is reconstructed from the published 88.830 m radius and 47.565 m offset, with approximate corner smoothing and a narrow V-strike recess. Rotation progresses from 0 to 120 degrees between the 45 and 605 m design datums. Exponential scaling uses the 0.535686 ratio printed in Figure 4, rather than interpreting every textual reference to “55%” as a 55% dimensional reduction. The envelope uses 144 divisions; three selectable facade sectors are authored per storey. Mullions, transoms, facade support rings and radial struts are separate components. IFC exterior glazing has 30% display transparency; this is a visualization setting, not measured optical performance.

Internal floor plates remain circular and step inward between nine reference zones. Floor meshes have genuine square core voids; circulation slabs form the central cross. Four core quadrants, eight major column positions, four diagonal supplementary column positions, two-storey belt trusses and radial outriggers follow the supplied structural concept. Sections, stair geometry, openings, doors and hotel subdivisions are indicative. They are not engineered escape routes or a checked structural design. Generic hotel furniture is included to make interior scale legible, not to claim a measured guest-room schedule.

Sky-garden platforms span the space between the inner cylinders and the outer facade at the base of each zone. Ordinary floors stop at the inner skin, preserving tall atrium voids. The top is a sloping, open crown with ribs and bracing; it is not a solid cap. The maintenance deck and damper are indicative geometry only.

128 above-grade reference storeys and five basement reference storeys are included. This reconciles the structural engineer's published storey count with the supplied early-design drawings, which variously show 121/124 levels. Intermediate elevations and functional boundaries are interpolated; neither a final floor schedule nor current tenancy is claimed. The podium is a schematic polygon tracing of the supplied site-plan arrangement, with facade bands and a roof platform. Landscape and basement extents remain approximate.

## Map reference

The IFC contains `IfcMapConversion` and `IfcProjectedCRS` in EPSG:32651. Its origin is the area centroid of [OpenStreetMap way 165792123](https://www.openstreetmap.org/way/165792123), version 42, retrieved 2026-09-07. The local +X apex is aligned toward the northernmost mapped vertex. The source outline and derived coordinates are included in `scripts/blender/sites/shanghai-tower.json`, attributed to OpenStreetMap contributors under [ODbL 1.0](https://www.openstreetmap.org/copyright). This is approximate cartographic alignment, not cadastral or surveyed control. Zero vertical height is an explicit unsurveyed local-ground assumption.

## Reproduce and validate

Run `blender --background --python-exit-code 1 --python scripts/blender/build-shanghai-tower.py -- public/models/shanghai-tower`, then `node scripts/blender/validate-shanghai-tower.mjs`. The generator writes LF-normalized IFC, deterministic identifiers, EXPRESS validation, hashes and two actual geometry renders. Independent web-ifc checks stream every mesh, check finite coordinates and height, verify floor/skin counts and test that the crown opening and a representative core void are not accidentally capped. Previews are rendered from the IFC-authored mesh coordinates; they are not AI illustrations.

The model is **approximate, not as-built**, and must not be used as construction documentation or as evidence of measured quantities.

For the final saved-file QA renders, run `blender --background --python-exit-code 1 --python scripts/blender/render-shanghai-tower.py -- public/models/shanghai-tower`. This reads the IFC through IfcOpenShell and produces exterior, structural and level-nine plan views with the same coordinates. The two skin layers are hidden only in the structural image; the model retains them.
