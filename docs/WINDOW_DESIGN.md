# Windows over the 3D scene — formats, states and coexistence

The companion to `MODAL_DESIGN.md`. That one is about what a dialog *is*
(semantics, focus, stacking). This one is about **shape**: how big a window may
be, what it looks like open, what remains when it is closed, and how it shares a
viewport with the scene it describes.

Everything here comes from measuring a real session, not from taste.

> **Superseded in part by `RIGHT_EDGE.md`.** The properties column no longer
> has an edge strip: the right edge has a single owner, the panel rail, and
> properties is its first icon. The tree and validation columns are unchanged —
> they are docked columns, a different pattern for a different job.

## The measurement that started it

A 1500×950 browser window, one model loaded, the scene panel opened from the
tree:

```
canvas                     1168 x 546
Escena (floating panel)     292 x 585  @ (864, 56)   27% of the canvas
Propiedades (sidebar)       340 x 466  @ (816, 68)   25%
Vistas (camera controls)    245 x 171  @ (603, 360)   7%
```

Three defects, none of which is a styling opinion:

1. **The panel was taller than the viewport.** 585px of window in 546px of
   canvas. It hung out of the bottom of the scene and over the panel below it.
   The cause: it was sized against `100dvh` — 950px — while the viewport it
   actually lives in is 546px, because the tree, the toolbar and the validation
   panel have taken the rest. A window must be measured against the box it is
   in, never against the screen.

2. **Two windows in one lane.** The floating panel at x 864 and the sidebar at
   x 816 both pin to the right edge, so one sat on top of the other.

3. **The scene lost its corner.** The camera and position controls live
   bottom-right at z-8, under the panels at z-20. An earlier attempt at this made
   the controls *move aside* when a panel opened — and with no room in the lane
   they ended up at x 603, floating over the middle of the model. That is worse
   than being covered: the fix put scene chrome in the one place the scene
   itself needs.

## The rules

### R1 — A window is measured against its container, never the screen

Panels are anchored **top and bottom** inside the viewport and given no height at
all. A box cannot overflow a container it is anchored to, and it needs no magic
number to stay inside one. `100dvh` is the screen; the viewport is what is left
after the chrome, and those are not the same number.

The container depends on the kind of window. **Content panels** (every
`ViewportPanel` with `mobile="sheet"`) are measured against the **main column**:
the 3D view plus the results drawer below it (R6). **Palettes** (`mobile="dock"`:
Measure, Section, Plans) are measured against the 3D view. Widths follow the same
rule: `min(width, 100% of the container - rail clearance - 12px)`, never `100vw`.

### R2 — The right edge is one lane, and it holds one window

The selection sidebar and the floating panels are both pinned right. Opening a
panel collapses the sidebar to its rail, and closing the panel brings it back —
unless the user expanded it again in the meantime, in which case their action
outranks ours. It is stepped aside, not closed: the rail is still the way back.

### R3 — The scene keeps its own corner; the window yields

The bottom-right of the viewport belongs to the camera controls. At rest they
are one 32px button at right 16-48px, bottom 16px (`CameraControls`); the view
presets are a popover that opens at z-21, above the panels, by design.

The scene keeps that corner by **horizontal separation**: panels start at the
rail clearance (right 60px or more), so they never cover the button and may run
to 12px above the bottom. The reserve token `--viewport-chrome-h` (48px, the
button plus its margin) now bounds only the rail, which sits directly above the
button.

It used to be 172px, measured when the presets were open by default. Once they
became a popover nobody re-measured, and every panel paid 124px for a control
that was no longer there. Numbers in this file come from the DOM — and have to be
taken again when the thing they measure changes.

**The window yields to the scene, not the other way round.** The scene is the
subject; a panel describes it. Moving the subject's controls to make room for
the description is backwards, and it is exactly what the discarded attempt did.

### R4 — Every window has a closed format, and it is the way back

| Family | Open | Closed |
| --- | --- | --- |
| Docked column | Full column, resizable | A rail on its own edge, named, click to restore |
| Floating panel | Card in the right lane | Nothing — its toolbar control is the way back |
| Modal | Centred dialog | Nothing — modal by definition |
| Chooser (Add data) | Modal hub, a sheet on phones | Nothing — every action closes it and hands off to a panel |

A column never simply disappears: it collapses in place and leaves a strip that
says what it is. See `ColumnStrip`.

### R5 — Anatomy, so they are recognisably the same family

The data panels (3D video, 3D model, Data layers, Live devices) now render this
header on desktop too, not only on phones.

Every window: a header with its name and a close control, a body that is the
only thing that scrolls, and an optional pinned action row. Long words wrap
rather than widening the card past the screen. The header and the actions stay
reachable however long the content is, which is what "the body scrolls" buys.

### R6 — Checking never squeezes the data tools

The bottom of the main column is **one slot**: Validation XOR IDS. A store rule
(`lib/ui/bottom-slot`) enforces it whatever opens them; the last one opened wins.

Its share is one value for both: 40% of the column by default, as
`clamp(180px | 220px for IDS, ratio, column - 240px)`, remembered under
`ifc-ui-drawer:v1` (not on phones, not in embeds). The grip is a
`role="separator"`: drag (snaps within 16px of 25/40/60%), double-click to cycle
those, Arrow keys ±24px (±96 with Shift), PageUp/PageDown between detents,
Home/End for minimum/maximum.

Content panels run **over** the drawer's right side, to 12px above the column
bottom (`--lane-drawer-h`, written on `[data-main-column]`). The drawer yields
**width, never height**: it pads its content by the panel's width + 68px (rail
clearance + an 8px gap), so its actions and collapse button stay visible beside
the card. A panel only does this while at least 460px of drawer remain;
otherwise it stops above the drawer. Overlays that share the bottom (time bar,
the bottom-right legend, the model-info pill) move clear of an open content panel.

Two structural invariants make this work, and `scripts/viewport-lane.test.ts`
pins them: the viewer area (`[data-viewer-area]`) has no overflow clip,
z-index, isolation, transform or contain; and the drawer roots
(`[data-bottom-drawer]`) are unpositioned.

The properties sidebar stays in the viewer on purpose: it never coexists with a
content panel (R2), and in the lane it would permanently take ~408px from the
validation list in the click-an-issue-then-read-properties flow.

### Glossary

- **Content panel** — any `ViewportPanel` with `mobile="sheet"`: scene, map,
  pointcloud, mesh, layers, video, twin-devices, solar, solar-analysis, flood,
  tour. Runs the full lane, over the drawer.
- **Palette** — `mobile="dock"`: measurement, section, plans. Stays in the 3D view.
- **Data panel** — (add-data work) pointcloud, mesh, video, layers, devices and
  map; all of them content panels.

## After

Same session, same window size, after the rules:

```
canvas                     1168 x 546
Escena (floating panel)     292 x 298  @ (864, 56)   14%   (was 27%)
Propiedades (sidebar)       collapsed to its rail          (was overlapping)
Vistas (camera controls)    245 x 171  @ (907, 360)         6px below the panel
```

The panel ends at y 354; the controls start at y 360. Nothing overlaps, the
model is unobstructed, and the panel scrolls internally instead of growing.

## The lane over the drawer (R6), measured

The 298px lane above was still too tight once real content (scans, several
models, a solar study) lived in it, and with the validation drawer open it was
worse: 248px at 1440x900, 0px at 1366x643. The decision is R6 — content panels
run over the drawer, which gives up width instead of height. With the default
40% drawer:

| Window | Content panel | Palette | Rail |
| --- | --- | --- | --- |
| 1440x900 | 248 → 788px | 248 → 446px | 248 → 390px (10 icons) |
| 1366x643 | 0 → 531px | — | 0 → 235px (6 icons) |
