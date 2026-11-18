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

STATUS: done. Paint via existing `viewer.setTwinPaint` (fragment material defs cached by viewer; cleared with null), isolate via `viewer.isolateElements`. `createAsBuiltView` tracks what was applied; clear() on Clear button, new run, and panel unmount. CSV: `results-csv.ts`, worst-first, all elements, labels (Name/GlobalId) read for all ids at export. Added optional `samples` to ElementDeviation (pipeline sets it) and exported ERROR_MULTIPLE (severe deviation = red). Strings `asBuilt.view.*` ×10. Tests: results-csv.test.ts (CSV, quoting, injection, colours, clear). tsc exit 0; 85 tests green (asbuilt + pointcloud parity).
Risk: twin paint channel shared with the operational twin device runner; if both active, last writer wins.
