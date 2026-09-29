# Árbol de escena: grupos, nubes de puntos, transformaciones y cámara

Estado a 2026-09-24. **F1–F3 construidas** (gizmo 3D incluido); F4 medida y cerrada (ver notas).

## Lo que ya existe (no rehacer)

- `src/lib/model-grouping.ts` — agrupación automática pura (GUID de proyecto →
  nombre de proyecto+site → proximidad ≤25 m → suelto). Ya acepta
  `userGroupId` como override que gana siempre.
- `src/hooks/useModelGroups.ts` — calcula los grupos desde `sceneStore` +
  árboles espaciales + georef.
- `ScenePanel.tsx` — lista modelos, visibilidad, aislar, y mueve un grupo
  entero en **posición** (`groupPositionUpdates`).
- `pointCloudStore.ts` — ya es multi-nube (`clouds[]`, `activeCloudId`,
  offset por nube persistido por fichero, presupuesto de render global).
- `viewer.setModelTransform(t, modelId)` — pivote por modelo (pos/rot/escala).

## Huecos reales

| # | Hueco | Síntoma |
|---|-------|---------|
| G1 | No hay UI para reasignar un modelo a otro grupo, crear/renombrar grupos ni ordenarlos | Si la heurística falla, el usuario no puede corregirla aunque el tipo lo soporte |
| G2 | Las nubes viven en `PointCloudPanel`, fuera del árbol | No se ve qué nube corresponde a qué edificio; no se mueven con su grupo |
| G3 | Transformar grupo = solo traslación; no hay ámbito "toda la escena"; rotar un grupo rota cada modelo sobre su propio pivote | Calibrar lat/lon o girar un conjunto federado lo rompe |
| G4 | `setCameraPreset` usa solo `currentModel.box` (`viewer.ts:2259`) | Con varios modelos/grupos las vistas encuadran solo el activo; ignora nubes; sin modelo cae a una caja fija de ±10 m |
| G5 | Render de nubes: sin medir aún coste CPU/GPU con N nubes | Por verificar antes de optimizar |

## Fases

### F1 — Árbol de escena unificado (G1 + G2) — HECHO
> Construido: `lib/scene-tree.ts` (composición pura manual+auto+nubes),
> `stores/sceneGroupStore.ts` (overrides persistidos por nombre de fichero /
> `fileKey`, localStorage `ifcv.sceneGroups.v1`), `components/SceneGroupTree.tsx`
> (panel Escena: arrastrar, "Mover a grupo", nuevo/renombrar/subir/bajar/
> eliminar, fijar grupo detectado, ojo y encuadre por grupo, bandeja de nubes
> sin asignar), `lib/tree-groups.ts` (árbol lateral ordenado por grupo con fila
> de grupo plegable). Nube sin asignar cae en el grupo del modelo contra el que
> se alineó.
- Nuevo `sceneTreeStore` (o extensión de `sceneStore`) con **nodos grupo**
  persistentes: `{ id, name, order, collapsed, color }`, `userGroupId` en
  modelos y `groupId` en nubes.
- Grupos automáticos se "materializan" solo cuando el usuario los toca
  (renombrar/mover); hasta entonces se recalculan.
- UI: grupo → modelos IFC + nubes; arrastrar entre grupos, menú "Mover a
  grupo… / Nuevo grupo / Sacar del grupo", bandeja "Sin asignar", badge con la
  base de la agrupación (`GroupBasis`) para no presentar una suposición como
  un hecho.
- Visibilidad/aislar/encuadrar por grupo.

### F2 — Transformación por ámbito (G3) — HECHO salvo gizmo
> Construido: `lib/rigid-move.ts` (giro sobre pivote común + traslación,
> modelos y nubes), `hooks/useScenePlacement.ts` (única puerta para mover),
> `stores/transformHistoryStore.ts` (deshacer/rehacer 50 pasos + modo
> temporal), ámbitos Archivo / Grupo / Escena en ScenePanel. Lat/lon: el mapa
> se ancla al modelo activo, así que el panel muestra la georreferencia y abre
> el editor de ubicación existente en vez de duplicarlo.
> Arreglado de paso: `model.box` de fragments ya incluye la matriz del pivote;
> el visor la aplicaba dos veces (`pivotLocalBox`).
> Gizmo 3D: `lib/scene-gizmo.ts` (TransformControls sobre un proxy en el
> pivote; mover en 3 ejes, girar solo rumbo con paso de 1°), `viewer.setGizmo`
> / `setGizmoPosition`, `hooks/useSceneGizmo.ts` y `placement.beginDrag`
> (movimiento TOTAL desde el pre-arrastre, un paso de deshacer por arrastre).
> Soltar sobre un eje no selecciona el elemento de detrás.
- Selector de ámbito: **Elemento activo / Grupo / Escena completa**.
- Transformación de grupo como matriz alrededor de un pivote común
  (`groupReferencePosition`), aplicada a modelos **y nubes** del grupo; rotar
  un grupo compone `R·(p − c) + c` por miembro, no rota cada uno en su sitio.
- Gizmo 3D (TransformControls) sobre el pivote del ámbito elegido.
- "Calibrar": fijar lat/lon/rumbo del grupo contra el ancla `GeoPlacement`
  (ver memoria digital-twin-frame: un único ancla para las 4 capas).
- Modo temporal "mover para mirar" con botón de revertir (snapshot de
  transforms), distinto de un cambio de calibración persistente.
- Deshacer/rehacer de transformaciones.

### F3 — Cámara consciente del ámbito (G4) — HECHO
> Construido: `lib/camera-framing.ts`, `viewer.setCameraPreset(preset, opts)`,
> `viewer.frameItems(ids)`, selector Auto/Activo/Grupo/Todo en CameraControls.
- Función pura `sceneBounds(scope)` → caja de: activo | grupo | todo
  (modelos visibles + nubes visibles), respetando pivotes.
- Presets usan el ámbito; por defecto "todo lo visible". Reglas:
  - Escena vacía: presets desactivados con tooltip; si solo hay nubes, encuadra nubes.
  - 1 modelo: igual que hoy.
  - Varios modelos de un grupo: encuadra el grupo.
  - Varios grupos lejanos (>~500 m): encuadra el grupo activo y ofrece
    "ver todos" — evita una vista a 3 km donde no se ve nada.
- Doble clic en un grupo/modelo/nube del árbol = encuadrar ese nodo.

### F4 — Render de nubes (G5) — MEDIDA Y CERRADA
> Medido (2026-09-29): 4 nubes demo = 280k pts, 35 trozos, 5 MB GPU, todo
> dibujado. `allocateBudget` cuesta 3 ms/2k trozos, 10 ms/10k, 79 ms/30k, pero
> con trozos de 262k pts y techo de 20 M residentes el caso real son ≤ ~200
> trozos (<1 ms): la CPU del LOD NO es el cuello de botella. Ya existían:
> presupuesto global por tamaño en pantalla, frustum culling, recorte de
> presupuesto al interactuar, display por uniforms, caché de nodos COPC
> (memoria 64 MB + IndexedDB 256 MB).
> ARREGLADO: el pase de LOD solo se relanzaba si la cámara se DESPLAZABA; girar
> en el sitio (modo a pie), zoom de lente o cambio a ortográfica dejaban
> ocultos trozos que volvían a estar en pantalla (`pc-lod.viewChanged`).
> Candidatos NO hechos (sin evidencia de que hagan falta hoy): caché de
> LAS/PLY ya parseados entre recargas; cuando ≥100k trozos, ordenar y cortar la
> cola en vez del mínimo de 1024 pts (decisión de producto: hoy se prefiere
> sobrepasar presupuesto a dejar huecos).
- Medir primero (puntos residentes, draw calls, ms/frame con 1/3/5 nubes).
- Candidatos: presupuesto de puntos repartido por visibilidad y distancia
  entre nubes (no igualitario), LOD por octree ya en streaming, frustum
  culling por nodo, cache de nodos en IndexedDB/OPFS por fichero, decodificar
  en worker con transferables, no re-subir buffers al cambiar color/tamaño
  (uniforms en vez de atributos).

## Orden recomendado
F3 (pequeño, puro, testeable, arregla un bug visible) → F1 → F2 → F4.
