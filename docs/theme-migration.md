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
| 2 | primitivas-modal-toast | `Modal.tsx`, `ToastContainer.tsx`, `lib/ui/modal-stack.ts` | en curso | — | Commit local 4793d53a en `theme/modal-toast`; push bloqueado, pendiente de permiso |
| 3 | primitivas-móvil | `mobile/mobileUi.tsx`, `mobile/MobileSheet.tsx`, `MobileBottomNav.tsx` | mergeada | [#516](https://github.com/j03rul4nd/ifc-viewer-online/pull/516) | `ScoreHero`/`StatPill` reciben color por prop |
| 4 | layout-toolbar | `Toolbar.tsx`, `Sidebar.tsx`, `PanelRail.tsx`, `OverlayHud.tsx`, `CameraControls.tsx` | mergeada | [#517](https://github.com/j03rul4nd/ifc-viewer-online/pull/517) | Incluye selector claro/oscuro/sistema y fix de `?theme=` |
| 5 | arranque | `WelcomeView.tsx`, `UploadOverlay.tsx`, `components/loading/*`, `KeyboardHelpModal.tsx` | pendiente | | |
| 6 | árbol-info | `ModelTree.tsx`, `ModelInfoPanel.tsx`, `ScenePanel.tsx`, `SceneContextMenu.tsx` | pendiente | | |
| 7 | validación | `ValidationPanel.tsx`, `ValidationCoverageSummary.tsx`, `ValidationExportModal.tsx`, `components/ids/score.ts` | pendiente | | ⚠ colores de nota y score con significado |
| 8 | validación-móvil-bcf | `mobile/ValidationPanelMobile.tsx`, `mobile/IdsPanelMobile.tsx`, `mobile/IdsFailurePager.tsx`, `BcfPanel.tsx`, `eir/EirProfileEditor.tsx` | pendiente | | Depende de 3 y 7 |
| 9 | medir-sección UI | `MeasurementPanel.tsx`, `SectionPanel.tsx`, `measure/MeasureHud.tsx`, `lib/measure/measure.css` | pendiente | | Incluir la pista oscura de `measure/MeasureHud.tsx:129` |
| 10 | paneles-escena | `PointCloudPanel.tsx`, `SolarPanel.tsx`, `VideoPanel.tsx`, `MeshPanel.tsx`, `ViewportPanel.tsx` | pendiente | | Solo el marco: las rampas no se tocan |
| 11 | datos-capas | `DataLegend.tsx`, `LayerStyleEditor.tsx`, `geo/ui.tsx`, `geo/chrome.tsx`, `GeoPanel.tsx` | pendiente | | ⚠ leyendas con significado |
| 12 | captura-tour | `CaptureToolbar.tsx`, `CapturePreviewModal.tsx`, `capture/EditorTimeline.tsx`, `TourRecorder.tsx`, `SceneBackgroundMenu.tsx` | pendiente | | |
| 13 | huds-tiempo | `WalkHud.tsx`, `TimeBar.tsx`, `PlacementMiniMap.tsx`, `DemoGallery.tsx` | pendiente | | |
| 14 | cuenta | `account/AccountModal.tsx`, `account/authAppearance.ts`, `CustomProfileModal.tsx`, `pro/SavedRulesetPicker.tsx` | pendiente | | Clerk necesita una variante clara |
| 15 | dashboard-admin | `dashboard/AdminView.tsx`, `dashboard/DashboardView.tsx` | pendiente | | /admin interno, prioridad baja |
| 16 | gemelo | `components/twin/*` (por trocear al llegar) | pendiente | | ⚠ comprobar los colores de estado de sensores |
| 17 | tailwind-alfa | Los ~65 usos de `bg-white/NN` y `border-white/NN` restantes | pendiente | | Al final, por grep |
| 3a | 3D fondo+grid+ejes | `lib/viewer.ts` (~1130–1206), `lib/scene/background.ts` | mergeada | [#518](https://github.com/j03rul4nd/ifc-viewer-online/pull/518) | Preset `studio` = fondo del tema |
| 3b | 3D selección/hover | `lib/viewer.ts` (~781–837, ~1817) | pendiente | | En serie con 3a (mismo fichero) |
| 3c | 3D gizmos/overlays/etiquetas | `lib/measure/section-system.ts`, `lib/measure/overlay.ts` | mergeada | [#519](https://github.com/j03rul4nd/ifc-viewer-online/pull/519) | Resaltado claro #0077a8 pendiente de validar |
| 3d | 3D luces/tone mapping | `lib/viewer.ts` (luces) | pendiente | | En serie después de 3b |
| G1 | glass (index.css) | `.glass`, `.glass-md`, `.glass-xl`, `.mobile-pill-glass`, `.mobile-sheet-glass` | mergeada | [#520](https://github.com/j03rul4nd/ifc-viewer-online/pull/520) | Añadido tras QA |
| G2 | app-chips + tool grid | `App.tsx` (chips Inicio y caché), `mobile/ToolGrid.tsx` | mergeada | [#521](https://github.com/j03rul4nd/ifc-viewer-online/pull/521) | |
| G3 | hud-pills | `ModelInfoPanel.tsx`, `WalkHud.tsx`, `ClientHealthBadge.tsx`, `ClientPresentationLayout.tsx` | mergeada | [#522](https://github.com/j03rul4nd/ifc-viewer-online/pull/522) | WalkHud y modo cliente sin revisar a ojo |
| 4a | cierre: lint anti-hex | script de CI + allowlist (tokens, `lib/geo`, `lib/cover`, informes) | pendiente | | |
| 4b | tokens propuestos | `src/index.css` | pendiente | | Consolidar lo que propongan los subagentes |

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

## Dudas para Joel (colores con significado)

- **Nota y score de validación** (verde/ámbar/rojo): ¿se oscurecen en claro manteniendo el tono, o se usa la misma paleta con otro fondo?
- **Fondo 3D en claro:** ¿gris muy claro por defecto, o se mantiene el fondo oscuro en el visor aunque la interfaz sea clara (como Figma o Blender)?
- **Fuera de alcance:** ¿lo son `VerifyCertificateView` (página pública) y `/admin`?
- **Rampas de datos** (nubes, solar, inundación, leyendas): propuesta de no tocarlas.
