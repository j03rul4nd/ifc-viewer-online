# T2 — Resultado (2026-11-13)

> Destino previsto: `C:/repo/ifc/docs/revision-compare/tasks/T2-RESULTADO.md`. Un hook bloquea escribir en la copia base: hay que copiarlo allí.

**PR:** https://github.com/j03rul4nd/ifc-viewer-online/pull/598 (rama `claude/revision-compare-t2-7f40a7`, contra `main`).

## Lo hecho

- **Capa 3** `src/lib/compare/match-geometry.ts`:
  - `boxOf` (:33): AABB del mundo desde `geo.m` + `geo.s`, menos el `originShift`; las líneas base antiguas sin `m` usan una caja centrada en `c`.
  - `Grid` (:97): rejilla uniforme de celda `matchRadius`, con clave clase canónica + celda; mira las 27 celdas vecinas.
  - `matchByGeometry` (:119): candidatos de la misma clase canónica con centros de caja a ≤ `matchRadius`; puntuación 0,5·IoU + 0,3·(1 − d/r) + 0,2·Jaccard(nombre, tipo, PredefinedType, valores de Psets); asignación voraz por puntuación descendente (:143), aceptando desde 0,6. `confidence` = la puntuación.
- **Capa 4** `src/lib/compare/match-split.ts`, `matchSplitMerge` (:51): para cada «entero» sin pareja, las «partes» de la misma clase con ≥ 85 % de su caja dentro; se acepta con cobertura ≥ 0,85, que se penaliza si las partes sobresalen. Confidence = cobertura × 0,9. Detecta `split` (1→N) y `merge` (N→1), voraz por cobertura.
- **Registro** `src/lib/compare/revision-diff.ts`:
  - `DEFAULT_EXTRA_MATCHERS` (:34) = [capa 3, capa 4]. Se usan si el llamante no pasa `ctx.extraMatchers` (:353). Con `extraMatchers: []` se vuelve al comportamiento de T1 (capas 1–2).
  - Elementos espaciales (site, building, storey…) con GlobalId regenerado: se emparejan por clase + nombre único con `method: 'tag'` y 0,9 (:373). Sin esto, F9 daba 6 altas/bajas de estructura espacial.
  - `renamed` (:404): GlobalIds base→head de parejas no-guid. `parentKeys` traduce por ese mapa el padre de agregación. Sin esto, shanghai-tower con GUID regenerados daba 267 `relations_changed` falsos.
- **Rotación (V2.5)**:
  - `snapshot.ts` (:163) guarda `geo.x`, el eje X local unitario de la primera colocación (marco de malla); (:188) guarda `geo.m`, la esquina mínima del AABB del mundo.
  - `planRotationDeg` (`revision-diff.ts`:41): ángulo en planta con signo, antihorario visto desde arriba.
  - `classifyPair` (:227): si |rot| > `angleTolerance`, el elemento cuenta como `moved` con `delta.rotationDeg`. Un cambio de tamaño del AABB sin cambio de volumen se atribuye al giro (no es `reshaped`).
  - Nueva clave de resumen `rotated_deg` {deg, mm, dir} (:267).
- **Fixtures** (`scripts/compare-fixtures/make.ts`; F1–F8 y F11 se regeneran idénticos):
  - F9 (:417): túnel con todos los GlobalId regenerados salvo IfcProject + 1 muro movido 120 mm +X. `expected.json` lleva `guidMap` viejo→nuevo.
  - F10 (:427): losa del pabellón (18×12 m) partida en dos mitades; `expected.json` lleva `parts`.
  - F12 (:437): un pilar del pabellón girado 5° en planta.
- **Tests** `src/lib/compare/match.test.ts`: F9, F10 (también al revés → `merge`), F12, rejilla adversarial de 20 pilares, padre regenerado, unidades (IoU, Jaccard, cobertura) y escala sintética (20 000 elementos).

## Tests

`npx vitest run src/lib/compare --maxWorkers=1`: **4 ficheros, 65 passed** (compare, snapshot, revision-diff y match).

- F9: `guidRegenerated: true`; precisión y recall del emparejamiento ≥ 0,95 (test); exactamente 1 `moved` (`method: 'geometry'`, E, 120 mm), 0 altas y bajas.
- F10: 1 cambio, `method: 'split'`, `reshaped`, 2 GlobalIds head; al revés, `merge`.
- F12: `rotationDeg` = 5 ± 0,5; con `angleTolerance: 6`, 0 cambios.
- Rejilla de 20 pilares, 1 movido 100 mm: 20 parejas, 0 cruzadas, 1 `moved` de 100 mm E.
- F1–F8 y F11 siguen a 1,0. Único cambio en un test de T1: «layer 2 uses markProperties…» pasa ahora `extraMatchers: []`, porque comprueba la capa 2 sola (con las capas 3–4 los duplicados en la misma posición sí se emparejan).
- **shanghai-tower con todos los GUID regenerados** (2 441 elementos, 2 173 con geometría; script temporal, no commiteado): `diffRevisions` completo **148–304 ms**, capas 1–2 solas 66–139 ms. Las capas 3–4 cuestan **~80–170 ms**, muy por debajo de 5 s. Resultado: 2 441 `unchanged`, 0 cambios. El snapshot del fichero tarda ~9,4 s, pero eso no entra en la medida.
- Sintético con 20 000 pilares por lado, todo regenerado y 1 % movido: pasa (umbral de 10 s; 5 s es el objetivo, con margen para la suite cargada).
- Con la máquina cargada por las sesiones paralelas, vitest falló a veces al arrancar un worker o esbuild («The service was stopped»). Es el flake conocido: con `--maxWorkers=1` pasa.

## Desviaciones de la spec

1. **`GeoFingerprint.m` y `GeoFingerprint.x`** (`types.ts`, opcionales): `m` es la esquina mínima del AABB, necesaria para el IoU; `x` es la orientación. `types.ts` no estaba en la lista de «puedes tocar», pero son campos opcionales, y sin ellos no hay IoU ni rotación. `revision-types.ts` no se ha tocado.
2. **Capa 3 sin el corte IoU ≥ 0,8** de la tabla §3.2: se sigue la tarea (solo la puntuación ponderada ≥ 0,6). Con el corte, un pilar de 40 cm movido 100 mm (IoU 0,6) no se emparejaría.
3. **Rotación como `moved`** con `rotationDeg` y la clave nueva `rotated_deg` {deg, mm, dir}: **T3/M4 tienen que añadir esta frase en los 10 idiomas.** `mm` y `dir` son los del origen de la malla de web-ifc, que el giro arrastra (en F12, unos milímetros).
4. **Emparejamiento espacial por clase + nombre** (`method: 'tag'`, 0,9) y **traducción de padres** en `revision-diff.ts`: tocan la clasificación y no solo el registro, pero sin ellos F9 y shanghai-tower dan falsos cambios.
5. **Desviación 2 de T1 (moved + reshaped):** **no resuelta.** Con `geo.m` se podría dar el desplazamiento del centro de la caja, pero en un reshape el centro se mueve por el propio cambio de forma (un muro 500 mm más alto «sube» 250 mm). No hay un vector honesto sin un punto de anclaje estable (la colocación IFC real, no el origen de malla de web-ifc). Queda anotado para el parking lot: guardar la traslación de `ObjectPlacement` en el snapshot y usarla como vector.
6. **Split/merge:** `classifyPair` compara el entero con la **primera** parte, así que `sizeAfter` y `volumeAfter` son de una sola parte. El `kind` (`reshaped`) y el `method` son correctos. Un delta agregado (la suma de las partes) queda pendiente.
7. **F9 conserva el GlobalId de IfcProject**, porque el emparejado de ficheros (`pairing.ts`) lo usa con nombres `a.ifc`/`b.ifc`. Si un autor también regenera el proyecto y cambia el nombre del fichero, no se emparejan los ficheros: eso es de `pairing.ts`, no de T2.

## Pendiente

- La frase i18n de `rotated_deg` (T3).
- El vector de movimiento para moved + reshaped (desviación 5).
- El delta agregado en split/merge (desviación 6).
- La suite completa del repo: no la he podido terminar con la máquina cargada. T1 ya anotó 16 ficheros que fallan fuera de `compare` en worktrees; esta PR solo toca `src/lib/compare`, `scripts/compare-fixtures` y `tests/fixtures/revision`.
- La junction de `node_modules` en este worktree: hay que quitarla antes de borrarlo.
