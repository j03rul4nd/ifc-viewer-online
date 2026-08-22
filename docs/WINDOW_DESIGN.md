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

### R2 — The right edge is one lane, and it holds one window

The selection sidebar and the floating panels are both pinned right. Opening a
panel collapses the sidebar to its rail, and closing the panel brings it back —
unless the user expanded it again in the meantime, in which case their action
outranks ours. It is stepped aside, not closed: the rail is still the way back.

### R3 — The scene keeps its own corner; the window yields

The bottom-right of the viewport belongs to the camera and position controls.
Panels stop above them, via one clearance token, so the reserve moves when the
controls do.

The token is **measured**: the controls are 171px tall with their view presets
open. The first value written here was 132px, and the panel still overlapped
them by 38px — small enough to look roughly right in a screenshot and be wrong
in fact. Numbers in this file come from the DOM.

**The window yields to the scene, not the other way round.** The scene is the
subject; a panel describes it. Moving the subject's controls to make room for
the description is backwards, and it is exactly what the discarded attempt did.

### R4 — Every window has a closed format, and it is the way back

| Family | Open | Closed |
| --- | --- | --- |
| Docked column | Full column, resizable | A rail on its own edge, named, click to restore |
| Floating panel | Card in the right lane | Nothing — its toolbar control is the way back |
| Modal | Centred dialog | Nothing — modal by definition |

A column never simply disappears: it collapses in place and leaves a strip that
says what it is. See `ColumnStrip`.

### R5 — Anatomy, so they are recognisably the same family

Every window: a header with its name and a close control, a body that is the
only thing that scrolls, and an optional pinned action row. Long words wrap
rather than widening the card past the screen. The header and the actions stay
reachable however long the content is, which is what "the body scrolls" buys.

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

## What this does not settle

The viewport is 546px tall in this configuration, and a 298px lane is tight for
a panel with transform fields in it. That is an honest consequence of the tree,
the validation panel and the scene chrome all being open at once — not something
a window rule can fix. The lever, if it matters, is the validation panel's share
of the height, and that is a separate decision.
