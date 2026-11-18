# DECISIONS (append-only)

## 2026-11-13 — Adoptar el modelo Orquestador
- Decisión: CLAUDE.md define al orquestador; estado en .orchestra/; subagentes en .claude/agents/.
- Motivo: proteger contexto y poder retomar entre chats.
- Nota: AGENTS.md (reglas de negocio) manda sobre CLAUDE.md. .claude/ está en .gitignore → agentes solo locales.

## 2026-11-13 — Steel Takeoff: arquitectura base
- Fuente principal de datos: fragments (getItemsData → psets/Qto, patrón clash/collect.ts). Perfil vía web-ifc sobre el buffer IFC cacheado solo como enriquecimiento opcional (T-103b), porque un .frag precalculado puede no tener buffer.
- Cadena de valores: Qto_*BaseQuantities → "Tekla Quantity"/"Tekla Common" → otros (Revit Structural, AS_*) → NetVolume × 7850. Peso = NetWeight preferente. Unidades por parseProjectUnits.
- Extractor puro (src/lib/steel/) sobre datos ya parseados → tests con fixtures JSON; IFC reales para el Verifier.
- Plan Pro con RequirePlan (regla opción C: herramienta nueva de productividad profesional = de pago). Export con exceljs lazy.
- Trabajo en worktree C:/repo/ifc-steel, rama feat/steel-takeoff desde main.
- Descartado: SheetJS; generar IFC con IfcOpenShell ahora (se aplaza a T-106).

## 2026-11-14 — Demo guiada de Steel takeoff
- Enlace `/?steel=demo&tour=steel&ref=<code>`, mismo patrón que compare (src/lib/compare/demo.ts + TourPlayer); `?demo=` está ocupado por el workspace.
- Modelo demo: nave de acero comercial generada por script propio (licencia nuestra), servida desde /models/steel-demo/ → requiere `npm run deploy:models` tras fusionar.
- Steel takeoff se desbloquea sin Pro SOLO con el modelo demo (escalera free → demo → Pro); con modelos propios sigue pidiendo Pro.
- (Joel, 2026-11-14) La demo y lo que se dé a Noam debe costar 0 €: sin cuenta Pro, backend, DB ni APIs propias. Solo IFC estático + cálculo en el navegador. No se le activa Pro.

## 2026-11-14 — Steel takeoff: base GRATIS (Joel)
- Gratis para todos: tabla por perfil, aislar 3D, CSV/XLSX (coste 0, todo en navegador). Excepción explícita a la opción C para usarlo de anzuelo en el nicho de acero.
- Pro (futuro, cuando cueste servidor): guardar takeoffs por proyecto, historial/comparar revisiones, informes compartidos.
- Se retira el gate RequirePlan y el desbloqueo "solo demo" (T-201).
