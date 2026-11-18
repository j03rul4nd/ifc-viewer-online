# 20 — Verificación independiente de Revision Compare (fase 4)

Fecha: 2026-11-13. Base: `origin/main` en `529c8c7b` (incluye T1–T5: #595, #598, #599, #600, #602). Worktree `revision-compare-verify-d462c2`.
Scripts propios en la rama `claude/revision-compare-verify-d462c2`, commit `89e6d5ea`, carpeta `scripts/verify-rc/`:
- `score.test.ts`: precisión y recall por `kind` y por método.
- `adversarial.ts`: casos A1–A4, derivados de `make.ts` y escritos fuera del repo.
- `perf.test.ts`: snapshot, diff y recálculo, con RSS pico.
- `make-big.mjs`: sintético grande.
- `ux.mjs`: recorrido Playwright en escritorio y a 375 px, con registro de red.
- `pdf2d.mjs`: comparación de PDF 2D.

Capturas, ficheros exportados y JSON de resultados: `side-session-notes/…/verif-captures/`.
Máquina: Windows 10, 12 hilos y 14 GB de RAM, cargada con otras sesiones. Chrome con GPU real.

## Tabla de criterios

| Criterio (spec) | Resultado | Evidencia | OK/FALLO |
|---|---|---|---|
| M1: F1–F8, P = R = 1,0 por `kind` | Las 5 categorías presentes en F1–F8 dan TP sin FP ni FN. El método, el fichero y la dirección coinciden en todos | `score.json`, scorer propio (no el test de los autores) | OK |
| M1: ruido de teselado da 0 cambios (F11) | 0 cambios | `score.json` F11 | OK |
| M1: origen desplazado 10 m (F7) | `originShift` = [10,0,0] y 0 `moved` | `score.json` F7 | OK |
| M1: F6, StandardCase → IfcWall | 0 `type_changed` | `score.json` F6 | OK |
| V2.1: F9, GUID regenerados + 1 movido | `guidRegenerated: true`, 1 `moved` por `geometry`, E, 120 mm, 0 FP | `score.json` F9 | OK |
| V2.1: F10, división 1→2 | 1 `reshaped` con método `split` | `score.json` F10 | OK |
| V2.5: F12, giro de 5° | 1 `moved` con `rotationDeg` = 5 (dir NW y 26 mm, arrastrados por el origen de malla) | `score.json` F12 | OK |
| Adversarial A1 (nuevo): muro movido 300 mm y +20 % de alto (GUID estable) | `kind` = `reshaped` (correcto por prioridad), pero `kinds` = [`reshaped`] sin `moved` y sin vector. §3.3 dice que un elemento puede tener varios tipos | `score.json` A1 | FALLO (menor; desviación ya declarada por T1/T2) |
| Adversarial A2 (nuevo): pabellón con GUID regenerados y 1 pilar movido 100 mm N | Correcto: `geometry`, N, 100 mm, 0 FP | `score.json` A2 | OK |
| Adversarial A3 (nuevo): GUID regenerados + pilar movido 200 mm y alargado un 25 % | No empareja: sale 1 `removed` + 1 `added` en lugar de 1 `reshaped` | `score.json` A3 | FALLO |
| Adversarial A4 (nuevo): rejilla de 10 pilares a 300 mm, GUID regenerados, el n.º 4 movido 100 mm (queda a 200 mm del vecino) | Correcto: 1 `moved` E 100 mm por `geometry`, sin parejas cruzadas | `score.json` A4 | OK |
| Agregado (F1–F12 + A1–A4) | moved P 1,0 / R 1,0 (6/6) · reshaped P 1,0 / R 0,8 (4/5) · properties P 1,0 / R 1,0 · added P 0,67 / R 1,0 · removed P 0,67 / R 1,0. Por método: guid 8/8, none 4/4, split 1/1, geometry 3/4 (R 0,75). Todas las bajadas se deben a A3 | `score.json` `perKind`/`byMethod` | V2.1 (≥ 0,95) FALLO solo en adversarial; los fixtures de la spec, OK |
| §5: 50 MB, snapshot A+B < 25 s (cras, 66 MB, node) | 6,3 + 5,6 = 11,9 s | `perf.json` | OK |
| §5: diff < 1 s (cras) | 30 ms | `perf.json` | OK |
| §5: 94 MB, snapshot (shanghai-tower, node) | 5,4 + 5,3 = 10,7 s; diff 79 ms | `perf.json` | OK |
| §5: 343 MB sintético (cras ×5, fuera del repo), snapshot A+B < 4 min | 52,9 + 26,6 = 79,5 s | `perf-big.json` | OK |
| §5: 343 MB, diff (presupuesto ≈ 3–8 s, entre 200 y 500 MB) | **10,1 s** en la primera pasada; el recálculo con los mismos snapshots, 74 ms. Puede deberse a GC o JIT, o a que las 5 copias coinciden en el espacio (sintético patológico) | `perf-big.json` | FALLO (a confirmar con un sintético realista) |
| §5: memoria pico | node: cras 463 MB, shanghai 607 MB, 343 MB → 1 274 MB RSS. Navegador: heap JS de 147–156 MB (CDP). No medí GPU ni wasm por separado | `perf*.json`, `ux` log | OK en node; en navegador, PARCIAL |
| M5: recálculo de 5 → 1 mm < 2 s con el fixture de 67 MB | 11 ms (cras), sin releer los ficheros | `perf.json` `recompute1mm_ms` | OK |
| §5 / M2: FPS con resaltado, cras (67 MB, objetivo entre ≥ 45 y ≥ 30) | Vista Cambios: **23 FPS** (rAF propio, 3 s). Cortina: 30 FPS. Alternar: 55 FPS | `cras-log.json` | FALLO (vista Cambios) |
| V2.4: cortina ≥ 30 FPS (67 MB) | 30 FPS con cras y 60 con F8 | ídem | OK (justo en el límite) |
| V2.4: vista dividida con cámara sincronizada | No existe; T3 la sustituye por cortina + alternar | T3-RESULTADO | FALLO (declarado) |
| M6: 3 clics, la lista sale sin más clics | F8: lista en 13,5 s (escritorio) y tarjeta en 17,4 s (375 px); cras en 33,7 s | `f8-log.json` | OK |
| M6: aviso «procesado en tu navegador» | Visible: «Procesado en tu navegador: los ficheros nunca salen de este dispositivo.» | `f8-desktop-1-list.png` | OK |
| M2: colores de la lista y los chips según 05-ux §2 | Las insignias son exactas: #D64545, #2E9E5B, #E08A1E, #2F6FDE y #8B5CF6, con icono y letra | `badgeColours` | OK |
| M2: colores en el 3D | En las capturas no se ven en 3D el verde del añadido ni el rojo fantasma del eliminado. El muro añadido sale gris en Alternar, la viga eliminada no se distingue y en cras el elemento violeta seleccionado no destaca | `f8-desktop-1-list.png`, `f8-desktop-2-blink.png`, `cras-desktop-1-list.png` | FALLO (observado; confirmar en manual) |
| M2: encuadre al pinchar < 300 ms | De clic a 2 frames: 61 ms (F8) y 34 ms (cras). Con F no he podido comprobar que la cámara encuadre de verdad (no hay API expuesta) | log | OK (solo la latencia) |
| M3: J/K/R/F, recorrido completo con teclado | J recorre 5/5 y 10/10. R suma «1 revisado». K retrocede. F no da error | log | OK |
| M3: estados persistentes tras recargar | No lo he vuelto a probar; T3 tiene un e2e que pasa | — | NO VERIFICADO |
| M4: frase de obra | «Movido 120 mm al oeste», «Altura 3300 → 4125 mm», «2 propiedades cambiadas». La clase sale en inglés dentro de la frase en español («Beam eliminado», «Wall nuevo»). El XLSX dice «120 mm W» | log, XLSX | OK con defecto menor |
| M4: tabla antes/después | Bien en propiedades y en reshape (XLSX y UI). En F9 (`moved` por geometry), la tabla muestra solo la cabecera | `f9` log | FALLO (menor) |
| M7: aviso `guidRegenerated` con F9 | «El proyectista ha regenerado los IDs…» | `f9` log | OK |
| Móvil 375 px | Sin scroll horizontal. Tarjeta y ◀ ▶ correctos. «Encuadrar» mide 80×36 px (< 44). El toast «3 modelos cargados» tapa el contador y las pestañas Cambios/Cortina/Alternar, que además quedan cortadas | `f8-phone375-1-list.png` | FALLO (menor) |
| V2.2: PDF | 5 páginas: portada, resumen por tipo y por planta, y 3 páginas de fichas. Fallos: (a) son páginas **raster** JPEG, sin texto seleccionable ni buscable; (b) en la portada los nombres de fichero se salen de la página y el pie se solapa con «Página x de y»; (c) los colores no son los de 05-ux (propiedades en ocre, no violeta); (d) las capturas son un contorno en alambre sobre fondo negro, sin contexto ni color | `pdfpage0.jpg`, `pdfpage2.jpg` | FALLO (calidad) |
| V2.2: XLSX | Lo abre exceljs: hojas Resumen (22 filas) y Cambios (1 fila por campo, con estado de revisión). Excel y LibreOffice no están instalados, así que no pude abrirlo con ellos | export | PARCIAL |
| V2.3: BCF 3.0 contra el XSD oficial (release_3_0) | `bcf.version`, 5 `markup.bcf` y 5 `.bcfv`: **todos válidos** (lxml). Un topic por cambio con IfcGuid. No hay `extensions.xml`. No pude probar BIMcollab ni Solibri | `valbcf.py` | OK (XSD); importación manual NO VERIFICADA |
| V3.1: PDF 2D (lógica) | Los tests de T5 pasan en aislado (11/11). En la suite cargada, el de rendimiento tardó 22,6 s frente a 20 s | suite | OK (lógica) |
| V3.1: PDF 2D en navegador | **No verificado.** En dev, `readPdfSheets` lanza «Invalid workerSrc type» porque `pdf.worker.min.mjs?url` devuelve `undefined`. La UI muestra «No se ha podido leer ese PDF». El importador de PDF que ya existía (`readPdfVectors`, mismo patrón, del 1 de noviembre) falla igual, así que apunta al entorno (dev + junction de `node_modules`). Mi build con `vite build` directo no arrancó web-ifc (wasm), así que no es una prueba válida | `pdf2d-1.png` | NO VERIFICADO (riesgo alto) |
| Local-first | F8 escritorio: 102 peticiones, F8 375 px: 109 y cras: 54, todas GET al propio origen. 0 POST, 0 bytes subidos, 0 hosts externos, ningún cuerpo con GlobalId. En PDF 2D, 0 peticiones que no sean GET | `*-requests.json` | OK |
| Suite completa en `main` | 8 fallos de 7 968 tests (7 902 pasan) | `suite-main.log` | ver abajo |

### Suite completa (`npx vitest run`, main 529c8c7b, 4 workers)

| Fallo | ¿Anterior a la iniciativa? (comprobado en `ebd14bd9`) |
|---|---|
| `scripts/blender/district-ifc`, `metro-drassanes-ifc` y `tower-ifc` (tamaño del fichero) | Sí, también falla en ebd14bd9 |
| `scripts/modal-migration` | Sí |
| `scripts/seo/landing-chrome` | Sí |
| `scripts/viewport-lane` | Sí |
| `scripts/colour-guard` | Ya fallaba en ebd14bd9 (DashboardView, mail/editorial). **Pero la iniciativa añade infracciones nuevas:** `src/lib/compare/report-revision.ts` (13 colores), `src/lib/drawing/revision-2d.ts` (4) y `revision-pdf.ts` (2) |
| `src/lib/drawing/revision-2d.test.ts`, «20 sheet pairs < 20 s» | **Nuevo (T5).** 22,6 s con la suite cargada; pasa en aislado. Es un flake de un umbral de tiempo |

Efecto secundario: la suite reescribe `mail/editorial/__snapshots__/editorial.test.ts.snap` (lo he revertido). Nada que ver con esta iniciativa.

## Defectos priorizados

1. **[Alta] Colores del diff que no se ven en el 3D (M2).**
   - Pasos: `/?compare`, soltar F8 a/ y b/, esperar 6 s, pulsar «Alternar» con el añadido seleccionado.
   - Esperado: muro verde, viga eliminada como fantasma rojo, movido con flecha azul.
   - Observado: geometría gris sin color de cambio (`f8-desktop-2-blink.png`, `f8-desktop-1-list.png`). En cras, el elemento seleccionado tampoco se ve violeta.
   - Las insignias de la lista sí son correctas.
   - Hay que confirmarlo a mano: puede que el resaltado llegue más tarde de los 6 s que esperé, o que el encuadre no apunte al elemento.
2. **[Alta] PDF 2D sin verificar en navegador.** Hay que abrirlo en un build de producción real (`npm run build` + preview), o en un entorno sin junction, con `tests/fixtures/revision-2d/A.pdf` y `B.pdf`, en Planos → Crear → Comparar hojas → Revisión antigua/nueva. En dev falla por `workerSrc`, también en el importador de PDF anterior. T5 tampoco lo probó en el navegador.
3. **[Media] FPS de la vista Cambios con cras: 23 FPS**, por debajo de los ≥ 30–45 de §5. Pasos: soltar `public/models/cras/model.ifc` (A) y una copia con 20 Pset cambiados (B), y medir el rAF durante 3 s en la vista Cambios. La cortina da 30 y Alternar 55.
4. **[Media] Informe PDF raster y con fallos de maquetación.**
   - Todo el documento es JPEG: no se puede buscar ni copiar texto.
   - Los nombres largos de A/B se salen de la portada.
   - El pie se solapa con la paginación.
   - Los colores no coinciden con 05-ux (propiedades en ocre).
   - Las capturas son alambre negro sin contexto.
   - Pasos: exportar PDF con F8.
5. **[Media] Movido + cambiado de forma con GUID regenerados (A3) se pierde:** sale como alta + baja. Pasos: `ADV_OUT=… node … scripts/verify-rc/adversarial.ts` y `ADV_DIR=… npx vitest run scripts/verify-rc/score.test.ts --dir .`. Causa probable: la capa 3 pide IoU y proximidad en `matchRadius` 0,25 m, y la capa 4 no aplica.
6. **[Media] Diff de 10,1 s en el sintético de 343 MB** (presupuesto ≈ 8 s a 500 MB). Hay que repetirlo con un sintético realista, sin copias coincidentes, para separar el coste de la capa 3 en copias solapadas del GC.
7. **[Baja] Movido + reshape con GUID estable (A1):** `kinds` no incluye `moved` ni lleva vector. Ya está declarado (T1 desv. 2, T2 desv. 5).
8. **[Baja] colour-guard:** `report-revision.ts`, `revision-2d.ts` y `revision-pdf.ts` añaden hex sin `theme-allow-color`.
9. **[Baja] Umbral flaky** en `revision-2d.test.ts`: 20 s, y con carga tarda 22,6 s.
10. **[Baja] Móvil (375 px):**
    - el toast de carga tapa la cabecera y las pestañas de vista;
    - las pestañas Cambios/Cortina/Alternar quedan cortadas;
    - «Encuadrar» mide 36 px de alto.
11. **[Baja] i18n:**
    - la clase va en inglés dentro de la frase ES («Beam eliminado»);
    - el XLSX y la ficha PDF dicen «IFCBEAM eliminado» y «120 mm W»;
    - la descripción BCF da `placement` en el marco de malla Y-up («18.000,1.950,-14.500»), no en ejes IFC.
12. **[Baja] Tabla antes/después vacía** para un `moved` emparejado por geometría (F9).
13. **[Baja] Fila de lista duplicada (sin confirmar):** en cras, «911079 Floor:(15cm)…» aparece dos veces (`cras-desktop-1-list.png`). Puede que sean dos elementos con el mismo nombre.
14. **[Baja] El panel Propiedades («Nada seleccionado») queda abierto** sobre un tercio del 3D durante la comparación. Al cerrar el comparador, A y B siguen en la escena (6 modelos), cosa que T3 ya declaró.

## No verificado
- PDF 2D en navegador (defecto 2).
- Importación BCF en BIMcollab o Solibri.
- XLSX en Excel o LibreOffice.
- Persistencia tras recargar: no la repetí.
- Memoria GPU/wasm del navegador.
- 500 MB.
