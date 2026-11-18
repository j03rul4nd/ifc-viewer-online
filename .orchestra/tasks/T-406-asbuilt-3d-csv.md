# T-406 — Colour/isolate elements by As-Built state and export CSV
## Objetivo
From the results panel: "Colour by state", "Isolate deviated + missing", "Clear", and "Download CSV".
## Contexto mínimo necesario
- Repo: C:/repo/ifc-asbuilt2. Diseño: docs/AS_BUILT_PHASE3_DESIGN.md §4 paso 5. Depende de T-405.
- Leer: how existing features colour/isolate by localId (grep `setColor`/`isolate`/`highlight` in viewer or validation colouring), an existing CSV export helper (grep `toCsv`/`downloadCsv`).
- Archivos (≤5): `src/lib/asbuilt/results-csv.ts` + `.test.ts`, `src/lib/asbuilt/results-colors.ts`, `src/components/asbuilt/AsBuiltPanel.tsx`, i18n en/es.
- Colours: conforming green, deviated amber (error severity red), missing red, unobserved grey, unmodelled n/a. Use existing palette tokens if any.
## Criterios de aceptación (verificables)
- [ ] CSV: header `globalId,name,ifcClass,state,p95_mm,matched_fraction,samples`; RFC 4180 quoting; formula-injection guard (=,+,-,@ prefixed); unit test.
- [ ] Colouring reversible: Clear / closing panel restores original materials (no leaked materials — test or dispose check).
- [ ] Isolate uses existing visibility API (no new hide mechanism).
- [ ] `npx tsc --noEmit` clean; tests green.
## Fuera de alcance
BCF, shareable report (plan pieza 6).
## Formato de vuelta (obligatorio, ≤ 250 palabras)
STATUS: done|partial|blocked · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS/DUDAS (≤3) · SIGUIENTE
## Informe
