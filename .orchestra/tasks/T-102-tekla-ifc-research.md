# T-102 — Estructura IFC de acero (Researcher) — STATUS: done (de memoria, SIN verificar en web)

- Tekla psets (configurables): "Tekla Common" (Phase, Class, Name, Part mark), "Tekla Quantity" (Length, Weight, Net weight, Gross weight, Width, Height, Volume), "Tekla Assembly" (Assembly mark/pos, Weight). Unidades del fichero (mm, kg). A veces IfcLabel con texto.
- Qto_{Beam,Column,Member,Plate}BaseQuantities: Length, NetWeight, GrossWeight, NetVolume, Width (plate).
- Marca: Tekla Common / IfcElement.Tag / Name. Assembly ↔ piezas por IfcRelAggregates.
- Advance Steel: psets "AdvanceSteel…"/"AS_…". Revit: Pset_BeamCommon, Qto solo si "export base quantities", Cut Length en "Structural".
- Perfil: SweptArea → IfcProfileDef.ProfileName (Tekla lo rellena: HEA200, IPE300, PL10*200). IFC4 DTV: IfcMaterialProfileSetUsage (perfil+material); RV lo pierde. Plancha: espesor = Depth.
- Peso: NetWeight preferente; fallback NetVolume × 7850. Leer IfcUnitAssignment (mm, mm³/m³, kg/t; alguno en N). Tornillos sin peso.
- Fixtures: ningún Tekla real con licencia clara. DECISIÓN propuesta: generar fixtures propias con IfcOpenShell (HEA/IPE, plancha, tornillo, assembly, variantes mm/m, con y sin Qto, IFC2x3 e IFC4).
- Fuentes candidatas: github.com/buildingSMART/Sample-Test-Files, github.com/IfcOpenShell/files (licencias por verificar).
- Riesgo: nombres exactos de propiedades Tekla sin confirmar → pedir a Noam un IFC real.
