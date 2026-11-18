# T-402 — Convert a rigid fit into the cloud's existing AlignmentOffset
## Objetivo
Pure function that composes a `FitResult` (T-401, maps current cloud world positions → model) onto a cloud's current `PointCloudAlignment`, returning a new alignment with rung `manual` so the cloud on screen IS the scored cloud (design alt. A).
## Contexto mínimo necesario
- Repo: C:/repo/ifc-asbuilt2. Diseño: docs/AS_BUILT_PHASE3_DESIGN.md §3.
- Leer: `src/lib/pointcloud/pc-types.ts` (`AlignmentOffset`, `PointCloudAlignment`, `clampOffset`, `MAX_LEVEL_DEG`), `src/lib/pointcloud/pc-align.ts` `effectiveTransform()` (orden real de composición: origin, yaw∘tilt, offset).
- Archivos a crear: `src/lib/asbuilt/fit-to-alignment.ts`, `src/lib/asbuilt/fit-to-alignment.test.ts`.
- NO tocar: `pc-align.ts`, `pc-types.ts` (si hiciera falta exportar algo, informar en vez de cambiarlo).
## API esperada
`applyFitToAlignment(current: PointCloudAlignment, fit: FitResult): { alignment: PointCloudAlignment } | { error: 'tilt-out-of-range' }`
## Criterios de aceptación (verificables)
- [ ] Property test: for random current alignments and random fits (yaw any, tilt ≤ 10°), transforming sample source points with `effectiveTransform(result)` equals fit∘`effectiveTransform(current)` within 1e-6 m.
- [ ] Required pitch/roll > MAX_LEVEL_DEG → `tilt-out-of-range` (no silent clamp).
- [ ] scaleMul unchanged; rung 'manual', confidence 'manual'; reasons gains an i18n key `align.reason.pointPairs`.
- [ ] `npx tsc --noEmit` clean; test file green.
## Fuera de alcance
Persistir (`saveOffset`), aplicar al sistema (T-404).
## Formato de vuelta (obligatorio, ≤ 250 palabras)
STATUS: done|partial|blocked · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS/DUDAS (≤3) · SIGUIENTE
## Informe
