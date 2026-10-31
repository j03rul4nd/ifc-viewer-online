# Sketch studio (`/sketch`)

Draw in 3D with a pen or a finger, on a phone, tablet or drawing display. Strokes
land on a drawing plane you can move, turn and take from the drawing or a model.
Everything runs and stays in the browser: IndexedDB, no account, no server.

## Where things live

Dependencies point one way; `lib/sketch/boundaries.test.ts` fails if they stop.

    components/sketch   what it looks like: composes, holds no behaviour
    hooks/sketch        behaviour: engine life, input, saving, layout; actions.ts
                        is everything a button or gesture can do, free of React
    stores/sketchStore  state, one store. Subscribe to the field you show
    lib/sketch          the rest: no React, no store, mostly pure and tested

From outside these folders, import `lib/sketch` (its index) or open the route.

To add a tool: a `SketchTool`, an icon and label, then its branch in
`useSketchInput`. An export: a pure writer in `lib/sketch`, a function in
`actions.ts`, a chip in `FileTab`. A saved field must be optional, because
documents already exist on people's devices; read it with a default.

## The line (`lib/sketch/ink.ts`)

The stages drawing software runs, in order:

1. **Device reading.** Pressure, then tilt (`altitudeAngle`, or `tiltX/Y`). A pen
   stuck at exactly 0.5 has no sensor; speed stands in, as it does for a finger.
2. **Pressure curve.** Soft, normal, firm.
3. **Stabilizer.** Gaussian average over 1 to 21 recent samples, the idea behind
   Krita's Stabilizer and Clip Studio's Stabilization. On lift the line catches up
   with the pen, so it ends where the pen ended.
4. **Thin.** Douglas-Peucker in 3D, keeping pressure changes.
5. **Curve.** Centripetal Catmull-Rom: no overshoot where spacing is uneven.
   Corners over 50° are cut, not rounded.
6. **Ends.** Start and end tapers, capped at 40 % of a short stroke each. Ends can
   join a nearby endpoint or the stroke's own start, even across planes.

Holding still at the end of a stroke recognizes it, QuickShape style: a line snapped
to the plane's axes, or, if it closes, an ellipse or a rectangle. A closed scribble
stays a line rather than being forced into a shape.
Finished strokes are polylines with weight per vertex. There is no node editor:
vertices cannot be dragged after the fact.

## What designers expect from other apps

Each of these has a pure rule in `lib/sketch/edit.ts` or `brushes.ts`.

| Feature | From | Here |
|---|---|---|
| Brush presets, saved | Clip Studio sub tools, Procreate library | Tool, size, opacity, curve, stabilizer, tapers |
| Lasso, then move, scale, rotate, duplicate, delete | All | Strokes, in 3D, on the active plane |
| Eraser that cuts | All | Part of a stroke, or the whole one |
| Symmetry | Procreate guides, Krita, Sketchbook | Across the plane's own axes |
| Layer opacity, duplicate, merge down, reorder | All | PSD keeps the opacity |
| Colour sampling, recent colours, two colour slots | All | Samples anything on screen |

Not here: blend modes, clipping and alpha lock, custom brush tips, canvas roll, a
vertex editor, editable shortcuts, a free pressure curve, ORA export, long-press
colour picking.

## Input (`lib/sketch/gestures.ts`, `hooks/sketch/useSketchInput.ts`)

| Contact | Does |
|---|---|
| Pen | Draws, and switches fingers to navigation. Palms over 44 px are ignored |
| Pen's other end (eraser) | Erases, whatever tool is in hand |
| Pen barrel button | Orbits |
| Pen hovering | Shows where the brush lands |
| One finger | Draws until a pen appears (setting) |
| Two fingers / three | Orbit and pinch / pan. Quick taps: undo / redo |
| Mouse | Left draws, right orbits, middle pans, wheel zooms |
| Space held | Pan with anything |
| Four fingers, or Tab | Hide or show the interface |
| Alt, or `I` | Sample any colour on screen |
| Shift at the start of a stroke | Straight line from where the last one ended |
| Shift+Space / Ctrl+Space | Orbit / zoom by dragging |
| `P B Y U E L`, `[` `]`, `1`–`0`, `X`, `D`, Ctrl+Z/Y, Ctrl+D | Tools, size, opacity, swap and default colours, undo, deselect |

Drawing tablets and displays (Wacom, Huion, XP-Pen) reach the browser as Pointer
Events through their driver. The Ink tab reads the live values, and says when a
driver is reporting a mouse: on Windows that usually means Windows Ink is off.

## Under load

- A pointer event only appends to an array. The GPU buffer is rebuilt at most once
  a frame, and a stalled thread gets its samples back from `getCoalescedEvents`.
- Over 12,000 live points, the stroke commits and carries on.
- A stroke re-renders no React: panels subscribe to single fields.
- `SaveQueue`: one write at a time, only the newest waits. Thumbnails wait for idle.
- A lost GPU context shows a notice and returns by itself. A failed save says so.
- A model that will not export does not cost the others.

## Layout (`lib/sketch/layout.ts`, `useStudioLayout`)

Read from the studio's own box on every resize. No device is named.

- Regular (at least 600×480): rail on either side, which folds to a strip.
- Compact: one row of tools under the thumb, tabs in a sheet.
- References dock beside or below when the drawing keeps room, otherwise float.
- A browser reporting two segments splits at the hinge. Half open (Z Flip's Flex
  mode), the drawing takes the flat lower half. WebKit reports no segments
  (`docs/DUAL_SCREEN.md`), and a flat screen has no seam to avoid.

### Split screen

The system's split (iPad, iPhone Duo, Android) needs nothing: it is a smaller box.
To draw next to the references full size, the arrow in the references pane opens
`/sketch?pane=refs` in its own window. That window owns no document: it shares the
image library and asks the studio to place or delete over a BroadcastChannel. It
also works on a second monitor beside a drawing display. Two windows of the
studio itself: the last save wins, not merged.

## Under the sketch

*View → 3D sketch* in the viewer sends what is visible (`lib/viewer-sketch-sources.ts`):
IFC models and meshes as GLB in their placed positions, point clouds as up to 600,000
resident points each. It is saved with the sketch on this device, each can be hidden
in the View tab, and a face or scan point can set the drawing plane. A GLB file works too.

## Getting it out

| To | Use | Keeps |
|---|---|---|
| Procreate | PSD, imported from the **Gallery** (*Add* flattens) | Layers, this view |
| Sketchbook, Krita, Clip Studio, Photoshop | PSD | Layers, this view |
| Blender | `.py`: Text Editor > Run Script, or `blender --python` | 3D, layers, colour, pressure as radius |
| Anything reading polylines | OBJ | 3D, layers as objects |
| Illustrator, Inkscape, layouts | SVG | Vector outlines with weight, this view |
| Instagram Stories, LinkedIn | Share buttons | 1080×1920 / 1200×1200 image |

No web API posts to Stories or attaches an image to a LinkedIn post. Both buttons
open the system share sheet with the image; where there is none, the image is
saved and the studio says what to do next. Nothing is posted without the user.

## Validated, and not

- PSD read with Pillow, layers intact. Not opened in Procreate, Sketchbook, Krita
  or Clip Studio themselves.
- Blender script run headless in Blender 4.5: curves, radius, materials.
- Desktop Chromium with synthetic pen events: pressure and tilt reading, sizes of
  Z Flip, iPad, iPad split, a Duo-like space and a drawing display, an emulated
  hinge, a lost and restored GPU context.
- **Not run on an iPhone Duo, Z Flip, iPad, Apple Pencil, S Pen or drawing tablet.**
  Latency, feel, palm size, eraser-end and barrel behaviour per driver, iOS storage
  limits and the share sheet are unmeasured. Sizes above are from public specs, not
  devices. Apple says Pencil on iPhone Duo arrives "later this year".
- End to end in Chromium: two IFC models, and an IFC with a real PLY scan (position, colour, plane from a scan point, reload). PSD and Blender with two layers. Barrel button, a blocked main thread mid-stroke, 30,000 samples in one stroke.

## Known limits

- Stored stroke weight is screen-space: it does not scale with zoom.
- Handoff stops above 300 MB. The figure is an estimate, not a measurement.
- Strokes are 32-bit floats: with UTM coordinates in the vertices they will jitter.
- The context is one per browser, not per sketch or page.
