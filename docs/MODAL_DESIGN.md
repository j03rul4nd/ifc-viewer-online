# Modal windows — the study, and the rule

## Why this exists

The app has three families of surface. Two of them already have a rule and a
single implementation:

| Family | Component | Rule |
| --- | --- | --- |
| Floating panels | `ViewportPanel` + `lib/ui/panel-registry` | One at a time; Escape closes; a modal on top wins |
| Docked columns | `ColumnStrip` + `uiStore` | Collapse in place; the strip is the way back; persisted |
| **Modals** | `Modal` + `lib/ui/modal-stack` | Stack by opening order; the top one owns Escape |

## Where the code lives

The same split in all three, so a rule is never buried in a component:

| Layer | Holds | Examples |
| --- | --- | --- |
| `src/lib/ui/` | The rules. Pure — no React, no DOM — so they are testable without mounting anything | `modal-stack`, `panel-registry` |
| `src/hooks/` | The React glue: membership while mounted, and what a render needs to read | `useModalLayer`, `useViewportPanel` |
| `src/components/` | Appearance and markup only | `Modal`, `ViewportPanel`, `ColumnStrip` |
| `src/stores/` | State the app persists or shares across surfaces | `uiStore` (column open/closed) |

This document is the study of the third, and the rule it produces.

## What was actually there

Measured across the ten dialogs in `src/components`, not assumed:

| Modal | Escape | `role="dialog"` | `aria-modal` | Focus trap | Backdrop closes | z-index |
| --- | --- | --- | --- | --- | --- | --- |
| ExportModal | yes | **no** | **no** | **no** | yes | 70 / 71 |
| EmbedModal | yes | **no** | **no** | **no** | yes | 70 / 71 |
| IdsModal | yes | **no** | **no** | **no** | yes | 70 / 71 |
| CustomProfileModal | yes¹ | yes¹ | yes¹ | **yes¹** | yes¹ | 100 / 101 |
| KeyboardHelpModal | yes | **no** | **no** | **no** | yes | 200 |
| ValidationExportModal | yes | yes | yes | **no** | yes | 80 / 81 |
| AccountModal | yes | yes | yes | **no** | yes | 80 / 81 |
| ProUpsellModal | yes | yes | yes | **no** | yes | 85 / 86 |
| EirProfileEditor | yes | **no** | **no** | **no** | yes | 72 / 73 |
| CapturePreviewModal | yes | yes | yes | **no** | yes | 100 |

¹ `CustomProfileModal` is built on Radix `Dialog`, which supplies escape, focus
trapping, outside-click dismissal and the dialog role **at runtime**. Reading the
source alone says it has none of them, which is how the first draft of this study
got that row wrong. It is the one dialog in the app that was already correct.

Four findings, in order of severity.

### 1. Nine of the ten do not trap focus

Every hand-rolled one. Tab out of any of them and focus walks into the page
behind — through a 3D canvas, a tree, a toolbar — with the dialog still on
screen and the backdrop still swallowing clicks. For a keyboard or screen-reader
user that is not a rough edge, it is a dead end. None of the nine restores focus
on close either, so dismissing a dialog drops the caret at the top of the
document instead of on the control that opened it.

The tenth does all of this correctly, and did not write a line of it: it is
built on Radix. **That is the finding that decided the implementation.** A focus
trap written by hand works until someone puts a `select` in a portal inside it;
this repo already had the dependency, already used it, and used it exactly once.

### 2. Six of ten are not announced as dialogs

Without `role="dialog"` and `aria-modal`, assistive technology treats them as
ordinary page content: no boundary, no announcement, no modal semantics.

This one also has a **functional** consequence, added by the panel work that
landed before it. `panel-registry` decides whether Escape belongs to a
floating panel by asking:

```ts
document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
```

The five hand-rolled dialogs missing the attribute are therefore invisible to
that check (the Radix one sets it at runtime and is fine).
Press Escape over `ExportModal` and it closes the export dialog *and* the panel
behind it. The inconsistency stopped being cosmetic the moment something else
started depending on it.

### 3. Seven z-index bands, no ordering rule

70, 71, 72, 73, 80, 81, 85, 86, 100, 101, 200 — assigned by whoever wrote each
dialog. Two modals that can be open together (`AccountModal` at 80 over
`CustomProfileModal` at 100) stack in the order their numbers happen to fall,
not the order the user opened them.

## The rule

> **A modal is a `Modal`.** It owns the backdrop, the stacking, dismissal, focus
> and the dialog semantics. A caller supplies a title, a body, and optionally a
> row of actions — nothing else.

`Modal` is Radix `Dialog` underneath, plus what the app has to decide on top:
stacking order, one appearance, four sizes. Focus, escape and aria are Radix's,
because that is the part nobody should be writing twice.

Concretely, `Modal` guarantees:

1. **Portalled to `document.body`.** A dialog is never clipped by, or stacked
   against, whatever happened to render it.
2. **One z-index scale, ordered by opening.** The stack is a registry, not a set
   of magic numbers: the modal opened last is on top, whatever it is.
3. **Two ways out, always.** Escape and a click on the backdrop, plus the close
   control in the header. `dismissible={false}` is available for a dialog in the
   middle of destructive work, and is the only way to remove them.
4. **Escape belongs to the topmost modal only.** Under it, nothing moves — not
   the modal below, not the panel behind.
5. **Focus is trapped while open and restored on close** — Radix's, not ours.
6. **`role="dialog"`, `aria-modal="true"`, and an accessible name** from the
   title, by construction rather than by remembering.
7. **The page behind does not scroll.**
8. **One appearance**: the same backdrop, radius, border, shadow, header and
   footer, and the same entrance.
9. **Below the desktop breakpoint** the dialog takes the width it needs to be
   usable rather than keeping a desktop card against a phone screen.

### What `Modal` deliberately does not do

- **It is not the panel rule.** Floating panels share one slot and so only one
  may be open. Modals stack, because a dialog opened from a dialog is a normal
  thing to do — the account modal opens over the upsell that offered it.
- **It does not own the state.** `open` is a prop. The callers already hold that
  state in stores, routes and local hooks, and moving it would be a large
  refactor for no behaviour the caller can observe.

## Sizes

Four, because measuring the ten showed four clusters and no more:

| Size | Width | For |
| --- | --- | --- |
| `sm` | 380px | A question and two buttons (upsell, confirmations) |
| `md` | 560px | A short form (export options, embed snippet) |
| `lg` | 860px | A working surface (rule-set editor, IDS loader) |
| `full` | viewport | Media that wants the room (capture preview) |

## Migration

Each dialog keeps its body and its behaviour. What is removed from every one of
them is the same list: the portal, the fixed backdrop, the escape listener, the
z-index, the card chrome, and the header markup.

Tests cover the guarantees above, and the migration is checked by a test that
asserts no component outside `Modal.tsx` builds its own dialog — the way this
drifted apart in the first place is that there was nothing to stop it.
