# Cover Studio — research and roadmap (2026-09)

What makes a presentation actually useful for **students** (juries, crits) and **studios** (clients, competitions, social), and how the Cover Studio answers it. Code: `src/lib/cover/`, `src/components/CoverStudioModal.tsx`.

## What the research says

**Juries and clients read a board in seconds.** They don't read it line by line, so the layout has to do the guiding:

- **Grid first.** Use 3–4 columns and leave white space. More density doesn't mean more quality.
- **Hero in the upper-left**, where the eye lands first.
- **Group related drawings** (plans, sections and elevations of the same part next to each other) so they can be cross-read.
- **Tell a story, don't just decorate.** Explain *why* each decision was made, not only *what* the final form is. A short concept paragraph does more than a wall of renders.
- **Few, cohesive boards win.** Five coherent boards beat fifteen chaotic ones.
- **Hybrid visuals.** Mix clean technical drawings, simple diagrams and a few renders. Beyond photorealism, 2026 favours clay/white models, diagrammatic line work, collage, and cinematic sequences over isolated hero images.
- **Screens come first.** Boards are seen on screens more than printed, so aspect ratios and typography have to survive a phone screen.

Sources: [illustrarch — presentation boards](https://illustrarch.com/articles/architectural-presentation/14040-successful-architectural-presentation-boards-3.html), [illustrarch — board design & layout](https://illustrarch.com/articles/architectural-presentation/11097-successful-architectural-presentation-boards.html), [learnarchitecture — jury tips](https://learnarchitecture.net/articles/32828-architecture-jury-presentation-tip.html), [Chaos — archviz trends 2026](https://blog.chaos.com/top-7-trends-in-archviz-you-cant-ignore), [myarchitectai — 12 rendering styles 2026](https://www.myarchitectai.com/blog/rendering-styles), [Golden Vision — beyond realism 2026](https://goldenstudio.org/architectural-rendering-styles).

## How this maps to the product

| Finding | What we built |
|---|---|
| Hero upper-left, grouped drawings, concept + numbers | **Competition board** template: hero, three secondary views with numbered captions, concept paragraph, stat row. A1 ratio (`board` format). |
| Narrative sequence instead of isolated images | **Sequence** template: numbered strip, 01 → 04. |
| Clay / line / diagrammatic / cinematic styles | **Render styles** applied to the real 3D scene: white model, line drawing, spotlight, x-ray, blueprint, noir, duotone. The **style pack** captures one view in six styles, and the **Style study** template lays them out. |
| Explaining a specific system (structure, MEP) | **Highlighted element** + x-ray or spotlight, and the **Element sheet** template (count, share of the model, context view). |
| Why, not just what | **Concept** field, used by board and element sheet. |
| Screen-first, social | Formats: 16:9, A4, A1, LinkedIn/IG 4:5, 1:1, 9:16. |
| Decks people actually edit | PPTX with **editable text boxes** over a text-free background. |

## Studio v2 — personal, practical, shareable (2026-09-25)

What people asked for after v1: "more useful, more personal, easier, Pinterest-ready, professional". What that turned into:

| Ask | What we built | Where |
|---|---|---|
| Easy: start from the job, not a template | **Quick starts** — Pinterest pin, carousel, social post, story, client deck, competition board, project sheet. One click sets format, template, deck shape, finish and light, and captures only the views the layout is missing (the automatic first capture is replaced, the user's own shots are kept). | `lib/cover/recipes.ts` |
| Pinterest / aesthetic | 8 new templates: **moodboard** (prints, washi tape, colour story), **colour story** (hero + 5 sampled colours with hex), **polaroid** (instant prints, film date stamp), **minimal**, **statement** (the idea in one sentence), **magazine** (masthead + cover lines), **project sheet**, **diptych**. Pinterest 2:3 and 1:2.1 formats, A1 landscape. Gallery filed by Social / Editorial / Professional. | `templates-aesthetic.ts`, `templates-pro.ts`, `formats.ts` |
| Realistic | **Light**: studio, morning, midday, golden hour, overcast, blue hour — key/fill/ambient plus a matching sky backdrop, and a sun-direction slider. Same `setLighting(SceneLighting)` API as the Director on `main`. **Photo finish**: exposure, contrast, saturation, warmth, fade (matte blacks), vignette, grain, with 8 presets. | `lighting.ts`, `grade.ts`, `viewer.setLighting` |
| Personal | **Colours**: 12 palettes (6 new), your brand colours (three picks → a legible palette, text nudged to 7:1), or **colours from the image** (light/dark). **Type pairings** from the three self-hosted families (grotesk, editorial, italic, technical mono), all caps, title size. **Background texture** (paper, grain, grid, dots). **Framing per view** (pan + zoom, drag or sliders). **Saved styles** (house style reused across projects). | `color.ts`, `design.ts`, `ShotTile.tsx`, `doc.ts` |
| Professional | **Project data**: measured from the model (storeys, height, footprint, elements, Health Score) plus your own lines (built area, status…); nothing estimated. **QR code** to the website. **Health Score toggle** — starts hidden below 70 (the badge's honesty bar). Deck gains a **project sheet**, a **statement** slide, **2–4 views per slide**, and **hideable slides** keyed by shot id. | `facts.ts`, `qr.ts`, `deck.ts` |
| Viral | **Post text** written from the fields, per platform (Pinterest ≤ 500 chars, LinkedIn ≤ 5 tags, Instagram a dozen), editable before copying. **Share** straight to the OS share sheet (phone → Pinterest/Instagram) where the browser supports files. Carousels export as the PDF LinkedIn wants. | `caption.ts`, `exporters.ts` |
| Pro editor habits | **Undo / redo** (Ctrl+Z / Ctrl+Shift+Z) over the whole document; typing and slider drags fold into one step. Four tabs: Design · Views · Text · Slides. | `useHistory.ts` |

How the layers stack at render time: `renderSlide` runs inside `withDesign(spec.design)`, so every template reaches the type pairing, title case/scale and texture through the kit (`template-kit.ts`: `fitTitle`, `ground`, `drawShot`) without its signature changing. The photo finish is split: tone/colour is baked into each shot's pixels once per setting (cached, full resolution, the export waits for it), vignette and grain are drawn over each frame so they follow the crop.

Verified in the real app (headless Chromium over the dev server): every quick start runs end to end — the board produced hero + long section + plan + line elevation with the model's measured storeys/height/elements; the client deck exported a 12-slide PPTX with editable text (plans named from the IFC) and a PDF; the Spanish UI and the post text; framing editor. All 20 templates were rendered in 6 formats with a reference image to check overlaps.

**Why owning the scene matters.** A screenshot tool can only crop. We can repaint every element (clay), ghost the context and keep one category solid, swap the backdrop, and frame the building's real bounding box. Nobody else can do that from an IFC.

## Roadmap (next, ordered by value)

1. ~~Section cuts~~ — **done**: plan / long / cross section at any position, with the cut solids in poché and a square-on + cutaway-axonometric pair (`lib/cover/cuts.ts`, `viewer.setPresentationSection`).
2. ~~Exploded axonometric~~ — **done**: storeys from the spatial tree, merged across models by elevation, banded to ≤ 7 layers, one render per band stacked bottom-up (`viewer.captureExplodedLayers`). Works with every render style.
3. ~~Storey plans~~ — **done**: each storey isolated, cut 1.2 m above its floor (below the next slab) with poché, seen from above at the same distance for every floor so the set shares one scale. Tall towers are sampled evenly (≤ 12 plans). Names come from the IFC.
4. ~~Hi-res capture~~ — **done**: 1× / 2× / 4× of the on-screen resolution for every capture (views, cuts, plans, exploded), capped at the GPU render-buffer limit (≤ 8192 px). The CSS size is untouched, so framing doesn't change; the live view is restored right after.
5. **Multi-model boards.** Architecture vs. structure vs. MEP, one look each, from the federated set.
6. **Shareable cover link.** Publish a cover with the Health Score and a live-viewer link (viral loop, ties into the badge moat). The QR slot is already there; it needs a public URL for the model.
7. **Collage layer.** Sky, people and trees cut-outs over the white model (2026's collage trend).
8. **Speaker notes in the PPTX.** The deck text is editable; notes need the notes master parts (PowerPoint is strict about them — test with PowerPoint, not only python-pptx).
9. **Instagram seamless carousel.** One wide image split across 4:5 slides so the swipe reads as a panorama.
10. **More faces.** Only Geist / Geist Mono / Instrument Serif are self-hosted (GDPR); a new pairing means shipping its woff2 in `public/fonts`, not a CDN.

## Known limits

- Poché uses back faces: exact for closed solids. Open or single-sided geometry (some plates, curtain-wall panels) shows no fill at the cut.
- The exploded view needs a spatial tree with storeys. Models with everything in one storey can't be pulled apart; the UI says so.
- Hi-res needs GPU memory: 4× of a 4K screen hits the 8192-px cap, and each shot is held in memory while the studio is open.
- The PPTX substitutes Arial / Georgia / Consolas for Geist / Instrument Serif / Geist Mono, and each block is scaled so it keeps its width. The background image carries the exact design; the text boxes are for editing.
- Spotlight shows a category in colour on a solid white model, so elements hidden inside (e.g. columns behind a curtain wall) won't show. Use x-ray for those.
- Light changes shading (Lambert materials) and the sky backdrop; it doesn't cast new shadows on the model. Line/blueprint/duotone/noir looks keep their own paper — the sky only goes behind as-is, white model and spotlight.
- "Footprint" is the box of the physical elements (longest × shortest side), not the built outline. It is off by default for that reason.
- Storeys come from the spatial tree; the studio re-measures when the tree lands after it opened.
- Share needs a browser that shares files (`navigator.canShare({ files })`): phones, Safari, Edge. Elsewhere the button isn't shown.
