# T-403 — Build the As-Built pipeline input and a cancellable worker client
## Objetivo
Turn IFC element triangles + a world-space cloud sample into `AsBuiltPipelineInput` without blocking the main thread, and run it in `asbuilt.worker.ts` via a promise client with cancel.
## Contexto mínimo necesario
- Repo: C:/repo/ifc-asbuilt2. Diseño: docs/AS_BUILT_PHASE3_DESIGN.md §2, §4 paso 4.
- Leer: `src/lib/asbuilt/pipeline.ts` (input type, `asBuiltTransferables`), `src/lib/asbuilt/surface-sampling.ts` (`ElementGeometry`: indexed), `src/lib/scene/item-triangles.ts` (`collectItemTriangles` → non-indexed world triangles per localId), `src/workers/asbuilt.worker.ts` (protocol), an existing worker client for the Vite `new Worker(new URL(...), {type:'module'})` convention.
- Archivos a crear: `src/lib/asbuilt/build-input.ts`, `src/lib/asbuilt/build-input.test.ts`, `src/lib/asbuilt/asbuilt-client.ts`.
- NO tocar: pipeline.ts, worker, item-triangles.ts.
## Requisitos
- `trianglesToElements(map, {modelId, yieldEvery})` async: concatenate chunks, sequential Uint32 indices, yield to the event loop every N elements (nothing synchronous over the whole model). Skip elements with 0 triangles.
- `chunkCloud(positions: Float32Array, chunk = 262_144)` → Float32Array[] (subarray copies so each can be transferred).
- `MAX_CLOUD_POINTS = 3_000_000` constant (caller passes to `samplePoints`).
- Client: `runAsBuiltInWorker(input, {signal}) → Promise<AsBuiltPipelineResult>`; transfers buffers; one worker per run, terminated on result/error/abort; rejects with AbortError on abort.
## Criterios de aceptación (verificables)
- [ ] Unit: 2 elements × triangles → ElementGeometry with correct index count; element order/ids preserved; empty element skipped.
- [ ] Unit: chunkCloud on 600k points → 3 chunks, total length preserved.
- [ ] Unit: build from `synthetic-scene.ts` and call `runAsBuilt` directly → score 100 (proves adapter correctness).
- [ ] `npx tsc --noEmit` clean; tests green.
## Fuera de alcance
UI, store, picking.
## Formato de vuelta (obligatorio, ≤ 250 palabras)
STATUS: done|partial|blocked · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS/DUDAS (≤3) · SIGUIENTE
## Informe
STATUS: done. Created build-input.ts (trianglesToElements async with yieldEvery default 200 + optional `classOf(localId)` since triangle map has no class; default 'IfcBuildingElement'; ids = Number(localId); trailing partial triangles dropped), chunkCloud (slice copies), MAX_CLOUD_POINTS; asbuilt-client.ts (runAsBuiltInWorker, one worker/run, transfers via asBuiltTransferables, AbortError DOMException). build-input.test.ts: 3 tests green (incl. synthetic scene → score 100). tsc clean.
