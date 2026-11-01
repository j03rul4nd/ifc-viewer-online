# Technical drawings

A pane beside the 3D view for 2D sheets: open DXF and PDF, cut plans and sections
from the IFC, slice the point cloud and check it against the model, compare revisions,
mark up, align, and export DXF, SVG and PDF. Everything here runs in the browser; no
file leaves it. What costs a server (sheets in the cloud, DWG conversion) is built and
dark, see *Free or paid*.

Link: `?model=…&scan=…&drawings=plan` opens the pane and cuts the first plan by itself
once the models are in, also inside an embed. Such a link neither reads nor overwrites
the visitor's saved sheets.

## The inspector

Five tabs, in the order of the work: **Scene** (every model, scan, sheet and device,
each with its switch; *Stack in 3D*), **Create** (one task at a time, only its own
fields), **Layers** (search, show or hide what matches, isolate, entity counts),
**Sheet** (what it is, how it sits in the model, typed placement, opacity) and
**Output**. The tab is remembered per browser. Sheets are tabs across the top.

Entry: the *Drawings* icon on the panel rail, *Tools → Drawings*, or dropping a
`.dxf` / `.dwg` on the viewer (a `.pdf` too while the pane is open; otherwise it
stays a project document, as before).

## Formats

| Format | In | Out | How |
|---|---|---|---|
| DXF (ASCII, R12–current) | yes | yes (R12) | `lib/drawing/dxf-parse.ts`, `export.ts` |
| PDF | as a page picture | vector, on a sheet | pdf.js (Apache-2.0) to read; own writer |
| SVG | no | yes, layers as groups | `export.ts` |
| DWG | **refused, with a way forward** | no | see below |
| Binary DXF | refused by name | no | |

**DXF read:** LINE, POINT, CIRCLE, ARC, ELLIPSE, LWPOLYLINE, POLYLINE, SPLINE, SOLID,
TRACE, 3DFACE, TEXT, MTEXT, ATTRIB, INSERT (with arrays and nesting), DIMENSION (its
block), HATCH (solid → fill, pattern → outline), LEADER. Layers keep colour and state;
frozen and off layers arrive switched off, with their content. Paper space is ignored
while model space has content. Anything else (MULTILEADER, 3DSOLID, meshes…) is counted
and named to the user, never dropped silently.

### Why DWG is not read

Every free reader in a browser is LibreDWG compiled to WebAssembly (e.g.
`@mlightcad/libredwg-web`), which is GPL-3.0, while this repository is MIT. Running it
in a worker is packaging, not a licence exemption. The alternatives are commercial (ODA Drawings SDK, RealDWG) and
cost money before there are customers. So a DWG is recognised by its header, its
AutoCAD version is named, and the user is told to save as DXF or use the free, local
ODA File Converter.

The honest routes when this is worth paying for: a licensed SDK, or conversion on a
server (which makes it a paid feature by the rules in `AGENTS.md`).

## Architecture

```
lib/drawing/types.ts        Drawing, Entity, Layer, Placement; pure
lib/drawing/dxf-parse.ts    file → entities; pure
lib/drawing/plan-cut.ts     triangles + plane → polylines per IFC class; pure
lib/drawing/export.ts       DXF, SVG, PDF, sheet layout; pure
lib/drawing/import-file.ts  sniff by content; pdf.js on demand
lib/drawing/pdf-vectors.ts  pdf.js operators → polylines and text; pure
lib/drawing/scan-slice.ts   point band → grid → runs, classified by distance; pure
lib/drawing/diff.ts         two sheets → added, removed, unchanged segments; pure
lib/drawing/persist.ts      sheets in IndexedDB
lib/drawing/drawing.worker.ts, run-job.ts   DXF, cuts and slices off the main thread
lib/drawing/overlay-3d.ts   a sheet laid flat in the three.js scene
stores/drawingStore.ts      open sheets, tool, per-sheet undo
components/drawings/        DrawingDock (lazy), DrawingPanels, DrawingCanvas
```

**One space.** The canvas works in *model space*: metres, x = scene x, y = −scene z
(IFC XY, pivot included). Each sheet carries a `Placement` (scale, rotation,
translation) into it. A plan cut from the IFC has the identity, so whatever is aligned
to it coincides with the model, and the 3D overlay needs no other conversion.

**Side by side.** As with the split screen, the viewer's box shrinks and the renderer
resizes; no model reloads. On a dual-screen layout the pane takes the second segment;
on narrow screens it stacks below.

**With the IFC, the scan and the live data.** A sheet can lie in the 3D scene at a
height, among the models and point clouds. On the sheet, bound twin devices appear at
their element's centre with their latest reading and rule colour, and an arrow shows
the 3D camera.

**Plans and sections** use `collectItemTriangles` (the same full-detail read as the
flood and solar analyses), not the viewer's streamed meshes, so nothing depends on
where the camera is. Each IFC class becomes a layer. `IFCSPACE`, openings, grids,
annotations and `IFCSITE` are not cut.

**Alignment** is two point pairs on the shared canvas, with endpoint snapping: a new
sheet lands centred on what is open, scaled by `$INSUNITS` or to the reference's width.
*Set the scale* takes a known length. *File coordinates* puts a sheet back at its own.

**Scan against model.** A band of the cloud is rasterised to a grid (up to 20 M points
are sampled; the cost on the sheet follows the grid, not the point count). Each occupied
cell's distance to the plan's lines comes from a hash grid, so it stays local on big
plans. Measured on CRAS Labs (1 M points, 63 MB IFC, software GPU): about 3 s, and 5,199
entities on the sheet. Only offered when the cloud has finished loading: half a cloud
reads as half a building.

## Free or paid

Everything above is free and costs no server. Backend, dark, in `ifc-cloud-api` PR #1
(`FEATURE_DRAWINGS`, `FEATURE_DRAWING_CONVERT`): **Pro** sheets in the cloud with
revisions and a CSV register, and DWG to DXF in credits; **Team** the same shared, with
roles and guests per project. There is no client code calling it yet. Costs and when to
switch it on: `docs-planning/22-planos-tecnicos-recursos-y-roi.md`. Whether the sheet
set or the scan check should start in Pro (option C) is Joel's decision to make before
this is public: nothing free is ever taken back.

## Phases

| Phase | Content | State |
|---|---|---|
| 1 | Import DXF/PDF, side by side, layers, markup, align, plan/section, export | done |
| 2 | Beyond the cut, fills, PDF vectors and snapping, saved sheets, inspector, worker | done |
| 2 | Scan slice against the model, compare sheets, sheet set, ZIP, one scene | done |
| 3 | Hidden-line removal, door swings, real sheet templates, Unicode fonts in PDF | to do |
| 3 (Pro) | Cloud sheets and DWG conversion: backend built; screens to do | dark |

## Limits to know

- Lines beyond the cut are crease and boundary edges with no hidden-line removal, and
  doors have no swing. Fills are of closed cut outlines only, so a section that doesn't
  close isn't filled.
- Sheets are saved in this browser: clearing its data removes them. The footer says when
  saving failed.
- PDF vectors are read from the page's operators: layers are not read, clipping is
  ignored, and curves are 6 chords. A scanned PDF has none and says so. Its page picture
  is rendered up to 4096 px.
- The scan check is a 2D slice at one height: cells, not wall length; clutter counts as
  different; not validated against certified deviation analysis. It trusts the scan's
  alignment, and storey levels can sit far from what the slice's height suggests.
- DXF export is R12: nearest of nine named colours, no blocks (flattened), no hatches
  (fills of 3–4 corners stay SOLID, others outline), and it carries no PDF page.
- PDF export writes Helvetica/WinAnsi: other scripts come out as `?` (a notice says
  so); SVG keeps them.
- Text is not drawn in the 3D overlay.
- Generated sheets use scene coordinates, which may carry the viewer's pivot, not the
  IFC's absolute coordinates.
- Alignment targets are on sheets; picking the target directly in the 3D view is not
  built.
