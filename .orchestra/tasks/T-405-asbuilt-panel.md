# T-405 — Ship the As-Built Preview panel inside the point cloud panel
## Objetivo
Lazy `AsBuiltPanel` stepper (cloud → align → tolerance → run → results table) mounted as a "Compare with model (Preview)" section in `PointCloudPanel`.
## Contexto mínimo necesario
- Repo: C:/repo/ifc-asbuilt2. Diseño: docs/AS_BUILT_PHASE3_DESIGN.md §4. Depende de T-403, T-404.
- Leer: `src/components/PointCloudPanel.tsx` (sections, i18n namespace `pointcloud`), `src/components/pointcloud/pc-ui.tsx`, i18n locale files for that namespace (grep a key used in the panel), `src/lib/url-params.ts` for flag parsing.
- Archivos (≤5): `src/components/asbuilt/AsBuiltPanel.tsx` (new), `src/components/PointCloudPanel.tsx` (mount, lazy), i18n en + es files for the namespace (other locales: follow the repo's i18n guard — if it requires all 10, report and stop at en/es).
- Decisiones: free, no `useEntitlement`; visible only if ≥1 IFC + ≥1 ready cloud AND `?asbuilt=1` (pending Joel, see design Q2); "Preview" label + note "Indicative result; depends on your alignment." No AI wording.
- NO tocar: engine, worker, store logic beyond consuming it.
## Criterios de aceptación (verificables)
- [ ] Section hidden without flag / without IFC / without ready cloud (component test).
- [ ] Run disabled with explicit reason when <3 pairs or gate fails; shows fit RMSE, LOO RMSE, τ.
- [ ] Run: builds input with yields, `samplePoints(cloudId, MAX_CLOUD_POINTS)`, progress + Cancel (abort); refusal from engine rendered as text, not as a score.
- [ ] Results: score, coverage %, table (GlobalId/name, state, p95 mm, samples) sorted worst-first; row click selects + frames element.
- [ ] Entry chunk unchanged in size class (AsBuiltPanel lazy; `npm run build` passes).
- [ ] `npx tsc --noEmit` clean; tests green.
## Fuera de alcance
Colouring/isolating, CSV (T-406).
## Formato de vuelta (obligatorio, ≤ 250 palabras)
STATUS: done|partial|blocked · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS/DUDAS (≤3) · SIGUIENTE
## Informe
