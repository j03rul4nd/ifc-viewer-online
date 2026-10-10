# Embedding & URL parameters

The viewer can load a model from a URL and render inside an `<iframe>` so it can be
dropped into a blog post, an article, or a **CDE panel / third-party screen**.
Everything is client-side — the visitor's browser fetches the IFC directly, so
**nothing touches our servers** (the same privacy story as the main app).

The in-app **Embed** button (toolbar, when a model is loaded) opens a generator that
builds the link and the `<iframe>` snippet for you, and there's a full no-code
**embed builder** served at **`/<base>/embed/`** (localized in 10 languages, with a
live preview). This doc is the reference for the underlying parameters.

## Quick start

```html
<iframe
  src="https://<app>/?model=https://your-cde.com/model.ifc&embed=1"
  width="100%"
  height="600"
  style="border:0;border-radius:12px;max-width:100%"
  loading="lazy"
  allow="fullscreen"
  title="IFC model viewer">
</iframe>
```

> Use the **full app URL including its base path** (e.g. `https://host/ifc-viewer-online/`).
> The Embed generator does this automatically.

## Parameters

| Param      | Values                          | Default   | Description |
|------------|----------------------------------|-----------|-------------|
| `model`    | URL(s)                           | —         | Public IFC URL to load. Comma-separated or repeated for multiple (federated) models, which load as one batch (see below). Aliases: `src`, `url`. |
| `name`     | string(s)                        | from URL  | Display file name(s), parallel to `model`. Aliases: `file`. |
| `embed`    | `1`/`0`                          | `0`       | Embed mode — slims the chrome for iframe hosting. |
| `ui`       | `minimal` \| `full` \| `kiosk` \| `client` \| `article` \| `embed` | `minimal` | Chrome preset (implies `embed=1`). `embed` is for a host application that supplies the file *(1.17)* — see [Presets](#presets). |
| `tools`    | `validate,measure` (any subset; empty for none) | `validate,measure` | The compact toolbar of `ui=embed`. Without `validate` the validation bar goes too. *(1.17)* |
| `autoframe` | `1` / `0`                      | `1` in embeds | Each time the loads settle with a different set of models, frame them all from `view` (default `iso`) with a margin. `0` leaves the camera where the loader puts it (fitted head-on, edge to edge) — for a host that sets its own shot. Off when `view` or `camera` is given (those shots win). *(1.17)* |
| `validate` | `1`/`0`                          | `1`       | Run validation automatically after load (drives the Health Score). With several models, validation waits until none is still loading, then runs model by model. |
| `select`   | expressId (number)               | —         | Select + frame an element once loaded. |
| `isolate`  | IFC class, e.g. `IfcWall`        | —         | Isolate a category after load (best-effort, by canonical IFC class). |
| `lang`     | locale code (`en`, `es`, …)      | auto      | Force the UI language (only if supported). |
| `accent`   | hex `rrggbb` / `#rrggbb`         | brand     | Tint the viewer's accent to match your dashboard. |
| `bg`       | preset / `rrggbb` / `top,bottom` | saved     | Scene background for this page view: `white`, `paper`, `blueprint`, `sky`, `studio`, one colour, or a top,bottom gradient (`bg=dbeafe,ffffff`). Applied from the first frame and **not** saved as the visitor's preference. An unreadable value is ignored. |
| `solar`    | `YYYY-MM-DDTHH:MM` or `MM-DDTHH:MM` | —      | Open the Sun & Moon study at this **site-local** wall time. The evergreen form (no year) uses the current year. |
| `moon`     | `1` / `0`                        | off       | Turn on the moon light for a `solar` deep link. |
| `map`      | `1` / `0` / layer list           | off       | Drop the model onto the basemap using its own georeferencing. A layer list turns extras on: `map=terrain,buildings,showcase`. Naming a layer implies the map. |
| `look`     | look id, or `from..to`           | user's    | Art direction of the map (needs `map`): `daylight`, `maquette`, `golden`, `night`, `blueprint`, `dawn`. `look=daylight..night` opens in the first and plays a 6 s time-of-day transition to the second once the city is built (it waits for the tab to be visible). Dawn/day/dusk use the site's real sun for today. Unknown ids are ignored. |
| `scan`     | URL(s)                           | —         | Point cloud(s) to load alongside the model. Comma-separated or repeated, like `model`. |
| `layers`   | URL                              | —         | A data-layer setup exported from the Data layers panel (*Export setup*): sources, styles, groups, alerts. Host the JSON anywhere with CORS. While present it is what the scene shows; the visitor's own saved layers are neither restored nor overwritten. |
| `scene`    | URL                              | —         | A **scene document** (see [`SCENE_FORMAT.md`](SCENE_FORMAT.md)): models, data layers, live device bindings, map, background and camera in one JSON. Same rules as `layers` (CORS, session-only). Also accepted in the fragment as `#scene=<packed>`, which carries the whole scene in the link without hosting anything. Explicit parameters in the same URL win over the scene's. |
| `camera`   | `px,py,pz,tx,ty,tz`              | —         | Open on this exact camera (scene metres, Y up: eye, then orbit target) once the models are in, after the map's own fly-in when `map` is set. Wins over `view`. |
| `view`     | `iso` · `top` · `front` · `back` · `left` · `right` · `bottom` | — (`iso` with `ui=article`) | Once every model has loaded, frame them from this view with a **tight fit**: fitted to the box's corners, not its bounding sphere, so a long low building fills the frame. *(1.14)* |
| `fill`     | `0.2`–`0.98` or a percentage     | `0.85` (`0.8` for auto-frame) | With `view` or auto-frame: share of the frame the model fills on its tighter axis. *(1.14)* |
| `turntable` | `1` or degrees/second          | off       | A slow idle orbit once the model is in, stopped for good by the visitor's first touch; never under `prefers-reduced-motion`. *(1.15)* |
| `wheel`    | `always` · `ctrl`                | `always` (`ctrl` with `ui=article`) | `ctrl`: the wheel scrolls the host page and zooms only with Ctrl/⌘ held (a trackpad pinch sends Ctrl), with a short hint over the canvas — like an embedded map. *(1.14)* |

### Federated links: how several models load

`?model=a.ifc,b.ifc,c.ifc` becomes one **batch** in the viewer's loading queue ([`MODEL_LOADING.md`](./MODEL_LOADING.md)):
- Downloads run two at a time with real byte progress, and conversions run one at a time. The next file downloads while the current one converts, but downloads never run more than a couple of files ahead of conversion, so a long link does not park every model in memory at once.
- The **first URL attaches first**. It sets the scene's coordinate base, so a small file that finishes early waits for it instead of silently becoming the origin of the federation. Put the architectural model first.
- Only the first model moves the camera. When the batch settles, the view frames all of them.
- A model that fails does not stop the others. Each failure is reported on its own (`model-error` below).
- Converted geometry is cached in the visitor's browser. Opening the same link again skips conversion, as long as the host sends the same file (the cache checks a content fingerprint, not just the name).

### Sun study (`solar` / `moon`)

```
?model=/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc&solar=06-21T18:30&moon=1
```

Starts the study at the summer solstice, 18:30 local, and reads the timezone from
the model's own georeferencing — the Poblenou set comes up as `UTC+2` in June.

It only fires when a location actually resolves. A model with no georeferencing
would otherwise pop the blocking "where is this?" notice, and a deep link that
opens a modal is worse than one that quietly does nothing; in that case the
study simply does not start.

### Scene deep links (`map` / `scan`)

Both wait for the first model — the map has nothing to place without one, and a
scan would have nothing to align against — and both then drive the same internal
commands the SDK uses, so behaviour is identical either way. In a federated link
that is the first URL, which always lands first.

```
?model=/models/poblenou/BCN-IVO-ZZ-XX-M3-A-0001.ifc&map=terrain,buildings&scan=/models/poblenou/poblenou-site-scan.las
```

`map` layers: `terrain` (3D relief), `buildings` (OpenStreetMap surroundings),
`showcase` (presentation-grade context — also downloads the authored props). An
unrecognised layer turns the map on and is otherwise ignored, so a typo costs
you that layer rather than the whole feature.

Three things worth knowing before you build a link:

- **`map` needs a georeferenced model.** With nothing to place the building by,
  map mode would have to ask where it is — and a deep link that opens a "where
  is this?" dialog is worse than one that does nothing. It reports an error
  instead. `IfcMapConversion` (or at minimum `IfcSite` latitude/longitude) is
  what makes it work.
- **`scan` lands wherever the alignment ladder puts it.** Sharing a projected
  CRS with the model is exact; anything less is labelled as the guess it is.
- **`map` does not work with `ui=client`.** Map mode is served by a panel the
  client skin does not mount, so the command has nobody to answer it and you get
  an error toast. Use `ui=kiosk` for a chrome-less recording instead. `scan`
  does work there: scans load through the loading queue, not through their panel.

Turning on OpenStreetMap surroundings queries a public service (Overpass) and
can take half a minute; the scan loads in parallel rather than queueing behind it.
Both show up as rows in the viewer's Loading Center next to the IFC models. The
scans are jobs of their own: each downloads with real progress, decodes in a
lane separate from the IFC conversions (it never waits for a conversion slot),
aligns against the model, and can be cancelled on its own. A list of scans
shares the point budget: one that does not fit while another is still loading
waits for it instead of overflowing the GPU. A failure is toasted with its
reason (for example "LAZ file too large to decompress in the browser").

### Granular chrome overrides (embed mode)

Each overrides its preset default. Accept `1`/`0` (also `true`/`false`, `yes`/`no`).

| Param      | Controls |
|------------|----------|
| `toolbar`  | Top toolbar |
| `tree`     | Spatial tree panel |
| `sidebar`  | Category / properties sidebar |
| `panel`    | Auto-open the validation panel |
| `home`     | "Back to home" button |
| `controls` | Camera preset overlay |
| `rail`     | Icon rail of tool panels on the right edge *(1.14)* |
| `stats`    | Model info chip — file size, element count, GPU backend *(1.14)* |

### Presets

| Preset    | Toolbar | Tree | Sidebar | Panel auto-open | Camera | Home | Rail · info chip · validation bar | Load indicator · toasts |
|-----------|:------:|:----:|:-------:|:---------------:|:------:|:----:|:----:|:----:|
| `minimal` | ✓ | — | ✓ | — | ✓ | — | ✓ | ✓ |
| `full`    | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| `kiosk`   | — | — | — | — | — | — | — | — |
| `client`  | — | — | — | — | ✓ | — | ✓ | ✓ |
| `article` | — | — | — | — | — | — | — | — |
| `embed`   | compact | — | ✓ (on selection) | — | ✓ | — | rail = properties · validation bar | — |

The collapsed validation bar (with the **Health Score** badge) shows in `minimal`/`full`
even when the panel isn't auto-opened, so the citable number is always visible.

**`kiosk` is the canvas only** (since 1.14): before, it still showed the tool rail, the
model info chip, the validation bar and the floating load indicator.

**`article`** (1.14) is the preset for a figure in a post: the kiosk canvas, plus
`view=iso` (a tight framing once loaded) and `wheel=ctrl` (the reader keeps
scrolling). Tool panels the host opens over the bridge — measure, sun, walk,
Cover Studio, Clip Studio, compare — still mount, and inside an article only a
frame under 520 px wide (or a touch screen) gets the phone layout, so a
650 px column keeps the desktop panels.

**`embed`** (1.17) is for a host **application** that supplies the file itself —
a manufacturer's product page, a catalogue, a CDE record. Its toolbar is
**compact**: the file name, then **Validate** (with the Health Score) and
**Measure** — no Open, Check, View, Tools, Capture, Share, help, account or
language. The properties panel starts closed, so the model gets the whole
frame, and opens itself when the visitor selects an element; the rail offers
properties only (`panels=` widens or narrows it). No toasts, no load chips —
the host shows its own progress from `model-progress`. Narrow it further with
`tools=measure` / `tools=` and `toolbar=0`. The other presets are unchanged.

### Shared tour links (`#tour=` fragment — D-26)

A tour generated with the presentation templates can be shared as
`?model=<url>[&ui=client]#tour=<base64>`. The **hash fragment** carries only
the tour steps/template/title (never the model — that rides the normal
`?model=` param) and is never sent to a server, following D-21. On open, the
viewer loads the model, rebuilds the tour and starts playback automatically;
invalid fragments show a clear error toast and fall back to the normal viewer.
Links can only be generated for models that are themselves loadable by URL —
disk-loaded models get an honest "no public URL" notice instead.

`client` is the **client presentation skin** (D-25): a show-only layer for
non-technical audiences. On top of the kiosk-like chrome it renders a large
semantic Health Score badge (with a one-click "verify" CTA when validation
hasn't run), a "View walkthrough" CTA wired to Tour Mode, a simplified capture
pill (screenshot / replay clip), and a discreet presenter gear that can
temporarily enable measurement/section tools or exit the skin. No IFC jargon,
no editing affordances, no technical panels. It can also be toggled from
inside the app (Toolbar `···` → "Client presentation mode") without reloading —
the loaded model and camera persist.

## Examples

```
# Minimal embed (default preset)
?model=https://host/a.ifc&embed=1

# Kiosk card (canvas only), no validation
?model=https://host/a.ifc&embed=1&ui=kiosk&validate=0

# Full embed, force Spanish, deep-link to an element
?model=https://host/a.ifc&embed=1&ui=full&lang=es&select=1234

# Federated: two models side-by-side in one scene
?model=https://host/arch.ifc,https://host/struct.ifc&embed=1

# Minimal but also show the spatial tree
?model=https://host/a.ifc&embed=1&tree=1

# Themed to a dashboard's brand colour
?model=https://host/a.ifc&embed=1&accent=22c55e

# A figure in an article: canvas only, model filling the frame, page keeps scrolling
?model=https://host/a.ifc&ui=article&bg=paper&validate=0

# A blog figure: white page, the model on its site, a solstice evening
?model=https://host/a.ifc&ui=client&bg=white&map=terrain,buildings&solar=06-21T19:30
```

## Present in dashboards & BI tools

The embed is just a URL or an `<iframe>`, so it drops into most tools:

- **Power BI** — add a *Web content* visual (or the *HTML Content* / *HTML Viewer*
  visual) and paste the `<iframe>` snippet. Use `accent` to match your report theme.
- **Notion / Confluence / SharePoint** — paste the URL as an embed block.
- **Dashboards / internal apps** — an `<iframe>`, or the [SDK](./IFC_VIEWER_SDK.md) /
  `<ifc-viewer>` web component for two-way control and data (`getStats`, `getIssues`).
- **Slides / presentations** — many tools accept a web embed; otherwise link the URL.

The fastest way to produce the snippet is the no-code builder at **`/<base>/embed/`**
(live preview, copy button, 10 languages) or the in-app **Embed** button.

## CDE / host integration (postMessage)

When running inside an iframe, the viewer posts lifecycle events to the parent window
so a CDE can react. All messages are `{ source: 'ifc-validator', type, ... }`:

| `type`             | Payload |
|--------------------|---------|
| `ready`            | — (viewer mounted) |
| `model-progress`   | `percent`, `phase` (`reading` · `parsing` · `uploading`). One stream per load, never decreasing, sent only while that load is in progress (≤ 4/s) |
| `model-loaded`     | `modelId`, `fileName`, `elementCount`, `fromCache` |
| `model-error`      | `url` (URL loads) or `name` (byte/file loads), `message`. Sent for download failures, invalid/unparseable files, scene failures and cancelled loads |
| `validation-started` | `modelId` — a queued validation (after a load with `validate=1`, or the SDK's `validate()`) began *(1.17)* |
| `validation-completed` | `qualityScore`, `errors`, `warnings`, `info`, `total`, `modelId` (null for the aggregate of a federated scene) *(total, modelId: 1.17)* |
| `validation-failed` | `modelId`, `message` — a queued validation could not run or did not finish *(1.17)* |
| `element-selected` | `expressId`, `modelId`, `ifcType`, `name` |
| `walk-changed`     | `active`, `speed` |
| `measurements-changed` | `tool`, `units`, `items` (values always SI) |
| `tour-started` / `tour-step` / `tour-ended` | `title, total, template` / `index, total, caption` / `completed` |
| `presentation-progress` | `stage` (`generate` · `export`), `label?`, `progress` |

Messages about a load a host started with a `requestId` (see below and the
[SDK](./IFC_VIEWER_SDK.md)) echo that `requestId`, so a host can tell its own
loads from the ones started inside the viewer.

```js
window.addEventListener('message', (e) => {
  if (e.data?.source !== 'ifc-validator') return
  if (e.data.type === 'element-selected') {
    console.log('User picked element', e.data.expressId)
  }
})
```

### Inbound commands (host → viewer)

The host can also drive the embedded viewer two-way by posting messages **to** the
iframe (only honored when the app runs inside an iframe). Commands use the
`ifcviewer:` namespace; unknown/malformed messages are ignored.

| `type`              | Fields | Effect |
|---------------------|--------|--------|
| `ifcviewer:load`    | `url` (string or string[]), `name?` (string or string[]), `requestId?` | Load model(s) into the scene. An array loads as one batch, like a federated `?model=`. The viewer accepts a new `load` while others are still running and queues it |
| `ifcviewer:load-bytes` | `name`, `bytes` (transferable `ArrayBuffer`), `requestId?` | Load IFC bytes the host already has (what the SDK's `add()` sends) |
| `ifcviewer:clear`   | — | Cancel IFC loads still in flight, then remove every model |
| `ifcviewer:select`  | `expressId`, `modelId?` | Select + frame an element |
| `ifcviewer:isolate` | `ifcType` (e.g. `IfcWall`, or omit to clear), `frame?` | Isolate a category; `frame: false` keeps the camera *(1.15)* |
| `ifcviewer:fit`     | — | Frame the active model from the current angle, with a margin *(margin: 1.17)* |
| `ifcviewer:set-turntable` | `enabled?`, `speed?` (°/s, default 6) | Idle orbit; answers `{ active, speed }` *(1.15)* |
| `ifcviewer:set-paused` | `paused` | Stops / resumes painting frames (a figure off screen); answers `{ paused }` *(1.15)* |
| `ifcviewer:view`    | `preset?`, `scope?`, `fill?`, `azimuth?`, `elevation?`, `animate?`, `elementId?`, `modelId?` | Frames from a preset. With `fill` (0.2–0.98) or angles (degrees) it is a **tight fit** to the box's corners. With `elementId` it frames that element instead (from the current angle unless a preset or angles are given; fails when the element is not in the model). Answers `{ scope }` when it carries a `requestId`; without one (the SDK's `setView`) it still moves the camera — between 1.14 and 1.16 it did not *(fill/angles: 1.14; elementId, the fix: 1.17)* |
| `ifcviewer:validate` | `modelId?`, `force?`, `requestId` | Validate a model (default: the active one) after any run queued before it; answers that model's `{ modelId, qualityScore, errors, warnings, info, total, durationMs }` or the reason it could not *(1.17)* |
| `ifcviewer:get-validation-status` | `requestId` | Answers `{ status: idle·running·done·error, modelId, progress, error, queued }` *(1.17)* |
| `ifcviewer:reset`   | — | Reset the camera |

#### Commands added in SDK v1.11

Every command below answers with a `result` envelope
(`{ source: 'ifc-validator', type: 'result', requestId, ok, data | error }`)
when it carries a `requestId`. On failure, `error` is a readable reason, such
as "no model yet", "feature not in this build" or "model has no location".

| `type` | Fields | Effect / `data` |
|--------|--------|-----------------|
| `ifcviewer:set-background` | `background`: preset, `'#rrggbb'`, `'#top,#bottom'` or `{ top, bottom? }` | Paints the scene without saving the preference. Returns the resolved background |
| `ifcviewer:get-background` | — | `{ preset, mode, top, bottom }` |
| `ifcviewer:set-accent` | `accent`: `#rrggbb` | Re-themes the UI accent |
| `ifcviewer:set-client-mode` | `enabled` | Turns the stakeholder skin on or off |
| `ifcviewer:set-render-quality` | `quality`: `standard` \| `quality` | Switches the heavier rendering |
| `ifcviewer:get-camera` | — | `{ position, target, direction, up, fovDeg }` (scene metres, Y up) |
| `ifcviewer:look-at` | `position`, `target`, `animate?` | Flies the camera |
| `ifcviewer:set-walk` | `enabled?`, `speed?` (m/s) | Walk mode. Returns `{ active, speed }` |
| `ifcviewer:get-walk` | — | `{ active, speed }` |
| `ifcviewer:set-solar` | `solar: { active?, date?, time?, moon?, sky?, quality?, location? }` | Sun study at site-local time. Returns `{ active, date, time, timeZone, moon, sky, quality, location }` |
| `ifcviewer:get-solar` | — | Same shape as above |
| `ifcviewer:set-site` | `site: { enabled?, terrain?, buildings?, layers?, detail?, terrainStyle?, exaggeration?, vehicles? }` | Map mode. Resolves once it is up. Returns state + `placement` + `attributions` |
| `ifcviewer:get-site` | — | Same shape as above |
| `ifcviewer:add-section` | `axis?` (`x`\|`y`\|`z`), `offset?`, `level?` (storey name or index), `flip?` | Adds a plane. Returns `{ id, planes, box, active }` |
| `ifcviewer:update-section` | `id`, `offset?`, `enabled?`, `flipped?` | Moves, toggles or flips the plane |
| `ifcviewer:remove-section` | `id?` | Removes one plane, or every cut when `id` is omitted |
| `ifcviewer:section-box` | `fit`: `model` \| `selection` \| `false` | Adds or removes the section box |
| `ifcviewer:get-sections` | — | `{ planes, box, active, levels }` |
| `ifcviewer:set-measure-tool` | `tool`: `distance`\|`path`\|`area`\|`angle`\|`point`\|`none` | Arms a tool and opens the Measure panel |
| `ifcviewer:get-measurements` | — | `{ tool, units, items }`. Values are always SI |
| `ifcviewer:clear-measurements` | `id?` | Removes one measurement, or all of them |
| `ifcviewer:model-visible` | `modelId`, `visible` | Shows or hides one model |
| `ifcviewer:model-opacity` | `opacity` (0.05–1), `modelId?` | Ghosts a model |
| `ifcviewer:isolate-model` | `modelId` \| `null` | Shows only that model, or all of them again |
| `ifcviewer:start-tour` *(1.12)* | `template?`, `autoplay?`, `title?`, `includeImprovements?` | Starts a built-in tour. Returns the tour state |
| `ifcviewer:play-tour` *(1.12)* | `tour: { title?, steps: [{ position, target, caption?, highlight?, isolate?, modelId? }] }`, `startAt?`, `autoplay?` | Plays a host-authored tour |
| `ifcviewer:tour-step` *(1.12)* | `index` or `delta` | Moves to another stop |
| `ifcviewer:set-tour-autoplay` *(1.12)* | `autoplay` (true / ms / false) | Turns self-running on or off |
| `ifcviewer:stop-tour` / `ifcviewer:get-tour` *(1.12)* | — | Stops the tour / returns `{ playing, title, template, stepIndex, total, steps }` |
| `ifcviewer:get-recipes` *(1.12)* | — | The built-in director recipes |
| `ifcviewer:create-presentation` *(1.12)* | `recipe`, `options?` | Generates a presentation in Clip Studio. Returns `{ clips, durationSec, width, height }` |
| `ifcviewer:export-presentation` *(1.12)* | `resolution?`, `music?` | Encodes it. `data: { bytes (transferred ArrayBuffer), mimeType, sizeBytes }` |
| `ifcviewer:close-presentation` *(1.12)* | — | Closes Clip Studio |
| `ifcviewer:get-cover-options` *(1.13)* | — | `{ recipes, templates, formats, palettes }` |
| `ifcviewer:create-cover` *(1.13)* | `recipe?`, `template?`, `format?`, `palette?`, `text?` | Makes a cover in Cover Studio. Returns its state |
| `ifcviewer:compare` | `base`, `head` (URL or URL[]), `baseLabel?`, `headLabel?` | Compares two deliveries by GlobalId and opens the comparison workspace on the result. `data: { changes }` |
| `ifcviewer:get-cover` / `ifcviewer:close-cover` *(1.13)* | — | Returns the state (or `null`) / closes the studio |
| `ifcviewer:export-cover` *(1.13)* | `fileType?` (`png`·`jpeg`·`pdf`·`pptx`·`zip`), `slide?` | `data: { bytes (transferred), mimeType, sizeBytes, slides }`. The field is `fileType`, not `type`, which is taken by the message itself |
| `ifcviewer:get-groups` *(1.13)* | — | `{ groups, looseCloudIds }` |
| `ifcviewer:create-group` *(1.13)* | `name`, `modelIds?` | `data: { id }` |
| `ifcviewer:rename-group` / `ifcviewer:delete-group` *(1.13)* | `groupId`, `name` / `groupId` | User groups only |
| `ifcviewer:assign-group` *(1.13)* | `itemId`, `groupId` (id · `null` · `'loose'`) | Moves a model or cloud |
| `ifcviewer:group-visible` / `ifcviewer:isolate-group` / `ifcviewer:frame-group` *(1.13)* | `groupId`, `visible` / `groupId` (or `null`) / `groupId` | Acts on a whole group |

```js
// Raw postMessage (the SDK does this for you):
frame.postMessage({ type: 'ifcviewer:set-solar', requestId: 'r1',
  solar: { date: '06-21', time: '19:30' } }, 'https://www.ifcvieweronline.eu')
window.addEventListener('message', (e) => {
  if (e.data?.type === 'result' && e.data.requestId === 'r1') console.log(e.data)
})
```

Prefer the [SDK](./IFC_VIEWER_SDK.md): it correlates the replies, applies timeouts and is typed.

```js
const frame = document.querySelector('iframe').contentWindow
// React to the viewer being ready, then drive it:
window.addEventListener('message', (e) => {
  if (e.data?.source === 'ifc-validator' && e.data.type === 'ready') {
    frame.postMessage({ type: 'ifcviewer:load', url: 'https://cde/model.ifc' }, '*')
  }
})
// Later, from a CDE issue list:
frame.postMessage({ type: 'ifcviewer:select', expressId: 1234 }, '*')
```

Alternatively, to swap the model you can simply point the iframe `src` at a new
`?model=…` URL — the simplest, stateless way to drive the viewer from a host.

## Requirements & gotchas

- **CORS** — the IFC host must send `Access-Control-Allow-Origin` so the visitor's
  browser can fetch the file. Without it the load fails with a CORS error.
- **HTTPS** — only `http(s)` model URLs are accepted.
- **Iframe embedding** — the app must not be served with a restrictive
  `X-Frame-Options` / CSP `frame-ancestors`. GitHub Pages sets neither by default,
  so it is embeddable as-is.
- **Base path** — always include the app's base path in the URL (the Embed generator
  does this). A root URL without it can drop the query string on the SPA base redirect.
