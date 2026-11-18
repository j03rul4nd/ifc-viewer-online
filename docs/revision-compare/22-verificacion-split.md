# 22 — Verificación de la vista dividida A | B (PR #619, `feat/revision-split-view`)

- **Fecha:** 2026-11-14.
- **Código verificado:** `c698307c` (rama de la PR), sobre `origin/main` `0703e4a1`.
- **Cómo lo probé:** bundle de `npm run build` servido con `vite preview`, en Chrome con GPU a 1440×900 (escritorio) y a 375 px (móvil).
- **Mi script:** `scripts/verify-rc/split.mjs`, commit `f8465861` en mi rama.
- **Capturas:** `side-session-notes/…/split-captures/`.

## Veredicto: **NO FUSIONABLE**

**Bloqueante:** con el diseño por defecto del visor, las dos mitades no coinciden con el divisor ni con las etiquetas «A» y «B».

- **Causa:** `RevisionWorkspace.tsx` llama a `v.setSplitView({ …, insetLeft: 364 })` con un valor fijo. `viewer.ts` lo interpreta como píxeles relativos al canvas (`x0 = insetLeft`). Pero el canvas empieza en x = 318 de la página, detrás del árbol de modelos.
- **Efecto:**
  - Las dos mitades se pintan en x 681–1060 y 1060–1440 de la página, de 379 px cada una.
  - El divisor y las etiquetas están en x ≈ 903, en el centro del área visible (355–1440).
  - La franja 355–681 queda vacía.
  - La parte derecha de la mitad A (903–1060) aparece bajo la etiqueta «B».
  - El usuario ve la mitad de A como si fuera B.
- **Pasos:** soltar F8 o cras, pulsar «Dividida» y mirar `f8-6-split-frame.png` o `cras-1-split.png`. El conducto aparece en 681 y en 1060, no a ambos lados del divisor en 903.
- **Arreglo probable:** calcular `insetLeft` en tiempo de ejecución como (borde derecho del panel de lista) − (`canvas.getBoundingClientRect().left`), recalcularlo al redimensionar o plegar paneles, y colocar el divisor y las etiquetas con la misma cifra.

## Tabla

| Criterio | Resultado | Evidencia | OK/FALLO |
|---|---|---|---|
| `npx tsc -b --force` | Sale con 0, sin errores | `tsc3.log` | OK |
| `npm run build` | Sale con 0 | `build5.log` | OK |
| Tests de compare | `src/lib/compare` + `src/components/compare`: 7 ficheros, 96/96 en verde | vitest | OK |
| Cada lado muestra su versión con sus colores (F8) | Hay dos copias y los colores son correctos: eliminado en rojo, añadido en verde solo en la copia derecha, movido en azul y propiedades en violeta en ambas. **Pero las copias no están alineadas con el divisor ni con las etiquetas A y B** (ver bloqueante). Por la cámara tan cercana, no se pudo distinguir la posición antigua del movido frente a la nueva | `f8-2-split-row0.png`, `f8-2-split-row3.png`, `f8-6-split-frame.png` | **FALLO** |
| Lo mismo con cras | El mismo desalineado. Al seleccionar el primer cambio (propiedades), el muro sale gris en las dos copias justo cuando aparece el aviso «model.ifc cargado»; no concluyente | `cras-1-split.png` | **FALLO** (desalineado) |
| Órbita, pan, zoom y Encuadrar sincronizados | Hay una sola cámara por diseño. Tras órbita (arrastre), pan (botón derecho), rueda y F, las dos copias son idénticas | `f8-3…6-*.png` | OK |
| Selección en la lista resaltada en los dos lados | F8: el elemento seleccionado se colorea en ambas copias (eliminado solo en A) | `f8-2-split-row*.png` | OK (F8) |
| FPS con cras ≥ 30 | 46 y 49 FPS medidos con rAF propio (insignia: 43 y 58) | log | OK |
| Al salir se restauran el viewport, la visibilidad y la cámara | Al volver de Dividida a Cambios, Cortina, Alternar y Cambios: canvas 1122×820 en (318,44) igual que antes, vista única, cortina normal y colores intactos. Cambios a 60 FPS en F8 y cras. Una primera pasada con cras dio 24–26 FPS tras salir, pero no se repitió (60/60/60/61 en la segunda) y sin la dividida daba 59. Fue carga de la máquina | `f8-7-after-*.png` | OK |
| Opción oculta en móvil (375 px) | Pestañas: Cambios, Cortina, Alternar; sin «Dividida». El código fuerza `changes` si la vista era `split` y la pantalla se estrecha | `tour-phone-after.png` | OK |
| Consola limpia | 0 errores, 0 avisos y 0 `pageerror` en Dividida y al salir (F8 y cras) | log | OK |
| Tour de la demo (`/?compare=demo&tour=revision`) | Escritorio: lista en 7,9 s sin clics, 9 pasos hasta «Listo», Ayuda con «Enviar opinión» y «Repetir el tour». 375 px: 5 pasos y se cierra | log | OK |

## Observaciones
- El paso 7 del tour habla de la cortina y de alternar, pero no menciona la vista dividida. Habrá que actualizar el texto cuando se arregle (no bloquea).
- No probé el caso con el árbol de modelos plegado (canvas en x = 0), que es el que el valor 364 parece suponer. Seguramente ahí sí encaja, lo que confirma la causa, pero no lo he comprobado.
