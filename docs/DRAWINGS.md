# Technical drawings

A pane beside the 3D view for 2D sheets: open DXF and PDF, cut plans and sections
from the IFC, mark them up, align them with the model and export DXF, SVG and PDF.
Everything runs in the browser; no file leaves it.

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
lib/drawing/overlay-3d.ts   a sheet laid flat in the three.js scene
stores/drawingStore.ts      open sheets, tool, per-sheet undo
components/drawings/        DrawingDock (lazy), DrawingCanvas
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

## Free or paid

Free, by decision to be reviewed by Joel: this first phase is a reason to come and
costs no server. Under option C (doc 19 §5) new professional tools may start in Pro;
the candidates are the next phases below, not this one, and there is no gating code.

## Phases

| Phase | Content | State |
|---|---|---|
| 1 | Import DXF/PDF, side by side, layers, markup, align, plan/section, export | **this** |
| 2 | Projection below the cut, poché, door swings; PDF vectors and snapping on PDF | to do |
| 2 | Sheets kept across reloads (IndexedDB), real sheet templates, Unicode fonts in PDF | to do |
| 3 (Pro candidates) | Batch: every storey to a sheet set; revision compare; DWG by server or licensed SDK | to do |

## Limits to know

- A plan is the cut only: nothing below the plane is projected yet.
- Sheets live in memory: a reload loses them. Export to keep them.
- A PDF is a picture: no snapping to its lines, no reading its layers or text. Its
  page is rendered up to 4096 px.
- DXF export is R12: nearest of nine named colours, no blocks (flattened), no hatches
  (fills of 3–4 corners stay SOLID, others outline), and it carries no PDF page.
- PDF export writes Helvetica/WinAnsi: other scripts come out as `?` (a notice says
  so); SVG keeps them.
- Text is not drawn in the 3D overlay.
- Generated sheets use scene coordinates, which may carry the viewer's pivot, not the
  IFC's absolute coordinates.
- Alignment targets are on sheets; picking the target directly in the 3D view is not
  built.
