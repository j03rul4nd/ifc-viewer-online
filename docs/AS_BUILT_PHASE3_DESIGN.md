# As-Built — Fase 3 (alineación por puntos) + flujo gratuito en el navegador

Referencia normativa: `docs/AS_BUILT_SCORE_PLAN.md` (§3.4 τ y guardarraíl, §4ter dos caminos un motor).
Estado de partida: motor hecho y DARK (`src/lib/asbuilt/*`, `src/workers/asbuilt.worker.ts`).

## 1. Qué se construye

El usuario tiene un IFC cargado y carga **su propia nube** con el cargador existente
(LAS/LAZ/COPC/PLY/PCD/XYZ — **E57 no se decodifica hoy**, `DEFERRED_EXTENSIONS`).
Marca ≥3 pares de puntos IFC↔nube, el visor ajusta una transformación rígida, informa el RMSE,
deriva τ y, si `τ ≥ 2·RMSE`, ejecuta el motor en el worker y muestra score, cobertura,
tabla por elemento, colores por estado en 3D y CSV. Todo en el navegador, gasto 0, gratis,
etiquetado **Preview**.

## 2. Piezas existentes que se reutilizan (no se reescriben)

| Necesidad | Ya existe |
|---|---|
| Cargar nube, colocarla | `lib/pointcloud/pc-runner.ts`, `pc-align.ts` (escalera de alineación + `AlignmentOffset` manual: x/y/z, yaw, pitch/roll ±45°, scaleMul), `realignCloud()` |
| Elegir punto de la nube | `PointCloudSystemAPI.pickPoint(clientX, clientY)` → `PickedPoint.position` (mundo) |
| Elegir punto del IFC con snap | `lib/measure/picker.ts` `createScenePicker().pick(..., { snaps })` (vértice/arista) |
| Nube al worker | `PointCloudSystemAPI.samplePoints(cloudId, maxPoints)` → copia aclarada **en mundo** |
| Geometría por elemento | `lib/scene/item-triangles.ts` `collectItemTriangles(model)` → `Map<localId, Float32Array[]>` (async, por lotes) |
| Motor | `runAsBuilt()` + `asBuiltTransferables()`; ya se niega a puntuar si `τ < 2·alignmentRmseM` |

## 3. Alternativas (dónde vive la transformación ajustada)

**A — El ajuste se escribe en la alineación de la nube (rung `manual`, vía `AlignmentOffset`).**
Lo que el usuario ve es exactamente lo que se puntúa; persiste por archivo con `saveOffset`; el resto
del visor (medir, sección) se beneficia. Coste: hay que traducir R,t a offset compuesto sobre la
transformación derivada (yaw∘tilt), y las rotaciones fuera de pitch/roll ±45° no son expresables
(caso raro: se rechaza con mensaje "eje vertical mal leído, corrígelo primero").

**B — Transformación privada del As-Built**: la nube en pantalla no se mueve; R,t se aplica a la
copia de `samplePoints` antes del worker. Más simple (sin composición), pero el usuario ve la nube
desalineada mientras el informe dice que está alineada — incoherencia visible y difícil de depurar.

**Recomendada: A.** WYSIWYG es la condición para que un usuario crea el número.

### Modelo de ajuste
- **4-DOF por defecto** (yaw + traslación): LAS/LAZ declaran Z-up y los escáneres nivelan; con 3 pares
  es mucho más estable que 6-DOF. Solución cerrada (Kabsch 2D en planta + media en altura).
- **6-DOF opcional** (Kabsch/Umeyama sin escala, SVD 3×3 propia, sin dependencias) con conmutador
  "Escaneo no nivelado". Escala fija a 1 (la unidad ya la resuelve el cargador; ajustarla ocultaría errores).
- Degeneración: rechazar si los puntos IFC son casi colineales (2º valor singular / 1º < 0,05) o separación < 1 m.

### RMSE y τ (plan §3.4)
- `fitRmse` = RMSE de residuos de los pares. Con n pequeño es optimista (el ajuste absorbe error),
  así que se informa además **RMSE leave-one-out** (n ≥ 4) y `alignmentRmseM = max(fitRmse, looRmse)`.
- `τ = sqrt(τ_decl² + σ_meas² + rmse²)` (⊕ = suma cuadrática). `τ_decl` por defecto 25 mm (editable);
  `σ_meas` = 0 para nube de usuario salvo que la indique (campo avanzado "precisión del escáner", defecto 5 mm).
- Guardarraíl: el botón Ejecutar se deshabilita si `τ_decl < 2·alignmentRmseM` (usar τ_decl, no τ inflado,
  para que el RMSE no se "autoapruebe"), con el motivo en texto. El motor repite la comprobación.
- Además: par con residuo > 3·RMSE marcado como sospechoso en la lista.

## 4. Flujo gratuito (UI)

**Ubicación:** nueva sección "Comparar con el modelo (Preview)" dentro de `PointCloudPanel`, visible solo
con ≥1 IFC y ≥1 nube `ready`. Monta un componente lazy `components/asbuilt/AsBuiltPanel.tsx` (no engorda
el chunk de entrada). En móvil, mismo componente en la hoja existente del panel.

Pasos (stepper en un solo panel):
1. **Nube**: selector si hay varias.
2. **Alinear**: "Añadir par" → clic en el IFC (snap a vértice) → clic en la nube. Lista con residuo por par,
   borrar par, conmutador 4/6-DOF, RMSE (fit y LOO). "Aplicar" escribe la alineación (alternativa A).
3. **Tolerancia**: τ_decl (mm), precisión opcional; muestra τ resultante y estado del guardarraíl.
4. **Ejecutar**: construcción de entrada por lotes (`await` entre elementos, nada síncrono sobre todo el
   modelo), `samplePoints(cloud, 3_000_000)`, worker con transferables, progreso + Cancelar (terminate).
5. **Resultados**: score o negativa explicada, cobertura, tabla por elemento (estado, p95 mm, muestras),
   clic = seleccionar/encuadrar, "Colorear por estado" y "Aislar desviados/ausentes", CSV.

**Gating honesto:** gratis, sin `useEntitlement`. Etiqueta "Preview" en el título y una línea:
"Resultado orientativo; depende de tu alineación." Primera entrega además tras `?asbuilt=1`
(ver pregunta abierta 2). Sin mención a IA.

**Memoria:** liberar la copia de la nube al terminar (transferida al worker; el worker se termina tras el
resultado). Limpiar colores al cerrar el panel. Marcadores de pares = 2 `Points`/sprites, disposed al salir.

## 5. Tareas

| ID | Tarea | Depende |
|---|---|---|
| T-401 | `rigid-fit.ts`: ajuste 4/6-DOF, RMSE, LOO, degeneración, τ y guardarraíl (puro) | — |
| T-402 | `fit-to-alignment.ts`: R,t → `AlignmentOffset` sobre la alineación actual (puro) | T-401 |
| T-403 | `build-input.ts` + `asbuilt-client.ts`: triángulos+nube → input; cliente del worker | — |
| T-404 | `asBuiltStore` + interacción de pares (pickers, marcadores) | T-401, T-402 |
| T-405 | `AsBuiltPanel` (stepper, ejecutar, resultados) + montaje en `PointCloudPanel` + i18n | T-403, T-404 |
| T-406 | Resultados en 3D (colorear/aislar por estado) + CSV | T-405 |
| T-407 | Verifier: IFC real + nube sintética desplazada conocida, criterios de §3–§4 | T-406 |

Paralelo: T-401 ∥ T-403; luego T-402; luego T-404; T-405; T-406; T-407.
