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

## What is deliberately not being done

**A mobile-only tool list.** It would be a third copy, and this document exists
because the second one drifted.

**Moving the panels themselves.** Mobile panels already have their own sheet
presentation with snap points. This changes how a tool is *reached*, not how it
looks once open.
