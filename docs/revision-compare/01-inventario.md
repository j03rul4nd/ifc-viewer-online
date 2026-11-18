# Revision Compare — 01 · Inventario de lo que ya existe

Fecha: 2026-11-13. Investigación de solo lectura.

> **Aviso clave:** la rama local `feat/urban-3d-vertical-infrastructure` está **1165 commits por detrás de `main`** (`git rev-list --count HEAD..main`). La comparación de versiones (antiguo worktree `ifc-compare`, rama `feat/version-compare`) **ya está fusionada en `main`** (commit `c31fb60f feat(compare): compare versions of IFC sets…`), pero **no está en el árbol de trabajo local**. Las evidencias marcadas `main:` se leyeron con `git show main:<ruta>`; las demás, del árbol de trabajo. El worktree `C:/repo/ifc-compare` ya no existe (no aparece en `C:/repo/` ni en `git worktree list`).

## Tabla de capacidades

| capacidad | existe | evidencia | reutilizable | carencias |
|---|---|---|---|---|
| Diff de conjuntos IFC por GlobalId (añadido/eliminado/modificado/sin cambio) | sí (en main) | `main:src/lib/compare/model-diff.ts:1-8` (identidad = GlobalId en todo el conjunto), `:64` `diffElement`, `:131` `diffSnapshotSets`, `:221` `churnPercent` | alta: puro, sin web-ifc ni DOM, con tests (`main:src/lib/compare/compare.test.ts`) | pensado para revisión semanal de oficina, no para obra; sin resumen «qué afecta a mi tajo» |
| Categorías de cambio (atributos, psets, contenedor, geometría, posición, fichero) | sí (en main) | `main:src/lib/compare/types.ts:53-67` (`ChangeCategory`; `'placement'` = misma forma, movido) | alta | sin severidad/relevancia para obra; atributos ignorados por defecto `GlobalId, Name, PredefinedType` (`main:src/lib/compare/model-diff.ts:17`) |
| Huella geométrica y distancia de movimiento | sí (en main) | `main:src/lib/compare/snapshot.ts:85` `fingerprintGeometry` (tamaños de teselado, sin leer vértices); `main:src/lib/compare/types.ts:22-24` (hash con rejilla 1 mm + origen en metros) | media: barata | puede no detectar cambios de forma con igual nº de vértices/índices (SUPUESTO, deducido de `snapshot.ts:87` «v/i»); sin diff de volumen/cotas |
| Snapshot en worker | sí (en main) | `main:src/lib/compare/snapshot.ts:1-8,126`; `main:src/workers/snapshot.worker.ts` (presente en el árbol de main) | alta | re-parsea con web-ifc (más memoria) |
| Emparejado de ficheros entre versiones | sí (en main) | `main:src/lib/compare/pairing.ts` (importado en `model-diff.ts:15`) | alta | — |
| Overlay de colores (3 colores + fantasma) | sí (en main) | `main:src/lib/compare/overlay.ts:3,18,34` (`locateInScene`, `planCompareOverlay`) | alta | vista lado a lado / deslizador A-B: no visto (SUPUESTO) |
| UI de comparar (modal, pestañas Cambios/IDS/BCF/Historial, dock) | sí (en main) | `main:src/components/CompareModal.tsx`, `main:src/components/compare/{ChangesTab,IdsTab,BcfTab,HistoryTab,CompareDock,SidePicker}.tsx`; i18n `main:src/locales/*/compare.json` | media: UI de oficina técnica | uso móvil/obra no comprobado (SUPUESTO) |
| Líneas base persistidas | sí (en main) | `main:src/lib/compare/baseline-store.ts:7,31` (IndexedDB, JSON gzip) | alta | solo local al navegador |
| IDS entre versiones | sí (en main) | `main:src/lib/compare/ids-versions.ts`, `main:src/lib/compare/ids-from-model.ts` | media | — |
| Sincronía BCF del diff | sí (en main) | `main:src/lib/compare/bcf-sync.ts` | alta | — |
| Exportar el diff (CSV + HTML imprimible) | sí (en main) | `main:src/lib/compare/report.ts:2-4,16,27` (`diffToCsv`, BOM para Excel, informe HTML) | alta | sin PDF nativo ni XLSX del diff |
| Multi-modelo (registro) | sí | `src/lib/model-registry.ts:25-41` (`modelId`, `ifcBuffer`, `expressIDToType`), `:49` API | alta | guarda el IFC entero en memoria por modelo |
| LoadManager (jobs, concurrencia) | sí | `src/lib/loading/load-manager.ts:325`, límites `:2397,2413,2450`; `src/lib/loading/resource-policy.ts:45,92` (deviceMemory) | alta para cargar A y B | sin noción de «par de versiones» |
| Conversión IFC → Fragments en pool de workers | sí | `src/lib/loading/ifc-convert-pool.ts:16,85,154` (IfcImporter de fragments 3.4.x) | alta | — |
| Diff de validación entre dos ejecuciones | sí | `src/lib/validation-diff.ts:1-22` | media (patrón) | mismo modelo, no versiones distintas |
| Coloreado / fantasma / realce en visor | sí | `src/lib/viewer.ts:35` (`original/clay/ghost`), `:261-264` (`ghostOpacity`), `:427`, `:821` (canal overlay compartido; IDS y validación excluyentes) | alta | el overlay de comparar comparte canal (riesgo de conflicto) |
| Ediciones como diffs no destructivos | sí | `src/lib/diffStore.ts:1-30` | baja (otro concepto) | no es comparación de versiones |
| BCF importar/exportar | sí | `src/lib/bcf.ts:29` `importBcf`, `:69` `issuesToBcfTopics`, `:240` `exportBcfZip` | alta | — |
| XLSX | parcial | `src/lib/cobie/xlsx.ts` (escritor para COBie) | media | no conectado al diff |
| PDF de informe | parcial | `main:src/lib/cover/pdf.ts` (existe); impresión en `src/components/VerifyCertificateView.tsx` (SUPUESTO, solo grep) | baja | sin PDF del diff |
| Panel de propiedades | parcial | SUPUESTO (no inspeccionado; `src/components/ModelTree.tsx` existe) | — | no muestra valor A vs B |
| Planos PDF/DXF y diff de láminas | sí (en main) | `main:src/lib/drawing/diff.ts:1-8` (diff segmento a segmento en espacio modelo), `main:src/lib/drawing/import-file.ts:2-3,13` (pdf.js bajo demanda; DWG reconocido y rechazado), `main:package.json:90` `pdfjs-dist ^4.10.38` | alta para revisiones de plano | DWG no soportado |
| Límite de tamaño | sí | `src/lib/upload.constants.ts:5` (2 GB), `src/lib/loading/ifc-source.ts:744-745` | — | dos versiones grandes en móvil probablemente no caben (SUPUESTO) |

## Arquitectura de carga y memoria

- Motores: `@thatopen/fragments ^3.4.5` (`package.json:51`) para render; `web-ifc ^0.0.77` (`package.json:83`) para datos, validación y snapshot.
- Flujo: el IFC se convierte a Fragments en workers (`src/lib/loading/ifc-convert-pool.ts:85`, binario transferido sin copia), se cachea en OPFS (`src/lib/model-registry.ts:34-35`, `src/lib/opfs-cache.ts`) y se conservan los bytes IFC originales (`src/lib/model-registry.ts:30-33`) porque validador, exportador y snapshot los necesitan.
- Consecuencia: por versión conviven IFC + fragments + modelo web-ifc temporal del snapshot; comparar dos versiones ≈ duplicar. La política de recursos lee `deviceMemory` (`src/lib/loading/resource-policy.ts:45,92`), pero no hay presupuesto específico para pares (SUPUESTO).
- Límite duro por fichero: 2 GB (`src/lib/upload.constants.ts:5`).

## Reutilizar / extender / falta

**Reutilizar tal cual (tras traer `main`):** `src/lib/compare/*` (snapshot, diff, pairing, overlay, report, baseline-store, bcf-sync), `model-registry`, `LoadManager`, `bcf.ts`, `src/lib/drawing/diff.ts` para revisiones de plano.

**Extender:**
- Capa «obra»: filtro por planta/zona/disciplina y ranking de relevancia sobre `ElementDiff` (movido > X cm, cambio de material/dimensión).
- Valores A vs B en el panel de propiedades a partir de `FieldChange`.
- Exportación PDF/XLSX del diff reutilizando `report.ts` y `cobie/xlsx.ts`.
- Resolver la exclusión del canal de overlay (`src/lib/viewer.ts:821`) si comparar convive con validación.

**Falta:**
- Detección de cambios geométricos finos (la huella actual = tamaños de malla + colocación).
- Emparejado cuando los GlobalId se regeneran (por tipo + posición + nombre): no visto (SUPUESTO).
- Vista dividida / deslizador A-B y nubes de revisión en 3D.
- DWG.
- Presupuesto de memoria para dos versiones grandes en móvil.

**Primer paso:** actualizar la rama de trabajo desde `main` (sin tocar el trabajo sin commitear) antes de diseñar: la mayor parte del motor ya existe allí.
