# Dual-screen and foldable layout

The viewer splits across two screens when the browser **reports** two display
segments: the 3D view on one, the spatial tree and the selection (properties,
legend, quantities) on the other. It never decides from a device name.

## What the web can actually detect (checked 2026-10)

| Mechanism | Where it works | Used for |
|---|---|---|
| Viewport Segments API — `window.viewport.segments`, CSS `horizontal-/vertical-viewport-segments`, `env(viewport-segment-*)` | Chromium (Chrome/Edge/Samsung Internet) on Android foldables and Windows dual-screen | Primary source of the geometry |
| `window.getWindowSegments()` | Old Edge on Surface Duo; removed from current browsers | Fallback read only |
| Device Posture API — `navigator.devicePosture` | Chromium on Android | Change event only (re-measure on fold) |
| Safari / WebKit | none of the above | — single-screen app |

Things to know:

- A foldable lying **flat** reports one segment (there is no seam to avoid), so
  the app stays single-screen. Two segments appear in book or tabletop posture,
  or when an app spans two physical panels (Surface Duo).
- There is no web API that names a device. A future "iPhone Duo" or any other
  two-panel phone gets the split only if its browser implements viewport
  segments. Until WebKit does, iOS devices get the normal phone/tablet app, plus
  the manual split described below on wide touch screens.
- Embeds never split (the segments describe the host page, not the iframe), nor
  does the client presentation skin.

## Layout

`src/lib/ui/display-segments.ts` (pure, unit-tested) turns segments + the
user's preference into a `DualLayout`: a rect for the viewer, one for the pane,
and the hinge between them. `useDualLayout` (one call, in `App`) listens to
resize, the segment media queries, orientation and device posture, coalesced to
one read per frame.

- **Side by side** (book posture): viewer on one segment, pane on the other.
- **Stacked** (tabletop): viewer on top, pane below.
- Segments narrower than 280 px are refused — a sliver beside the hinge is worse
  than ignoring the hinge.
- Nothing is placed over the hinge: the viewer's whole container (toolbar
  included) is sized to its segment.

The pane (`components/dual/DualScreenPane.tsx`) has three views, persisted:

| View | Shows |
|---|---|
| Tree + properties (default) | spatial tree on top, selection below |
| Properties | selection column full height (properties / legend / quantities) |
| Tree | spatial tree full height |

plus *swap screens* and *use one screen*. When a split is possible but off, a
"Use both screens" chip sits in the viewer, and *View → Split screen* toggles it.

**Manual split.** On a touch screen at least 720 px wide with no hardware
segments (tablets, iPad, foldables lying flat) the user may choose
*View → Split screen*. It is never turned on automatically.

**Link.** `?split=1` asks for the split for that visit; the screen still decides. The
article `foldable-phone-ifc-viewer` links to it, with a live check (`FoldableCheck`).
Funnel: `blog_tool_clicked` (`foldable-open`) → `dual_screen_active` (source, posture),
plus `foldable_report` (the reader's answer, never a device name).

## Single source of truth

- The `Viewer` element is never moved in the React tree: the split only changes
  its container's box, so the renderer resizes instead of re-initialising and
  no model is reloaded. Verified: the same `<canvas>` survives split → swap →
  stacked → single.
- `ModelTree` and `Sidebar` are the app's own components, built once in `App`
  and rendered in exactly one place — the desktop column / floating panel, or
  the pane. There is no second copy to keep in sync. Inside the pane both stay
  mounted across view changes, so the tree keeps its expansion and scroll.
- Selection stays in `App` / `editorStore` as before. In the split, the tree
  **follows** a selection made in 3D (`revealElement(..., { follow: true })`:
  opens and scrolls, never re-selects or jumps to a host, never clears a search).
- `Sidebar docked` fills the pane and leaves the one-floating-panel-at-a-time
  rule, since it shares the screen with nothing. Measure, Section, Plans, Map and
  the other tool panels keep floating over the viewer and stay reachable from the
  toolbar and the panel rail.
- `Toolbar compact`: in a 540 px segment the toolbar triggers go icon-only (text
  kept for accessibility) and the file name hides (it heads the tree pane), so
  every menu stays reachable without crossing the hinge.

## Validation done

Emulated in Chromium by overriding `window.viewport.segments` and dispatching
`resize` (the same path the real API takes), with the Duplex sample model:

- side by side 2×540 px + 34 px hinge, swapped, tabletop 2×350 px + 20 px hinge,
  back to one segment: layout correct, same canvas, selection kept;
- selection in 3D → properties in the pane and the tree scrolled to the row;
- use-one-screen → chip → both screens; preference persisted;
- 375 px phone and desktop: no pane, layout unchanged.

**Not validated on real hardware.** No foldable or dual-screen device was
available; behaviour on a physical Galaxy Z Fold / Pixel Fold / Surface Duo
(posture changes, real hinge sizes, touch on both panels) is unverified.
Chrome DevTools' foldable emulation (*Device toolbar → Surface Duo / Galaxy Z
Fold*) is the next check.

## Known limits / next steps

- Dialogs, sheets and toasts stay on the viewer's segment, and the context menu on
  the screen that was tapped. The clip and cover studios take the viewer's segment.
- The validation and IDS drawers open over the pane instead of under the viewer;
  collapsing one uncovers the pane, and their resize grip and maximize button are
  hidden, having nothing to do there. Below 768 px they remain sheets on the viewer.
- Model comparison on two screens (scenario D) needs a second renderer or a
  second camera view over the same scene; not built — it would double GPU
  memory on phones and needs its own design.
- Tools (measure, section) as a pane view rather than floating panels.
