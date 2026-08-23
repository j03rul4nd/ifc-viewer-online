# The floating panel: expanded, minimised, and what it should be

`WINDOW_DESIGN.md` settled where a window may sit and how big it may be. This
one is about the thing that was left unanswered: **a floating panel has no
minimised form.** It is either open or it does not exist.

## What we have

Nine panels — scene, map, point cloud, mesh, solar, video, measure, section,
plans — and this is how you reach any of them:

```
Toolbar → "Vista"  → Escena
Toolbar → "Herramientas" → Medir | Sección | Plantas
```

Two clicks, into a menu that closes behind you. Once a panel is open the only
way back out is to find the same menu item again. Consequences, all of them
things you can watch happen:

- **Nothing tells you the panels exist.** Nine tools behind two menus.
- **Nothing tells you which one is open.** The menu item carries an `active`
  dot, but the menu is closed.
- **Switching costs four clicks** — menu, item, menu, item.
- **There is no in-between.** You cannot park a panel; you can only lose it.

## How other tools solve it

Four families, and the industry has been converging on one of them for a decade.

### 1. Floating palettes that roll up — 3ds Max, Rhino, early Maya

Draggable windows with a title bar; minimising rolls the window up into that
bar. Maximum freedom, and it is why the pattern lost: the panels pile up, hide
behind each other, drift off-screen on a resize, and people end up managing
windows instead of using them. Almost nothing designed after ~2015 does this.

### 2. Docked inspector with accordion sections — Figma, Spline, Blender's N-panel

One lane on the right, contents change with what is selected. Collapsed, the
whole lane hides behind a small arrow at the edge. Nothing overlaps and the
position is predictable. The weakness is that it holds ONE thing: it suits an
inspector for the current selection, less so nine independent tools.

### 3. Icon rail plus panel — VS Code, Onshape, Speckle, Autodesk's viewer, Blender's tab strip

A permanent narrow rail of icons on the edge. Click one and its panel opens in
the lane beside it; click the active one and the panel collapses back to the
rail. **The rail is the minimised state.** It answers all four complaints above
at once: every tool is visible without opening anything, the open one is
indicated, switching is one click, and parking is one click. VS Code made this
the default mental model for a whole generation of tools, and the 3D apps
followed.

The cost is honest and small: about 44px of permanent width.

### 4. Popovers anchored to a toolbar button — Google Earth, Matterport

Fine for a one-shot action. Poor for a tool you keep open while you work, which
is what a section plane or a measurement is.

## What this app should be: family 3

It is also the shortest path from where we already are. The lane exists, the
one-panel-at-a-time rule exists, the registry exists. The rail is the missing
piece — the minimised state that was never designed.

### The minimised form

A vertical rail on the right edge, one icon per panel that is currently
applicable:

- **Always visible** while a model is loaded. Not a mode, not behind a menu.
- **The open panel's icon is marked.** So the rail also answers "which one am I
  in".
- **Click an icon** → that panel opens (and the previous one closes, which is
  already the rule).
- **Click the open panel's icon** → it collapses back to the rail. Same control
  both ways, which is the rule the docked columns already follow.
- **Icons only, with a tooltip and an accessible name.** A 44px rail cannot
  carry labels, and the tooltip is what makes it learnable.
- **Panels that do not apply are not shown**, rather than shown disabled. A
  point cloud panel with no scan loaded is noise.

### The expanded form

Anatomy, fixed, so nine panels read as one family:

| Zone | Rule |
| --- | --- |
| Header | Icon, name, optional count, close. Fixed height, never scrolls. |
| Body | Sections. The only thing that scrolls. |
| Footer | The primary action, pinned. Absent when there is no primary action. |

And the sizing rules already established: the card is anchored top and bottom in
the lane, hugs its content when short, scrolls internally when long, and stops
above the camera controls.

Density follows what these tools settled on — 11–13px labels, ~30px rows,
~292–360px of width. Ours is already in that band; what it lacked was the rail.

## What this replaces, and what it does not

The menu items stay. The rail is a second, faster route, not a migration: a
menu is still the right place to discover something you have never used, and
removing it would break every habit and every keyboard path at once.

## What is deliberately not in this

**Dragging and free positioning.** It is the first thing family 1 offers and the
reason family 1 lost. A panel that can be anywhere is a panel that is in the way
somewhere, and this viewport is 1168x546 with the tree and validation open —
there is nowhere to drag it to.
