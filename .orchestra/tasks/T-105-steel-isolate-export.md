# T-105 — Wire isolate-in-3D and CSV/XLSX export into the steel panel

## Objetivo
Desde el panel Steel takeoff, el usuario hace clic en una fila y ve solo esas piezas en 3D (y puede volver a ver todo), y descarga el listado en CSV y XLSX para pasarlo a compras/taller.

## Contexto mínimo necesario
- Worktree C:/repo/ifc-steel, rama feat/steel-takeoff. Panel: src/components/steel/SteelTakeoffPanel.tsx con prop `onRowAction(row, refs)` sin conectar; filas con `refs: {modelId, expressId}[]` (src/lib/steel/collect.ts).
- Aislar: `isolateElements(targets[{expressId, modelId}], enabled)` src/lib/viewer.ts:494 (no modifiques viewer.ts; solo úsalo). Ver cómo lo invoca Clash.
- XLSX: exceljs SIEMPRE con `await import('exceljs')`; modelo src/lib/cobie/xlsx.ts:64-68 y src/lib/compare/report-revision.ts. CSV: ver components/compare/ChangesTab.tsx (escape, BOM UTF-8 para Excel).
- Textos nuevos en los 10 idiomas en src/lib/steel/i18n.ts.
- tsc con NODE_OPTIONS=--max-old-space-size=8192.

## Criterios de aceptación
- [ ] Clic en fila → aísla sus piezas; fila activa marcada; botón "mostrar todo" restaura; cerrar el panel restaura.
- [ ] Export CSV y XLSX: una fila por perfil (perfil, clase, nº, longitud m, peso kg, material, sin peso) + totales; XLSX con segunda hoja "Parts" (una fila por pieza: modelo, id, nombre, marca, perfil, longitud, peso, fuente). Nombre de fichero con el nombre del modelo.
- [ ] Builders puros en src/lib/steel/export.ts con tests (CSV escape de comas/comillas, decimales con punto, totales).
- [ ] vitest src/lib/steel verde; tsc -b sin errores; `npm run build` (en segundo plano si tarda) OK.
- [ ] Commit en inglés sin mencionar IA; sin push.

## Fuera de alcance
ProfileName vía web-ifc, PDF, cambios en takeoff.ts/collect.ts salvo lo mínimo.

## Formato de vuelta (≤ 250 palabras) — detalle en "Informe".

## Informe
STATUS: done. Commit 3eeb864b en feat/steel-takeoff (C:/repo/ifc-steel), sin push. collect.ts y takeoff.ts sin tocar.

- src/lib/steel/export.ts, builders puros:
  - `csvCell`, `rowTable`, `partTable`.
  - `steelCsv`: BOM UTF-8, CRLF, decimales con punto (longitud con 3 decimales, peso con 1) y fila TOTAL.
  - `steelXlsx`: exceljs con `await import`; hoja "Takeoff" con la fila de totales en negrita, y hoja "Parts" con modelo, id, nombre, marca, perfil, longitud, peso y fuentes de longitud y peso.
  - `steelFileBase`: el nombre del fichero sale del primer modelo, más "+N" si hay varios.
- export.test.ts: escape de comas y comillas, BOM, decimales, totales, las dos hojas del XLSX (se lee de vuelta con exceljs) y el nombre de fichero. El test del XLSX tiene timeout de 30 s: en la suite de src/lib/steel falló una vez por los 5 s por defecto (la importación de exceljs es lenta).
- SteelTakeoffPanel.tsx:
  - Clic en una fila aísla sus `refs` con `isolateElements(..., true)`. La fila activa queda marcada (fondo, contorno y aria-selected).
  - Un segundo clic en la misma fila o "Mostrar todo" restauran la vista.
  - Cerrar el panel o recalcular también restauran.
  - Botones CSV y Excel; la descarga usa downloadBlob de components/compare/ui.
  - `onRowAction` se mantiene como enganche opcional, que se llama después de aislar.
- i18n: showAll, exportCsv, exportXlsx e isolateHint en los 10 idiomas. La prueba de paridad de i18n pasa.
- Las cabeceras de CSV y XLSX van en inglés y fijas (Profile, Length_m…), pensadas para herramientas de compras y taller. No se traducen.

Verificado: vitest src/lib/steel 27/27; tsc -b sin errores; `npm run build` OK (exit 0). No se ha probado en el navegador.
