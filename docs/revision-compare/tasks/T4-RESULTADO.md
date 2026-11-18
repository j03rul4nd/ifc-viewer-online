# T4 — Resultado (2026-11-13)

> Destino previsto: `C:/repo/ifc/docs/revision-compare/tasks/T4-RESULTADO.md`. El hook impide escribir en `C:/repo/ifc`: hay que copiarlo allí.

**PR:** ver el informe final (rama `feat/revision-compare-t4`, contra `main`).

## Lo hecho

### Informe PDF / XLSX — `src/lib/compare/report-revision.ts`
- `REVISION_REPORT_PLAN` (:25): `{ pdf: { requiresPlan: 'pro' }, xlsx: { requiresPlan: 'pro' } }`. Solo es una bandera: no hay ningún cobro conectado.
- `parseIso19650Name` (:56): Proyecto-Originador-Volumen-Nivel-Tipo-Rol-Número, con estado (S0–S7, A, B, CR, D) y revisión (P01, C02, P01.1) opcionales detrás, separados por `-` o `_`.
- `revisionReportText(t, locale)` (:123): construye los textos a partir de `t` del namespace `compare`, con las claves `report.revision.*` en los 10 idiomas. Incluye las frases de obra para cada clave de `summary` de T1 (`report.revision.sentence.*`) y los rumbos (`report.revision.dir.*`).
- `buildRevisionReportModel` (:213), `orderedChanges` (:203), `changeRows` (:186) y `paginateRevisionReport` (:306): modelo puro, sin DOM. Ordena por `CHANGE_KIND_PRIORITY` → planta → clase. Las filas A/B salen del delta (desplazamiento, tamaño, volumen) y de los `changes`. Las filas de malla y colocación en bruto se omiten cuando hay delta.
- `revisionToXlsx(diff, text)` (:256): exceljs con import perezoso, igual que `cobie/xlsx.ts`. Tiene dos hojas:
  - Resumen: ficheros A/B con su revisión y estado ISO, conteo por tipo y por planta.
  - Cambios: una fila por campo con columnas A y B, cabecera fija y autofiltro.
- `revisionToPdf(diff, captures, text, opts?)` (:505): portada, resumen y una ficha por cambio (2 por página A4 a 150 ppp). Cada ficha lleva la captura, la frase de obra, la identidad (elemento, clase, planta, GlobalId, fichero A/B), la tabla A/B y el estado de revisión.
  - Las páginas se componen en un canvas y se empaquetan con `report/pdf-writer.ts` (`buildImagePdf`, un JPEG por página), que ya estaba en el repo. **No hace falta ninguna librería nueva de PDF.** Así, tailandés y CJK salen con las fuentes del sistema. La contrapartida es que el texto del PDF no se puede seleccionar (ver Desviaciones).
  - `createCanvas` y `loadImage` son inyectables (tests). Si un cambio no tiene captura, se dibuja un hueco con el texto `noCapture`.

### Capturas — `src/lib/compare/capture-change.ts`
- `ChangeCaptureViewer` (:15) es el subconjunto de `ViewerAPI` que hace falta: `isolateElements`, `frameElement`, `selectElement`, `clearSelection`, `getCameraViewpoint`, `setCameraLookAt` y `takeSnapshot`. Es el mismo `takeSnapshot` que usa `CaptureToolbar`, y el mismo patrón de foco y captura que el informe de `ClashPanel`. No toca ningún componente.
- `resolverFromDiff(diff, modelIdFor)` (:53): pasa de GlobalId a `{expressId, modelId}`. Un elemento eliminado se busca en A (`baseExpressId`/`baseFile`) y el resto en B.
- `createChangeCapturer(viewer, resolve, opts)` (:78) devuelve:
  - `captureChange(globalId)`: aísla, encuadra, selecciona (el resaltado de selección hace de «nube»), espera `settleMs` y captura. Devuelve `{ snapshot: PNG dataURL, camera }`;
  - `captureAll(ids, onProgress)`: al terminar restaura la selección, el aislamiento y la cámara.
- `captureImages(caps)` (:126): convierte el resultado al formato que recibe `revisionToPdf`.

### BCF 3.0 — `src/lib/compare/bcf-sync.ts` (ampliado; lo anterior no cambia)
- `buildRevisionChangeTopics(diff, text, captures)` (:233): un topic por cambio. El título es la frase de obra, con las etiquetas `revision-change`, el tipo de cambio y `version:<B>`. La prioridad es High si `review === 'affects_site'`. El viewpoint lleva la selección por GUID (de B, o de A si es una eliminación), la cámara de la captura y el snapshot PNG.
- Si un cambio no tiene captura, el viewpoint lleva una cámara isométrica de reserva, porque BCF 3.0 exige cámara (`FALLBACK_CAMERA`).
- `addViewpointColoring` (:272): añade `<Coloring>` con el color del tipo de cambio (`CHANGE_KIND_BCF_COLOR`, :193) detrás de `<Selection>`, que es el orden del XSD. Hace falta porque `bcf.ts` no escribe coloreado y no estaba en mi lista de ficheros.
- `revisionChangesToBcfZip(diff, text, captures)` (:291): genera `{ bytes, topics }`, un .bcfzip 3.0 en memoria. Reutiliza `buildBcfTextEntries(topics, '3.0')` de `bcf.ts`.

### i18n
`report.revision.*` en `src/locales/{en,es,ca,fr,de,it,pt,ja,zh,th}/compare.json`, con el guard `compare-parity` en verde.

## Cómo conectarlo a la UI (para T3 o un cambio final pequeño)
```ts
const text = revisionReportText(t /* useTranslation('compare').t */, i18n.language)
const resolve = resolverFromDiff(diff, (file, side) => modelIdOf(file, side)) // null si ese modelo no está cargado
const caps = await createChangeCapturer(viewerApiRef.current!, resolve).captureAll(orderedChanges(diff).map(c => c.globalId), onProgress)
// PDF (Pro: REVISION_REPORT_PLAN.pdf.requiresPlan)
download(new Blob([await revisionToPdf(diff, captureImages(caps), text)], { type: 'application/pdf' }), 'revision.pdf')
// XLSX (Pro)
download(new Blob([await revisionToXlsx(diff, text)]), 'revision.xlsx')
// BCF (recomendación: gratis)
const { bytes } = revisionChangesToBcfZip(diff, { author, sentence: text.sentence }, caps)
download(new Blob([bytes]), 'revision.bcfzip')
```
Igual que en ClashPanel: primero se hacen las capturas y después se abre o descarga, porque una pestaña en segundo plano deja de dibujar.

## Tests y salida
`npx vitest run src/lib/compare` → **4 ficheros, 61 tests en verde.** `report-revision.test.ts` añade 9 tests sobre F8:
- ISO 19650;
- bandera de plan;
- modelo con una ficha por cambio esperado;
- **PDF: las 5 fichas de F8, cada una con su captura** (un `drawImage` por cambio, frase y GlobalId presentes, número de páginas = número de `/Type /Page`);
- PDF en tailandés con huecos cuando no hay captura;
- **XLSX que exceljs vuelve a abrir**, con todos los GlobalId en la hoja de cambios;
- `captureAll`, que restaura cámara, aislamiento y selección;
- **BCF: 5 topics** con título igual a la frase, selección y coloreado por GUID, cámara y snapshot PNG;
- cámara de reserva.

`compare-parity.test.ts` en verde.

**XSD BCF 3.0:** `REVISION_REPORT_OUT=<dir> npx vitest run src/lib/compare/report-revision.test.ts` escribe `F8.bcfzip` y `F8.xlsx`. He validado `F8.bcfzip` con lxml contra `markup.xsd`, `visinfo.xsd`, `version.xsd` y `shared-types.xsd` de buildingSMART/BCF-XML `release_3_0`: **11 ficheros, 0 inválidos.**

## Pendiente
- **LibreOffice / Excel:** no están instalados en esta máquina. El XLSX se ha comprobado solo releyéndolo con exceljs. Falta abrirlo a mano en LibreOffice.
- **Importación en BIMcollab Zoom o Solibri:** pendiente, porque no tengo acceso. El fichero valida contra el XSD.
- **PDF real en navegador con capturas reales:** el test usa un canvas doble. Falta una pasada visual cuando T3 conecte los botones.
- Los botones de exportar son de T3 (ver la sección anterior).
- Un eliminado solo tiene captura si el modelo A está cargado en el visor. Si no lo está, la ficha sale con el hueco.

## Desviaciones de la spec / tarea
1. **PDF como imágenes por página** (pdf-writer del repo), no como texto vectorial. Ventaja: sin dependencias y con cualquier escritura. Contrapartida: el texto no se puede seleccionar ni buscar. Si hace falta texto, propondría `pdf-lib` (aún no está en el repo; `cobie/xlsx.ts` dice «pdf-lib not in MVP»).
2. **Frases de obra propias** en `report.revision.sentence.*`: T3 tiene los textos de `summary` de la UI y puede reutilizar estas claves o reemplazar `text.sentence`.
3. **El coloreado BCF se inyecta en `bcf-sync.ts`** sobre la salida de `bcf.ts`, sin tocar `bcf.ts` ni el tipo `BcfViewpoint`.
4. La firma de `revisionToXlsx` es `(diff, text)` y la de `revisionToPdf` es `(diff, captures, text, opts?)`: el texto es necesario para los 10 idiomas.

## Gating Free/Pro (recomendación)
- **PDF y XLSX → Pro**, como dice la spec §4, siguiendo la opción C del doc 19 §5: son herramientas nuevas de productividad. Queda solo la bandera.
- **BCF por cambio → Free.** El doc 12, regla 1, deja expresamente «informe, BCF e histórico local» como gratis, y el BCF ya se exporta gratis en la app. Cobrar el BCF por cambio contradiría «lo que ya es gratis sigue gratis». Además, el BCF es lo que llega al proyectista y hace de canal de captación. Por eso no lleva bandera.
