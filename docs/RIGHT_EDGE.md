# The right edge: one surface, and how it scales

`PANEL_RAIL.md` gave floating panels a minimised form. That immediately exposed
a bigger problem, and this document is about it: **the right edge now has three
different systems competing for the same 60 pixels**, and the app has no rule
for which of them a new tool should join.

## What is actually there today

Count the ways to reach the same information:

| Surface | Reaches | Minimised as |
| --- | --- | --- |
| Topbar `Vista ▾` | Scene, map, sun, legend… | Closed menu |
| Topbar `Herramientas ▾` | Measure, section, plans | Closed menu |
| Panel rail (new) | The eight floating panels | Icon |
| Properties sidebar | Selection properties, categories | `PROPIEDADES` edge strip |
| Tree column | Spatial tree | `ÁRBOL` edge strip |
| Validation column | Issues | Edge strip |

Three of those overlap in space. The screenshot that started this shows it
literally: the rail's rounded box drawn on top of the `PROPIEDADES` strip,
because both claim `right-3` and only the z-index decides who wins.

And two of them overlap in *meaning*. The properties strip is a vertical
40px-wide label whose only job is "click to bring the panel back". That is
exactly, and only, what a rail icon does. Keeping both is asking the user to
learn two gestures for one idea, in the same 60 pixels of screen.

## How the tools that solved this solved it

I looked at four that face the same pressure — many tools, one canvas, and a
tool count that only grows.

### Blender — the honest worst case

Blender has hundreds of tools, and it draws the line by **kind of thing**, not
by tool:

- **Properties editor** (right): one icon column, one panel. The icons are
  *categories of data about the scene* — object, modifiers, material, physics.
- **N-panel** (right, over the viewport): transient tool state.
- **T-panel** (left): the active tool's options.
- **Top bar**: modes and workspaces — things that change what the whole app is.

The rule that makes it scale: **an icon column holds data categories; a menu
holds commands.** New tools get an icon only if they are a persistent view of
something. Everything else is a menu item or an operator.

### Adobe (Photoshop, After Effects) — the cautionary half

The right edge is a rail of collapsed panel icons plus a panel. Same family.
But Adobe also kept every panel in the `Window ▾` menu, and the result is the
thing everyone complains about: a Window menu with forty entries, most of which
nobody can find, and a rail that people customise into a personal mess. The
lesson is not "don't have a menu" — it is that **the menu must not be the
primary route**, or it grows without limit because nothing pushes back.

### Linear — the discipline

Not 3D, but the best current answer to "where does configuration go". Linear
splits ruthlessly:

- **Things you act on** → the surface itself, or `Cmd-K`.
- **Things you configure once** → Settings, a full separate view.
- **Things about the current selection** → a right panel that follows selection.

Almost nothing is in a top menu. The insight worth stealing: **a top menu bar is
where features go to be forgotten.** Linear replaced it with search.

### Apple (Final Cut, Maps, Freeform) — the restraint

One inspector on the right, contents driven entirely by selection. Toggled by a
single button, always the same button. Apple's answer to tool growth is to
refuse to add rails — the inspector re-skins itself instead. It scales in depth,
not in width, and it works because the app is opinionated about *what the user
is looking at*.

## The rule for this app

Both families converge on one thing that we do not have: **the right edge is a
single control surface, and there is exactly one way in.**

So:

> **The rail owns the right edge.** Every persistent view of scene data —
> properties, scene, map, sun, scans, measurements, sections, plans — is a rail
> icon. Nothing else lives on that edge.
>
> **The topbar owns commands**, not views. Open, validate, export, share: things
> that *do* something and then are finished. If a menu item's job is "show me a
> panel", it belongs on the rail, and the menu entry is a shortcut, not the
> route.
>
> **Columns are not panels.** The tree and the validation list are docked,
> resizable, and can be open at the same time as a panel. They keep their own
> edge strips, on their own edges. That is a different pattern for a different
> job and it should stay different.

### What this fixes right now

- The properties strip is deleted. Properties becomes the **first rail icon** —
  the position it earns by being the most-used panel in the app.
- One gesture on the right edge instead of two, and one place that answers
  "what can I open, and what is open now".
- The rail and the panels stop fighting for `right-3`: the rail is pinned to
  the edge and everything else — panels *and* the properties sidebar — is
  offset left by its width, from one shared token.

### What this means for the next tool

The test is one question: **is it a persistent view of something in the scene?**

- Yes → it is a rail icon, and it opens in the lane. No new surface, no new
  gesture, no new menu entry needed. This is the path that scales, and it is
  why the rail is worth 40px.
- No → it is a topbar command or a `Cmd-K` action, and it does not get an icon.

The rail has room for roughly twelve icons before the camera-controls clearance
starts biting. Past that, the answer is Blender's: **group by kind**, with a
separator, before anyone reaches for a scroll or a customisation UI. We are at
nine.

## Turning tools on and off, as the set grows

The rail is where every new tool now lands, so the question "which tools does
*this* audience get" has to have one answer rather than a flag invented per
tool. The embed chrome already had six coarse switches — toolbar, tree,
sidebar, panel, home, camera — and none of them could reach a single panel.

So the chrome carries a list:

```
?embed=1&panels=scene,map        only those two
?embed=1&panels=-measurement     everything else, including tools shipped later
?embed=1&panels=                 no rail at all, said explicitly
```

Three properties worth keeping when this is extended:

- **It filters, it never adds.** Naming `pointcloud` with no scan loaded does
  not produce the panel, and naming `properties` does not re-enable a column the
  chrome switched off. Availability is still the app's answer; the list only
  narrows it.
- **The subtractive form is the one that ages well.** A host that opts two tools
  out stays correct when we ship a third; a host that lists seven silently
  misses it.
- **Unknown names are ignored, not rejected.** A URL written against a newer
  build has to still open on an older one.

**The allowlist narrows; it does not decide what exists.** That distinction was
learned the hard way. The first version of the client preset carried its own
list of panels, written from memory — `scene`, `map`, `solar` — and the client
skin mounts none of the first two. The rail dutifully showed three icons, two of
which did nothing when pressed.

So availability is stated once, in `App.tsx`, from the same expressions that
render each panel, and the rail cannot form an opinion of its own:

```tsx
const railAvailable = useMemo(() => ({
  scene: !clientMode,
  map:   isGisEnabled() && !clientMode,
  solar: isSolarEnabled(),
  …
}), [...])
```

A panel the app has never heard of counts as unavailable, so a newly added tool
is invisible until someone states it — failing invisible rather than failing
dead. A presentation mode, when it arrives, is a preset over this: not a new
mechanism, and not a second list of what exists.

## What is deliberately not being done

**Removing the topbar menus.** Linear could go menu-less because it launched
that way. Every existing user of this app reaches Scene through `Vista`, and
taking that away to make a point costs more than it buys. The menus stay as a
second route; the rail becomes the first.

**Making the rail customisable.** That is Adobe's mistake, downstream of having
too many panels to begin with. The fix for too many icons is fewer icons.
