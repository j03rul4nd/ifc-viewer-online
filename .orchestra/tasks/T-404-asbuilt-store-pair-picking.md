# T-404 — Add the As-Built store and point-pair picking interaction
## Objetivo
Zustand store for the As-Built session and a controller that captures IFC↔cloud point pairs using the existing pickers, shows markers, fits (T-401) and applies the result to the cloud (T-402).
## Contexto mínimo necesario
- Repo: C:/repo/ifc-asbuilt2. Diseño: docs/AS_BUILT_PHASE3_DESIGN.md §3–§4. Depende de T-401, T-402.
- Leer: `src/lib/measure/picker.ts` (`createScenePicker`, vertex snap), `src/lib/pointcloud/point-cloud-system.ts` (`pickPoint`, `setAlignment`), `src/lib/pointcloud/pc-runner.ts` `realignCloud`, `pc-align.ts` `saveOffset`, the pointCloud store (grep `usePointCloudStore`), how MeasurementPanel gets the picker/canvas.
- Archivos a crear/tocar (≤5): `src/stores/asBuiltStore.ts`, `src/stores/asBuiltStore.test.ts`, `src/lib/asbuilt/pair-controller.ts`, (+1 wiring file if needed, report which).
- NO tocar: measure tools behaviour; a cloud must never intercept an IFC click outside this mode.
## Requisitos
- Store: `cloudId`, `pairs[{model?, cloud?}]`, `mode '4dof'|'6dof'`, `fit|fitError`, `declaredMm=25`, `precisionMm=5`, `phase 'idle'|'picking-model'|'picking-cloud'|'running'|'done'|'error'`, `result`, actions add/remove/reset.
- Controller: start(): IFC click (vertex snap) then cloud click; Esc cancels pending; markers (numbered, same colour for both ends) disposed on stop; refit on every completed pair; `apply()` uses T-402 → `setAlignment` + persists via the existing manual-offset path; after apply, pairs' cloud ends are re-projected so residuals stay meaningful.
## Criterios de aceptación (verificables)
- [ ] Store unit tests: add/remove pair refits; <3 complete pairs → no fit; gate reflects declaredMm vs alignmentRmseM.
- [ ] Controller unit test with mocked pickers: two clicks produce one pair; Esc leaves no half pair; stop() disposes markers (geometry/material dispose called).
- [ ] `npx tsc --noEmit` clean; tests green.
## Fuera de alcance
Panel UI (T-405), running the worker.
## Formato de vuelta (obligatorio, ≤ 250 palabras)
STATUS: done|partial|blocked · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS/DUDAS (≤3) · SIGUIENTE
## Informe

- 2026-11-18: i18n `align.reason.pointPairs` added to 10 pointcloud locales (cb65dced). tsc exit 0; vitest asbuilt+locales+i18n 29 files / 241 tests green.
