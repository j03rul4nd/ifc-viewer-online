# T2 — Emparejamiento avanzado sin GlobalId

Lee primero `tasks/_comun.md` y `tasks/T1-RESULTADO.md`. Requisito: T1 fusionada en `main`. Contexto: `10-spec.md` §3.2, §3.4 y §4 V2.1/V2.5; `04-casuisticas.md` (filas de GUID regenerados, división/fusión, espejado, elementos repetidos); `02-dominio.md` (estabilidad de GUID).

## Objetivo
Emparejar los elementos que quedan sin pareja tras las capas 1 y 2, mediante geometría (capa 3) y por división o fusión (capa 4). Cada emparejamiento lleva `method` y `confidence` según la tabla de la spec §3.2.

## Qué construir
1. `src/lib/compare/match-geometry.ts`. Para la capa 3:
   - un índice espacial (rejilla uniforme o un árbol simple, sin dependencias nuevas pesadas);
   - candidatos de la misma clase canónica dentro de `matchRadius`;
   - puntuación 0,5·IoU(AABB) + 0,3·proximidad + 0,2·similitud de propiedades;
   - asignación voraz por confianza descendente, aceptando a partir de 0,6.
2. `src/lib/compare/match-split.ts`. Para la capa 4: 1→N y N→1, con una cobertura volumétrica (AABB) de al menos 0,85.
3. Guardar la orientación en el snapshot (eje X local, opcional) y añadir `rotationDeg` y `angleTolerance`.
4. Engancharlo a `diffRevisions` a través de `extraMatchers` (el punto que dejó T1).
5. Fixtures F9 (GUID regenerados + 1 movido), F10 (losa partida) y F12 (giro de 5°). Un caso adversarial: una rejilla de 20 pilares idénticos, con 1 movido 100 mm.

## Puedes tocar
`src/lib/compare/match-*.ts`, la parte de orientación de `snapshot.ts`, el registro de matchers en `revision-diff.ts`, los tests y los fixtures nuevos.

## No toques
`revision-types.ts`, salvo campos opcionales anotados como desviación. Tampoco `src/components/**` ni `src/lib/drawing/**`.

## Aceptación
- F9: `guidRegenerated: true`; precisión ≥ 0,95 y recall ≥ 0,95 en el emparejamiento; exactamente 1 `moved`.
- F10: 1 cambio con `method: 'split'`.
- F12: `rotationDeg` ≈ 5 ± 0,5.
- Rejilla de pilares: 1 `moved` y 0 parejas cruzadas.
- Siguen pasando F1–F8 y F11.
- Las capas 3 y 4 sobre `shanghai-tower` con todos los GUID regenerados tardan menos de 5 s (tiempo anotado en el RESULTADO).

Al terminar escribe `tasks/T2-RESULTADO.md`.
