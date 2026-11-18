# T3 — UI: 3D coloreado, lista de cambios, tabla A/B, flujo de 3 clics

Lee primero `tasks/_comun.md` y `tasks/T1-RESULTADO.md`. Requisito: T1 fusionada. Contexto: `10-spec.md` §4 (M2–M7, V2.4) y §7.2–7.3; **`05-ux.md` completo** (colores, esquemas, móvil, atajos); `01-inventario.md` (overlay y LoadManager).

## Objetivo
Que alguien de obra suelte A, suelte B y vea los cambios: lista primero, 3D después, sin que se le escape ninguno.

## Qué construir (sobre `src/components/compare/` y `CompareModal`/`CompareDock`, ampliando lo que hay)
1. **Flujo de 3 clics** (M6): dos zonas de soltar con la etiqueta A/B, arranque automático, progreso del snapshot y el aviso «procesado en tu navegador». Al terminar salta al cambio de más impacto.
2. **3D** (M2):
   - colores e iconos de `05-ux.md`;
   - el elemento eliminado como fantasma rojo en su posición de A;
   - el movido con una flecha de A a B y su cota;
   - el resto en gris translúcido.
   Se amplía `overlay.ts` (`planCompareOverlay`). Mientras se compara, validación e IDS quedan apagados con un aviso (spec §7.2).
3. **Lista** (M3):
   - ordenada por impacto;
   - filtros por planta, disciplina (fichero), `kind`, clase y marca;
   - estados pendiente/revisado/afecta a obra guardados en IndexedDB, con clave hash de A + hash de B + GlobalId;
   - el contador;
   - atajos J/K/R/F;
   - virtualizada si pasa de 500 elementos (hay listas virtuales en `components/twin/`).
4. **Tabla antes/después** (M4) por cambio, con las frases de obra a partir de `summary.key` y sus parámetros ×10 idiomas, y la confianza y el método cuando no sean `guid`.
5. **Panel de tolerancias** (M5), que recalcula con `diffRevisions` sin volver a leer los ficheros.
6. **Aviso de GUID regenerados** (M7).
7. **Vista dividida** con cámara sincronizada y **cortina A/B** (V2.4).
8. **Móvil y tablet:** `MobileSheet` con tarjeta, lista y tabla, como en `05-ux.md`.

## Puedes tocar
`src/components/compare/**`, `CompareModal.tsx`, `src/lib/compare/overlay.ts`, los packs i18n (solo claves `compare.*`) y la integración mínima en el visor para la flecha y la vista dividida (aislada en ficheros nuevos `src/lib/compare/view-*.ts`).

## No toques
El motor (`revision-diff.ts`, `normalize.ts`, `match-*.ts`), `report.ts`, `bcf-sync.ts` y `src/lib/drawing/**`.

## Aceptación
- Prueba e2e con Playwright: soltar el par de F8 y ver la lista sin más clics.
- Recorrer todos los cambios con J/K.
- Los estados sobreviven a una recarga.
- Un clic en un cambio encuadra el elemento en menos de 300 ms.
- Sin cadenas sin traducir: guard de i18n en verde.
- Al menos 30 FPS en vista dividida con `cras` (67 MB).
- Capturas reales de escritorio y móvil, adjuntas en el RESULTADO.

Al terminar escribe `tasks/T3-RESULTADO.md`.
