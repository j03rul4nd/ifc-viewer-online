# IFC Viewer SDK

Embed the viewer in a **CDE, digital twin, or internal project tool** and load IFC
data straight from your own app. Model processing stays in the visitor's browser —
**no upload backend, nothing sent to our servers**.

The SDK is a tiny (~6 KB) dependency-free ES module. Under the hood it mounts the
app in an `<iframe>` (embed mode) and streams your IFC bytes to it over
`postMessage` with a transferable `ArrayBuffer`, so the heavy three.js / web-ifc /
WASM weight is loaded by the iframe, not your bundle.

- Source: `src/sdk/ifc-viewer-sdk.ts`
- Build: `npm run build:sdk` → `public/sdk/ifc-viewer.es.js`, the same file pinned at
  `public/sdk/<version>/ifc-viewer.es.js`, and `public/sdk/versions.json` (also runs as part of `npm run build`)
- Live demo + web docs: `/<base>/sdk/` (served from `public/sdk/index.html`)

> **Pin a version in production:** `https://www.ifcvieweronline.eu/sdk/1.17.0/ifc-viewer.es.js`.
> See [Versions, caching and compatibility](#versions-caching-and-compatibility).

## Quick start

```html
<div id="viewer" style="height:520px"></div>
<script type="module">
  import { IfcViewer } from "https://<your-host>/sdk/ifc-viewer.es.js";

  const viewer = new IfcViewer("#viewer");

  // Load IFC bytes from your app or CDE — nothing is uploaded
  const bytes = await fetch("/models/project.ifc").then(r => r.arrayBuffer());
  await viewer.add("project.ifc", bytes);
</script>
```

The SDK auto-discovers the app URL relative to its own script location — the parent
of `sdk/`, from `sdk/ifc-viewer.es.js` and from a pinned `sdk/<version>/ifc-viewer.es.js`
alike — so self-hosting under `/<base>/sdk/` just works. Override with the `baseUrl`
option if you serve the app elsewhere.

### Even easier: the `<ifc-viewer>` web component

Zero JavaScript — drop a tag into any page or dashboard:

```html
<script type="module" src="https://<host>/sdk/ifc-viewer.es.js"></script>

<ifc-viewer model="https://your-cde.com/model.ifc" ui="minimal" accent="#22c55e"
            style="display:block;height:520px"></ifc-viewer>
```

Attributes: `model`, `ui`, `lang`, `accent`, `validate`, `panel`, `base-url`, and since
v1.17 `toolbar`, `tools`, `auto-frame`. Events are
re-dispatched as DOM `CustomEvent`s named `ifcviewer:<type>` (`detail` = payload), and
the underlying `IfcViewer` is on the element's `.viewer`:

```js
const el = document.querySelector("ifc-viewer")
el.addEventListener("ifcviewer:validation-completed", (e) => updateScore(e.detail.qualityScore))
const stats = await el.getStats()
```

### Or `await` a ready viewer

```js
const viewer = await IfcViewer.create("#viewer", { model: url })
```

## API

### `new IfcViewer(target, options?)`
`target`: CSS selector or `HTMLElement` to mount into. Options:

| Option     | Type                                  | Default     | Notes |
|------------|---------------------------------------|-------------|-------|
| `baseUrl`  | string                                | auto        | App base URL. Auto-derived from the script URL. |
| `ui`       | `'minimal'` \| `'full'` \| `'kiosk'` \| `'client'` \| `'article'` \| `'embed'` | `'minimal'` | Chrome preset. `client` is the stakeholder skin. `embed` (v1.17) is for a host app that supplies the file: 3D, properties on selection, a compact toolbar with Validate and Measure — no Open, Share, account or language. |
| `toolbar`  | boolean                               | preset      | Show the toolbar. `false` leaves the 3D view and the panels (v1.17). |
| `tools`    | `('validate' \| 'measure')[]`         | both        | The compact toolbar of `ui: 'embed'`; `[]` for none (v1.17). |
| `autoFrame` | boolean                              | `true`      | Frame the whole scene from iso, with a margin, every time a load settles. `false` leaves the camera where the loader puts it (v1.17). |
| `validate` | boolean                               | `true`      | Validate each model once it has loaded (drives the Health Score): `validation-started`, then `validation-completed` or `validation-failed`. Before v1.17 this flag was accepted but no validation ever ran for SDK loads. |
| `panel`    | boolean                               | `false`     | Auto-open the validation panel. |
| `lang`     | string                                | auto        | Force UI language (`en`, `es`, …). |
| `accent`   | `#rrggbb`                             | brand       | Tint the viewer to match your dashboard. |
| `height` / `width` | number \| string              | `'100%'`    | iframe size (number → px). |
| `model`    | string                                | —           | Auto-load this public IFC URL once ready. |
| `background` | preset \| `#rrggbb` \| `#top,#bottom` \| `{ top, bottom? }` | — | Scene background from the first frame (v1.11). Not saved as the visitor's preference. |
| `map`      | `true` \| `('terrain'\|'buildings'\|'showcase')[]` | — | Put the model on the map once it loads (v1.11). Your page declares tile consent — see [Presentation](#presentation-look-sun-map-v111). |
| `solar` / `moon` | `'MM-DDTHH:MM'` / boolean         | —           | Open the sun study at this site-local time once loaded (v1.11). |
| `scans`    | string[]                              | —           | Point cloud URLs to load alongside the model (v1.11). |
| `layers`   | string                                | —           | Data-layer setup to open: URL of a JSON exported from the Data layers panel — live sources, styles, groups, alerts; never keys. Mirrors `?layers=` (v1.16). Also `<ifc-viewer layers="…">`. |
| `loadTimeout` | number                             | `120000`    | Reject `add()`/`addFromUrl()` after N ms (`0` disables). A backstop: the viewer now answers every load it accepts with `model-loaded` or `model-error`, including parse failures and cancellations. |
| `onReady` / `onModelLoaded` / `onModelError` / `onProgress` | function | — | Convenience callbacks (same as `.on(...)`). |

### Methods
| Method | Description |
|--------|-------------|
| `add(name, bytes)` | Load IFC `ArrayBuffer`/`Uint8Array`. Returns `Promise<ModelLoadedEvent>`; rejects with the `model-error` message if the model fails to load or the load is cancelled. The buffer is transferred (detached) for zero-copy. |
| `addFromUrl(url, name?)` | Load a public, CORS-enabled IFC URL. Returns `Promise<ModelLoadedEvent>`, and rejects the same way. The download reports real byte progress. |
| `select(expressId \| globalId, modelId?)` | Select + frame an element by IFC expressID, or by GlobalId (v1.17; it also finds the model). |
| `isolate(ifcType?)` | Isolate a category (e.g. `"IfcWall"`); omit to clear. |
| `setView(view, scope?)` | Fly to a named view of the scene — `iso`·`front`·`back`·`left`·`right`·`top`·`bottom` — with all of it in frame. (Between v1.14 and v1.16 the viewer ignored it; fixed in v1.17.) |
| `frame(options?)` / `frame(elementId, modelId?, options?)` | `Promise<{ scope }>` — frame the scene tightly (v1.14), or one element (v1.17): from the current angle unless a view or angles are given; rejects when the element is not in the model. |
| `fit()` / `reset()` | Frame the active model from the current angle with a margin (v1.17; it was edge to edge) / reset the camera. |
| `showAll()` | Restore full visibility (clear hidden elements + isolation). |
| `setLanguage(lang)` | Change UI language at runtime. |
| `clear()` | Cancel IFC loads still in flight, then remove all loaded models. |
| `getLanguages()` | Supported language codes (reflects the iframe once ready). |
| `getModels()` | `Promise<ModelSummary[]>` — the loaded models (`{ id, fileName, elementCount }`). |
| `findElements({ ifcClass?, globalId?, name?, modelId?, limit? })` | `Promise<ElementSummary[]>` — `{ expressId, modelId, globalId, ifcClass, name, typeName }` per match, across the loaded models (v1.17). |
| `getElement(expressId \| globalId, modelId?)` | `Promise<IfcElementData \| null>` — attributes with the `globalId`, the element's property/quantity sets, and its **type**'s: `typeName`, `typeProperties` (with units), `effectivePropertySets`. See [Catalogue objects](#catalogue-objects-in-a-host-app-v117). |
| `validate(modelId?, { force? })` | `Promise<ValidationRunResult>` — validate now and resolve with that model's Health Score and counts (v1.17). |
| `getValidation()` | `Promise<ValidationSummary \| null>` — the result on screen; see [Validation lifecycle](#validation-lifecycle-v117). |
| `getValidationStatus()` | `Promise<ValidationStatus>` — `idle` · `running` (with progress) · `done` · `error` (v1.17). |
| `getStats()` | `Promise<StatsResult>` — per-category element counts per model (for charts). |
| `getIssues(opts?)` | `Promise<IssuesResult>` — validation issues for a table (`{ severity?, limit?, modelId? }`). |
| `checkIds(idsXml)` | `Promise<IdsResult>` — check the model against a buildingSMART **IDS** (`.ids` XML). |
| `checkEir(profile)` | `Promise<IdsResult>` — check the model against an **EIR** profile: an object, its JSON, or a built-in id such as `'builtin-en14351-1'` (v1.17; see [Declared performance](#declared-performance-en-14351-1-v117)). Same result shape as `checkIds`. |
| `screenshot()` | `Promise<string>` — the current 3D view as a PNG data URL. |
| `removeModel(modelId)` | Unload a specific model (see `getModels()`). |
| `hideElements(ids, modelId?)` / `showElements(ids, modelId?)` | Hide / show a set of elements by expressID (defaults to the active model). |
| `setCamera(position, direction)` | Place the camera at a point looking along a direction (both `{x,y,z}`). |
| `whenReady()` | `Promise<void>` that resolves when the viewer is ready. |
| `isReady` | Getter — `true` once ready. |
| `on(event, cb)` | Subscribe; returns an unsubscribe function. |
| `off(event, cb)` | Unsubscribe. |
| `dispose()` | Tear down and remove the iframe. |

Statics: `IfcViewer.LANGUAGES` (`{ code, label }[]`, native names) and `IfcViewer.SUPPORTED_LANGUAGES` (codes) — handy for building a language picker before the viewer is ready.

Each `add()`/`addFromUrl()` promise is correlated to its own load by request id, so an app-initiated load inside the iframe (a URL param, a user upload) never resolves your `add()` promise.

Inside the iframe, every load is a job in the viewer's loading queue ([`MODEL_LOADING.md`](./MODEL_LOADING.md)). The queue overlaps downloads, conversions and scene attaches, converts one model at a time, and attaches the **first-submitted** model first, because that model sets the scene's coordinate base. The iframe accepts concurrent loads. The SDK still sends your calls one after another, which keeps their order stable and costs nothing, since the queue would serialise the conversions anyway. Calling `add()` several times in a row is safe, and the models land in the order you called it.

### Events
| Event | Payload |
|-------|---------|
| `ready` | `{ languages }` — the viewer is mounted and ready |
| `model-progress` | `{ percent, phase }`. `phase` is `reading` (download / identify / cache check), `parsing` (conversion) or `uploading` (cache write / scene attach). `percent` never goes backwards for a load, even across an automatic retry. Sent only while that load is still in progress, at most every 250 ms. It is an estimate over the load's real phases, not a timer |
| `model-loaded` | `{ modelId, fileName, elementCount, fromCache }` |
| `validation-started` | `{ modelId }` — a validation began (after a load with `validate: true`, or `validate()`) (v1.17) |
| `validation-completed` | `{ qualityScore, errors, warnings, info, total, modelId }` — the Health Score; `modelId` is null for a federated aggregate (`total`, `modelId`: v1.17) |
| `validation-failed` | `{ modelId, message }` — it could not run or did not finish (v1.17) |
| `model-error` | `{ message, url?, name? }`. Sent for download failures, invalid or unparseable files, scene failures and cancelled loads (`message: 'Load cancelled'`). `url` for URL loads, `name` for byte/file loads |
| `element-selected` | `{ expressId, modelId, ifcType, name, globalId }` (`globalId`: v1.17) |
| `pointcloud-picked` | `{ cloudId, position, sourcePosition, classification, intensity, distance }` — armed with `inspectPointCloud()`. `sourcePosition` is the file's own coordinates, which is the number a survey record already holds |
| `map-feature-picked` | `{ id, name?, label?, featureKind, heightM?, heightEstimated }` — a building in the OpenStreetMap surroundings. Context, not model: never validated, never exported, and `heightEstimated` is true far more often than not |
| `walk-changed` | `{ active, speed }` — walk mode turned on or off, by the visitor (G / Esc) or the host (v1.11) |
| `measurements-changed` | `{ tool, units, items }` — a measurement was added, removed or renamed; carries the whole list (v1.11) |

## Presentation: look, sun, map (v1.11)

For blog posts and project pages. Every call goes through the same store or
panel as the visitor's own clicks, so the viewer's UI always agrees with what
the host set. All return promises and **reject with a readable reason** (no
model yet, feature not in this build, a model with no location…).

| Method | Description |
|--------|-------------|
| `setBackground(bg)` / `getBackground()` | A preset (`white`, `paper`, `blueprint`, `sky`, `studio`), `'#rrggbb'`, `'#top,#bottom'` or `{ top, bottom? }`. Not saved as the visitor's own preference (the iframe shares storage with the app). |
| `setAccent(color)` | Re-theme the UI accent at runtime. |
| `setClientMode(on)` | Stakeholder skin on/off — `ui: 'client'` at runtime. |
| `setRenderQuality('standard' \| 'quality')` | Heavier rendering for a hero shot. |
| `getCamera()` / `lookAt(position, target, animate?)` | The camera as data (`{ position, target, direction, up, fovDeg }`, scene metres, Y up) — build "saved views" in your own UI. |
| `setWalkMode(on, { speed? })` / `getWalkState()` | First-person walk (WASD, drag to look, Esc). Emits `walk-changed`. |
| `setSolar({ date?, time?, moon?, sky?, quality?, location?, active? })` / `getSolar()` | Real shadows at a **site-local** date/time (`date: 'MM-DD'` or `'YYYY-MM-DD'`, `time: 'HH:MM'`). The site comes from the IFC georeference, then the map placement; pass `location: { lat, lon }` for a model without one — the SDK never falls back to a default city. `active: false` stops the study. |
| `setSiteContext({ enabled?, terrain?, buildings?, layers?, detail?, terrainStyle?, exaggeration?, vehicles? })` / `getSiteContext()` | Map mode with terrain and OpenStreetMap surroundings. Resolves once they are up (the first OSM query for a place can take tens of seconds). `getSiteContext().attributions` must be shown wherever the map is. |

**Consent.** Map tiles, elevation and OpenStreetMap data come from third
parties, so the visitor's browser talks to them. `setSiteContext()` and the
`map` option are *your page* declaring that consent for its visitors; the
viewer does not show its own consent sheet inside someone else's page.

```js
const viewer = await IfcViewer.create('#viewer', {
  model: 'https://example.com/house.ifc',
  ui: 'client',
  background: 'white',
  map: ['terrain', 'buildings'],
  solar: '06-21T19:30',
})
// Change the story as the reader scrolls:
await viewer.setSolar({ date: '12-21', time: '09:30' })
```

## Tours and the presentation director (v1.12)

Tours are played by the viewer's own tour bar, so a tour the host starts looks
and behaves like one the visitor started: captions, arrows and the share link.
The director turns the model into an edited video. It is rendered and encoded
in the visitor's browser, and nothing is uploaded.

| Method | Description |
|--------|-------------|
| `startTour(template?, { autoplay?, title?, includeImprovements? })` | Starts a built-in tour: `social` (5 views), `client-walkthrough` (up to 10, client skin) or `technical-review` (walks the validation issues, worst first; needs validation to have run). |
| `playTour({ title?, steps }, { startAt?, autoplay? })` | Plays a tour you wrote. Each step is `{ position, target, caption?, highlight?: expressId[], isolate?: IfcClass[], modelId? }`, in scene metres with Y up. Take the positions from `getCamera()`. `autoplay: true` advances every 6 s; a number is ms per stop (1.5–120 s). The tour ends after the last stop. |
| `nextTourStep()` / `prevTourStep()` / `goToTourStep(i)` | Moves to another stop. |
| `setTourAutoplay(autoplay)` / `stopTour()` | Turns self-running on or off / stops the tour and gives the camera back. |
| `getTour()` | `{ playing, title, template, stepIndex, total, steps }`. `steps` is in the shape `playTour()` takes, so you can save a tour and replay it later. |
| `getPresentationRecipes()` | The built-in recipes: `{ id, name, format, targetSec, style, look, sections }`. |
| `createPresentation(recipe?, { format?, targetSec?, pace?, title?, cta?, captions?, music?: 'none', watermark? })` | Generates a presentation (shots planned from the IFC, captions, music) and opens Clip Studio with it, where it stays editable. Resolves when the shots are rendered, which takes tens of seconds to minutes. It also works in `kiosk` and `client`, which have no toolbar. |
| `exportPresentation({ resolution?: 720 \| 1080 \| 1440, music? })` | Encodes the presentation and resolves `{ bytes, mimeType, sizeBytes }`. The file is MP4, or WebM where the browser cannot encode MP4. The bytes are transferred, not copied. |
| `closePresentation()` | Closes Clip Studio. |

Events: `tour-started` `{ title, total, template }`, `tour-step` `{ index, total, caption }`,
`tour-ended` `{ completed }`, `presentation-progress` `{ stage: 'generate' | 'export', label?, progress }`.

```js
await viewer.playTour({ title: 'Casa Poblenou', steps: savedSteps }, { autoplay: 6000 })

await viewer.createPresentation('linkedin-teaser', { title: 'Casa Poblenou', targetSec: 20 })
const { bytes, mimeType } = await viewer.exportPresentation({ resolution: 1080 })
video.src = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
```

## Cover Studio and scene groups (v1.13)

| Method | Description |
|--------|-------------|
| `getCoverOptions()` | `{ recipes, templates, formats: [{ id, width, height, ratio }], palettes }`. |
| `createCover({ recipe?, template?, format?, palette?, text? })` | Opens Cover Studio (it stays editable) and runs the `recipe` if one is given (`pinterest`, `carousel`, `post`, `client`, `board`, `sheet`, `story`, `coordination`); the recipe captures the views it needs. It then applies the template, format and palette, plus `text: { title, subtitle, client, location, date, studio, tagline, concept, website }`. Resolves with `{ template, format, palette, mode, shots, slides, text }`. Also works in `kiosk` and `client`. |
| `getCover()` | The same state, or `null` when the studio is closed. |
| `exportCover({ type?, slide? })` | `png` / `jpeg` export one page (`slide`, 0-based). `pdf` / `pptx` export the whole document and `zip` every page. Resolves `{ bytes, mimeType, sizeBytes, slides }`; the bytes are transferred. |
| `closeCover()` | Closes the studio. |
| `getGroups()` | `{ groups: [{ id, name, user, basis, modelIds, cloudIds }], looseCloudIds }`. This is the same grouping the Scene panel shows: inferred from the IFC (project, site, location) plus the groups users made. |
| `createGroup(name, modelIds?)` | Creates a user group. Resolves with its id. Groups are remembered per file name on the visitor's device. |
| `renameGroup(id, name)` / `deleteGroup(id)` | Work on user groups only. Automatic groups reject with a reason. |
| `assignToGroup(itemId, groupId \| null \| 'loose')` | Moves a model or point cloud into a group. `null` hands it back to automatic grouping; `'loose'` keeps it in no group. |
| `setGroupVisible(id, visible)` / `isolateGroup(id \| null)` | Show or hide a whole group's models, or show only that group. |
| `frameGroup(id)` | Fits the camera to a group, hidden members included. |

## Presentation in articles (v1.14)

```js
const viewer = new IfcViewer('#figure', { ui: 'article', background: 'paper', validate: false })
await viewer.addFromUrl('https://example.com/pavilion.ifc')
await viewer.frame({ azimuth: 200, elevation: 32, fill: 0.8 })
```

| Option / method | Description |
|--------|-------------|
| `ui: 'article'` | The canvas alone — no toolbar, rail, info chip, validation bar, load indicator or toasts — plus `view: 'iso'` and `wheel: 'ctrl'`. Tool panels you open over the bridge still mount. |
| `view`, `fill` | Once every model has loaded, frame them from this view so the model fills `fill` (0.2–0.98, default 0.85) of the frame. |
| `wheel: 'ctrl'` | The wheel scrolls your page; Ctrl/⌘ + wheel (or a pinch) zooms. |
| `frame({ view?, scope?, fill?, azimuth?, elevation?, animate? })` | A tight fit to the box's corners, not its bounding sphere, from a preset or any angle (degrees). Resolves `{ scope }`. |

`kiosk` is the canvas only since 1.14, as it was always documented.

## The article kit (v1.15)

Everything a figure in a blog post needs, so the page around it stays light and still.

```js
const viewer = new IfcViewer('#figure', {
  ui: 'article',
  model: 'https://example.com/pavilion.ifc',
  lazy: true,                 // or 'visible': boot when the figure nears the screen
  poster: '/img/pavilion.jpg', posterTitle: 'The pavilion, live', launchLabel: 'Open the model',
  aspectRatio: '16/10',       // poster and viewer share one box: no layout shift
  background: 'auto',         // paper on a light page, studio on a dark one — and it follows theme switches
  turntable: true,            // slow idle turn, stopped by the first touch
  fullscreenButton: true,
  validate: false,
})
```

| Option / method | Description |
|--------|-------------|
| `lazy`, `poster`, `posterTitle`, `posterText`, `launchLabel` | Nothing loads until the reader presses the poster's button (`true`) or the figure nears the screen (`'visible'`). Calls made before are queued, and their timeouts only start at boot. The poster stays up until the first model is in. |
| `aspectRatio` | Size by proportion. Without it (and without the other kit options) the iframe goes into your element bare, as before. |
| `background: 'auto'` | Reads the first opaque background up from your element; follows `class` / `style` / `data-theme` changes and `prefers-color-scheme`. |
| `turntable` / `setTurntable(enabled \| degPerSec)` | Idle orbit; never under `prefers-reduced-motion`. |
| `pauseOffscreen` / `setPaused(paused)` | Stop rendering while the figure is off screen. On by default with `ui: 'article'`. |
| `fullscreenButton` / `toggleFullscreen()` | Expand the figure to the whole screen. |
| `activate()` | Boot a lazy viewer from your own button. |
| `bindSteps(steps)` | Scrollytelling: each `{ el, frame?, camera?, isolate?, solar?, background?, run? }` applies while its paragraph crosses the middle of the screen; waits for the models. Returns an unbind function. |

The web component takes the same as attributes: `<ifc-viewer ui="article" model="…" lazy poster="…" aspect-ratio="16/10" background="auto" turntable fullscreen-button>`.

## Analysis: sections, measurements, federated models (v1.11)

| Method | Description |
|--------|-------------|
| `addSection({ axis?, offset?, level?, flip? })` | Add a section plane — the same cut the Section panel makes, so the visitor can drag it. `{ level: 'Level 1' }` (name or index from `getSections().levels`) is a floor plan 1.2 m above that storey; `{ axis: 'x', offset: 4.5 }` is a section at 4.5 m (IFC metres, Z up). Resolves with the new `id` and every plane. |
| `updateSection(id, { offset?, enabled?, flipped? })` | Move, toggle or flip a plane. |
| `removeSection(id?)` | One plane, or every cut when `id` is omitted. |
| `setSectionBox('model' \| 'selection' \| false)` | A section box around the model or the selected element; `false` removes it. |
| `getSections()` | `{ planes, box, active, levels }`. |
| `setMeasureTool('distance' \| 'path' \| 'area' \| 'angle' \| 'point' \| 'none')` | Arm a tool for the visitor (opens the Measure panel so they see what to click). |
| `getMeasurements()` / `clearMeasurements(id?)` | `{ tool, units, items }`. `value` is **always SI** — metres, m², degrees — whatever unit the viewer displays; `units` is only what it displays. |
| `setModelVisible(modelId, visible)` | Show/hide one model of a federated scene without unloading it. |
| `setModelOpacity(opacity, modelId?)` | Ghost a model (0.05–1). |
| `isolateModel(modelId \| null)` | Only this model; `null` shows them all again. |

```js
const { levels } = await viewer.getSections()
await viewer.addSection({ level: levels[0].name })
viewer.setView('top')
await viewer.setMeasureTool('distance')
viewer.on('measurements-changed', ({ items }) => console.table(items))
```

## Catalogue objects in a host app (v1.17)

A manufacturer's product page, a catalogue or a CDE record usually shows one
object — a window, a door — whose data lives in its **type**: the
`IfcWindow` carries the geometry, its `IfcWindowType` (`IfcWindowStyle` in
IFC2x3) carries `Pset_WindowCommon`, `Pset_ManufacturerTypeInformation` and the
manufacturer's own sets, linked by `IfcRelDefinesByType`.

```js
import { IfcViewer } from "https://www.ifcvieweronline.eu/sdk/1.17.0/ifc-viewer.es.js"

const viewer = await IfcViewer.create("#product-3d", { ui: "embed", lang: "es" })
await viewer.add("V-70-PR.ifc", bytes)                            // framed iso, with a margin

// The product by class — or by its GlobalId, if your catalogue keeps it
const [win] = await viewer.findElements({ ifcClass: "IfcWindow" })
const el = await viewer.getElement(win.globalId)                  // or (win.expressId, win.modelId)
el.globalId        // "2c161Q3PMaELK1P$GnzTUr"
el.typeName        // "Ventana V-70 practicable"   (el.typeClass: "IFCWINDOWTYPE")
el.typeProperties  // [{ name: "Pset_WindowCommon", properties: [{ name: "ThermalTransmittance", value: 1.2,
                   //      type: "IFCTHERMALTRANSMITTANCEMEASURE", unit: "W/(m²·K)" }, …] }, …]
```

- `propertySets` and `typeProperties` have the same shape: set name, then per
  property `name`, `value`, IFC `type` and `unit` when there is one — the
  property's own `Unit`, else the project's unit for that measure. Enumerated,
  list and bounded properties also carry `values`.
- **Occurrence over type.** Where the element defines a property its type also
  defines (same set, same name), the element's value applies:
  `effectivePropertySets` is that merge, each property tagged
  `source: 'occurrence' | 'type'`, and the type's own value stays in
  `typeProperties` marked `overridden: true`. The properties panel shows the
  type's sets in a **Type properties** section, overridden values struck through.
- The same works for IFC2x3 (window and door styles) and for any other type
  class. Sets attached to the type with `IfcRelDefinesByProperties` (allowed
  in IFC4) count as the type's too.
- Windows' and doors' **pre-defined property sets** — `IfcWindowLiningProperties`,
  `IfcWindowPanelProperties`, `IfcDoorLiningProperties`, `IfcDoorPanelProperties` —
  appear as sets named after their class (or their `Name`), their attributes as
  properties (`LiningDepth`, `PanelOperation`…), with the project's units.
- `materials` is the element's own, else its type's.
- No expressIDs to know: `findElements({ ifcClass: 'IfcWindow' })` or
  `getElement(globalId)` / `select(globalId)`; `element-selected` carries the
  `globalId` of what the visitor picked.
- In `ui: 'embed'` the properties panel opens over the right of the frame; the
  view's centre moves into the space left (a lens shift — orbiting still turns
  about the model), and if the visitor has not moved the camera since the last
  framing, that framing is redone to fit beside the panel.
- Models converted and cached by an older build are converted again on their
  next load: the cache entry records the converter revision.

### Declared performance: EN 14351-1 (v1.17)

`checkEir('builtin-en14351-1')` checks that a window or external door
**declares** the essential characteristics of EN 14351-1:2006+A2:2016
(Annex ZA) that IFC4 has a standard property for. It checks that each value
is present, not whether a class matches a test report. Type properties count, so a
catalogue object that keeps everything on its `IfcWindowType` passes.

```js
const res = await viewer.checkEir("builtin-en14351-1")       // same IdsResult as checkIds
res.specs.filter(s => s.status === "fail").map(s => s.name)
// → ["Window: light transmittance τv declared (EN 410)"]
```

| Characteristic | Window | Door | Property |
|---|---|---|---|
| Scope: external (the checks below apply when `true`) | warning | info | `Pset_WindowCommon` / `Pset_DoorCommon` `.IsExternal` |
| Thermal transmittance Uw / Ud (EN ISO 10077, 12567-1) | error | error | `…Common.ThermalTransmittance` > 0 |
| Resistance to wind load (EN 12210) | error | error | `…Common.WindLoadRating` |
| Watertightness (EN 12208) | error | error | `…Common.WaterTightnessRating` |
| Acoustic performance (EN ISO 717-1) | error | error | `…Common.AcousticRating` |
| Solar factor g (EN 410) | warning | — | `Pset_DoorWindowGlazingType.SolarHeatGainTransmittance` > 0 |
| Light transmittance τv (EN 410) | warning | — | `Pset_DoorWindowGlazingType.VisibleLightTransmittance` > 0 |
| Manufacturer (DoP) | error | error | `Pset_ManufacturerTypeInformation.Manufacturer` |
| Product-type identification code (DoP) | error | error | `Pset_ManufacturerTypeInformation.ModelReference` |

- Every rule is `optional`: a file with only a window is not failed for its
  missing doors (those rules come back `na`), and an interior door
  (`IsExternal = false`) is out of scope, not a failure.
- **Not covered**, because no standard IFC property holds them: air
  permeability class (EN 12207; `Infiltration` is a flow rate), impact
  resistance, safety devices, dangerous substances, release and operating
  forces, roof-window characteristics. Keep them in your own sets and the DoP.
- The same profile is in the viewer's **EIR / BIM Validation profiles** list;
  a copy you save there can be edited and passed to `checkEir()` as an
  object. EIR rules accept `where: { pset?, property, value }` (only the
  elements with that value; booleans are `'true'` / `'false'`) and
  `optional: true` (no failure when the model has none).

## Validation lifecycle (v1.17)

`validate: true` (the default) validates each model once it has loaded;
`validate(modelId?)` does it on demand and resolves with that model's result.
Both go through one queue — one run at a time, each answered — and emit
`validation-started`, then `validation-completed` or `validation-failed`.

| When | `getValidation()` returns |
|------|---------------------------|
| Before any validation | `null` — `getValidationStatus()` says `idle` |
| While the first run is going | `null` — `getValidationStatus()` says `running`, with `progress` |
| After a run | `{ qualityScore, errors, warnings, info, total, status: 'done', modelId }`. With several models, the aggregate of all (`modelId: null`) |
| While a newer run is going | the previous numbers, `status: 'running'` |
| After a run failed | the previous numbers, `status: 'error'` and `error` — or `null` if there were none; `validation-failed` fired and `validate()` rejected |

`validate()` rejects with a readable reason: no model loaded, an unknown
`modelId`, the model's IFC data not available, cancelled, or the validator's
own failure. A model validated before resolves from the cached result unless
`{ force: true }`.

## Querying the viewer (CDE workflows)

Pull data out of the viewer to drive your own UI — element panels, model lists,
thumbnails, dashboards:

```js
// Model list for a sidebar
const models = await viewer.getModels()       // [{ id, fileName, elementCount }, …]

// Click in your CDE → read the element's IFC property sets
viewer.on("element-selected", async (e) => {
  const data = await viewer.getElement(e.expressId, e.modelId ?? undefined)
  console.log(data?.globalId, data?.propertySets)
})

// Health Score for a dashboard widget (or listen to "validation-completed")
const v = await viewer.getValidation()        // { qualityScore, errors, warnings, info }

// Thumbnail for a CDE card
const png = await viewer.screenshot()          // "data:image/png;base64,…"

// Drive visibility from a flagged-elements list
viewer.hideElements(everything); viewer.showElements(flaggedIds)
```

For dashboards, `getStats()` feeds charts (element counts per category per model) and
`getIssues({ severity: "error", limit: 50 })` feeds an issues table — click a row →
`viewer.select(issue.expressId, issue.modelId)` to jump to it in 3D. Theme the whole
thing to your product with `accent: "#22c55e"`.

Queries are request/response and time out after 30 s.

### IDS (Information Delivery Specification)

Check the loaded model against a buildingSMART `.ids` and drive a compliance dashboard:

```js
const ids = await fetch("/specs/project.ids").then(r => r.text())
const res = await viewer.checkIds(ids)   // runs in a worker; up to 120 s
// res = { score, totalSpecs, passedSpecs, failedSpecs, naSpecs, specs: [...] }
for (const spec of res.specs) {
  console.log(spec.name, spec.status, `${spec.passedCount}/${spec.applicableCount}`)
  spec.failures.forEach(f => /* click → */ viewer.select(f.expressId, f.modelId))
}
```

The check is fully client-side (a dedicated web-ifc worker). **Coverage:** all six
IDS 1.0 facets — Entity (incl. predefinedType with USERDEFINED resolution and type
inheritance), Attribute, Property (incl. type-inherited psets and `dataType`),
Classification (incl. reference hierarchies), Material (all set/usage shapes) and
PartOf (aggregates, nests, containment, voids/fills, groups) — with `simpleValue`
and `xs:restriction` (enumeration, pattern, bounds, length), specification-level
cardinality and the bSI 1e-6 floating-point tolerance. Validated against the
official buildingSMART test cases. In the app, the **IDS** button (toolbar) opens
the same check with a drag-and-drop `.ids` upload.

Each failure carries `reasons: string[]` (human-readable English — stable, kept for
backward compatibility) and, additively, `reasonCodes: { code, params }[]` with
machine-readable codes (`missingRequired`, `wrongValue`, `prohibitedPresent`, …) if
you prefer to localize or aggregate failures yourself.

## Languages

The viewer ships in 10 languages: **en, es, de, fr, pt, it, ca, zh, ja, th**. Set the
initial language with the `lang` option, switch at runtime with `setLanguage(code)`,
and build a picker from `IfcViewer.LANGUAGES` (code + native label). The `ready` event
and `getLanguages()` report the exact set the embedded app advertises.

```js
const viewer = new IfcViewer("#viewer", { lang: "es" })
// later:
viewer.setLanguage("ja")
// build a <select> from IfcViewer.LANGUAGES → [{ code:'en', label:'English' }, …]
```

**Localized docs + live demo** are generated per language at `/<base>/sdk/` (English)
and `/<base>/sdk/<lang>/` (the rest), with a language switcher. The generator is
`scripts/sdk/build-sdk-docs.mjs` (runs as part of `npm run build:sdk`).

```js
viewer.on("element-selected", (e) => {
  console.log("User picked", e.ifcType, "#", e.expressId);
});
```

## Versions, caching and compatibility

| Path | Caching | Use |
|------|---------|-----|
| `/sdk/ifc-viewer.es.js` | revalidated on every load (`max-age=0, must-revalidate`) | trying things out — always the latest |
| `/sdk/<version>/ifc-viewer.es.js` (e.g. `/sdk/1.17.0/`) | `public, max-age=31536000, immutable` | production — the code you tested is the code that runs |

- Both paths serve **the same file** for the current version: `scripts/sdk/version-sdk.mjs`
  copies the build into `public/sdk/<version>/` (with its `.d.ts`) and records its
  Subresource Integrity hash in `public/sdk/versions.json`, so a page can pin the
  content too (`<script type="module" src="…" integrity="sha384-…" crossorigin>`).
  It only ever writes the current version: a published folder never changes, and
  `scripts/sdk-versions.test.ts` fails if one does.
- **The iframe is not versioned.** A pinned SDK opens the live viewer at the same
  origin; it keeps its own API and behaviour while the viewer inside keeps
  improving. The viewer must therefore answer every command any published SDK
  sends — the same test checks every `ifcviewer:*` command of every pinned build
  against `App.tsx`.
- Hosting (`vercel.json`): the immutable `Cache-Control` and
  `Access-Control-Allow-Origin: *` apply to `/sdk/<version>/…`; a version that
  does not exist is a 404 instead of the app's HTML (the SPA fallback skips those
  paths). Self-hosting elsewhere needs the same two rules.

### Changelog

- **1.17.0** — catalogue objects in a host app. `getElement()` returns the
  `globalId` (it was always null) and the type's data (`typeName`,
  `typeProperties` with units, `effectivePropertySets`; IFC4 types and IFC2x3
  styles — before, `typeProperties` was always empty and even property values
  came back null). `validate()`, `getValidationStatus()`,
  `validation-started` / `validation-failed`, and `validate: true` really
  validates after each load now. Auto-frame after load (`autoFrame`), `fit()` /
  `frame()` with a margin for small objects, `frame(elementId, modelId?)`, and
  `setView()` moves the camera again (a no-op since 1.14). `ui: 'embed'` with
  `toolbar` / `tools`, whose properties panel keeps the picked object in view.
  `findElements()`, GlobalIds for `getElement()` / `select()` /
  `element-selected`, window and door lining and panel sets, the type's
  materials. `checkEir('builtin-en14351-1')`, the declared performance of
  EN 14351-1 windows and external doors; EIR rules gain `where` and
  `optional`. Pinned builds at `/sdk/<version>/`.
- **1.16.0** — `layers` option (data-layer setup).
- **1.15.0** — the article kit (`lazy`, `poster`, `aspectRatio`, `turntable`, `bindSteps`…).
- **1.14.0** — `ui: 'article'`, tight `frame()`.
- Earlier: see the version notes at the top of `src/sdk/ifc-viewer-sdk.ts`.

## How it relates to the iframe embed

The SDK is a thin wrapper over the same embed + postMessage protocol documented in
[`EMBED_URL_PARAMS.md`](./EMBED_URL_PARAMS.md). If you only need a static deep-link
(a public model URL, no host-supplied bytes), a plain `<iframe src="…?model=…&embed=1">`
is enough — the SDK adds the byte-streaming `add()` path and a typed JS API on top.

## Notes & limits

- **CORS** only matters for `addFromUrl`. `add(bytes)` needs no CORS — you hand the
  bytes over directly.
- `add(bytes)` **transfers** the buffer (it becomes detached in your code). Pass a
  copy if you still need the bytes afterward. Inside the iframe, that same buffer
  becomes the model's copy for validation, IDS and export, with no second copy.
- Loads a host starts are not checked for duplicates: adding the same bytes twice
  loads two models (only the in-app import dialog asks). Converted geometry is
  cached in the visitor's browser, keyed by name and size and checked against a
  SHA-256 of every byte. Adding the same file again, now or in a later session,
  skips conversion, and an edited file with the same name and size is never
  served stale. Bytes over 1 GB, or pages outside a secure context, are not cached.
- The app must be **iframe-embeddable** (no `X-Frame-Options: DENY`). GitHub Pages
  sets none by default.
- Vite **dev** server does not serve `public/sdk/index.html` for `/sdk/` (its SPA
  fallback intercepts HTML). It works in a real `vite build` / static host. To test
  the SDK in dev, `import()` `/<base>/sdk/ifc-viewer.es.js` directly.
