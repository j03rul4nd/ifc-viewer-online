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
