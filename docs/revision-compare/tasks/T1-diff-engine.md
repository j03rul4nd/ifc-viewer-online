# T1 — Motor de diff de revisiones (define el contrato)

Lee primero `tasks/_comun.md`. Contexto: `10-spec.md` §2, §3, §4 (M1, M5, M7) y §6; `04-casuisticas.md`; `01-inventario.md`.

## Objetivo
Ampliar el diff por GlobalId que ya existe en `src/lib/compare/` para que distinga movido, forma, tipo, relaciones y propiedades; corrija el desplazamiento global del origen; ignore el ruido de teselado; y empareje por marca cuando falte el GlobalId. Todo con una salida serializable.

## Qué construir
1. `src/lib/compare/revision-types.ts`, exactamente como en la spec §3.5.
2. `src/lib/compare/normalize.ts`, con estas funciones:
   - `canonicalClass(ifcClass, schema)`, que quita `StandardCase`, `ElementedCase`, etc.;
   - `detectOriginShift(pairs, tol)`, que devuelve la mediana de Δc si al menos el 60 % de los pares coinciden;
   - una lista por defecto de `ignorePsets`.
3. Ampliar el snapshot (`snapshot.ts:85` `fingerprintGeometry`) para guardar en `geo` también `s` (tamaño del AABB en m) y `v` (volumen de la malla en m³). Ambos campos son opcionales: las líneas base antiguas, que no los tienen, siguen funcionando.
4. `src/lib/compare/revision-diff.ts` con `diffRevisions(base, head, opts)`:
   - usa `diffSnapshotSets` para la capa 1 (GlobalId);
   - la capa 2 empareja por Tag o por `markProperties`, con la misma clase canónica y valor único;
   - calcula `kind`, `kinds`, `delta` (incluida la dirección cardinal), `summary` (clave más parámetros), `byKind`, `originShift` y `guidRegenerated`;
   - deja un hueco para las capas 3 y 4: una función `extraMatchers` inyectable que implementará T2.
5. Recalcular sin volver a leer los IFC: `diffRevisions` es pura y trabaja sobre los snapshots.
6. Script `scripts/compare-fixtures/make.ts` y fixtures F1–F8 y F11 de la spec §6 en `tests/fixtures/revision/`, con su `expected.json`. Las mutaciones se hacen con web-ifc sobre los IFC pequeños del repo.

## Puedes tocar
`src/lib/compare/{types,snapshot,snapshot-runner,model-diff,normalize,revision-types,revision-diff}.ts`, sus tests, `scripts/compare-fixtures/` y `tests/fixtures/revision/`.

## No toques
`src/components/**`, `viewer.ts`, `report.ts`, `bcf-sync.ts` y `src/lib/drawing/**`.

## Aceptación
- F1–F8 y F11: precisión y recall de 1,0 por `kind`, en `src/lib/compare/revision-diff.test.ts`.
- F7: `originShift` ≈ [10,0,0] ± 1 mm y ningún `moved`.
- F11 (reteselado): 0 cambios.
- Los tests de `compare.test.ts` y `snapshot.test.ts` siguen pasando.
- `diffRevisions` sobre los snapshots de `cras` tarda menos de 1 s (medido en el test, con el tiempo anotado en el RESULTADO).

Al terminar escribe `tasks/T1-RESULTADO.md`. **T2, T3 y T4 empiezan cuando T1 esté fusionada.**
