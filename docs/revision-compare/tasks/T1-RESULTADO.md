# T1 — Resultado (2026-11-13)

> Destino previsto: `C:/repo/ifc/docs/revision-compare/tasks/T1-RESULTADO.md`. Un hook del worktree bloqueó la escritura en la copia base: hay que copiarlo allí.

**PR:** https://github.com/j03rul4nd/ifc-viewer-online/pull/595 (rama `feat/revision-compare-t1`, commit 5aedb726, contra `main`).

## Lo hecho

- **Contrato** `src/lib/compare/revision-types.ts`: §3.5 literal. Añadidos: `CHANGE_KIND_PRIORITY`, `LocatedElement`, `MatchPair`, `MatcherContext`, `ExtraMatcher`, `RevisionContext`, `DiffRevisionsFn` y `RevisionDiff.noise?`.
- **Normalización** `src/lib/compare/normalize.ts`:
  - `canonicalClass` (:30);
  - `detectOriginShift` (:60): mediana por eje, ≥ 60 % de acuerdo, mínimo 3 pares, y devuelve la media de los pares que coinciden;
  - `DEFAULT_IGNORE_PSETS` (:82), con globs `Pset` o `Pset.Prop`, y `makeIgnoreMatcher` (:101);
  - `cardinalDirection` (:116), en 8 rumbos, `up` o `down`, con +Y = norte del proyecto.
- **Snapshot** `src/lib/compare/snapshot.ts`:
  - `meshStats` (:95) y `fingerprintGeometry` (:129) añaden `geo.s` (AABB del mundo, con resolución de 0,1 mm) y `geo.v` (volumen de la malla, con 6 cifras significativas). Se cachean por geometría. `h` y `c` no cambian.
  - `typeNames` (:190) añade `SnapElement.typeName`, el nombre del IfcType relacionado.
  - Todos los campos son opcionales (`GeoFingerprint` en `types.ts`).
- **Motor** `src/lib/compare/revision-diff.ts`, `diffRevisions(base, head, opts, ctx)` (:280):
  - capa 1 vía `diffSnapshotSets`;
  - capa 2 `matchByMark` (:96), con Tag y después `markProperties`, misma clase canónica y valor único, confidence 0,95;
  - `ctx.extraMatchers` para T2;
  - `classifyPair` (:158) calcula `kinds` y `kind` por prioridad;
  - `summary` con las claves `moved_mm`, `height_mm`, `size_mm`, `volume_m3`, `type_changed`, `storey_changed`, `file_changed`, `property_changed`, `properties_changed`, `added`, `removed`;
  - `guidRegenerated` (:395) cuando hay < 30 % de solape en ficheros emparejados.
- **Fixtures** `tests/fixtures/revision/{F1..F8,F11}` y el script `scripts/compare-fixtures/make.ts`:
  - se ejecuta con `node --experimental-strip-types --no-warnings --import ./scripts/ebook/ts-hook.mjs scripts/compare-fixtures/make.ts`;
  - F8 usa las carpetas `a/` y `b/` con los 3 ficheros de Poblenou;
  - `expected.json` se escribe a partir de las mutaciones, no del diff.

## Tests

`npx vitest run src/lib/compare`: **55 passed**. Incluye `compare.test.ts` y `snapshot.test.ts` sin cambios, y los nuevos de `revision-diff.test.ts`.

- F1–F8 y F11: precisión y recall de 1,0 por `kind`, además del método, el fichero y la dirección.
- F7: `originShift` = [10,0,0] ± 1 mm y 0 `moved`.
- F11: 0 cambios y `noise` > 0.
- **cras: `diffRevisions` = 119 ms.** cras solo tiene 261 elementos: casi todo su tamaño es malla. Como prueba de carga hay un test sintético con 50 000 elementos por lado: ~0,8 s en caliente. Su umbral es de 10 s porque con la suite completa en paralelo superó los 3 s.

Suite completa: 16 ficheros fallan fuera de `compare`: blog-covers, landing-chrome, colour-guard, seo/*, blender/*, mcap, ids.worker, etc. No los he tocado. Parece un problema de este worktree (activos binarios y finales de línea por `core.autocrlf=true`), pero no lo he comprobado contra `main`.

## Desviaciones de la spec

1. **Ejes:** web-ifc entrega las mallas con Y arriba, así que `geo.c` y `geo.s` siguen en ese marco. `delta.move`, `sizeBefore`, `sizeAfter` y `originShift` se devuelven en ejes IFC (x este, y norte, z arriba). `MatcherContext.originShift` está en el marco de la malla (documentado).
2. **moved con reshape:** el origen de la malla de web-ifc sigue a la geometría, así que un reshape también desplaza `c`. Por eso `moved` solo se emite sin reshape, como dice §3.3. Un cambio que mueve y cambia la forma a la vez sale como `reshaped`, sin vector.
3. **Sin `s` ni `v` (líneas base antiguas):** se usa el hash. Si además hay `originShift`, no se emite `reshaped` por hash.
4. **`diffRevisions`** está en `revision-diff.ts` y tiene un 4.º parámetro `ctx` con `labels` y `extraMatchers`, que son funciones y no se serializan.
5. **Elemento girado:** su AABB es la caja de las 8 esquinas transformadas. Es estable entre revisiones, pero sobreestima.
6. **`relations_changed`:** cubre `container`, fichero y `partOf` (por GlobalId del padre). Los huecos no se comparan.
7. **Fixtures:** web-ifc navega el modelo y reexporta F1 (`SaveModel`). Las mutaciones se aplican sobre las líneas STEP por express id.
8. **`.gitattributes`:** se añade `tests/fixtures/revision/**/*.ifc text eol=lf`. El fichero no estaba en la lista de «puedes tocar».
9. **El commit lleva un trailer `Co-Authored-By`.** El force-push para quitarlo fue bloqueado. La descripción de la PR ya está limpia. **Al fusionar con squash, borrar esa línea del mensaje.**

## Pendiente

- La lista `ignorePsets` es inicial: hay que ampliarla con ficheros reales de Revit y Archicad.
- `angleTolerance` está en las opciones pero no se usa (T2 y V2.5).
- Las capas 3 y 4, F9, F10 y F12 son de T2.
- Los textos i18n de las claves de `summary` son de T3/M4.
- `files[].counts` sale de la capa 1: una pareja por tag cuenta allí como alta más baja. El resto de contadores sí se recalculan.
- El worktree tiene una junction en `node_modules`: quitarla antes de borrarlo.
