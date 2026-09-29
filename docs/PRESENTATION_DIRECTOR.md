# Presentation director

Generates finished presentation clips from the loaded IFC models, from templates
("recipes") the user can adjust and save. Output lands in Clip Studio as an
ordinary, editable timeline — or, for a batch, one MP4 per model.

## Pieces

| File | Role |
|---|---|
| `src/lib/director/recipe.ts` | Recipe type, 6 built-in templates, `sanitizeRecipe`, `tourVideoRecipe` |
| `src/lib/director/storage.ts` | User templates in `localStorage` (`ifc-director-recipes:v1`), sanitised on read |
| `src/lib/director/systems.ts` | IFC classes → structure / envelope / MEP / interiors |
| `src/lib/director/facts.ts` | Reads what the models really contain: storeys (`viewer.getStoreys`, falls back to the validator's tree), systems, validation findings, the current tour, the selection |
| `src/lib/director/plan.ts` | **Pure planner**: recipe + facts → shots, durations, scene state per shot, captions |
| `src/lib/director/run.ts` | Executes a plan: sets up the scene per shot (hide models / isolate / highlight), renders, restores, builds the project; batch export |
| `src/lib/director/generate.ts` | facts → plan → run in one call |
| `src/components/studio/StudioDirector.tsx` | Template picker + editor (uses `Modal`) |

## Rules the planner keeps

- **Nothing invented.** A section with no data (no storeys, no findings, no tour) produces no shot.
  The editor shows what each section will yield for the loaded models before generating.
- **Timing.** Shot lengths within the pace's bounds; on the beat, whole beats per shot with the
  outgoing shot extended by the transition overlap so the *cut* lands on the beat, and beats given
  back until the clip is within one beat of the target. When time is short, multi-shot sections
  (storeys, systems…) lose shots first; hero and closing are kept.
- **Storeys** bottom to top, spread evenly when capped (ground and roof always kept), shown isolated.
  **Findings** are always shown highlighted in context, never isolated.
- **Health Score** only printed when ≥ 70.
- **Vertical formats** keep text out of the bottom band; the stats line moves to the second shot.
- **Several models:** `combined` (one clip of the federation), `sequence` (each model alone, then
  all together), `separate` (one MP4 per model, downloaded one after another). A federation is
  named by the shared prefix of its file names.

## Tours

- The tour player has **Autoplay** (6 s per stop, stops at the last one) and **Turn into a video**,
  which renders the stops as a fly-through (`path` shot: Catmull-Rom through the stops, time shared
  by distance) inside Clip Studio.
- Clip Studio picks the request up through `clipStudioStore.requestGenerate`.

## Verified in the browser

Torre Poblenou (18 storeys read without validating), Poblenou A/M/S federation in sequence mode,
tour → video from the player, MP4 export. Batch download (`separate`) is covered by the planner
tests but was not run end to end in the browser pane.

## Review videos (2026-09-24)

- **Sections** `ids` (failed IDS specs), `bcf` (topics from their own viewpoint; components by GlobalId, or the model the camera looks at), `fixed` (previous validation run vs current, elements found again by GlobalId).
- **Details** (`captions.details`): affected elements, how to fix (remediation corpus), BCF status/priority/assignee, shown top-left under each finding. The fixes summary ("12 fixed · Health Score 71 → 86") opens the first fix shot.
- **Groups** (`multiModel: 'groups'`): models grouped by IfcBuilding name (discipline files share it), else project name without its " - discipline" tail. Each group alone, then everything.
- Built-ins: *Issues for the team*, *What was fixed*, *Projects together*.

## Sections and measurements

- `viewer.setSectionBox(box, margin)` — six hidden managed clip planes (not listed as user planes); `viewer.setLevelCut(y)` — one horizontal plane, moved live by the section panel's slider.
- Measurement panel: size of the selection (axis-aligned box), totals, copy as tab-separated table.

## Launch 2026 edit style (`recipe.style = 'launch'`)

From the 2026 launch-video grammar (Raycast/Framer/Vercel-style launches, short-form social):
- **Speed ramp** (`easing: 'ramp'`): fast in, slow through the middle, fast out — on orbit/focus/flyby/crane/topDown.
- **Motion blur**: `renderShot({ motionBlur: n })` averages n sub-frames over a 180° shutter; used at 3 on fast launch cuts.
- **Beat punch**: `project.fx.punch` — the picture (not the text) jumps in 5.5 % on every cut and each bar's downbeat, decays in ~0.14 s (`punchScale`).
- **Kinetic text**: `slam` titles/CTA, `count` numbers (format kept, denominators untouched), `words` labels; the hook title lands at 0.12 s.
- Templates: *Launch 2026 · vertical* (Reel, 16 s, whip) and *Launch 2026 · 16:9* (24 s, zoom).

## Sound effects (`recipe.sfx`: off · subtle · full)

- `src/lib/capture/sfx.ts`: whoosh, hit, riser, boom, tick — synthesised with OfflineAudioContext (seeded noise, cached per sample rate), no audio files, no licences.
- `project.sfx = { cues, volume }`; `cueAt(kind, at)` places a cue so its audible moment (whoosh peak, riser end) lands on `at`.
- Director (`planSfx`): whoosh on every cut; *full* adds a hit on slammed titles/CTA, ticks as words land, a riser into the last shot, a boom when the building finishes rising.
- Export mixes music + effects through a limiter (`masterBus`), preview plays them live from the playhead. Verified: peaks land on the cues, no clipping with music.

## Zoom through / pull-out

- `ShotSpec.pathTiming: 'even'` + `zoomKeyframes()` (geometrically spaced distances) = exponential "infinite" zoom with constant apparent speed.
- `zoomThrough`: accelerating push (`easeIn`) from outside, through the facade, into the middle storey — the next storey shot (a single pick is the middle one) continues from there.
- `pullOut`: from ~1 m off the selected element, or the middle storey's facade, back to the whole building (linear on the geometric path).
- Both are in the Launch 2026 templates: pullOut → buildup → zoomThrough → storey → systems → closing.

## End card (`endCard` section)

- `src/lib/capture/endcard.ts`: 2D canvas card — three gradient blobs drifting over near-black, the title slamming in, stats line, a white URL pill rising at 0.35 s with a light sweep at 0.9 s. Encoded like any shot (2.5 s at 1080×1920 ≈ 1.5 s to render).
- `PlannedShot.card` — `run.ts` renders it instead of a 3D shot; the CTA lower-third is skipped (the card carries the URL); full SFX puts a hit + boom under it.
- Launch 2026 templates end on it.

## Looks — art direction (`recipe.look`)

`src/lib/director/looks.ts`. One choice sets five things that agree: model paint per system (`viewer.applyModelPalette`, matte, translucent glass), scene backdrop (and the ground grid hidden), film grade (`src/lib/capture/grade.ts`: tone curve via canvas filter, split tone, vignette, animated grain, 2.39 letterbox on landscape), typography (Geist / Instrument Serif / Geist Mono, ink + muted, case; dark ink gets light plates) and one complementary accent (lower-third bar, URL sweep, end-card blobs). With a look, the title sits in the sky above the building, never on it.

Looks (2026 references): Cloud Dancer (Pantone 2026 — clay on warm paper, serif, terracotta), Transformative Teal (WGSN/Coloro 2026, persimmon accent), Plum Noir (Pinterest 2026, wasabi, letterbox), Brutalist (light concrete on charcoal, grayscale), Blueprint (navy, mono, cyan), Golden hour (sand under sunset, orange/teal, letterbox). Templates: Editorial clay, Teal & persimmon, Plum noir film, Brutalist reel, Blueprint, Golden hour.

The scene is restored after the render (models' own materials, the user's backdrop and grid, the validation overlay). Contrast is tested (ink on card ≥ 4.5:1; building vs backdrop).
- **Light per look** (`viewer.setLighting`): sky/ground ambient, a key "sun" (colour, strength, azimuth, elevation) and an opposite fill — soft studio for clay, raking warm key for Plum Noir, hard overhead for Brutalist, flat cool for Blueprint, low warm sun for Golden hour. Restored after the render.
- With letterbox, titles are laid out inside the picture area, not on the bars.
- Not used: the viewer's AO/edges post-processing is WebGL-only and is off on WebGPU, so looks do not depend on it.
- **Restyle after generating**: the project panel's look picker (`restyleProject`) re-grades and re-styles the titles instantly, undoable; the 3D shots keep their paint and light (re-generate to repaint).
- **Dive between projects**: in *By project* with `zoomThrough` in the recipe, an exponential zoom from the whole set into each project precedes its shots (everything visible). *By project* and *One by one* now keep the end card.
- **Look preview** (`previewLook`): the template editor renders one still of the loaded model in the chosen look (paint, light, backdrop, grade, title) and restores the scene — see the look on this building before generating.

## Narrated subtitles (`captions.narration`)

- `src/lib/director/narration.ts`. The planner tags every shot with a typed `NarrationFact` (`intro`, `rise`, `footprint`, `storey`, `system`, `issue`, `ids`, `fixed`, `bcf`, `detail`, `inside`, `context`, `closing`) whose numbers come from the model facts only: element and storey counts, height and footprint from the bounds, a system's share of the elements, the Health Score only when ≥ 70.
- `PlanStrings.narrate` turns a fact into one localised sentence (`studio.director.say.*`, 10 languages); `subtitleCues` cuts it into cues: ≤ 44 characters (30 on vertical), broken at clause marks, then at the space nearest the middle, never a lone word; at least 1 s per cue; sentences dropped from the end when they cannot be read at 17 characters/s. A dot inside a number ("19.241") is not the end of a sentence.
- Placement: bottom-centre caption pill (mid-centre on vertical, clear of the feed UI), the look's ink. It replaces the per-shot labels and the stats line; the CTA keeps the last shot; end cards say nothing.
- Voice: not included. `speechSynthesis` plays straight to the speakers, with no stream the MP4 mixer can capture, so the text track is subtitles only.

## Section shots (`sectionCut`, `sectionSweep`)

- `ShotScene.cut = { normal, points, stepped }`: `run.ts` sets the cut once with `viewer.setPresentationSection` (poché in the look's accent, `#c8553d` without a look), moves it every frame with `viewer.movePresentationSection(cutPointAt(points, t / duration, stepped))` (synchronous — just the plane), and removes it when the shot ends. Part of the shot cache key.
- **sectionCut** (≥ 2 storeys): a plan cut from above the roof down through up to 6 storeys (spread, top to bottom), at 1.2 m above each floor (less on low storeys); stepped — glides to each level in 40 % of its segment and holds so every plan reads. Orbit at 50° elevation.
- **sectionSweep**: a vertical plane across the long side, from just outside the building to 60 % through, the camera on the removed side looking at the cut face.
- Narration: "Cut from Roof down to Foundation: 6 plans." / "A vertical cut across 68 m of building."
- Verified on Torre Poblenou (MP4 frames): the roof opens, the ground-floor plan with columns and core in poché, the sweep showing all slabs; the scene is whole again afterwards.
- Templates: Blueprint (storey cut + sweep), Launch 2026 16:9 (storey cut, instead of the closing turn), Brutalist reel and Plum noir film (sweep).

## Exploded view (`exploded`)

- Fragments cannot move single elements, so the explosion is rendered, not modelled: `viewer.setShotExplode({ bands, offsets })` makes `renderShotFrame` draw one pass per band — every model lifted by the band's offset and clipped to its (lifted) y-range by two planes — over ONE depth buffer (autoClear off, the colour background only on the first pass, since it clears). Floors occlude each other correctly; positions and planes are restored after every frame. Only shot frames honour it; `endShotRender` clears it.
- `explodeBands(storeys, 8)`: contiguous bands, each starting 5 cm under its first storey's floor so the slab travels with it; lowest and highest open-ended. `explodeOffsets(n, gap, p)`: apart over 10–45 %, held, back together over 70–95 %; gap = 0.9 × height / bands. The orbit frames the building at its tallest, exploded.
- Needs ≥ 3 storeys. Narration: "18 storeys, pulled apart and put back together."
- Verified on Torre Poblenou (native and Cloud Dancer): 8 bands, backdrop intact, cost ≈ one render pass per band (8 s shot at 1080p ≈ 40 s).
- Templates: Editorial clay (after the build-up), Teal & persimmon (instead of the build-up).
- Not done: exploding by system or by discipline model (models side by side) — the same pass mechanism would take a per-model offset.

## Motion pass (2026-09-29)

Borrowed from 2026 motion-graphics grammar (one accent over neutrals, masked word rolls, a technical interface frame, a travelling dot that ties the shots together) — applied to real model data, nothing decorative.

- **Text**: titles always in the sky (`top-center`), never on the building. `TextOverlay.yFrac` places a card's centre at a fraction of the height: vertical subtitles sit at 72 %, above the feed's UI and under the building's middle. New anim **`roll`** (letters rise through a per-line mask, 22 ms stagger, 0.3 s each, out through the top) — the launch style's subtitles. Subtitles break at `: ` first.
- **HUD** (`recipe.hud`, `project.hud`, `src/lib/capture/hud.ts`): corner mono type (project · subject), shot counter `03/07`, live detail (the height of a horizontal cut, printed every frame; storey `L 3/18`; system share), a timeline with a tick per shot and an accent dot. Stops where the end card starts; vertical formats put the timeline at the top. On in Launch 2026 ×2 and Blueprint.
- **`plans`**: typical storeys (`typicalStoreys`: no near-empty foundation or roof slab) cut at plan height, the camera settling at 62° close on that floor. Narration says the rooms when there are ≥ 2 IfcSpace, else the elements.
- **`interior`**: eye height (1.6 m over the room's own floor — the storey box starts lower and put the eye in the slab) inside the largest IfcSpace of a middle storey, a slow dolly along the long side with a pan across the far end, 72° lens. `clearLine` picks the parallel route nearest the middle that clears every column/wall/stair of that storey by 0.5 m (their boxes gathered in facts). No cut: the slab above is the ceiling (a cut showed the backdrop).
- Rooms: IfcSpace per storey from containment, else placed by box height (Torre Poblenou: one open-plan space per floor, not listed under the storeys). The category is matched by `id` (`IFCSPACE`); its `label` is "Spaces".
- Client walkthrough template: hero → tour → plans → interior → aerial → closing.
- Known: the slab underside reads dark in the interior (the viewer's key light is from above).
