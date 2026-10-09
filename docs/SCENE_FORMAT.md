# Scene documents (`ifc-viewer-scene` v1)

A **scene document** is one JSON file that describes a whole digital-twin scene:

- which IFC models to load;
- which data layers to show and how they look;
- which live devices paint which IFC elements;
- how the view opens: map, background, sun and camera.

It is versioned and validated. It is written to be read and edited by a person,
kept in a repository, and published on any static host.

- Code: `src/lib/scene-doc/` (pure; tested in `scene-doc.test.ts`).
- JSON Schema: <https://www.ifcvieweronline.eu/schemas/scene-v1.json> (`public/schemas/scene-v1.json`).

## Three ways to open one

| How | Example | Where the scene lives | Size limit |
|---|---|---|---|
| By URL | `https://www.ifcvieweronline.eu/?scene=https://example.org/plaza.scene.json` | Any static host. Needs CORS, or the same origin as the viewer. | None |
| In the link | `https://www.ifcvieweronline.eu/#scene=7Vtfj9u4…` | Inside the URL fragment. The fragment is never sent to any server, ours included. | About 16 000 characters after compression. A scene with 4 models and 4 layers takes about 3.5 KB. |
| From a file | Share → Digital-twin scene → *Open scene…* | The user's disk. | Must fit in a link (it is opened as one). |

Both URL forms combine with the usual parameters, and an explicit parameter wins.
For example, `?scene=…&ui=client&bg=white` opens the scene with the client skin on
a white background.

In the app, **Share → Digital-twin scene** does three things:

- writes the current scene: it downloads the `.scene.json`, copies the `#scene=` link, or copies an `<iframe>` built on that link;
- lists every data source the scene reads, with its attribution;
- opens a scene file.

## Format

```jsonc
{
  "$schema": "https://www.ifcvieweronline.eu/schemas/scene-v1.json",
  "format": "ifc-viewer-scene",
  "v": 1,
  "meta": {
    "title": "Plaça de Catalunya",
    "description": "…",
    "license": "CC BY 4.0",
    "place": { "name": "Barcelona", "lat": 41.3874, "lon": 2.1696 },
    "notes": ["Asset values in the IFC files are illustrative."]
  },
  "models": [
    { "url": "/models/barcelona-catalunya/catalunya-mobility-hub.ifc" },
    { "url": "https://cdn.example.org/fountain.ifc", "name": "Fountain" }
  ],
  "layers": [ /* entries of an ifc-viewer-data-layers v1 file */ ],
  "twin": { "sources": [ /* .twin.json sources */ ], "bindings": [ /* … */ ] },
  "view": {
    "map": "terrain,buildings",
    "background": "paper",
    "camera": { "position": [120, 80, -40], "target": [0, 0, 0] }
  }
}
```

### Each part is a format the app already speaks

| Part | Same as | Applied by |
|---|---|---|
| `models[]` | `?model=` / `?name=` | the URL loader (federated, in order) |
| `layers[]` | the `layers` of an exported `ifc-viewer-data-layers` v1 file | the layer importer (a session-only import, like `?layers=`) |
| `twin` | a `.twin.json` v1 (`sources` + `bindings`) | the twin store, in session-only mode |
| `view.map` / `view.look` | `?map=` / `?look=` | the map deep link |
| `view.background` | `?bg=` | the background store (not saved) |
| `view.solar` | `?solar=` | the sun panel |
| `view.view` | `?view=` | the first-settle camera preset |
| `view.camera` | `?camera=px,py,pz,tx,ty,tz` (new) | applied after the map's own fly-in, so it is the last word |

That is why the format costs almost no new code. A scene is resolved **before** the app
mounts (`scene-boot.ts`). Its URL-shaped half becomes parameters the app already
reads (`setSceneParams`). Its layers and twin are handed to their importers once the
models are in, so the layers anchor to the models' own georeference and the bindings
find their GlobalIds.

### Rules

- **URLs only.** A model opened from the user's disk cannot be shared. Export says how
  many were left out.
- **No secrets.** Layer URLs go through the same scrubbing as a layer export
  (`app_key`, `token`, `apikey`… are removed). Twin sources never include their request
  headers.
- **The visitor's own setup is untouched.** While a scene is open, the visitor's saved
  layers and twin are neither restored nor overwritten (session-only, like `?layers=`).
- **Same-origin model URLs are stored as paths** (`/models/…`). The same scene then
  opens on localhost, on a preview deployment and on production.
- **Validation is forgiving per part and strict overall.** These are errors that stop
  the scene: the wrong `format`, a newer `v`, or nothing to show (no models and no
  layers). A broken part is dropped with a warning that names its JSON path, and the
  rest still opens. Examples: a model URL that is not http(s), or a camera with five
  numbers.
- **A failing scene never blocks the app.** It boots without the scene and shows why
  in a toast.

### Camera coordinates

`view.camera` is in **scene coordinates**: metres, Y up, the eye position and then the
orbit target. Tours and BCF viewpoints use the same convention. Scene coordinates
depend on which models load and in what order, and on whether the map is on. That is
why a scene stores its models in order and applies its camera last.

## Hosting a scene for free (no backend)

1. Download the `.scene.json` from Share → Digital-twin scene.
2. Put it, and any models it references, on a static host that sends CORS. GitHub
   Pages, Netlify, Cloudflare Pages, an S3 bucket or your own web server all work.
3. Open `https://www.ifcvieweronline.eu/?scene=<its URL>`, or embed that URL in an
   `<iframe>`.

When there is no host at all, the `#scene=` link works without one, within its size
limit.

## What a scene does not (yet) carry

- **Point clouds and meshes.** `?scan=` exists as a URL parameter but is not part of
  v1.
- **Sections, measurements, model groups, tours.** A tour has its own `#tour=` link.
- **Recorded history of live layers.** It stays on the device that recorded it.
- **Per-model visibility or opacity.**

These are candidates for v1.x. The validator ignores unknown keys, so adding optional
parts does not break v1 readers.
