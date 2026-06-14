# IFC Viewer SDK

Embed the viewer in a **CDE, digital twin, or internal project tool** and load IFC
data straight from your own app. Model processing stays in the visitor's browser —
**no upload backend, nothing sent to our servers**.

The SDK is a tiny (~6 KB) dependency-free ES module. Under the hood it mounts the
app in an `<iframe>` (embed mode) and streams your IFC bytes to it over
`postMessage` with a transferable `ArrayBuffer`, so the heavy three.js / web-ifc /
WASM weight is loaded by the iframe, not your bundle.

- Source: `src/sdk/ifc-viewer-sdk.ts`
- Build: `npm run build:sdk` → `public/sdk/ifc-viewer.es.js` (also runs as part of `npm run build`)
- Live demo + web docs: `/<base>/sdk/` (served from `public/sdk/index.html`)

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

The SDK auto-discovers the app URL relative to its own script location
(`new URL("../", import.meta.url)`), so self-hosting under `/<base>/sdk/` just works.
Override with the `baseUrl` option if you serve the app elsewhere.

### Even easier: the `<ifc-viewer>` web component

Zero JavaScript — drop a tag into any page or dashboard:

```html
<script type="module" src="https://<host>/sdk/ifc-viewer.es.js"></script>

<ifc-viewer model="https://your-cde.com/model.ifc" ui="minimal" accent="#22c55e"
            style="display:block;height:520px"></ifc-viewer>
```

Attributes: `model`, `ui`, `lang`, `accent`, `validate`, `panel`, `base-url`. Events are
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
| `ui`       | `'minimal'` \| `'full'` \| `'kiosk'`  | `'minimal'` | Chrome preset. |
| `validate` | boolean                               | `true`      | Run validation on load (drives the Health Score). |
| `panel`    | boolean                               | `false`     | Auto-open the validation panel. |
| `lang`     | string                                | auto        | Force UI language (`en`, `es`, …). |
| `accent`   | `#rrggbb`                             | brand       | Tint the viewer to match your dashboard. |
| `height` / `width` | number \| string              | `'100%'`    | iframe size (number → px). |
| `model`    | string                                | —           | Auto-load this public IFC URL once ready. |
| `loadTimeout` | number                             | `120000`    | Reject `add()`/`addFromUrl()` after N ms (`0` disables). |
| `onReady` / `onModelLoaded` / `onModelError` / `onProgress` | function | — | Convenience callbacks (same as `.on(...)`). |

### Methods
| Method | Description |
|--------|-------------|
| `add(name, bytes)` | Load IFC `ArrayBuffer`/`Uint8Array`. Returns `Promise<ModelLoadedEvent>`. The buffer is transferred (detached) for zero-copy. |
| `addFromUrl(url, name?)` | Load a public, CORS-enabled IFC URL. Returns `Promise<ModelLoadedEvent>`. |
| `select(expressId, modelId?)` | Select + frame an element by IFC expressID. |
| `isolate(ifcType?)` | Isolate a category (e.g. `"IfcWall"`); omit to clear. |
| `setView(view)` | Fly to a camera view: `iso`·`top`·`bottom`·`front`·`back`·`left`·`right`. |
| `fit()` / `reset()` | Frame the active model / reset the camera. |
| `showAll()` | Restore full visibility (clear hidden elements + isolation). |
| `setLanguage(lang)` | Change UI language at runtime. |
| `clear()` | Remove all loaded models. |
| `getLanguages()` | Supported language codes (reflects the iframe once ready). |
| `getModels()` | `Promise<ModelSummary[]>` — the loaded models (`{ id, fileName, elementCount }`). |
| `getElement(id, modelId?)` | `Promise<IfcElementData \| null>` — attributes + property/quantity sets. |
| `getValidation()` | `Promise<ValidationSummary \| null>` — Health Score + issue counts. |
| `getStats()` | `Promise<StatsResult>` — per-category element counts per model (for charts). |
| `getIssues(opts?)` | `Promise<IssuesResult>` — validation issues for a table (`{ severity?, limit? }`). |
| `checkIds(idsXml)` | `Promise<IdsResult>` — check the model against a buildingSMART **IDS** (`.ids` XML). |
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

Concurrent `add()`/`addFromUrl()` calls are **serialized** internally (one load at a time) and each promise is correlated to its own load by request id — so an app-initiated load inside the iframe (a URL param, a user upload) never resolves your `add()` promise.

### Events
| Event | Payload |
|-------|---------|
| `ready` | `{ languages }` — the viewer is mounted and ready |
| `model-progress` | `{ percent, phase }` (download → parse → render) |
| `model-loaded` | `{ modelId, fileName, elementCount, fromCache }` |
| `validation-completed` | `{ qualityScore, errors, warnings, info }` — the Health Score |
| `model-error` | `{ message, url?, name? }` |
| `element-selected` | `{ expressId, modelId, ifcType, name }` |

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

## How it relates to the iframe embed

The SDK is a thin wrapper over the same embed + postMessage protocol documented in
[`EMBED_URL_PARAMS.md`](./EMBED_URL_PARAMS.md). If you only need a static deep-link
(a public model URL, no host-supplied bytes), a plain `<iframe src="…?model=…&embed=1">`
is enough — the SDK adds the byte-streaming `add()` path and a typed JS API on top.

## Notes & limits

- **CORS** only matters for `addFromUrl`. `add(bytes)` needs no CORS — you hand the
  bytes over directly.
- `add(bytes)` **transfers** the buffer (it becomes detached in your code). Pass a
  copy if you still need the bytes afterward.
- The app must be **iframe-embeddable** (no `X-Frame-Options: DENY`). GitHub Pages
  sets none by default.
- Vite **dev** server does not serve `public/sdk/index.html` for `/sdk/` (its SPA
  fallback intercepts HTML). It works in a real `vite build` / static host. To test
  the SDK in dev, `import()` `/<base>/sdk/ifc-viewer.es.js` directly.
