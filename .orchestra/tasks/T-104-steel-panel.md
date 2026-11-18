# T-104 — Build steel takeoff panel (collect + UI + Pro gate)

## Objetivo
Un usuario Pro con un IFC de acero cargado abre un panel "Steel takeoff" y ve la tabla por perfil (perfil, clase, nº piezas, longitud total m, peso total kg, material, piezas sin peso) con totales, sin bloquear el visor.

## Contexto mínimo necesario
- Worktree C:/repo/ifc-steel, rama feat/steel-takeoff (ya tiene src/lib/steel/takeoff.ts verificado: extractSteelPart, groupByProfile). Solo ahí.
- Recolección: patrón getItemsOfCategories + getItemsData troceado en src/lib/clash/collect.ts:12,67,70,105; parseo src/lib/ifc-item-data.ts (parseItemData :675, parseProjectUnits :398). Multi-modelo: src/lib/model-registry.ts.
- Gating: <RequirePlan plan="pro" fallback={<ProUpsellModal/>}> src/components/pro/RequirePlan.tsx; useEntitlement.
- Registro de paneles/pestañas: src/components/Sidebar.tsx (verifícalo; copia la estructura de un panel de pago reciente).
- i18n: todo texto visible en los 10 idiomas de src/locales (sigue la convención existente).
- Gotchas: tsc con NODE_OPTIONS=--max-old-space-size=8192; suite completa tiene flakes de 5 s → ejecuta solo tests relevantes.
- NO toques: src/lib/steel/takeoff.ts (salvo bug evidente, avísalo), viewer.ts, package.json.

## Criterios de aceptación
- [ ] src/lib/steel/collect.ts: reúne IfcBeam/Column/Member/Plate/MechanicalFastener/ElementAssembly de todos los modelos cargados en lotes (≤ 500 ids), con modelId+expressId por pieza; test unitario con un modelo falso.
- [ ] Panel accesible desde la UI, envuelto en RequirePlan pro; estado de carga, vacío ("no hay elementos de acero") y tabla ordenada por peso con fila de totales; aviso si hay piezas sin peso.
- [ ] Cada fila conserva las ids (para T-105: aislar/exportar) — deja un callback/prop preparado, sin implementarlo.
- [ ] Textos en 10 idiomas.
- [ ] vitest de lo nuevo verde; tsc -b sin errores; `npm run build` OK si cabe en tiempo (si no, dilo).
- [ ] Commit(s) en inglés sin mencionar IA; sin push.

## Fuera de alcance
Aislar en 3D, export CSV/XLSX, ProfileName vía web-ifc, landing/blog.

## Formato de vuelta (≤ 250 palabras)
STATUS · CAMBIOS · VERIFICADO · RIESGOS (≤3) · SIGUIENTE. Detalle en "Informe".

## Informe
STATUS: done. Commit a237dabb en feat/steel-takeoff (C:/repo/ifc-steel), sin push.

Ficheros nuevos:
- src/lib/steel/collect.ts: collectSteelParts(models, onProgress, signal) recoge IfcBeam/Column/Member/Plate/MechanicalFastener/ElementAssembly con getItemsOfCategories y luego getItemsData(ITEM_DATA_CONFIG) en lotes de 500, cediendo el hilo con setTimeout 0 entre lotes; usa las unidades del proyecto de cada modelo (PROJECT_UNITS_CONFIG); AbortSignal. Cada pieza lleva modelId+localId (expressId = localId). steelRows() = groupByProfile + `refs: {modelId, expressId}[]` por fila (para T-105). steelTotals().
- src/lib/steel/i18n.ts: textos en los 10 idiomas, junto a la feature, igual que lib/clash/i18n. **No** está en src/locales: sigo la convención que ya usa clash. Así no se toca ningún fichero de idioma compartido.
- src/stores/steelStore.ts: estado abierto/cerrado.
- src/components/steel/SteelTakeoffPanel.tsx: ViewportPanel; contenido dentro de `<RequirePlan plan="pro" fallback={<Upsell/>}>`. Estados: sin modelo, leyendo (progreso + cancelar), vacío, error, tabla ordenada por peso con tfoot de totales y aviso de piezas sin peso. Prop `onRowAction(row, refs)` preparada y sin conectar.
- Integración: entrada de menú "Pro" en Toolbar.tsx junto a Clash y montaje lazy en App.tsx junto a ClashPanel. El brief citaba Sidebar.tsx, pero el panel de pago reciente (clash) se registra así.
- Tests: collect.test.ts (modelo falso multi-modelo, 1202 piezas, lotes ≤500, excluye no-acero, refs, totales, abort, vacío), i18n.test.ts (10 idiomas, placeholders).

Desviación: el fallback es un upsell en línea (como clash), no ProUpsellModal. Su `trigger` no incluye steel y es un modal, que no encaja dentro de un panel.

Verificado: vitest src/lib/steel 22/22; tsc -b sin errores. `npm run build` NO ejecutado (tiempo); tampoco se ha probado en el navegador.
takeoff.ts sin tocar.
