# Project mail: design notes

The coordinator is the editor and the project is the publication. These notes record
what makes good editorial newsletters work, so our templates reach that finish with a
language of their own. Nothing here copies a layout, text, illustration or brand.

## What was studied (2026-11-13)

- beehiiv's newsletter templates (7 under the newsletter tag): Classic Editorial,
  Featured Interview, Runway Roundup, Tech Roundup, Product Rundown, Community Pulse,
  Wellness Wire. They were looked at as small previews, not as full sends.
- From memory of the publications, not re-read for this note: Stripe Press, The Browser,
  Monocle, Kinfolk, annual reports by architecture practices (BIG, Snøhetta, Herzog &
  de Meuron), and the graphic conventions of technical drawings (title block, grid
  axes, north arrow, scale bar, revision table).

## Patterns that make them good

1. **One voice per issue.** Every strong template commits to a single typographic idea
   (a condensed display head, a big serif, or a strict mono). Weak ones mix three.
2. **A masthead that reads as a publication.** A name, an issue number and a date, set
   small and exact. The dateline sits apart from the title, as in a newspaper.
3. **A narrow measure and a lot of air.** A 560–640 px column, 60–70 characters per
   line, one idea per block, and space between sections rather than boxes around them.
4. **Restrained colour.** Warm neutrals plus one accent. The single loud colour, if any,
   lives in the masthead or one panel, never on every element.
5. **Images carry captions.** A photo is set full width with a short caption beneath.
   In our case that caption is the view, storey and model revision.
6. **Hierarchy from size and weight, not cards.** Thin rules and numbered sections
   instead of rounded shadowed boxes, gradients or emoji.
7. **Data set as data.** Tabular figures, right-aligned numbers, a sign and a unit on
   every change.

## Our own BIM language

- **Title block (cajetín)** as the footer: project, phase, revision, date, author and the
  ISO 19650 container code of the issue itself.
- **Grid axes** (A, B, C / 1, 2, 3) as a quiet frame or section marker, never as a pattern
  fill.
- **Discipline colours** (ARQ, EST, MEP…) only as small labels next to data.
- **Health Score as a stamp:** one number, its change, and what it was measured against
  (IDS file, date).
- **Viewer captures** always with the same treatment: neutral background, caption with
  view, storey and revision, and a link that opens the same view.

## Email constraints that shape the design

- System font stacks only, with web fonts as an enhancement: Georgia/"Times New Roman"
  serif, Arial/Helvetica sans, and Consolas/Menlo/monospace mono. Every design must
  hold up in the fallback.
- Tables, inline styles and MSO conditionals; colours as hex (no OKLCH); dark mode via
  `prefers-color-scheme` plus `[data-ogsc]` for Outlook; under 102 KB.
- Colour tokens follow `docs/COLOR_SYSTEM.md`: concrete neutrals and verdigris accent
  (`#00696a` light, `#55cac3` dark); status colours only when something has that state.
- Avoid the 2026 "AI look" tells: purple or indigo gradients, emoji headers, equal cards
  with tick marks, and the trendy display serif on cream with terracotta.

## The system (2026-11-13)

Three directions were mocked up for the weekly report (`docs/email-directions/shots/`):
A editorial magazine, B technical drawing, C executive report. The choice was **A + B**:
one system with two registers.

- **Editorial register** (client, management, newsletter, welcome, RFI): centred serif
  masthead with issue number and dateline, double rule, sections numbered `01` with a serif
  title, full-width capture with an italic caption.
- **Technical register** (coordinators, trades, clashes, EIR, minutes): grid axes A–F along
  the top, left-aligned masthead, circled section numbers with mono caps, tables with
  discipline tags, captures framed by a rule.
- **Shared:** the "For / From" band under the masthead, discipline tags, the Health Score
  stamp, and the title block (cajetín) as footer with the ISO 19650 code of the issue.

Code: `src/components/workspace/sections/mail/editorial/`

| File | What |
|---|---|
| `tokens.ts` | Neutrals, status, discipline colours, three type pairings, contrast maths (a brand accent is darkened until it reads AA). |
| `render.ts` | Block library and `renderIssue()`: HTML (tables, inline styles, MSO, dark via `prefers-color-scheme` + `[data-ogsc]`), plain text and preheader. |
| `labels.ts` | The fixed words of an issue in the ten product languages. |
| `templates.ts` | The ten templates (audience, register, es/en sample content) and `factsFrom()` to fill figures from a workspace snapshot. |
| `Studio.tsx` | Gallery filtered by audience, block editor (reorder, hide, edit text, insert capture or validation report), brand, live preview and plain text. |

`renderEmail()` in `model.ts` maps the older block templates onto the same blocks, so
approval previews and automations share the design.

Checks: `npx vitest run src/components/workspace/sections/mail` (snapshots of HTML and
text for every template in es/en, under 102 KB, presentation tables, alt and sizes on
images, AA contrast, labels in ten languages). Screenshots: `node scripts/mail/capture-templates.mjs`
(desktop, 375 px and dark into `docs/email-directions/templates/`).

**Languages:** labels, sample content and Studio words in all ten languages. Spanish and
English are written inline as `x('es', 'en')`; the other eight are in `editorial/content/<lang>.json`,
keyed by the English text (`node scripts/mail/extract-content.mjs <out.json>` lists the keys;
the test fails when one is missing or a `{{placeholder}}` differs).

**Not done yet:** real viewer captures
need an image endpoint (today a sample image in `public/images/mail/`); nothing sends
(`MAIL_LIVE` is false); not tested in real Outlook, Gmail or Apple Mail, only in Chromium.
