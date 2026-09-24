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
