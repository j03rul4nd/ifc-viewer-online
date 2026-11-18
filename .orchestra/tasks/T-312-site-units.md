# T-312 — Apartment/unit status tied to the IFC model

## Objetivo
Promotora: ver el estado de cada vivienda (available, reserved, sold, in_works, delivered, post_sale) sobre el modelo 3D. Archivos nuevos, sin montar en Sidebar/App.

## Informe
- `src/lib/site/units.ts` — puro: `buildUnits` (IfcZone con espacios agrupados → una unidad; si no, un IfcSpace = una unidad), `spaceArea` (Qto_SpaceBaseQuantities primero; NetFloorArea → GrossFloorArea → null), `mergeCsv` (GlobalId gana a Name, nombre sin mayúsculas, separador `,`/`;`, alias ES de estado, cuenta no encontradas / estado malo), `unitsCsv` (comillas + guarda de fórmulas), `countByStatus`, `countByStorey`, `groupByStorey`, `applyStates`/`statesOf`. `collectUnits` lee por fragments (`getItemsOfCategories` + `getItemsData(ITEM_DATA_CONFIG)` + `parseItemData`, lotes de 300) como `lib/steel/collect.ts`. Miembros de zona: `zoneMemberIds` recorre `IsGroupedBy`/`RelatedObjects` buscando `_localId` (forma no verificada con un IFC real con IfcZone).
- `src/lib/site/unit-store.ts` — IndexedDB `ifc-site-units`, un registro por proyecto (`projectKey` = nombres de fichero ordenados), `sanitizeStates`.
- `src/lib/site/unit-colors.ts` — `STATUS_COLORS`, `applyUnitColors`/`clearUnitColors` vía `fragmentsModel.setColor/resetColor` (ViewerAPI no tiene API de color por elemento; es lo que usa la paleta del visor), `isolateUnits` vía `ViewerAPI.isolateElements` (como el panel de acero).
- `src/lib/site/units-i18n.ts` — textos ×10 junto a la feature (patrón `lib/steel/i18n`).
- `src/components/site/UnitsPanel.tsx` — contenido sin chrome (el host lo envuelve): leer, tabla por planta, desplegable de estado, comprador, filtro por estado + búsqueda, chips con recuentos, colorear por estado, aislar unidad (clic en nombre; otro clic o "Ver todo" restaura), CSV import/export. Prop `viewerApiRef`.
- Tests: `src/lib/site/units.test.ts` (17).

Riesgos: `resetColor` sobre espacios borra también el color de paleta del visor para esos ids; IfcZone sin probar con fichero real; sin probar visualmente.
