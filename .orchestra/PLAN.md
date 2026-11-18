# PLAN

Estados: [ ] pendiente · [~] en curso · [x] hecho · [!] bloqueado

## E0 — Arranque del orquestador
- [x] T-000 CLAUDE.md + .claude/agents/ (2026-11-13)
- [x] T-001 Explorer: mapa del repo → CONTEXT.md

## Siguiente épica
- [x] Elegida: Steel Takeoff (2026-11-13)

## E1 — Steel Takeoff (usuario: Noam) — rama nueva desde main (worktree)
- [x] T-101 Explorer: lectura de props/psets/Qto/perfiles hoy + cómo se marca una feature de pago + paneles/exports reutilizables (sin dependencias)
- [x] T-102 Researcher: estructura de IFC de Tekla/Advance Steel (perfiles, Qto, psets, assemblies, IFC2x3 vs IFC4) + IFC de acero públicos con licencia usable (sin dependencias)
- [x] T-103 (verificado + 3 fixes, 0526ac1e) Implementer: extractor puro `src/lib/steel/` + tests sobre fixtures (depende de T-101, T-102)
- [x] T-104 (a237dabb; verificación conjunta en T-106) Implementer: panel UI
- [x] T-105 (3eeb864b; build OK) Implementer: aislar en 3D + export CSV/XLSX (depende de T-104: comparte el panel → secuencial)
- [x] T-106 Verifier (re-pasado tras T-107): falla perfil (todo "(sin perfil)") → T-107; resto pasa
- [x] T-107 (a0d68873, re-verificado en navegador) Implementer: resolver perfil (ObjectType → tipo → ProfileName web-ifc) + i18n NO_PROFILE + formato clase/plural (depende de T-106)
- [x] T-108 (d958890d, 43 tests) Implementer: longitud/peso desde geometría (Depth × área de perfil × 7850) cuando no hay Qto/pset; perfil Revit "Familia:Tipo" → "Tipo"; tabla con 1 decimal en kg (depende de T-107)
- [x] T-109 Reviewer: 5 hallazgos arreglados (11ca1841, 54 tests)
- [x] T-109b Verifier: regresión final OK (+ 04e2c3d2: split Revit estricto, chapas sin longitud; 55 tests)
- [x] T-110 PR #621 fusionado en main (b5986155, 2026-11-14)

## Backlog E1+
- [ ] Peso por volumen de geometría para perfiles arbitrarios (Revit sin Qto)
- [ ] Probar con IFC real de Tekla (Noam)
- [ ] ¿Cabeceras de export traducidas?
- [x] Desplegado en producción (Cloudflare Pages, 2026-11-14)

## E2 — Enlace demo guiado de acero (Noam) — worktree C:/repo/ifc-steel, rama feat/steel-demo-tour
- [x] T-201 (e8becf50) Implementer: modelo IFC de nave de acero + `/?steel=demo&tour=steel` + panel abierto/calculado + tour + desbloqueo Pro solo en el modelo demo
- [x] T-202 Verifier en navegador (PR #625, desplegado 2026-11-14)
- [ ] T-203 PR, fusionar, deploy:models + deploy:pages
- [ ] (backlog Pro) Takeoffs guardados por proyecto / comparar revisiones / informes compartidos — solo con clientes de pago
