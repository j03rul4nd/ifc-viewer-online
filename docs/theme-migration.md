# Migración a modo claro: registro

Fuente de verdad del trabajo de tema claro/oscuro en la app 3D (`src/`). Las landings y el blog (`public/`) quedan fuera porque ya tienen su modo claro (`.lp-light`, `--lc-*`).

Actualizar este fichero cada vez que termine un subagente.

## Auditoría (Fase 0, 2026-11-11)

**Stack**
- Tailwind 3.4.17. `tailwind.config.js` mapea tokens a variables CSS, pero los componentes no usan esas clases. Usan estilos en línea con `var(--x)`: unos 4.160 usos en unos 800 bloques `style={{}}`.
- Los tokens están en `:root` de `src/index.css` (líneas 5–17): `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--text`, `--text-dim`, `--text-faint`, `--accent` (#5E6AD2), `--accent-2`, `--danger`, `--warn` y `--ok`.
- **`--text-muted` se usa 139 veces y no está definido.**
- Hay unas 65 clases Tailwind con alfa pensadas solo para oscuro (`bg-white/NN`, `border-white/NN`, `black/NN`).
- No hay ThemeProvider, `data-theme` ni store de tema. `.lp-light` (index.css, línea ~494) sirve de plantilla de valores claros.
- No hay componente `Button` compartido: los botones llevan estilo en línea.

**Colores fijos**
- Hay unos 2.436 en `src/`. Por carpeta: components 937, lib/geo 333, lib/cover 234, reactbits 153, blog 116, lib/layers 114, index.css 62, lib/scene 59…

**Escena 3D**
- `lib/viewer.ts`:
  - Fondo `0x0A0A0C` y niebla (~1130).
  - Fondo, niebla y grid de usuario (~1160–1206).
  - Materiales de selección y resaltado (~781–837): acento, hover, danger, warn, info y ghost.
  - Box3Helper (~1817).
  - Looks de presentación (~3105).
- `lib/scene/background.ts`: presets de fondo, niebla y grid, con test. Ya existe `SceneBackgroundMenu`.
- `lib/measure/section-system.ts` (23 colores) y `lib/measure/overlay.ts`.

**Fuera de alcance: es contenido, no interfaz**
- `lib/geo/*` (mapa, OSM, cielo, fachadas), `lib/cover/*`, rampas de nube de puntos, rampas solares y capas de datos.
- Informes exportados: `lib/ids/ids-report.ts` y `lib/delivery-report.ts`.
- Marketing: Blog, Landing, reactbits y `blog/EmbedViewer`.

## Registro de grupos

Leyenda de estado: pendiente / en curso / PR abierta / mergeada.

| # | Grupo | Archivos | Estado | PR | Notas |
|---|---|---|---|---|---|
| 1 | **base** (Fase 1) | `src/index.css` (tokens `[data-theme]`), `src/theme/*` (ThemeProvider, useTheme, sceneTheme.ts), `index.html` (script anti-FOUC), `tailwind.config.js`, `docs/theming.md` | mergeada | [#515](https://github.com/j03rul4nd/ifc-viewer-online/pull/515) | Definir `--text-muted`. Oscuro idéntico. Toggle claro/oscuro/sistema. Mantener alias de los nombres actuales (`--bg`, `--text-dim`…) hacia los semánticos para no tocar 4.000 usos |
| 2 | primitivas-modal-toast | `Modal.tsx`, `ToastContainer.tsx`, `lib/ui/modal-stack.ts` | mergeada | [#524](https://github.com/j03rul4nd/ifc-viewer-online/pull/524) | Oscuro idéntico (clases originales + overrides claros) |
| 3 | primitivas-móvil | `mobile/mobileUi.tsx`, `mobile/MobileSheet.tsx`, `MobileBottomNav.tsx` | mergeada | [#516](https://github.com/j03rul4nd/ifc-viewer-online/pull/516) | `ScoreHero`/`StatPill` reciben color por prop |
| 4 | layout-toolbar | `Toolbar.tsx`, `Sidebar.tsx`, `PanelRail.tsx`, `OverlayHud.tsx`, `CameraControls.tsx` | mergeada | [#517](https://github.com/j03rul4nd/ifc-viewer-online/pull/517) | Incluye selector claro/oscuro/sistema y fix de `?theme=` |
| 5 | arranque | `WelcomeView.tsx`, `UploadOverlay.tsx`, `components/loading/*`, `KeyboardHelpModal.tsx` | mergeada | [#528](https://github.com/j03rul4nd/ifc-viewer-online/pull/528) | |
| 6 | árbol-info | `ModelTree.tsx`, `ModelInfoPanel.tsx`, `ScenePanel.tsx`, `SceneContextMenu.tsx` | mergeada | [#529](https://github.com/j03rul4nd/ifc-viewer-online/pull/529) | |
| 7 | validación | `ValidationPanel.tsx`, `ValidationCoverageSummary.tsx`, `ValidationExportModal.tsx`, `components/ids/score.ts` | mergeada | [#530](https://github.com/j03rul4nd/ifc-viewer-online/pull/530) | ⚠ colores de nota y score con significado |
| 8 | validación-móvil-bcf | `mobile/ValidationPanelMobile.tsx`, `mobile/IdsPanelMobile.tsx`, `mobile/IdsFailurePager.tsx`, `BcfPanel.tsx`, `eir/EirProfileEditor.tsx` | mergeada | [#548](https://github.com/j03rul4nd/ifc-viewer-online/pull/548) | Asa de la hoja móvil invisible en claro (pendiente) |
| 9 | medir-sección UI | `MeasurementPanel.tsx`, `SectionPanel.tsx`, `measure/MeasureHud.tsx`, `lib/measure/measure.css` | mergeada | [#531](https://github.com/j03rul4nd/ifc-viewer-online/pull/531) | Incluye la pista de MeasureHud |
| 10 | paneles-escena | `PointCloudPanel.tsx`, `SolarPanel.tsx`, `VideoPanel.tsx`, `MeshPanel.tsx`, `ViewportPanel.tsx` | mergeada | [#525](https://github.com/j03rul4nd/ifc-viewer-online/pull/525) | MeshPanel sin revisar (feature off) |
| 11 | datos-capas | `DataLegend.tsx`, `LayerStyleEditor.tsx`, `geo/ui.tsx`, `geo/chrome.tsx`, `GeoPanel.tsx` | mergeada | [#527](https://github.com/j03rul4nd/ifc-viewer-online/pull/527) | DataLegend/LayerStyleEditor sin revisar a ojo |
| 12 | captura-tour | `CaptureToolbar.tsx`, `CapturePreviewModal.tsx`, `capture/EditorTimeline.tsx`, `TourRecorder.tsx`, `SceneBackgroundMenu.tsx` | mergeada | [#554](https://github.com/j03rul4nd/ifc-viewer-online/pull/554) | Verde de clips #2E9E7A se mantiene |
| 13 | huds-tiempo | `WalkHud.tsx`, `TimeBar.tsx`, `PlacementMiniMap.tsx`, `DemoGallery.tsx` | mergeada | [#547](https://github.com/j03rul4nd/ifc-viewer-online/pull/547) | WalkHud y minimapa sin cambios (sobre contenido) |
| 14 | cuenta | `account/AccountModal.tsx`, `account/authAppearance.ts`, `CustomProfileModal.tsx`, `pro/SavedRulesetPicker.tsx` | mergeada | [#549](https://github.com/j03rul4nd/ifc-viewer-online/pull/549) | Clerk sigue el tema; sin revisar a ojo (requiere sesión) |
| 15 | dashboard-admin | `dashboard/AdminView.tsx`, `dashboard/DashboardView.tsx` | mergeada | [#560](https://github.com/j03rul4nd/ifc-viewer-online/pull/560) | Brillo dorado de admin pasa a tinte del acento |
| 16 | gemelo | `components/twin/*` (por trocear al llegar) | mergeada | [#555](https://github.com/j03rul4nd/ifc-viewer-online/pull/555), [#546](https://github.com/j03rul4nd/ifc-viewer-online/pull/546) | Colores guardados en reglas (#e0523f, #7b8494, #cccccc) se mantienen; sin revisar a ojo |
| 17 | tailwind-alfa | Los ~65 usos de `bg-white/NN` y `border-white/NN` restantes | mergeada | [#564](https://github.com/j03rul4nd/ifc-viewer-online/pull/564) | Quedan alfas en demos MSP (AgvTwin, ImportTracker), LanguageSelector y ~25 velos sobre vídeo/imagen/3D |
| 3a | 3D fondo+grid+ejes | `lib/viewer.ts` (~1130–1206), `lib/scene/background.ts` | mergeada | [#518](https://github.com/j03rul4nd/ifc-viewer-online/pull/518) | Preset `studio` = fondo del tema |
| 3b | 3D selección/hover | `lib/viewer.ts` (~781–837, ~1817) | mergeada | [#550](https://github.com/j03rul4nd/ifc-viewer-online/pull/550) | Selección en claro teal; oscuro sin tinte como antes |
| 3c | 3D gizmos/overlays/etiquetas | `lib/measure/section-system.ts`, `lib/measure/overlay.ts` | mergeada | [#519](https://github.com/j03rul4nd/ifc-viewer-online/pull/519) | Resaltado claro #0077a8 pendiente de validar |
| 3d | 3D luces/tone mapping | `lib/viewer.ts` (luces) | mergeada | [#550](https://github.com/j03rul4nd/ifc-viewer-online/pull/550) | Luz en claro 1.15/1.2 |
| G1 | glass (index.css) | `.glass`, `.glass-md`, `.glass-xl`, `.mobile-pill-glass`, `.mobile-sheet-glass` | mergeada | [#520](https://github.com/j03rul4nd/ifc-viewer-online/pull/520) | Añadido tras QA |
| G2 | app-chips + tool grid | `App.tsx` (chips Inicio y caché), `mobile/ToolGrid.tsx` | mergeada | [#521](https://github.com/j03rul4nd/ifc-viewer-online/pull/521) | |
| G3 | hud-pills | `ModelInfoPanel.tsx`, `WalkHud.tsx`, `ClientHealthBadge.tsx`, `ClientPresentationLayout.tsx` | mergeada | [#522](https://github.com/j03rul4nd/ifc-viewer-online/pull/522) | WalkHud y modo cliente sin revisar a ojo |
| P1 | pulido: tokens | `index.css`, `sceneTheme.ts`, `docs/theming.md` | mergeada | [#536](https://github.com/j03rul4nd/ifc-viewer-online/pull/536) | Revisión estética: superficies cálidas, velo sin blur, paneles sólidos en claro, 3D en verde azulado, `--border-control` |
| P2 | pulido: barra, lateral, árbol | `Toolbar.tsx`, `Sidebar.tsx`, `ModelTree.tsx`, `PanelRail.tsx`, `DrawerResizeGrip.tsx`, `App.tsx` (separador) | mergeada | [#540](https://github.com/j03rul4nd/ifc-viewer-online/pull/540) | |
| P3 | pulido: cajón de validación | `ValidationPanel.tsx`, `pricing/ScoreUpsell.tsx` | mergeada | [#541](https://github.com/j03rul4nd/ifc-viewer-online/pull/541) | |
| P4 | pulido: modal de atajos | `KeyboardHelpModal.tsx` | mergeada | [#543](https://github.com/j03rul4nd/ifc-viewer-online/pull/543) | |
| P5 | pulido: campos a `--border-control` | inputs y selects | mergeada | [#564](https://github.com/j03rul4nd/ifc-viewer-online/pull/564) | Clases compartidas de inputs + búsquedas de árbol e incidencias |
| 4a | cierre: lint anti-hex | script de CI + allowlist (tokens, `lib/geo`, `lib/cover`, informes) | mergeada | [#559](https://github.com/j03rul4nd/ifc-viewer-online/pull/559) (+ ajuste en [#561](https://github.com/j03rul4nd/ifc-viewer-online/pull/561)) | Ratchet en scripts/colour-guard; bajar recuentos solo avisa |
| 4b | tokens propuestos | `src/index.css` | mergeada | [#561](https://github.com/j03rul4nd/ifc-viewer-online/pull/561) | --info y --scrim; --bg-floating y --selection no hacen falta |

## Orden y paralelismo

1. **1 (base)**, sola. Hay que mergearla antes de seguir.
2. **En paralelo, sin ficheros compartidos:** 2, 3, 4, 3a y 3c.
3. **En paralelo:** 5, 6, 7, 9, 10, 11, 12, 13, 14 y 3b.
4. **Después:** 8 (tras 3 y 7), 3d (tras 3b), 15, 16 y 17.
5. **Cierre:** 4a y 4b.

## Decisiones tomadas

- 2026-11-11: se aceptan pequeños desplazamientos de color en oscuro al pasar colores fijos a tokens (Joel).
- Tema por defecto: oscuro. `?theme=` en la URL solo fija el tema inicial.
- Tokens propuestos hasta ahora: `--scrim`, `--info`, `--selection`, `--bg-floating`, sombras y velo de modal/aviso.

- 2026-11-11, revisión estética (crítica en `.claude/theme-qa/review.md`, local): superficies en escalones cálidos, velo de modal oscuro suave sin blur, paneles flotantes sólidos con borde en claro, hover y medida 3D en verde azulado (Joel).

- 2026-11-12, dudas resueltas (Joel): la nota y el score de validación mantienen el tono y se oscurecen en claro vía tokens; el fondo 3D es claro por defecto en tema claro; las rampas de datos (nubes, solar, inundación, leyendas) no se tocan; `VerifyCertificateView` (página pública) queda fuera de alcance. `/admin` sí se migró (grupo 15).
- 2026-11-12: selección 3D en oscuro con tinte verde azulado #14a39f (hecho).
- 2026-11-12: modal de cuenta revisado a ojo en producción en claro (Clerk en claro, correcto).

## Pendiente tras el cierre (2026-11-12)

- `--text-muted` sigue sin definir en oscuro (rareza documentada en theming.md).
- Velos sobre vídeo/imagen/3D: marcados con `theme-allow-color` en CoverStudioModal, VideoPanel, DrawingDock, SketchDemo y ClipStudio; revisados también: DropOverlay y el cabezal de SoundToClip (sobre medios, marcados); `lib/capture` entra en la lista permitida (lienzos que acaban en clips/imágenes exportadas); CodeBlock ya estaba permitido (blog). Pasados a token: velos de `geo/flows.tsx`, MobileActionSheet y GuidedTour → `color-mix` con `--scrim` (oscuro idéntico); panel de FloodTimeline mantiene el literal en oscuro y usa `--bg-surface` en claro; texto sobre acento con `--accent-contrast`. Quedan: blancos translúcidos del cuerpo de MobileActionSheet (sin variante clara), tinte de acento en `geo/flows.tsx`, `bg-black/*` de StudioTimeline y SoundToClip y los colores de la gráfica de FloodTimeline (de datos).
- Comparación de versiones (`CompareModal`, `compare/ChangesTab`, `CompareDock`, `SidePicker`, `ui`): fondos oscuros fijos con variante clara por token, texto sobre acento con `--accent-contrast`, ámbar `#E9A23B` → `--warning`; el dock en claro queda sólido sin sombra. Oscuro sin cambios. Falta mirarlo a ojo con dos versiones cargadas.
- Comparación: `compare/IdsTab.tsx` ya usa `--warning` (mismo valor en oscuro). Los colores de tipo de cambio en `compare/ui.tsx` (añadido/modificado/borrado) son de significado y no se tocan.
- Editor de capas: insignia de alertas y puntos del historial mantienen `#ff3b30`/`#5ce27a` en oscuro y pasan a `--danger`/`--ok` en claro; texto de la insignia con `--accent-contrast`. Paleta, franjas de zoom y colores por defecto son de datos.
- Guía de la demo (`DemoGuide`): texto de los botones con `--accent-contrast`.
- Barra de tiempo: ya tiene variante clara; ámbar/verde de pasado/en vivo son de estado.
- Gemelo (`twin/*`): sin colores de interfaz fijos; los de `BindingsTab` (regla, caducado) son de datos.
- `ClashPanel`: solo fallbacks dentro de `var()` y el lienzo blanco del informe; estados de choque son de significado. `ClientMailV2`: el verde `#2f6f62` y su texto blanco son la marca del cliente en la vista previa del portal (contenido); marcados con `theme-allow-color`.
