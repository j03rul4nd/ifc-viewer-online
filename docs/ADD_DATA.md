# Add data: one door for everything that is not the IFC

Decision record: DECISIONS.md D-34. Code: `src/components/data/`,
`src/lib/loading/drop-plan.ts`, `src/lib/loading/add-data-catalogue.ts`.

## Who it is for

The twin assembler: the BIM coordinator or surveyor who brings a federated IFC
together with a scan, site footage, a GeoJSON of the street and a few live
sensors. Before this, every one of those hid behind an unlabelled 18px caret
next to Open, a dropped video or E57 answered "not a supported format", and a
phone with an empty scene had no way in at all.

## The doors

| Where | What |
| --- | --- |
| Top bar | **Open** stays the IFC door (one click to the IFC review). Right after it, **+ Add data**: a secondary button, labelled from 1280px (xl), a 28px "+" with tooltip below that (the pre-decided fallback: at 1024px the labelled button overflowed the bar). Enabled on an empty scene and during validation runs. |
| Open ▾ | Open IFC file…, Demo models, Open scene file…, then *Add data…* |
| Phone | A 44px glass "+" capsule beside the model capsule, always present. |
| Upload dialog | "Scans, video, 3D models or map layers? Add data" closes it and opens the hub. |
| Anywhere | Drag files over the window. |

All of them open the same hub.

## The hub

A `Modal` (size `lg`, 860px; a bottom sheet on phones through `.m-sheet`), not a
popover anchored to the button:

- it is a one-shot chooser that closes itself on every action and hands off to
  a panel, the IFC review or the scene opener, so it hides nothing the user
  needs while choosing (NN/g: modals for short, user-started, focused choices);
- 7–8 cards and a drop zone (about 860x600) do not fit the anchored menu shell
  and cannot hang off a 28px button;
- `Modal` brings the focus trap, the accessible name and Escape ownership
  through the modal stack. Side effect, accepted: opening it closes the open
  floating panel (`pushModal`), like every other dialog.

Content, top to bottom: a dashed drop zone with *Choose files…* (desktop) or one
44px *Choose files…* button (phone), then intent-ordered cards from
`addDataCatalogue(flags)`:

| Group | Card | Primary | Secondary |
| --- | --- | --- | --- |
| Reality capture | Point cloud | Choose files… | Samples (`openDataSamples`) |
| Reality capture | 3D video | Choose files… | Camera, screen & demo (panel) |
| Models | IFC model | Choose files… (IFC review) | Demo models |
| Models | 3D model (flag) | Choose files… | Samples |
| Map & live data | Map & terrain (flag) | Set up the map — needs an IFC | — |
| Map & live data | Data layers | Choose files… | URL, WFS & live feeds (panel) |
| Map & live data | Live devices | Connect a source (panel) | — |
| Scenes | Scene file | Choose a file… (replaces the scene) | — |

Flag-off cards are not rendered (7 with the `.env.example` defaults). Format
codes come from the extension tables, so they cannot drift and are not
translated. Once a kind is loaded its card shows "N in the scene · Open panel".

Picks route like drops (same duplicate detection, same "scans wait for the IFC
review"), except Data layers (CSV / plain .json would route elsewhere by
extension, so they go straight to the layers queue and a shared layer setup
imports as a setup) and Scene file (opened directly: picking one is deliberate).

## Drop routing

`classifyFiles` (extensions only, entry chunk) → `planDrop(files, caps)`:

| Bucket | Extensions | Goes to |
| --- | --- | --- |
| ifc | .ifc | Upload dialog (review) |
| ids | .ids (first one) | IDS flow |
| bcf | .bcf .bcfzip | hint toast |
| pointcloud | .las .laz .copc .ply .pcd .xyz .pts .csv .asc .txt | loading queue |
| mesh | .glb .gltf .obj + .bin .mtl + textures | loading queue (flag) |
| video | .mp4 .m4v .mov .webm .ogv .ogg | 3D video queue (flag, not client mode) |
| vector | .geojson | Data layers queue |
| weather | .epw, a `.zip` whose name carries TMY/CWEC/IWEC/EPW | solar analysis panel (flag, not client mode; needs a model or an IFC in the drop) |
| scene | `*.scene.json` (suffix, checked first) | scene opener (not in embeds) |
| deferred | .e57 → `pointcloud:unsupported.e57`; .rcp .rcs .fls .zfs → `unsupported.proprietary` | specific advice toast |

Everything else, flag-off kinds, extra IDS/scene files and sidecar-only mesh
picks are `unsupported`. The generic warning appears only when nothing was
routed; when a summary toast is shown anyway, " · N files skipped" is appended
to it. A README next to an IFC, a clip or a scene file stays out of the scans.

## After the drop

`followUp(plan, { interactive })`, interactive = full toolbar, not client mode,
not a quiet preset:

- one kind → open its panel;
- several kinds → if data layers are among them, the layers panel opens (it
  must mount to read its queue) and the rest get one "Adding to the scene: …"
  toast whose Show opens the first other kind; otherwise the toast's Show opens
  the first kind (order: point cloud, 3D model, 3D video, layers);
- held for the IFC review (IFC in the drop, or the dialog already open):
  "x will be added after the IFC review", then "Adding to the scene: …" with
  Show when the dialog closes.

## Scene files

Opening a scene reloads the viewer on it. A dropped `.scene.json` opens at once
only on an empty scene with the upload dialog closed; otherwise a persistent
warning toast asks ("Opening "plaza.scene.json" replaces the current scene.",
*Open scene*). In a mixed drop it is handled alone and the other files are not
loaded ("A scene file opens on its own…").

## The drag overlay

`DropOverlay` (route level, `absolute inset-0`, `pointer-events-none`, never
inside `[data-viewer-area]`) shows "Drop to add to the scene", the file count
and the format legend. Browsers hide names until the drop, so it never predicts
per file. `createFileDragTracker` counts enter/leave depth for file drags only,
resets on capture-phase drop/dragend, on leaving the window (null relatedTarget
AND pointer outside the viewport — Safari nulls it on every leave) and after
1000ms without a dragover (dragover arrives every ~350ms ±200ms; shorter
flickers). It never calls preventDefault; App's handler keeps that job.

## Rail: app-only ids

Data layers and 3D video are rail entries (`RailId = PanelId | 'layers' |
'video'`, appended after `mesh` in `RAIL_ORDER`) but NOT host panels: PanelId,
`ALL_PANEL_IDS` and the SDK's `PanelName` are frozen with SDK 1.18. Host
allowlists never yield them, `get-panels` filters them out (`isHostPanel`) and
`open-panel` / `set-panels` ignore them. Promoting them is an SDK version bump
(PanelName, the generated `/sdk` docs ×10, SRI pins).

## Menus follow content, not the validation run

View ▾ opens for any scene content (Tree and Legend need an IFC); Tools ▾,
Share ▾ and the compact Measure need an IFC; Validate and Check › IDS keep
`canRun`. Device sources are not "content": they persist in
`ifc-twin-devices:v1` and would make an empty canvas count as populated.

## Analytics (INV-5)

Cookieless, enum-only, through `track()`:

- `add_data_opened {from: toolbar | open_menu | mobile | upload_dialog}`
- `data_added {kind: ifc | pointcloud | mesh | video | layers | scene | ids, via: drop | hub | menu, files: 1 | 2-5 | 6+}` — "handed to a loader or the review", not "loaded"; the scene event is best-effort (the page reloads)
- `data_refused {reason: e57 | proprietary | unsupported | flag_off, via}`

Never names, sizes, URLs or coordinates.

## Not in this

Paste-a-link row, keyboard shortcuts, an empty-scene card, Capture for
scan-only scenes, content sniffing of CSV/JSON, `.twin.json` routing, and
promoting the app-only rail ids to the SDK.

## Folders and archives

A drop (or the hub's "Choose folder…") can be a whole project. Before routing,
`lib/loading/expand-drop.ts` turns it into plain files, all in the browser:

- **Folders** are walked recursively (`webkitGetAsEntry`, captured inside the
  drop handler — the DataTransfer is empty once it returns).
- **Archives**: `.zip` (nested up to 3 levels), `.ifczip` (the IFC inside is
  named after the archive), `.gz` / `.tgz`, `.tar`. fflate, lazy-loaded.
- **RAR / 7z** open through 7-Zip compiled to WASM (`7z-wasm`, ~1.6 MB,
  `lib/loading/sevenzip.ts`), imported only when one is dropped. Their files go
  through the same path as a zip's (junk filter, caps, nested archives). A
  password-protected archive fails with its own toast ("extract it on your
  computer"); there is no password prompt.
- **xz / bz2 / zst** are recognised and named in a toast ("save as .zip or drop
  the folder"), not opened.
- Junk is dropped (`__MACOSX`, dotfiles, `Thumbs.db`); expansion stops at
  4 GB / 5,000 files with a warning.

Then everything goes through `planDrop` as usual: IFCs to the import dialog,
scans, meshes, GeoJSON layers, IDS, BCF, weather, video and scene files to
their own subsystems.
