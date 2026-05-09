# Deployment — GitHub Pages

## Stack

- Vite 6 + React 18 + TypeScript
- `base: '/ifc-viewer-online/'` in `vite.config.ts`
- Deployed to `https://<user>.github.io/ifc-viewer-online/` via GitHub Actions (`.github/workflows/deploy.yml`)

---

## IFC loading pipeline

```
File drop
  └─ useIfcLoader (src/lib/loader.ts)
       ├─ OPFS cache check
       └─ ifc-parser.worker.ts  ← Web Worker (ES module, separate bundle)
            ├─ @thatopen/fragments IfcImporter
            └─ web-ifc WASM   (loaded from BASE_URL)
```

### Worker

The IFC parser runs entirely off the main thread in `src/workers/ifc-parser.worker.ts`.
Vite builds it as an independent ES module chunk in `dist/assets/ifc-parser.worker-HASH.js`.

### WASM

`web-ifc.wasm` and `web-ifc-mt.wasm` are copied to `dist/` root by the `copy-web-ifc-wasm`
Vite plugin (see `vite.config.ts`). At runtime the worker loads them via:

```ts
importer.wasm = { path: import.meta.env.BASE_URL, absolute: true }
// → /ifc-viewer-online/web-ifc.wasm  (correct on GitHub Pages)
```

`forceSingleThread: true` is passed to `IfcAPI.Init` so only the ST WASM is used,
avoiding Emscripten pthread sub-workers (which would fail inside a nested ES module worker).

### COEP/COOP on GitHub Pages

GitHub Pages does not support custom HTTP headers. `coi-serviceworker.js` (in `dist/`) is
registered in `index.html` and injects `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` headers on the fly, satisfying SharedArrayBuffer
requirements without a custom server.

---

## Production bug fixed — 2026-05-09

### Symptom

```
[IFC Loader] Load failed: IFC parsing failed: Parser worker script error: undefined
```

Only on GitHub Pages. Worked fine in `localhost`.

### Root cause

`vite.config.ts` had:

```js
worker: {
  format: 'es',
  rollupOptions: { external: ['three'] },  // BUG
}
```

`external: ['three']` told Rollup **not** to bundle `three` into the worker chunk.
The built worker file therefore started with:

```js
import { ... } from 'three';   // unresolvable in a browser Web Worker
```

A browser Web Worker has no `node_modules`, no module resolver, and no import map
for bare specifiers. When the browser tried to load the worker module it could not
resolve `'three'` and the worker failed to start before executing any user code.
Chrome fires an `ErrorEvent` with `message: ""` / `undefined` for this class of
failure — hence the useless `undefined` in the error string.

**Why it worked in dev:** Vite's dev server resolves all imports through its own
middleware (including inside workers). `three` was available transparently. In the
production build the worker is a self-contained Rollup bundle, so externals are fatal.

### Fix

Removed `rollupOptions: { external: ['three'] }` from the `worker` config in
`vite.config.ts`. Rollup now bundles `three` inline into the worker chunk
(`ifc-parser.worker-HASH.js`, ~4.2 MB). The worker loads and initialises correctly.

### Files changed

| File | Change |
|---|---|
| `vite.config.ts` | Removed `worker.rollupOptions.external: ['three']` |
| `src/lib/loader.ts` | Improved `errorHandler` to include `filename`, `lineno`, `colno` and a fallback message when `e.message` is empty |

### Verification

After `npm run build`, confirm:

```sh
# No bare 'three' import in the worker bundle:
grep "from 'three'" dist/assets/ifc-parser.worker-*.js
# → (no output)

# WASM files present in dist root:
ls dist/*.wasm
# → web-ifc.wasm  web-ifc-mt.wasm
```
