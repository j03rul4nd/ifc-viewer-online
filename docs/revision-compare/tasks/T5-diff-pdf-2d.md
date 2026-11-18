# T5 — Diff de PDF 2D con alineación automática

Lee primero `tasks/_comun.md`. Es independiente de T1 y **solo empieza si el usuario confirma que recibe revisiones en PDF**; Joel lo indicará. Contexto: `10-spec.md` §4 V3.1; `04-casuisticas.md` (PDF vectorial, escaneado, escala y encuadre, cajetín, hojas reordenadas); `03-competencia.md` (Bluebeam Overlay: falla al alinear con escala distinta).

## Lo que ya existe (no reescribir)
- `src/lib/drawing/diff.ts:40` `diffSheets(before, after, tolerance)`: diff segmento a segmento.
- `src/lib/drawing/pdf-vectors.ts`: extracción de vectores con pdf.js cargado bajo demanda.
- `src/lib/drawing/import-file.ts`, `drawing.worker.ts`, `export.ts`.

## Qué construir
1. `src/lib/drawing/align.ts`: registro afín entre la hoja A y la hoja B, que corrija escala, traslación y rotación pequeña:
   - primero por el marco o cajetín;
   - si no, por RANSAC sobre extremos de segmentos largos.
   Devuelve la matriz y la calidad (RMS en mm de papel).
2. Ignorar el cajetín: una zona excluida configurable que se detecta como la región que cambia en todas las hojas.
3. Emparejar hojas entre A y B por número o título de plano cuando el orden cambie.
4. Superposición rojo (solo en A) / verde (solo en B) / gris (igual), y una lista de zonas cambiadas, agrupando las diferencias en «nubes» con el bbox de cada grupo.
5. PDF escaneado (sin vectores): avisar «no vectorial», sin diff de píxeles en esta tarea; se apunta en el parking lot.
6. Exportar el PDF de B con nubes de revisión dibujadas, como anotaciones o como capa, con la librería que ya use `export.ts`.
7. UI mínima dentro de la superficie de planos que ya existe (búscala desde `import-file.ts`), siguiendo el flujo de 3 clics de `05-ux.md`.

## Puedes tocar
`src/lib/drawing/**` (solo añadidos y `diff.ts`), los componentes de planos que ya existen y las claves i18n `drawing.compare.*`.

## No toques
`src/lib/compare/**` ni `src/components/compare/**`.

## Aceptación
- Fixtures en `tests/fixtures/revision-2d/`, generados por script: A y B vectoriales con escala distinta (1:100 frente a 1:50), desplazados 20 mm, con 3 cambios conocidos y el cajetín cambiado.
- Resultado esperado: 3 nubes y 0 falsos positivos por el cajetín.
- RMS de alineación por debajo de 0,5 mm de papel.
- Hojas reordenadas emparejadas bien.
- Un PDF de 20 hojas se compara en menos de 20 s en escritorio.

Al terminar escribe `tasks/T5-RESULTADO.md`.
