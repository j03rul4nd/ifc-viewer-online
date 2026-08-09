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
| `model`    | URL(s)                           | —         | Public IFC URL to load. Comma-separated or repeated for multiple (federated) models. Aliases: `src`, `url`. |
| `name`     | string(s)                        | from URL  | Display file name(s), parallel to `model`. Aliases: `file`. |
| `embed`    | `1`/`0`                          | `0`       | Embed mode — slims the chrome for iframe hosting. |
| `ui`       | `minimal` \| `full` \| `kiosk` \| `client` | `minimal` | Chrome preset (implies `embed=1`). |
| `validate` | `1`/`0`                          | `1`       | Run validation automatically after load (drives the Health Score). |
| `select`   | expressId (number)               | —         | Select + frame an element once loaded. |
| `isolate`  | IFC class, e.g. `IfcWall`        | —         | Isolate a category after load (best-effort, by canonical IFC class). |
| `lang`     | locale code (`en`, `es`, …)      | auto      | Force the UI language (only if supported). |
| `accent`   | hex `rrggbb` / `#rrggbb`         | brand     | Tint the viewer's accent to match your dashboard. |
| `map`      | `1` / `0` / layer list           | off       | Drop the model onto the basemap using its own georeferencing. A layer list turns extras on: `map=terrain,buildings,showcase`. Naming a layer implies the map. |
| `scan`     | URL(s)                           | —         | Point cloud(s) to load alongside the model. Comma-separated or repeated, like `model`. |

### Scene deep links (`map` / `scan`)

Both wait for the first model — the map has nothing to place without one, and a
scan would have nothing to align against — and both then drive the same internal
commands the SDK uses, so behaviour is identical either way.

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
- **Neither works with `ui=client`.** The panels that serve them are not mounted
  in the client skin, so the command has nobody to answer it and you get an
  error toast. Use `ui=kiosk` for a chrome-less recording instead.

Turning on OpenStreetMap surroundings queries a public service (Overpass) and
can take half a minute; the scan loads in parallel rather than queueing behind it.

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

### Presets

| Preset    | Toolbar | Tree | Sidebar | Panel auto-open | Camera | Home |
|-----------|:------:|:----:|:-------:|:---------------:|:------:|:----:|
| `minimal` | ✓ | — | ✓ | — | ✓ | — |
| `full`    | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `kiosk`   | — | — | — | — | — | — |
| `client`  | — | — | — | — | ✓ | — |

The collapsed validation bar (with the **Health Score** badge) shows in `minimal`/`full`
even when the panel isn't auto-opened, so the citable number is always visible.

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
| `model-loaded`     | `modelId`, `fileName`, `elementCount`, `fromCache` |
| `model-error`      | `url`, `message` |
| `element-selected` | `expressId`, `modelId`, `ifcType`, `name` |

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
| `ifcviewer:load`    | `url` (string or string[]), `name?` | Load model(s) into the scene |
| `ifcviewer:select`  | `expressId`, `modelId?` | Select + frame an element |
| `ifcviewer:isolate` | `ifcType` (e.g. `IfcWall`, or omit to clear) | Isolate a category |
| `ifcviewer:fit`     | — | Frame the active model |
| `ifcviewer:reset`   | — | Reset the camera |

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
