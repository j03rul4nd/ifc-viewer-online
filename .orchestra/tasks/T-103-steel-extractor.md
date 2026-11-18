# T-103 — Implement pure steel takeoff extractor

## Objetivo
Función pura que, a partir de los datos de elementos ya parseados del visor, devuelve la tabla de takeoff agrupada por perfil (nº piezas, longitud total, peso total, material) para que un estructurista (Noam) obtenga su listado de acero sin Tekla.

## Contexto mínimo necesario
- Worktree: C:/repo/ifc-steel (rama feat/steel-takeoff, desde main). Trabaja SOLO ahí. Si no tiene node_modules, ejecuta `npm ci` en él (no uses junctions ni toques C:/repo/ifc).
- Stack React/TS, ThatOpen/Fragments, vitest.
- Lee: src/lib/ifc-item-data.ts (parseItemData :675, summarizeItem :704, parseProjectUnits :398) para conocer la forma de psets/Qto/unidades ya parseados; src/lib/clash/collect.ts (patrón getItemsOfCategories + getItemsData).
- Decisiones (C:/repo/ifc/.orchestra/DECISIONS.md, 2026-11-13 Steel Takeoff) y research (C:/repo/ifc/.orchestra/tasks/T-102-tekla-ifc-research.md).
- NO toques: viewer.ts, componentes UI, package.json.

## Diseño
- `src/lib/steel/takeoff.ts`: `extractSteelPart(item, units) → SteelPart` (clase, id, nombre, marca, perfil, material, longitud m, peso kg, fuente de cada valor: 'qto'|'tekla'|'revit'|'advance'|'volume'|'none') y `groupByProfile(parts) → SteelTakeoffRow[]` (perfil, clase, nº, longitud total, peso total, material(es), ids).
- Cadena: Qto_*BaseQuantities (Length, NetWeight>GrossWeight, NetVolume) → "Tekla Quantity"/"Tekla Common" (Length, Net weight, Weight, Profile; valores IfcLabel con texto numérico) → Revit "Structural" Cut Length / Pset_*Common Reference → AS_*/AdvanceSteel* → NetVolume×7850. Perfil: pset (Profile/Tekla) → nombre de tipo → '(sin perfil)'. El campo ProfileName de geometría podrá inyectarse después como entrada opcional `profileOverride`.
- Normaliza unidades (mm/m, mm³/m³, kg/t) con las unidades del proyecto; propiedades Tekla con unidades explícitas o texto ("12.5 kg").
- `src/lib/steel/collect.ts` (opcional, fino): reúne items de IfcBeam/Column/Member/Plate/MechanicalFastener/ElementAssembly en lotes troceados usando el patrón de clash/collect.ts. Sin tests de integración si requieren el visor.

## Criterios de aceptación
- [ ] Tests vitest con fixtures JSON (forma real de parseItemData) cubren: Qto en m/kg; Tekla en mm con texto; solo volumen → ×7850; sin datos → peso null y fuente 'none'; plancha; tornillo sin peso; IFC2x3 vs IFC4 nombres; agrupación por perfil suma bien.
- [ ] `npx tsc -b` sin errores nuevos; `npx vitest run src/lib/steel` verde.
- [ ] Commit en feat/steel-takeoff, mensaje en inglés, SIN mencionar IA/herramientas. No push.

## Fuera de alcance
UI, aislar 3D, export, web-ifc/ProfileName, gating de plan.

## Formato de vuelta (≤ 250 palabras)
STATUS · CAMBIOS · VERIFICADO (pasa/falla + cifra) · RIESGOS (≤3) · SIGUIENTE. Detalle en "Informe" de este fichero.

## Informe
- Ficheros: `src/lib/steel/takeoff.ts` (extractSteelPart, groupByProfile, parseNumeric) y `src/lib/steel/takeoff.test.ts` (13 tests) en C:/repo/ifc-steel.
- Cadena longitud: Qto/BaseQuantities Length → Tekla Length → Revit (Structural/Pset_*Common) Cut Length/Length → AS_*/AdvanceSteel*. Peso: NetWeight>GrossWeight → Tekla Net weight>Weight>Gross weight → Revit Weight/Mass → Advance → NetVolume/GrossVolume (Qto o Tekla Volume) ×7850.
- Perfil: profileOverride → Tekla Profile → AS Section/Profile → Profile/Section Name Key en cualquier pset → Pset_*Common Reference → typeName → '(sin perfil)'.
- Unidades: unidad en el texto > unidad de la propiedad > ProjectUnits (LENGTHUNIT/MASSUNIT/VOLUMEUNIT). Unidad no reconocida → null (no se inventa). Tekla Length sin ninguna unidad: >100 se toma como mm (heurística).
- Agrupación por perfil+clase, orden por peso desc; `missingWeight` cuenta piezas sin peso.
- collect.ts (opcional) NO hecho: se deja para la tarea de UI/integración.
- Verificado: vitest src/lib/steel 13/13 verde; tsc -b 0 errores.

### Correcciones tras Verifier
1. Longitud Tekla sin unidad explícita (la del texto, o una de la propiedad distinta de la del proyecto): si leída con la unidad del proyecto pasa de 100 m, se toma como mm. Proyecto en mm con valor 6 → 0,006 m (sin cambios).
2. parseNumeric: separadores de miles. Con '.' y ',' el último es el decimal; una sola coma seguida de exactamente 3 dígitos se lee como miles; si no, es decimal. La ambigüedad queda documentada en `normaliseSeparators`.
3. 'Profile', 'Section Name Key' y 'Section Shape' solo se leen de Tekla*, Pset_*Common, Structural, AS_*/AdvanceSteel* y Qto_*; si no, se usa typeName.
- 4 tests nuevos; antes del arreglo fallaban 3 (el de mm sin cambios ya pasaba). Después: 17/17.
