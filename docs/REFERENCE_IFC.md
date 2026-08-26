# The reference IFC models

The models in the demo gallery we authored ourselves — the only ones whose contents
we control:

| | |
|---|---|
| **IFC Hello World** — `public/HelloWorld.ifc` | 4 elements, 1 storey, 9 KB |
| **Japanese Temple — Main Hall** — `public/JapaneseTemple.ifc` | 92 elements, 3 storeys, 161 KB |
| **Poblenou Pavilion** — `public/models/poblenou/*.ifc` | 3 federated files, 349 elements, 695 KB |
| **Poblenou site survey** — `public/models/poblenou/poblenou-site-scan.las` | 150 k points, 3.7 MB |
| **Torre Poblenou** — `public/models/torre-poblenou/*.ifc` | 1 file, 1,930 elements, 3.5 MB |
| **Ciutadella Pavilion** — `public/models/ciutadella/*.ifc` | 1 file, 137 elements, 240 KB |

Every IFC here is IFC4, scores **100 / 100 with zero issues** on our own validator,
and is asserted entity-by-entity by a test that reads it through web-ifc — the parser
the app ships.

## Why they exist

The other eleven demo models came out of someone else's exporter. That is what makes
them useful (they are what real files look like) and it is also why none of them can
answer *"is the viewer wrong, or is the file wrong?"*. Duplex is IFC2x3 with Revit's
idea of a placement tree; the buildingSMART bridge is IFC4.3 with alignments. When
storey navigation breaks, there is no file in the set that is both small enough to
read end to end and known-correct by construction.

These are. If the viewer misreads **these**, the viewer is wrong.

Each one exists because the one before it cannot carry the next set of failures:

- **Hello World** is four elements on one storey. It can prove a placement chain and
  a containment relationship, and nothing else.
- **The temple** adds what a four-element file never exercises: storey-relative
  placement, a column grid, openings that void a host, an element that decomposes
  into parts, a space aggregated rather than contained, a sloped roof. It is also
  the answer to "what does a genuinely correct IFC look like?" — proof that
  *realistic* and *perfect* are compatible.
- **The Poblenou Pavilion** adds the three things that only exist BETWEEN files:
  federation across disciplines, georeferencing onto a real map, and a point cloud
  that lines up with a model. None of them can be demonstrated by any single file,
  and no public sample set contains a matched group.

## IFC Hello World

Three walls and a slab around a 4.0 × 3.0 m room, on one storey at z = 0.

| | |
|---|---|
| Schema / units | IFC4 · metre, square metre, cubic metre |
| Contexts | 3D `Model` (precision 1e-5, WCS at the origin) with `Body`/`Axis`/`Box`/`Annotation`/`Profile` subcontexts; 2D `Plan` |
| Spatial | `IfcProject` → `IfcSite` → `IfcBuilding` → `IfcBuildingStorey` ("Ground Floor", elevation 0.0) |
| Elements | `Hello World Wall 01/02/03` (`IfcWall`), `Hello World Slab` (`IfcSlab`) |
| Types | `WAL-200-Masonry`, `SLB-200-Concrete`, each with an `IfcMaterialLayerSet` |
| Properties | `Pset_WallCommon`, `Pset_SlabCommon` |
| Geometry | `IfcExtrudedAreaSolid` over an `IfcArbitraryClosedProfileDef`, plus an `Axis` curve per wall |
| Relationships | `IfcRelAggregates` ×3, `IfcRelContainedInSpatialStructure` ×1, `IfcRelDefinesByType` ×2, `IfcRelDefinesByProperties` ×4, `IfcRelAssociatesMaterial` ×6 |
| Total | 161 entities, 9,696 bytes |

The south side is left open on purpose: three walls read as a room, four read as a
closed box, and a closed box hides which wall you just clicked.

Two conventions make the placements readable rather than merely valid: local +X runs
along each element's length and local +Y across its thickness (the IFC wall
convention), and local y = 0 is the **interior** face of all three walls.

## Japanese Temple — Main Hall

A Buddhist main hall (*hondō*): 5 bays × 4 bays on a 2.4 m grid, a timber post-and-
beam frame on a stone podium, under a tiled gable roof with 2.8 m eaves. Facing south.

| | |
|---|---|
| Schema / units | IFC4 · metre, square metre, cubic metre |
| Georeferencing | `IfcSite` RefLatitude / RefLongitude / RefElevation — Kyoto, level 20/40 (see below) |
| Storeys | `Stone Podium` (0.0) → `Main Hall` (0.9) → `Roof Structure` (4.32) |
| Elements | 22 `IfcColumn`, 18 `IfcWall`, 18 `IfcMember` (bracket sets), 6 `IfcSlab`, 6 `IfcBeam`, 5 `IfcRailing`, 4 `IfcWindow`, 3 `IfcDoor`, 1 `IfcRoof`, 1 `IfcStair` + 1 `IfcStairFlight` |
| Also | 7 `IfcOpeningElement` (voiding walls, filled by the doors and windows), 1 `IfcSpace` (aggregated into the storey, with `NetFloorArea`) |
| Types | 13, one per element kind — layer sets on walls/slabs/roof, **profile sets** on columns/beams/members |
| Data per element | name, description, type, material on the occurrence, classification, `Pset_*Common`, `Qto_*BaseQuantities` |
| Geometry | every body an `IfcExtrudedAreaSolid`; the roof is one gable section swept along the ridge |
| Total | 2,735 entities, 165,332 bytes |

**What makes it score 100**, which is the whole exercise:

- **Nothing intersects.** Walls sit *between* columns, not through them; head ties
  butt at the corners instead of crossing; brackets sit on the ties and the roof sits
  on the brackets, each touching the one below at exactly one plane. Real timber
  frames interpenetrate — modelling them as butting segments is both honest at this
  level of detail and the only way an AABB clash check has nothing to say.
- **Material on the occurrence, not only the type.** Layer sets and profile sets both
  give the occurrence a `*Usage`; a bare `IfcMaterial` on a type does not, which
  leaves the element knowing its material only through its type — true in the schema,
  invisible to every take-off tool. Columns, beams and bracket sets therefore carry
  `IfcMaterialProfileSet`, which is what a linear member's material actually is.
- **Openings are real.** An `IfcOpeningElement` voids the wall and is filled by the
  door; cutting the hole into the wall profile would render identically and lose the
  three questions worth asking of it.
- **A gable, not a hip.** A hipped roof would have to be four sloped slabs whose
  bounding boxes overlap enormously, and the clash rule would report the reference
  model against itself. A *kirizuma* gable is authentic for a hall like this and is
  one section swept along the ridge.

**Deliberately not Uniclass.** The classification is our own —
`Reference Element Classification`, codes `REF-COL`, `REF-WAL`, … Plausible-looking
codes from a system nobody checked would be copied straight out of a model presented
as correct.

**No `IfcOwnerHistory`** in either file: it is optional in IFC4 and Bonsai does not
write one unless configured to. The STEP header carries the author and organisation
instead, which is what ISO 19650 traceability and the app's header rules read.

**Occurrences carry no `PredefinedType` and no `ObjectType`.** Not an omission —
IfcOpenShell strips both when a type is assigned so the two can never contradict each
other, which means a consumer that wants an element's predefined type has to resolve
`IfcRelDefinesByType`. Exercising that is part of the job.

## Poblenou Pavilion — the federated set

Three IFC files and a point cloud, all claiming to be the same 36.0 × 21.6 m
pavilion on a real plot in Barcelona's 22@ district. This is the one that
demonstrates what the product is actually sold on, and what no combination of
public sample files can show together.

| | |
|---|---|
| Architecture | `BCN-IVO-ZZ-XX-M3-A-0001.ifc` — 12 curtain walls of 102 glazed panels, core walls, doors, stairs, roof, parapets, railings, 3 spaces |
| Structure | `BCN-IVO-ZZ-XX-M3-S-0001.ifc` — 24 pad footings, 72 columns on a 7.2 m grid, 114 beams, 4 slabs |
| Services | `BCN-IVO-ZZ-XX-M3-M-0001.ifc` — supply ductwork, fittings and 18 air terminals in one `IfcDistributionSystem`, with connected `IfcDistributionPort`s |
| Survey | `poblenou-site-scan.las` — LAS 1.2 · PDRF 2 · EPSG:25831, colour + intensity + classes 2/5/6 |
| Storeys | Foundation (−1.20) → Ground (0.00) → Level 01 (4.20) → Level 02 (8.40) → Roof (12.60), identical in all three |

**Three things it proves, and each is a distinct failure it would catch:**

1. **Federation.** One building, three authors, one shared origin. Nothing is
   modelled twice — the slabs are structure, the envelope is architecture, and
   the test asserts that neither has the other's elements. Three files that each
   validate perfectly and land 40 m apart is the federation failure with no
   symptom short of loading all three, and `district-ifc.test.ts` checks that
   they occupy one envelope.
2. **Map mode, at the right rotation.** Full IFC4 georeferencing —
   `IfcProjectedCRS` (EPSG:25831, ETRS89 / UTM 31N) plus `IfcMapConversion` at
   E 432340, N 4583945, with the project +X axis 45° off grid east. That last
   number is the Cerdà grid: a model placed by latitude alone lands square to
   north and looks fine until you compare it to the street. The app reports
   `41.4042, 2.1905 · 45°`, and OpenStreetMap has ~115 buildings within 600 m to
   put it among.
3. **Scan alignment.** The survey is written in the *same* projected CRS at the
   same origin, so `pc-align` reaches its top rung — "Georeferenced (map
   conversion) · Exact" — instead of "placed by hand". Its frame points are
   sampled on the structural model's own column faces and slab soffits, so the
   scan lands on the model to the centimetre. This is the pair the honesty note
   in `point-clouds.ts` says did not exist; it is synthetic, and its card says so.

The files are named the way ISO 19650 asks (Project-Originator-Volume-Level-Type-
Role-Number), which is also what makes `RULE_ISO19650_FILENAME` pass on all three.

**A bug this model found.** `RULE_CONNECTED_MEP` read only
`IfcRelConnectsPortToElement`, which IFC2x3 uses and **IFC4 deprecated** in favour
of nesting ports under their element with `IfcRelNests`. Every correctly-authored
IFC4 services model it ever saw came back "disconnected". The rule now reads both.
That is what a reference model is for.

## Torre Poblenou — the one built to be looked at

`public/models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc` — **1,930 elements,
3.5 MB, IFC4, 100/100 with no issues.** A sixteen-storey office tower on the
block next to the Pavilion, same CRS and same 45° Cerdà rotation.

**It shares the Pavilion's site origin**, and that is load-bearing rather than
tidy. The tower first shipped with its own eastings and northings one block along,
on the assumption that the viewer places each model by its own `IfcMapConversion`.
It does not: every IFC model goes to its own local origin and the *basemap* is
anchored to one of them — both model pivots sit at (0, 0, 0) with scale 1, which is
readable straight off the scene graph. Two buildings with two map conversions
therefore land on top of each other, and every single-file test stayed green while
they did.

So the two now share one project coordinate system — same map conversion, same site
latitude and longitude, same 45° rotation — and the tower is positioned *within* it
by `SITE_OFFSET_X = 57.6` m along the Cerdà street direction. That is what a
masterplan is, and it is how two buildings on one plot are actually delivered. The
Pavilion holds x 0..36; the tower starts eight bays along, leaving 21.6 m between
the two faces.

`tower-ifc.test.ts` opens **both** files and asserts it: identical map conversion,
identical site description, and footprints that are disjoint in x with a real gap
between them. A cross-file claim needs a cross-file test, which is the lesson —
the original claim was never checked against anything.

Every other reference model exists to prove a *property* (it is minimal; it is
realistic; it federates). This one exists to be **filmed**. That is a real
requirement and it drove real decisions:

- **Stepped massing.** 82 m to the mast, stepping back a bay off *each* end of
  the long axis at Level 10, so both long elevations read as a ziggurat.
- **An expressed floor line.** Every storey's glazing is an opaque spandrel band
  at the floor datum plus vision glass above it, and the spandrel stands 120 mm
  proud so it throws a shadow line.
- **Brise-soleil.** Full-height aluminium fins standing clear of the spandrel
  face. They are what make the tower read as designed rather than extruded.
- **A ground plane.** Granite paving, planters and a cantilevered entrance
  canopy, so the model *meets* the basemap instead of hovering over it. On the
  map, the join between our geometry and OpenStreetMap's is what people notice
  first.
- **One file, role `Z`.** The Pavilion is deliberately three files, to show
  federation. This one is deliberately one, because "drag it in and hit record"
  has to be a single step.

**The bug being one file found.** In the Pavilion, the frame and the façade live
in different discipline files, so nothing ever compared them — and both models
draw their perimeter columns and beams *centred on the grid line*, which puts
half a column outside the slab edge and straight through the curtain walling hung
off it. Federated, invisible. Combined, it was 492 clashes on the first sweep.
Perimeter members now sit wholly **inside** their grid line, flush with the slab
edge, and beams stop at the real column faces rather than at "grid line plus half
a column" — see `member_span()` in
[`build-tower.py`](../scripts/blender/build-tower.py). The core is inset off the
grid for the same reason.

**Two things only a render caught.** Neither is a schema problem and no test
would have flagged them, because both are about how the building *looks*:

1. The first massing stepped back on **one** face. On the elevation facing that
   face the step is a change of depth and reads as nothing at all, and from an
   angle it is a small ledge — so a 68 m tower looked like a plain slab from the
   two angles a camera uses most. It now steps a bay off each end.
2. The façade had **no floor line**: sixteen storeys of unbroken curtain wall,
   which made a 68 m elevation indistinguishable from a 20 m one. Splitting each
   panel into a proud spandrel plus vision glass is what fixed it.

Both were found by rasterising the geometry to a PNG and looking at it. The app's
own screenshot could not do it — its camera tweens on `requestAnimationFrame`,
which is suspended whenever the browser pane is not compositing, so every shot
came out framed on the podium regardless of which view button was pressed.

`scripts/blender/tower-ifc.test.ts` runs the app's own AABB clash sweep over the
whole file, and reports failures grouped by element family — with ~2,000
elements, a list of the first eight clashes tells you nothing and a histogram
tells you everything.

**One link**, the tower alone on the basemap with the real neighbourhood:

```
/?model=/models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc&map=terrain,buildings
```

**Or both buildings**, side by side on the shared origin — the tower across the
street from the Pavilion, with the OpenStreetMap neighbourhood around them:

```
/?model=/models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc,/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc&map=terrain,buildings
```

## Ciutadella Pavilion — the one that exists for the map

`public/models/ciutadella/BCN-IVO-ZZ-XX-M3-Z-0003.ifc` — **137 elements, 240 KB,
IFC4, 100/100 with no issues.** An exhibition pavilion standing on the Passeig de
Lluís Companys, 80 m from the Arc de Triomf.

Every other reference model is about the FILE. This one is about the
SURROUNDINGS. It is what to open when somebody asks what map mode is:

- **Somewhere worth looking.** The Arc is 80 m up the promenade and the Parc de
  la Ciutadella starts 200 m down it — a monument, an avenue of plane trees, a
  lake and a zoo, all inside the ±700 m box the surroundings are fetched in. A
  demo on an anonymous plot exercises the same code and shows nothing.
- **Turned the way the street is.** The promenade runs at **-45.5°** to the map
  grid and the pavilion is authored on that axis through a real
  `IfcMapConversion`. A model placed by latitude alone lands square to north,
  which on this street is unmistakably wrong — that difference IS the argument
  for georeferencing, and this is the file that shows it.
- **Small enough to read.** 24 × 12 m on a 4.0 × 6.0 m grid: a foyer under a
  mezzanine gallery, a double-height hall beyond it, a gabled standing-seam roof
  and glazed long facades, on a granite apron.

**Where the plot came from**, because "next to the Arc" is not a coordinate. The
real Overpass reply for the site (7,267 elements) was searched for the position
on the promenade axis where a 24 × 12 m footprint has the most room, measuring
every candidate against every mapped building and every carriageway edge. The
answer: 80 m from the Arc, dead centre of the esplanade, **50 m clear of the
nearest building and 18 m clear of the nearest carriageway**.

The rotation was not typed in either. It is the Arc de Triomf's own passage axis
— the short axis of the minimum-area rectangle of its mapped outline, 28.1 ×
12.6 m — cross-checked against the 87 segments of the promenade longer than 20 m,
which run between -45.2° and -46.1°.

### What the app's clash rule costs a pitched roof

The rule compares **axis-aligned boxes**, so a roof's box covers its whole plan
from eaves to ridge: anything reaching above the eaves *anywhere under the roof*
is reported as inside it. That rules out a chimney, a rooflight, a parapet gable
— and, the first time round, it ruled out closing the gable at all, which left a
triangular hole at each end that reads as something nobody finished.

The arrangement that closes the gable and still scores 100 is to stop the roof
**flush with the gable walls** and overhang only the long sides. The wall and the
roof then share no plan at all, so no box can overlap, and the wall's top edge is
cut on the roof's own slope so the two meet on a line rather than leaving a wedge
of daylight. Worth knowing before designing the next one.

Perimeter columns and beams sit **entirely inside** their grid line, for the
reason the tower taught: centred on the line, half the section hangs over the
slab edge and straight through the facade hung from it. On this pavilion that was
54 clashes between the frame and the glazing, all of them the same mistake.

## Driving the demo

All four Poblenou files together — three disciplines federated, on the basemap
with the real neighbourhood around them, under a scan that lines up — is the shot
the whole set exists for. It has been checked end to end; this is the recipe.

**One link.** Relative paths work, so it is the same URL everywhere (dev,
preview, production):

```
/?model=/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc,/models/poblenou/BCN-IVO-ZZ-XX-M3-S-0001.ifc,/models/poblenou/BCN-IVO-ZZ-XX-M3-M-0001.ifc&map=terrain,buildings&scan=/models/poblenou/poblenou-site-scan.las
```

That loads all three disciplines (**3 MODELS** in the header), puts them on the
basemap at `41.4042, 2.1905 · 45°` with terrain and the real OpenStreetMap
neighbourhood, and drops the survey on top at **"Georeferenced (map conversion)
· Exact"**. Nothing to click.

Add `&ui=kiosk` for a chrome-less recording, `&validate=0` to skip the automatic
Health Score, or `&isolate=IfcColumn` to open straight into the frame. Full
reference: [`EMBED_URL_PARAMS.md`](EMBED_URL_PARAMS.md) — including why `map` and
`scan` do not work with `ui=client`.

## How they were created

With **Blender 4.5 + Bonsai**, headless:

```bash
npm run hello-world
```

```bash
npm run temple
```

```bash
npm run district && npm run site-scan
```

```bash
npm run tower
```

```bash
npm run ciutadella
```

The IFC builds need `blender` on PATH with the Bonsai extension installed (see
<https://docs.bonsaibim.org/quickstart/installation.html>) — the same prerequisite as
`npm run props`.

The scripts use Bonsai's own operators and core calls, never `file.create_entity`
behind the API's back:

- `bim.create_project` writes the project, units, contexts and the spatial chain;
- occurrences follow the sequence Bonsai's own wall and slab tools use
  (`core.root.assign_class` → `type.assign_type` → `bim.assign_container` →
  `geometry.edit_object_placement` → `geometry.add_*_representation`);
- property sets, quantity sets, material sets and classifications go through
  `ifcopenshell.api`, which is what the corresponding Bonsai panels call.

Shared machinery lives in [`scripts/blender/bonsai_kit.py`](../scripts/blender/bonsai_kit.py).

**The builds are reproducible.** GUIDs are seeded (uuid5 over a fixed namespace), the
header timestamp is frozen, and EXPRESS SETs are sorted before writing — so rebuilding
produces a byte-identical file. Without that, every rebuild would churn a hundred
GUIDs in the diff and the fixtures' expected values would be meaningless.

Each script also **verifies before it ships**: it reloads the file it just wrote
through `bim.load_project` and fails the build if `ifcopenshell.validate` (with EXPRESS
rules) reports anything, if any element comes back without geometry, or if anything
lands away from where the script put it. That check is what caught the first version
of Hello World, whose elements were valid IFC with no `ObjectPlacement` at all.

## How to validate them

```bash
npx vitest run scripts/blender/
```

The two golden fixtures open the committed files with **web-ifc — the parser the app
ships** — and assert entity counts, aggregation and containment, GUIDs, units and
contexts, property sets and quantities, types, material and classification coverage,
placements, and the world-space bounding box of every element's triangles. The temple and district tests additionally run the **app's own clash sweep** over each
model and require it to come back empty, so a geometry change cannot quietly turn a
reference model into one with 46 warnings. The district test also reads the point
cloud and checks its points land on the structural model's slab soffits — the one
assertion that fails if either file moves without the other.

In the app, both score **100 / 100** with zero issues. If that number ever moves, one
of the model and the validator is wrong, and both are worth looking at.

## Where they are wired in

| | |
|---|---|
| The files | `public/HelloWorld.ifc`, `public/JapaneseTemple.ifc` (bundled — offline-safe, no CORS host) |
| The build scripts | `scripts/blender/build-hello-world.py`, `build-temple.py`, `bonsai_kit.py` |
| The npm scripts | `npm run hello-world`, `npm run temple` |
| The gallery entries | `src/demo-models/models.ts`, ids `hello-world` and `japanese-temple`, category `Reference` |
| The card artwork | `src/demo-models/illustrations.tsx` |
| The category | `src/demo-models/categories.ts` + `demoGallery.categories.reference` in all ten locales |
| The golden tests | `scripts/blender/hello-world-ifc.test.ts`, `temple-ifc.test.ts` |

`Reference` is the one gallery category that is not a building type. It holds the
models we authored to be *read* rather than admired.
