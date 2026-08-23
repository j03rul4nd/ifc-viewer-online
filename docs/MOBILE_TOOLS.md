# Mobile: the same tools, a different form

The desktop rail settled where tools live and how they scale (`RIGHT_EDGE.md`).
Mobile did not come along, and the gap is measurable rather than aesthetic.

## What was actually wrong

Counted on a 390x844 viewport with a model loaded:

| Surface | Tools offered |
| --- | --- |
| Desktop rail | Properties, Scene, Measure, Section, Plans, Map, Sun |
| Mobile `Herramientas` sheet | Measure, Section, Plans, Scene |

**Map, Sun, Point cloud and Mesh have no mobile entry point at all.** Not hidden,
not disabled — absent. The only way to reach them on a phone is to not be on a
phone.

And the reason matters more than the count: the sheet is a hand-written grid of
four buttons, in a different file from the rail, listing tools by name. It is a
second copy of "what tools exist". Every copy of that list drifts — this one had
already fallen four behind, and the client preset made the same mistake with the
rail the day it shipped. A redesign that writes a nicer hard-coded grid buys a
few months and then drifts again.

## The rule

> **One catalogue, two forms.** What tools exist, whether each is available, and
> what toggles it, is answered once. Desktop renders that as a 40px icon rail;
> mobile renders it as a labelled grid in a sheet. Neither surface has an opinion
> about what is in the list.

A tool added next year appears on both the day it is stated in `App.tsx`, with
no edit to either surface. That is the whole point.

## Why mobile does not get the rail itself

The rail is right for a pointer and wrong for a thumb, for reasons that are
about the device rather than taste:

- **It is icon-only, and learnable through hover.** There is no hover on touch,
  so nine unlabelled 32px glyphs would be nine guesses.
- **32px targets.** Below the ~44px that touch guidelines settle on, and
  everything about a rail is that it is narrow.
- **It occupies a side edge**, which on a phone is where the thumb rests and
  where the OS puts its own back gesture.

So mobile keeps the sheet it already had — a familiar, dismissible surface with
room for a label under every icon — and only its *contents* change.

## The mobile form

- **Icon plus label**, always. The label is not decoration on touch; it is the
  only affordance that explains the icon.
- **A grid that wraps**, not a fixed row of four. Nine tools fit; twelve will.
- **The open tool is marked**, the same as the rail marks it — so the sheet also
  answers "which one am I in", which the old grid could only do for the four it
  knew about.
- **Tapping a tool closes the sheet.** You asked for the tool, not for the menu.
- **Availability is the same answer as the rail's.** A point cloud panel with no
  scan loaded is absent on both, rather than absent on one and dead on the other.

Actions that are not panels — reset, isolate, tree, tour — stay in their own
section below a divider. They are commands, and the split follows the same line
`RIGHT_EDGE.md` draws between a view and a command.

## The sheet had a floor under it

Reaching a tool is one thing; using it is another. Measured with the sheet open
at its half detent on a 390x844 phone:

- The sheet is **792px** of content with **464px** on screen.
- There was a scroll container inside it, and it **never scrolled**.
- Two controls in Scene and two in Sun & Moon were **below the fold with no way
  to reach them**. On a 320x568 phone, Tour's own "Play tour" button was one.

The cause is in the sheet mechanics rather than in any panel. The sheet is
always as tall as its largest detent, and lower detents are reached by
translating it DOWN — which keeps the drag maths simple. An inner
`overflow-y-auto` therefore measured itself against the full height, found it
had room, and stayed put, while the tail of the content sat below the bottom of
the screen with nothing on screen to suggest it existed.

So the content now lives in a box exactly as tall as the part of the sheet
actually on screen, derived from the drag position so it is correct mid-drag
too. An inner scroller overflows when it should. The same box carries the
safe-area padding, because every sheet ends at the same edge and the home
indicator sits over its last row.

## Panels that placed themselves

`TourRecorder` did its own mobile layout: `bottom-[76px]` — a copy of a number
that has a token — and `max-h-[55%]` of a container it was not measured against.
It sat tight under the nav with the cache badge across its primary button, had
no drag handle, no detents, and was not in the panel registry, so it obeyed
neither one-at-a-time nor Escape.

It is a `ViewportPanel` now, like every other tool. The rule is worth stating
plainly, because this is the second time it has been broken:

> **A panel does not choose where it goes.** It declares itself a
> `ViewportPanel` and which mobile form it wants — `sheet` for a tool you read,
> `dock` for one you use while watching the model. Everything else follows.

## The dock, brought under the same rule

`dock` is the right form for a tool you use while watching the model — measure,
section, plans. It should not become a sheet, and it has not. What it did need
was to stop being measured against the wrong thing, which is the disease this
whole sequence keeps finding:

- The card stopped at **`46vh`**. A fraction of the visual viewport is not the
  space the card has: on a 390x844 phone it capped at 388px inside 724px of
  actual room, and on a shorter screen the same fraction gives a different,
  equally arbitrary answer. It is anchored top and bottom now, exactly as the
  desktop lane is, so it takes the room it has and no magic number decides.
- The **whole card scrolled**, header included. A header that scrolls away is
  the one thing a header must not do.
- Each panel's list carried its own ceiling — `max-h-[160px]`, `[200px]`,
  `[240px]`, three numbers, three files. They are `min-h-0 shrink` now: natural
  height while there is room, shrinking and scrolling when the card is capped.
  Same list, same code, right answer on every screen.

All three forms — lane, sheet, dock — now share one sentence: **anchored, not
sized; header fixed, body scrolls.**

## What is deliberately not being done

**A mobile-only tool list.** It would be a third copy, and this document exists
because the second one drifted.

**Moving the panels themselves.** Mobile panels already have their own sheet
presentation with snap points. This changes how a tool is *reached*, not how it
looks once open.
