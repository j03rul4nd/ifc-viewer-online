# T-101 — Mapa de código para Steel Takeoff (Explorer, sobre main) — done
1. Lote por clase: `model.getItemsOfCategories([/regex/])` + `model.getItemsData(ids, config)` — patrón en src/lib/clash/collect.ts:12,67,70,105. Parseo: src/lib/ifc-item-data.ts (parseItemData :675, summarizeItem :704, ELEMENT_SUMMARY_CONFIG). Trocear ids grandes.
2. ProfileName/IfcExtrudedAreaSolid: no expuesto por fragments; nada en src/lib lo usa. Buffer IFC en caché: src/lib/cache-repository.ts:169 findIfcBuffer / :175 saveIfcBuffer. web-ifc ya usado en src/lib/autofix/. Si se cargó .frag puede no haber buffer.
3. Unidades: parseProjectUnits src/lib/ifc-item-data.ts:398 (config :212), uso viewer.ts:1078.
4. Aislar: isolateElements(targets[{expressId,modelId}], enabled) viewer.ts:494.
5. exceljs ^4.4.0, siempre `await import('exceljs')`. Modelos: src/lib/cobie/xlsx.ts:64-68, src/lib/compare/report-revision.ts. CSV: components/compare/ChangesTab.tsx, MeasurementPanel.tsx.
6. Gating: <RequirePlan plan="pro" fallback={<ProUpsellModal/>}> src/components/pro/RequirePlan.tsx:3; useEntitlement. Docs 16/19 no mencionan takeoff.
7. Panel: sin verificar — src/components/Sidebar.tsx.
