# T4 — Informe PDF/XLSX («nubes de revisión automáticas») y BCF 3.0 por cambio

Lee primero `tasks/_comun.md` y `tasks/T1-RESULTADO.md`. Requisito: T1 fusionada. Contexto: `10-spec.md` §4 V2.2–V2.3 y la nota de Free/Pro; `02-dominio.md` (BCF 3.0, códigos ISO 19650); `05-ux.md` (lo que se lleva a obra).

## Objetivo
Un documento que el usuario pueda llevar a obra y enviar al proyectista para reclamar.

## Qué construir
1. `src/lib/compare/report-revision.ts`, con:
   - `revisionToXlsx(diff)`, que reutiliza el escritor XLSX de COBie (búscalo en `src/lib/`) y tiene una hoja de resumen y otra de cambios con columnas A y B;
   - `revisionToPdf(diff, captures, text)`, generado en el navegador sin servidor, con portada (ficheros A y B, fechas, revisión si el nombre sigue ISO 19650), resumen por tipo y por planta, y una ficha por cambio con captura, frase de obra, tabla A/B y estado de revisión. Si hace falta una librería de PDF, usa una que ya esté en el repo; si no hay ninguna, propón una y anótalo.
2. **Capturas por cambio:** una API `captureChange(globalId)` que encuadra, resalta y hace la captura. Reutiliza la captura que ya existe (`CaptureToolbar`/`CapturePreviewModal`) mediante una función de librería, sin tocar los componentes de T3.
3. **BCF 3.0:** amplía `bcf-sync.ts` para generar un topic por cambio, con título igual a la frase de obra, viewpoint, componentes por GUID (selección y coloreado) y el snapshot PNG. Exporta un .bcfzip.
4. Botones de exportar: T3 es dueña de la UI. Tú expones las funciones y una línea en el RESULTADO para que T3, o un cambio final pequeño, las conecte.
5. Gating Free/Pro: deja una bandera `requiresPlan: 'pro'` en el PDF y en el XLSX, **sin activar ningún cobro**. Revisa `docs-planning/12` y `19` y anota tu recomendación.

## Puedes tocar
`src/lib/compare/report-revision.ts`, `bcf-sync.ts`, `src/lib/compare/capture-change.ts`, sus tests y las claves i18n `compare.report.*`.

## No toques
`src/components/compare/**` (es de T3), el motor ni `src/lib/drawing/**`.

## Aceptación
- El PDF de F8 lista todos los cambios esperados, cada uno con su captura.
- El XLSX de F8 abre sin errores; se comprueba con el parser del propio test y se anota que se abrió en LibreOffice.
- El .bcfzip valida contra el XSD de BCF 3.0. Se documenta la importación manual en BIMcollab Zoom o Solibri, o se deja como pendiente si no tienes acceso.
- Nada sale del navegador.

Al terminar escribe `tasks/T4-RESULTADO.md`.
