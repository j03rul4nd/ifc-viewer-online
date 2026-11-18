# T5 — Diff de PDF 2D con alineación automática: RESULTADO

Rama `feat/revision-compare-t5` (worktree `revision-compare-t5-c42cfe`), rebasada sobre `origin/main` `ebd14bd9`. Commits `fb933452` y `051c46ed`. La PR va contra `main` (el enlace está en el informe final).

## Lo hecho

1. **Registro afín (semejanza)**: [`src/lib/drawing/align.ts`](src/lib/drawing/align.ts)
   - `alignSheets` (`align.ts:245`) prueba primero el marco (`:261`): ajuste por mínimos cuadrados de las 4 esquinas y refinado. Si menos del 80 % de los extremos casan, pasa a RANSAC (`:273`): cada par de los 40 segmentos más largos de A y de B con el mismo rumbo (rotación de ±10° como máximo) propone una semejanza. Un primer recuento con 100 puntos descarta las propuestas malas, las 8 mejores se refinan (Umeyama, `fitSimilarity` `:167`) y gana la que tiene más inliers.
   - Devuelve la `Placement` A→B, el método (`frame`, `ransac` o `identity`), el **RMS en mm de papel de B** y la proporción de inliers.
   - `detectFrame` (`:96`) detecta el marco (el rectángulo más grande, al menos el 30 % de la hoja) y el cajetín (el rectángulo más grande dentro del marco, pegado a una de sus esquinas). `isFurniture` (`:123`) aparta el marco, el cajetín, lo que queda fuera del marco y las zonas excluidas.
2. **Cajetín ignorado**: [`src/lib/drawing/revision-2d.ts`](src/lib/drawing/revision-2d.ts)
   - Se excluye por detección geométrica, por zonas configurables (`CompareOptions.exclude`) y por `commonChangeZones` (`revision-2d.ts:346`). Esta última toma las nubes que se repiten (IoU > 0,5) en **todas** las hojas comparadas (2 o más) y repite el diff con esas zonas excluidas (`compareSheetSets` `:367`). `keepTitleBlock` permite incluirlo.
3. **Emparejado de hojas**: `sheetIdentity` (`:87`) lee los tokens de texto del cajetín (los que llevan dígito, como A-101, pesan ×3) y una etiqueta (el número de plano o el texto más grande). `matchSheets` (`:111`) empareja de forma voraz por similitud ponderada. Si no hay texto, empareja por orden; las hojas sobrantes quedan como `onlyA` / `onlyB`.
4. **Superposición y nubes**: `compareSheets` (`:269`) hace un diff tolerante. Un segmento está «presente» si todos sus puntos de muestra, cada 5 mm, quedan a menos de la tolerancia (0,5 mm de papel) de un segmento del otro lado con el mismo rumbo. Así una polilínea partida de otra forma no cuenta como cambio. El texto se compara por contenido y posición.
   - Capas: `UNCHANGED` gris, `REMOVED` rojo (solo en A), `ADDED` verde (solo en B) y `REVISION CLOUDS`.
   - Agrupado: `clusterBoxes` (`:223`) une los cambios separados menos de 8 mm (barrido por x). `cloudOutline` (`:245`) dibuja la nube festoneada.
   - Cada `RevisionCloud` lleva bbox, número de añadidos y quitados, y los textos afectados. Las nubes se numeran en orden de lectura.
5. **PDF escaneado**: con menos de 8 segmentos vectoriales devuelve `status: 'notVector'` (`:272`) y la UI muestra «No vectorial (escaneado): sin comparar». No hay diff de píxeles (va al parking lot).
6. **Exportar B con nubes**: [`src/lib/drawing/revision-pdf.ts`](src/lib/drawing/revision-pdf.ts) `revisionCloudsPdf` (`:46`). Es un escritor propio como el de `export.ts`, del que reutiliza `pdfLiteral`, y no añade dependencias.
   - Una página por hoja de B, a su tamaño, redibujada desde sus vectores.
   - Las nubes van en una capa OCG «Revision clouds» (`/OCProperties`, `:63`) y además como anotaciones `/Square` con borde nuboso `/BE << /S /C >>` (`:76`), con el texto «n: +a / −r (textos)».
7. **Lectura de todas las páginas**: [`src/lib/drawing/pdf-sheets.ts`](src/lib/drawing/pdf-sheets.ts) `sheetsFromPdfDoc` recibe el documento de pdf.js desde fuera, así que en los tests se usa el build legacy. `readPdfSheets` está en `import-file.ts:83` y es solo una adición.
8. **UI**: [`src/components/drawings/RevisionComparePdf.tsx`](src/components/drawings/RevisionComparePdf.tsx), montado en la tarea «Compare» de Crear (`DrawingPanels.tsx:364`, debajo del comparador de hojas abiertas, que sigue igual).
   - Es el flujo de 3 clics: PDF antiguo, PDF nuevo y la comparación arranca sola.
   - Abre una hoja de superposición por cada hoja con cambios y lista por hoja el método, la escala, el RMS y las nubes (+/− y textos).
   - Tiene el botón «Descargar la revisión nueva con nubes (PDF)».
9. **i18n**: 22 claves nuevas bajo `create.compare.*` del namespace `drawings`, en los 10 idiomas, con `drawings-parity` en verde.
10. **Fixtures**: `tests/fixtures/revision-2d/generate.mjs` genera `A.pdf`, `B.pdf` y `scan.pdf`.
    - A: 3 hojas (A-101, A-102 y A-103) a 1:100, revisión P01.
    - B: las mismas hojas reordenadas (A-103, A-101, A-102) a 1:50, con el dibujo desplazado 20 mm y el cajetín cambiado en todas (revisión, fecha, escala y una fila nueva).
    - A-101 tiene 3 cambios: un pilar añadido, una puerta quitada y el texto KITCHEN cambiado a KITCHEN + DINING.
    - En `.gitattributes` los PDF van como `binary`, para que la conversión CRLF no rompa el xref.

## Tests

`src/lib/drawing/revision-2d.test.ts` (11 tests, entorno node, lee los PDF reales con pdf.js legacy):

- **fixture**: empareja las hojas reordenadas como [A3↔B1, A1↔B2, A2↔B3] con las etiquetas A-103, A-101 y A-102. Las 3 hojas quedan `compared`, con **RMS < 0,5 mm** (real ≈ 0) y escala 2,000. Salen **3 nubes en A-101** y cada una contiene la posición del cambio sembrado. Salen **0 nubes en A-102 y A-103**, y **ninguna nube en el cajetín**.
- **scan**: el PDF escaneado da `notVector`.
- **export**: el PDF de B tiene 3 páginas, `/OCProperties` y 3 `/Square` cloudy. pdf.js lo vuelve a abrir y lee 3 anotaciones en la página 2.
- **align**: el ajuste exacto funciona. RANSAC recupera escala 0,5, rotación 1,5° y desplazamiento sin marco (RMS < 0,01). El marco se usa cuando solo se mueve el papel. La detección del marco y del cajetín es correcta.
- **emparejado**: funciona por número con títulos idénticos y orden cambiado, y deja una hoja nueva como `onlyB`.
- **nube**: el contorno es correcto.
- **polilíneas**: si se parten de otra forma, salen 0 nubes.
- **rendimiento**: 20 pares de hojas con unos 3000 segmentos cada una y escala ×2 se comparan en menos de 20 s, comprobado con la máquina muy cargada por otras sesiones. Antes de pasar las rejillas a claves numéricas y celdas con banda, el mismo test tardaba 24 s.

Salidas:
- `npx vitest run src/lib/drawing/revision-2d.test.ts src/locales/drawings-parity.test.ts src/lib/drawing/drawing-advanced.test.ts src/lib/drawing/drawing.test.ts` → **4 ficheros, 62 tests en verde**.
- `npx vitest run --no-file-parallelism src/lib/drawing src/locales` → **230/231**. El único fallo es `workspace-parity › the English catalogue is up to date` por timeout de 5 s (flake conocido por carga): `node scripts/i18n/extract-workspace.cjs --check` pasa solo («up to date: 1555 keys») y no toca nada de esta tarea.
- `npx tsc --noEmit` → limpio.
- Suite completa: el intento en paralelo acabó con **OOM** de la máquina (`Fatal process out of memory: Zone`), porque hay varias sesiones a la vez. El resultado del reintento en serie está en el informe final.

## Pendiente / no verificado

- **La UI no se ha probado en el navegador**: el equipo estaba saturado (workers de vitest caídos por timeout y OOM) y no levanté el servidor de desarrollo. La lógica está cubierta con los PDF reales; el componente solo está comprobado con `tsc`.
- La comparación corre en el hilo principal. Para 20 hojas son segundos, pero conviene moverla a `drawing.worker.ts` (añadir `kind: 'revision'`).
- La superposición se abre como hoja `diff` sin unidades (`metresPerUnit: null`) ni imagen de página. No hay botón para «saltar a la nube» en el visor de planos: la lista solo informa.
- El export redibuja B desde sus vectores con Helvetica, así que el texto no latino sale como «?» (limitación ya documentada en `export.ts`). No se modifica el PDF original de B con una actualización incremental.
- `commonChangeZones` puede excluir un cambio real si aparece en la misma zona de todas las hojas. Solo actúa con 2 hojas comparadas o más.

## Parking lot (no puedo escribir en `C:/repo/ifc`; para `99-parking-lot.md`)

- Diff de píxeles para PDF escaneado o raster (alineado por ECC u ORB y diferencia umbralizada).
- Anotar las nubes sobre el PDF original de B mediante actualización incremental (conserva fuentes e imágenes de B).
- Ejecutar la comparación 2D en el worker y mostrar progreso por página.
- «Saltar a la nube» en el visor de planos y selector de zonas excluidas dibujando un rectángulo.
- DWG (V3.4, ya estaba en el parking lot).

## Desviaciones

- **Claves i18n**: la tarea pide `drawing.compare.*`, pero el namespace real es `drawings` y la tarea Compare ya usaba `create.compare.*`. Las claves nuevas están en `drawings:create.compare.*`.
- **«Registro afín»**: se implementa como **semejanza** (escala uniforme, rotación y traslación), que coincide con la `Placement` del repo y es lo que cambia entre dos plots de la misma hoja. Una afinidad general (cizalla o escala no uniforme) no aporta en planos y añadiría grados de libertad a RANSAC.
- **Export**: no es «el PDF de B anotado» byte a byte, sino B redibujado desde sus vectores, con capa OCG y anotaciones nubosas, usando el escritor propio de `export.ts`.
- No se ha tocado `src/lib/compare/**`, `src/components/compare/**` ni `diff.ts`, y no hay dependencias nuevas.
- El worktree usa una junction `node_modules` → `C:\repo\ifc\node_modules`: **hay que quitarla antes de borrar el worktree**.
