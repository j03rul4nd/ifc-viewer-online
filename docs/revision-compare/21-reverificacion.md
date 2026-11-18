# 21 — Re-verificación de Revision Compare (segunda pasada)

Fecha: 2026-11-13. Base: `origin/main` `b1db4920` (incluye #605, #606, #607, #608, #609 y #611). Mis scripts están en `scripts/verify-rc/`, rama `claude/revision-compare-verify-d462c2`, commits `09992f42` y `d082eb65` (sin PR).
Capturas, exportaciones y JSON en `side-session-notes/…/reverif-captures/`.

Las pruebas de UI de esta pasada se hicieron sobre el **bundle de producción**: `vite build` con la misma configuración que `npm run build`, servido con `vite preview`. Los eventos `rc_*` se inspeccionaron en dev, porque `__phMock` solo existe en DEV y en localhost PostHog no envía nada.

## Veredicto: **NO DESPLEGABLE**

**Bloqueante único: `npm run build` falla.**

```
src/components/compare/RevisionExports.tsx(51,66): error TS2345:
Argument of type '[`rc.dir.${string}`]' is not assignable to parameter of type …
```

- La línea es `t(\`rc.dir.${c.delta.direction}\`)`, introducida por #611 (`b1db4920`).
- `tsc -b` aborta el build antes de vite. Lo he confirmado con `npx tsc -b --force`; es el único error.
- Cualquier despliegue que ejecute `npm run build` (Cloudflare Pages o Vercel) fallará.
- Arreglo probable, de una línea: tipar la clave, por ejemplo con `t(\`rc.dir.${dir}\` as const)` o `t('rc.dir.' + dir as never)`, como hacen las otras claves dinámicas de `rc.*`.

**Con ese error corregido, el resto queda DESPLEGABLE.** No queda ningún FALLO funcional de la primera pasada, y el bundle de producción funciona de principio a fin.

## Tabla

| Criterio | Antes (20) | Ahora | OK/FALLO |
|---|---|---|---|
| Build de producción (`npm run build`) | No probado (mi build directo no arrancaba web-ifc) | **Falla en `tsc -b`:** TS2345 en `RevisionExports.tsx:51` (#611). El paso de vite solo sí compila, y ese bundle funciona | **FALLO (bloqueante)** |
| Colores en el 3D, F8 | Gris: sin verde, sin fantasma rojo | Añadido en verde sólido (Alternar), eliminado como fantasma rojo (375 px), movido en azul con cota «120 mm» | OK |
| Colores en el 3D, cras | Sin violeta visible | Lista y 3D en violeta; 10 cambios | OK |
| FPS vista Cambios, cras | 23 FPS | 60 FPS en vista Cambios, Cortina y Alternar (rAF propio, 3 s) | OK |
| FPS F8 | 60 | 60 en las tres vistas | OK |
| Informe PDF | Raster, cortado, colores ajenos a 05-ux, capturas negras | 5 páginas con **texto seleccionable** (pypdf lo extrae). Nombres largos con «…», pie y «Página x de 5» sin solaparse, colores 05-ux (violeta para propiedades), capturas en color del elemento (fantasma rojo y muro verde), clase legible («Viga», «Muro») | OK |
| BCF 3.0 contra el XSD | 11/11 válidos | 11/11 válidos (98 KB, antes 703 KB) | OK |
| A1: movido 300 mm + reshape, GUID estable | `kinds` sin `moved` y sin vector | `kinds` = [reshaped, moved], E, 300 mm | OK |
| A3: GUID regenerados + movido 200 mm + reshape | Alta + baja (sin emparejar) | 1 `reshaped` por `geometry`, `kinds` [reshaped, moved], E, 200 mm, 0 FP | OK |
| Agregado F1–F12 + A1–A4 | reshaped R 0,8; added/removed P 0,67; geometry R 0,75 | P = R = 1,0 en todos los kinds y todos los métodos | OK |
| Sintético de 343 MB (cras ×5), diff | 10,1 s | **64 ms** (snapshot A+B 44 s, RSS pico 1,67 GB) | OK |
| cras / shanghai (node) | diff 30 / 79 ms | diff 26 / 65 ms; snapshot A+B 9,3 / 8,0 s; recálculo a 1 mm 8 / 52 ms | OK |
| PDF 2D en navegador | No verificado (falla en dev) | En producción: A (3 h, 1:100) contra B (3 h reordenadas, 1:50): A-101 con **3 nubes** (+1/−1 KITCHEN→KITCHEN + DINING, +3, −9), A-102 y A-103 sin nubes, escala ×2,000, RMS 0,00 mm. Exportar «B con nubes» descarga 11,5 KB. Nubes visibles en el visor de planos | OK |
| PDF 2D: aviso de escaneado | Cubierto por test unitario | Al cambiar B por `scan.pdf` (1 pág.) frente a A (3 h), la hoja sale como «#1 Solo en el juego nuevo» y no como «No vectorial». El aviso solo aparece si la página escaneada llega a emparejarse | FALLO menor (no bloquea) |
| Móvil 375 px | Toast tapaba la cabecera, pestañas cortadas, «Encuadrar» de 36 px | Cabecera y pestañas completas, sin toast encima, 0 botones < 44 px, sin scroll horizontal | OK |
| Frase de obra e i18n | «Beam eliminado», «IFCBEAM» en PDF | «Eliminado: Viga», «Nuevo: Muro», clase «Viga» en PDF y tarjeta | OK |
| Local-first al comparar (F8, cras, 375) | 0 POST y 0 hosts externos | 0 peticiones que no sean GET, 0 bytes subidos, 0 hosts externos. En la demo, 0 peticiones que no sean GET | OK |
| colour-guard en los ficheros de la iniciativa | `report-revision.ts`, `revision-2d.ts` y `revision-pdf.ts` marcados | Ya no aparecen. Siguen DashboardView y mail/editorial, que son anteriores y ajenos | OK |
| Tests de la iniciativa | — | `src/lib/compare`, `src/components/compare` y `revision-2d.test.ts`: 109/109 en verde | OK |
| T6: `/?compare=demo&tour=revision&ref=test`, lista + paso 1 sin clics | — | Escritorio: lista y «Tour · 1 de 9» en 3,0 s sin clics. 375 px: tarjeta y «1 de 5» en 3,9 s | OK |
| T6: recorrido del tour | — | Escritorio: 9 pasos hasta «Listo», que lo cierra. 375 px: 5 pasos y se cierra (los pasos sin ancla en móvil se saltan) | OK |
| T6: Ayuda / Opinión sin llamada | — | Menú: «✉ Enviar opinión», «▶ Repetir el tour». El formulario es «¿Qué te ayudaría más?… te contesto aquí», sin agenda ni llamada | OK |
| T6: eventos `rc_*` sin ficheros ni GlobalIds | — | Capturados (dev): `rc_opened {source:demo, ref:test}`, `rc_diff_completed` (solo rangos y kinds), `rc_tour_started`, `rc_tour_step ×10`, `rc_tour_completed`, `rc_help_clicked {option:feedback}`. 0 coincidencias de `.ifc` y 0 cadenas de 22 caracteres tipo GUID. El resto de `rc_*` (`change_reviewed`, `export`, `own_files_dropped`) solo llevan enums o booleanos (`analytics.ts:1140-1149`) | OK |

## Observaciones (no bloquean)

1. **`scan.pdf` desemparejado no se marca como «No vectorial».** Pasos: Planos → Crear → Comparar hojas, con `A.pdf` como antigua y `scan.pdf` como nueva. El resultado muestra «#1 Solo en el juego nuevo».
2. **`rc_tour_step` del paso `local` se emite dos veces** en dev (11 eventos para 9 pasos más el `end`). Probablemente es el doble montaje de StrictMode y no ocurre en producción, pero no lo he comprobado en producción porque PostHog no envía desde localhost.
3. **`ref` se envía sin filtrar** en `rc_opened` (`ref=test`). Si alguien pone datos personales en el enlace, se registran. El riesgo es bajo.
4. **Panel Planos y 3D:** al abrir Planos con A/B «mantenidos», los 6 modelos se quedan en la escena, como se espera tras «Mantener».
5. **El build modifica ficheros versionados de `public/`** (`embed/*`, `tracking-globe/*`). Los he revertido. Es comportamiento anterior a esta iniciativa.

## Cómo se midió
- Puntuación: `ADV_OUT=… node --experimental-strip-types --import ./scripts/ebook/ts-hook.mjs scripts/verify-rc/adversarial.ts` y después `ADV_DIR=… npx vitest run scripts/verify-rc/score.test.ts --dir .`
- Rendimiento: `PERF_FILES=… npx vitest run scripts/verify-rc/perf.test.ts --dir .`, y para el sintético `node scripts/verify-rc/make-big.mjs public/models/cras/model.ifc 5 <out>`
- UI: `node scripts/verify-rc/ux.mjs`, `pdf2d.mjs`, `demo.mjs` y `tour-phone.mjs` contra `vite preview` (puerto 3372). Los eventos, contra `vite` dev (puerto 3371).
- BCF: `valbcf.py` (lxml) con los XSD de buildingSMART/BCF-XML `release_3_0`.
