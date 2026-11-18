# CONTEXT — mapa del repo (Explorer T-001, 2026-11-13, rama feat/urban-3d-vertical-infrastructure)

## Mapa de src/
- `src/lib/viewer.ts` — núcleo (`createViewer` :1110), ThatOpen/Fragments sobre Three.js.
- `src/lib/loader.ts:59` — `useIfcLoader`. `src/lib/loading/` — LoadManager (toda carga = job). `src/lib/model-registry.ts` — multi-modelo.
- `src/stores/` — Zustand (model, ui, scene, geo, ids, validation, bcf…). Ojo: `lib/inspector.ts` y `lib/diffStore.ts` también son stores.
- `src/workers/` — `ifc-parser.worker.ts` (IfcImporter → fragments, :55), validator, ids, export, bcf-parser, geo-*, point-cloud, gif-export.
- `src/lib/ids|eir|certify/` — IDS, perfiles EIR, certificado.
- `src/lib/geo/` (+ layers, pointcloud, solar) — gemelo urbano/SIG.
- `src/components/` — paneles `*Panel.tsx`; subcarpetas ids, eir, geo, mobile, blog, pricing, dashboard, account, reactbits.
- Contenido: `src/seo/`, `src/lib/blog-posts.ts`; generadores en `scripts/seo/`.
- SDK: `src/sdk/ifc-viewer-sdk.ts` → `build:sdk` → `public/sdk/`.

## Carga y propiedades
- IFC: `viewer.ts:2676` `ifcLoader.load(buffer, true, name)`; .frag: `:2745`.
- Props: `model.getItemsData([id], ITEM_DATA_CONFIG)` (:2841, :2861, :3851); config con IsDefinedBy :1041.
- Psets formateados :855–930; Qto (IfcElementQuantity) :930; tipos :172–231.

## Comandos
- `npm run dev` · `npm run build` (sdk+embed+`tsc -b`+vite) · `npm test` (vitest run).
- Un test: `npx vitest run <ruta>`. Typecheck: `npx tsc -b` (no hay script typecheck/lint).
- Blender: `npm run props|district|hotel-vela|tower`, `og`, `covers`.

## IFC de prueba
- `public/HelloWorld.ifc`, `public/Ifc2x3_Duplex_Architecture.ifc`, `public/JapaneseTemple.ifc`; `public/models/*`.
- Fixtures: `src/lib/ids/ids-fixtures/` (FIXTURES.md), `src/lib/geo/__fixtures__/`.
- No hay IFC de acero/Tekla → hará falta para Steel Takeoff.

## Gotchas
- Build con `--max-old-space-size=6144`; suite completa con timeouts de 5 s aleatorios → re-ejecutar solo el test.
- Texto público ×10 idiomas (`src/locales`, `public/sdk/<lang>/`); generadores escriben en `public/`/`dist/` → regenerar, no editar HTML.
- `public/models` cambiado + en main → `npm run deploy:models` (script solo en main, no en esta rama); >25 MiB a lista gzip de `cf-models/`.
- Esta rama tiene mucho sin commitear y no tiene `mcp/` (está en main): no descartar nada.
- Ni commits ni PRs mencionan IA.
- tsc -b necesita NODE_OPTIONS=--max-old-space-size=8192 (OOM 134 por defecto).
- Pro en local (sin override dev): en consola `(await import('/src/stores/cloudAccountStore.ts')).useCloudAccountStore.setState({status:'signed-in', planCache:{plan:'pro', planStatus:'active'}})`.
- Fixture de acero hecho a mano: C:/repo/ifc-steel/fixtures/steel/steel-small.ifc (sin commitear). Duplex tiene 12 IfcBeam sin Qto; HelloWorld = sin acero.
