# T6 — Demo guiada de Revision Compare: enlace, tour, flags de PostHog y asistencia

Lee primero `tasks/_comun.md`, `T3-RESULTADO.md`, `T4-RESULTADO.md`, `T5-RESULTADO.md`, `05-ux.md` (§ demo y guion de 30 s) y `30-correo-usuario.md`. Requisito: T3 fusionada en `main`.

## Objetivo
Un único enlace, `/?compare=demo&tour=revision&ref=<código>`, que abra el comparador con un par de revisiones de ejemplo ya cargado y arranque un tour guiado de unos 2 minutos. El tour enseña lo que le importa a alguien de obra. En cualquier momento se puede pedir ayuda: reservar llamada o escribir. Todo se mide con PostHog, sin cookies.

## Qué construir
1. **Par de demo.** Por defecto, el par F8 (Poblenou A/S/M, con 5 cambios) desde `tests/fixtures/revision/F8`, copiado a `public/models/revision-demo/{a,b}/`. Si lo ves pobre, amplíalo con un script a unos 12–20 cambios variados (movido, forma, propiedades, añadido, eliminado, uno emparejado por posición). Añade también un par PDF de T5 para el paso 2D, si su fixture es presentable. **Tras fusionar hay que ejecutar `npm run deploy:models` desde `main`** (regla 6 de AGENTS.md): anótalo en el RESULTADO; no lo ejecutes tú.
2. **Enlace profundo.** `?compare=demo` carga el par de demo y salta al primer cambio. `?tour=revision` arranca el tour. Sin `tour` se ofrece en una línea; nunca arranca solo, igual que `workspace-tours`.
3. **Tour.** Reutiliza `src/components/workspace/GuidedTour.tsx` y el formato `TourStep` de `src/lib/workspace-tours/tours.ts`, con anclas `data-tour` en los componentes de comparación. Pasos, en lenguaje de obra:
   1. «Old vs new, nothing uploaded» (candado Local).
   2. La lista: «every change, ordered by impact».
   3. Un movido: flecha y «Moved 120 mm W».
   4. La tabla antes/después.
   5. Marcar «Reviewed» / «Affects site» y el contador.
   6. Filtros por planta y marca de pieza.
   7. La cortina A/B.
   8. Exportar PDF/BCF para obra o para el proyectista.
   9. (si existe) Planos PDF con nubes.
   10. Cierre: «Try it with your own files» (las dos zonas para soltar) + «Tell us what you think» (enviar feedback).
   El tour va ×10 idiomas, se puede repetir desde un botón «?» del comparador y funciona en móvil (los pasos sin ancla visible se saltan).
4. **Asistencia, SIN llamada** (decisión de Joel, 2026-11-13: no ofrecer `/call` en ningún sitio de este flujo). Un botón «Help / Feedback» siempre visible en el comparador durante la demo, con dos opciones:
   - Enviar feedback: reutiliza `FeatureRequestModal` o el canal de feedback que ya existe (llega a /admin/feedback), con contexto `revision-compare`.
   - Repetir el tour.
   No pidas datos personales fuera de esos flujos.
5. **PostHog.** En `src/lib/analytics.ts`, con persistencia en memoria y respetando el opt-out:
   - **Feature flag** `revision-compare`: si existe y vale `false`, se oculta la entrada al comparador nuevo desde la UI general; el enlace directo `?compare=demo` funciona siempre. Si PostHog no carga, por bloqueador o por opt-out, se trata como activo. Documenta en el RESULTADO cómo crear la bandera en PostHog (Joel la crea; tú no tocas la cuenta).
   - **Eventos**, solo con recuentos y tipos, nunca nombres de fichero ni GlobalIds:
     - `rc_opened` {source: demo|own|link, ref?}
     - `rc_diff_completed` {elements_bucket, changes_bucket, kinds, guid_regenerated, ms_bucket}
     - `rc_tour_started` / `rc_tour_step` {step} / `rc_tour_completed` / `rc_tour_dismissed` {step}
     - `rc_change_reviewed` {state}
     - `rc_export` {format}
     - `rc_help_clicked` {option: feedback|tour}, `rc_feedback_sent`
     - `rc_own_files_dropped` {after_demo: bool}
   - `ref` se registra con `registerEntrySource` o `trackInviteLinkOpened`, como ya se hace con `?ref=`.
   - Tests en `analytics-revision-events.test.ts`, siguiendo el patrón de `analytics-*-events.test.ts`.
6. **Política de privacidad.** Si añades una llamada nueva a PostHog (flags), comprueba que `PrivacyPolicy.tsx` la cubre. Si no, anótalo, pero no cambies textos legales.

## Puedes tocar
`src/components/compare/**`, `CompareModal.tsx`, `src/lib/compare/demo*.ts`, `src/lib/workspace-tours/` (añadir el tour), `GuidedTour.tsx` solo para hacerlo reutilizable fuera del workspace, `src/lib/analytics.ts` y sus tests, `public/models/revision-demo/`, la lectura de parámetros en `App.tsx` y los packs i18n.

## No toques
El motor de diff, `report-revision.ts`, `src/lib/drawing/**` (salvo leer sus fixtures) y los textos legales.

## Aceptación
- Prueba e2e: abrir `/?compare=demo&tour=revision&ref=test` muestra la lista con los cambios y el paso 1 del tour sin ningún clic. Recorrer el tour hasta el final emite `rc_tour_completed`; se comprueba con un mock de PostHog.
- Con PostHog bloqueado, la demo funciona igual.
- Con la bandera a `false`, desaparece la entrada general y el enlace directo sigue funcionando.
- Guard de i18n en verde.
- Capturas reales de escritorio y móvil de 3 pasos del tour.
- Ningún evento lleva nombres de fichero ni GlobalIds; un test lo comprueba.

Al terminar: PR contra `main` sin mención a la IA. Deja `T6-RESULTADO.md` en tu carpeta de notas, pon su contenido en tu informe final e incluye el enlace exacto que irá en el correo.
