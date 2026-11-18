# T3 — Resultado (2026-11-13)

> Destino previsto: `C:/repo/ifc/docs/revision-compare/tasks/T3-RESULTADO.md` (un hook impide escribir allí: copiarlo).
> Capturas y log del e2e: `side-session-notes/local_3f37405b-…/T3-captures/`.

**PR:** https://github.com/j03rul4nd/ifc-viewer-online/pull/602 (rama `feat/revision-compare-t3`, rebasada sobre `main` con T2/T4/T5, commits `0fe88f1e`, `d9874e62`, `45084c95` y `c32f1550`). El check de Vercel falla por «Account is blocked» (cuenta, no código).

## Lo hecho

- **Flujo de 3 clics (M6)** — `src/components/compare/RevisionDrop.tsx`: dos zonas A/B (soltar o elegir, uno o varios IFC), ⇄, arranque automático, barra de progreso y aviso «procesado en tu navegador». Si se sueltan los dos juegos en una sola zona, se reparten por fecha (el más antiguo va a A). `CompareModal.tsx:144-160` abre por defecto este flujo y deja las herramientas de siempre (líneas base, IDS, BCF) a un clic (`rc.advanced`).
- **Runner** — `src/components/compare/revisionStore.ts:136` `runRevision`: lee los ficheros, calcula el hash SHA-256 de cada lado, hace el snapshot en el worker y llama a `diffRevisions`. Restaura los estados de revisión y abre el cambio de más impacto. **La lista sale en cuanto termina el diff**; la carga en la escena (LoadManager, `submitIfcFiles`) sigue por detrás y rellena los `modelIds` al terminar. `recomputeDiff` (:113) recalcula con los snapshots en memoria (M5).
- **3D (M2)**:
  - `src/lib/compare/overlay.ts:92` `planRevisionOverlay` (puro). B lleva los cambios en su color y A muestra solo los eliminados y la posición antigua de los movidos. También devuelve las flechas.
  - `src/lib/compare/view-paint.ts`: aplica los 5 colores de `05-ux` (sobre `getFragmentsModel().highlight`) por encima del fantasma del canal de overlay, y oculta el resto de A. El eliminado se ve como fantasma rojo translúcido y la posición antigua del movido, en azul al 25 %.
  - `src/lib/compare/view-arrows.ts`: una flecha de A a B por cada elemento movido, con la cota en mm para el seleccionado. Se dibuja encima y sin prueba de profundidad.
  - `src/App.tsx:1871`: mientras el comparador está abierto, el canal de overlay es suyo. Validación e IDS quedan en pausa, con un aviso (`rc.paused`).
- **Lista (M3)**:
  - `RevisionList.tsx`: icono, letra y color por cambio, frase de obra y estado (●/✓/⚠). Se virtualiza a partir de 500 filas (`@tanstack/react-virtual`).
  - Filtros (`RevisionWorkspace.tsx:134`): por tipo de cambio con contadores, planta, fichero/disciplina, clase, estado y marcas. Las marcas admiten pegar una lista y salen de `Tag` o de `markProperties`.
  - Los filtros se aplican a la vez a la lista, al 3D y a la navegación.
  - Contador «N cambios · M revisados · ⚠ K».
  - Atajos (:358): J/K o ↓/↑, R revisado, S afecta a obra, F encuadrar, Espacio en modo alternar.
- **Estados persistentes** — `review-db.ts`: en IndexedDB con la clave `hashA:hashB:GlobalId`. Las funciones puras están en `src/lib/compare/revision-view.ts`: orden por impacto, facetas, filtros, claves, contadores y filas de la tabla.
- **Tabla antes/después (M4)** — `RevisionWorkspace.tsx:44` + `tableRows`: posición E/N/Z, distancia, tamaño por eje, altura, volumen y campos de propiedades. La frase de obra sale de `summary.key` y sus parámetros (`useRevisionText.ts`): dirección, eje y clase legible, en 10 idiomas. Si la pareja no se hizo por `guid`, se muestran el método y la confianza.
- **Tolerancias (M5)** — `RevisionWorkspace.tsx:186`: movimiento (mm), tamaño (mm) y volumen (%). Recalcula sin releer los ficheros y muestra lo que ha tardado.
- **Avisos** — `guidRegenerated` (M7, `rc-guid-warning`) y `originShift`.
- **Cortina A|B (V2.4)** — `src/lib/compare/view-split.ts` `startCurtain`: un plano vertical que pasa por el ojo de la cámara y por la columna del tirador. A se recorta a la izquierda y B a la derecha, en el renderer principal y en cada frame. Hay también un modo **Alternar** (A↔B en el mismo visor).
- **Móvil y tablet** — `MobileSheet` con detents 0,24/0,55/0,92: la tarjeta en peek, la lista en half y la tabla en full. Botones ◀ ▶ de 44 px o más.
- **Exportar PDF / XLSX / BCF** — `RevisionExports.tsx`, conectado a T4 como indica su sección de conexión:
  - exporta lo que muestra la lista (con filtros) junto con los estados de revisión;
  - primero hace las capturas y después descarga, y luego repinta el 3D;
  - PDF y XLSX llevan la etiqueta «Pro», pero no bloquean nada;
  - `revisionExportSlot` sigue permitiendo sustituir los botones.
- **Sin ruido al cargar A y B** (`App.tsx` `onModelLoaded`): con el comparador abierto o leyendo, no se abre el panel de validación ni se lanza la validación sola. El encuadre ya no selecciona el elemento, así que el panel de propiedades no se rellena.
- **i18n** — un bloque `compare.rc.*` en los 10 packs, con todas las claves de `summary` de T1 (+ `moved_mm_nodir` y `changed`) y las direcciones.
- **Enlace profundo** `/?compare`: abre el comparador directamente (`App.tsx:1045`, previsto en 05-ux §10.2).

## Tests

- `npx vitest run src/lib/compare src/locales`: 14/15 ficheros en verde. `workspace-parity` dio timeout con la máquina cargada y **pasa aislado** (flake conocido). Lo nuevo:
  - `revision-view.test.ts`: 8 tests (orden, filtros, facetas, claves, tabla, plan de overlay y localización);
  - `compare-parity` en verde con el bloque `rc`.
- `tsc --noEmit`: sin errores en los ficheros tocados.
- **E2E** `scripts/e2e/revision-compare.mjs`, con el par F8 y Chromium con GPU real (`CHROME=… node scripts/e2e/revision-compare.mjs http://localhost:3361 tmp/rc-e2e`):
  ```
  PASS  list visible after dropping both sides, no extra click — 5 rows
  PASS  F8 has the 5 seeded changes — 5
  PASS  J visits every change — 5/5
  PASS  K steps back — 5 / 5
  PASS  click frames the element in < 300 ms — 0.6 ms (llamada; la animación de cámara empieza en el acto)
  PASS  curtain view at 30 FPS or more — 60 FPS (F8, no cras)
  PASS  xlsx export downloads — 8754 bytes
  PASS  bcf export downloads — 685092 bytes
  PASS  pdf export downloads — 505611 bytes
  PASS  review state survives a reload
  PASS  phone shows the change card
  ```
- Tras el rebase, `src/lib/compare` (100 tests) y `compare-parity` pasan. Suite completa antes del rebase: 7779 pasan y 8 fallan, ninguno en ficheros de esta PR (blender ×3, seo blog-images y landing-chrome, colour-guard por `DashboardView`, modal-migration, viewport-lane). El colour-guard de mis ficheros quedó limpio en `f7a145c5`.

## Pendiente

- **Vista dividida lado a lado:** no está hecha. Un segundo `WebGLRenderer` no puede dibujar los modelos de fragments, porque fragments libera la copia en CPU de cada buffer al subirlo a la GPU (`createBuffer` → `byteLength` de `undefined`, y el visor se reinicia). Para hacerla habría que tocar el render de `viewer.ts` (scissor con dos viewports), y eso queda fuera de los ficheros permitidos. La cortina y el modo alternar cubren el caso.
- **FPS con `cras` (67 MB):** sin medir. Medido solo con F8 (40 FPS con cortina). También falta medir M5 «de 5 a 1 mm en < 2 s» con cras; T1 midió `diffRevisions` en 119 ms.
- **M7:** sin probar con F9, porque el fixture es de T2. El aviso sale con `diff.guidRegenerated`.
- **Colour guard en `main`:** marca `report-revision.ts` (T4), `drawing/revision-*.ts` (T5) y el editorial de mail. Ninguno es de esta PR.
- Al cerrar, A y B se quedan en la escena. Falta un botón «quitar la revisión A».
- `selectElement` restaura el color de severidad del overlay; se repinta a los 60 ms, así que puede verse un parpadeo.
- El e2e no está en CI: necesita GPU real y servidor dev. En headless con swiftshader se pierde el contexto WebGL.

## Desviaciones

1. La lista no espera a que el 3D cargue: así se cumple «lista primero». El 3D aparece después.
2. El modo dividido se sustituye por cortina + alternar (ver Pendiente).
3. Cambios mínimos en `App.tsx`: el canal de overlay se cede al comparador y se añade `?compare`. Ninguno de los dos estaba en «puedes tocar».
4. Nuevo store `components/compare/revisionStore.ts`, en lugar de ampliar `stores/compareStore.ts`.
5. `type_changed` se pinta con el naranja de forma y `relations_changed` con el violeta de propiedades (cinco categorías de 05-ux).
6. Atajo extra **S** para «afecta a obra».
7. Los colores son constantes TS (`GROUP_COLOUR`) y se exponen como variables CSS `--rc-*` en la raíz del workspace. No entran en el sistema global de tokens.
