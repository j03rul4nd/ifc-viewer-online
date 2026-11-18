# T-201 — Build a guided steel takeoff demo link

## Objetivo
Un enlace personal (`https://www.ifcvieweronline.eu/?steel=demo&tour=steel&ref=noam`) que abre el visor con una nave de acero comercial ya cargada, el panel Steel takeoff abierto y calculado, y un tour guiado que enseña: la tabla por perfil → aislar una fila en 3D → mostrar todo → exportar a Excel → "prueba con tu propio IFC de Tekla". Para Noam (estructura de acero comercial) y luego para cualquier lead.

## Contexto mínimo necesario
- Worktree C:/repo/ifc-steel, rama feat/steel-demo-tour (desde origin/main). Solo ahí. `npm ci` si faltan node_modules.
- Patrón a copiar: src/lib/compare/demo.ts (`/?compare=demo&tour=revision&ref=`, DEMO_BASE '/models/revision-demo', quita `?tour` de la URL tras arrancar), src/components/TourPlayer.tsx, revision-tour.test.ts, conexión en src/App.tsx:~1049.
- URL params: src/lib/url-params.ts parseAppUrlParams (~399). NO reutilices `?demo=` (ocupado por workspace).
- Steel: src/components/steel/SteelTakeoffPanel.tsx, src/stores/steelStore.ts, src/lib/steel/*, textos en src/lib/steel/i18n.ts (10 idiomas). Gating actual: RequirePlan pro.
- Modelos: public/models/... servidos por Worker de Cloudflare (ver AGENTS.md regla 6: >25 MiB a lista gzip; este debe ser pequeño, < 2 MB).
- Decisiones: C:/repo/ifc/.orchestra/DECISIONS.md (2026-11-14 Demo guiada).

## Trabajo
1. Script generador (p. ej. scripts/steel-demo/generate.ts, ejecutable con `npx tsx`) que escribe public/models/steel-demo/steel-hall.ifc: IFC4, unidades mm, nave a dos aguas ~24 × 40 m: pilares HEA300, dinteles IPE400, correas IPE160/C, arriostramientos L80x8, placas base PL20x400 (IfcPlate), tornillos M20 (IfcMechanicalFastener), agrupados en IfcElementAssembly por pórtico; geometría IfcExtrudedAreaSolid con IfcIShapeProfileDef/LShape/Rectangle bien colocada (que se vea como una nave en 3D); psets "Tekla Common"/"Tekla Quantity" y Qto_*BaseQuantities en la mayoría, y algunas piezas sin Qto (para que el aviso y la cadena se luzcan); IfcMaterial S355. Determinista. Test que carga el IFC con el extractor/STEP reader y comprueba recuento y perfiles esperados.
2. `src/lib/steel/demo.ts` + parámetros `steel=demo`, `tour=steel`, `ref`: carga el modelo demo, abre el panel, lanza el cálculo y arranca el tour; quita `tour` de la URL tras arrancar.
3. Tour de ~5 pasos con TourPlayer (10 idiomas), anclado a elementos reales del panel; el último paso invita a soltar su propio IFC y menciona que eso es Pro.
4. Desbloqueo: sin Pro, el panel funciona SOLO cuando el único modelo cargado es el demo de acero; con cualquier otro modelo sigue RequirePlan. Test de la regla.
5. `ref` solo para atribución/analítica existente (mira cómo lo usa compare); nada de datos personales en la URL más allá del código.

## Criterios de aceptación
- [ ] Abrir `/?steel=demo&tour=steel&ref=noam` en dev → nave visible, panel abierto con tabla (≥ 5 perfiles), tour en marcha; recargar no reinicia el tour.
- [ ] Sin Pro funciona con el demo; con otro IFC sin Pro aparece el aviso Pro.
- [ ] Tests nuevos verdes; vitest src/lib/steel verde; tsc -b (NODE_OPTIONS=--max-old-space-size=8192) limpio; `npm run build` OK.
- [ ] Commits en inglés sin mencionar IA; sin push.

## Fuera de alcance
Landing/blog, emails, cambios en el cálculo.

## Formato de vuelta (≤ 250 palabras) — detalle en "Informe".

## Informe
STATUS: partial (todo hecho y verificado; el commit lo denegó el clasificador de permisos → cambios SIN commitear en C:/repo/ifc-steel, rama feat/steel-demo-tour).

Cambios de alcance aplicados (coordinador):
- Joel: Steel takeoff GRATIS para todos y con cualquier modelo. Quitado RequirePlan, Upsell, badge "Pro" del panel y del menú; la entrada del menú está ahora con las herramientas gratuitas (antes de Clash). Quitados los textos upsellTitle/Body/Cta (×10). El desbloqueo "solo demo" y su test se han eliminado.
- Último paso del tour: "Drop your own Tekla IFC to get your takeoff." ×10 idiomas, sin mencionar Pro (lo comprueba un test).
- Coste de servidor cero: el IFC es estático (/models/steel-demo/steel-hall.ifc, 235 KiB); sin cuenta, sin backend, sin BD, sin API propia. `ref` no se toca: lo recoge attribution.ts como cualquier `?ref=` (analítica cookieless ya existente).

Archivos:
- scripts/steel-demo/generate.ts (+ generate.test.ts): nave IFC4 mm de 24 × 40 m, 9 pórticos (HEA300, IPE400), 64 correas IPE160, 32 largueros UPE160, 8 arriostramientos L80x8, 18 PL20x400, 72 M20 sin peso, 9 IfcElementAssembly, S355, Qto + Tekla Common/Quantity; la última crujía de correas y los arriostramientos solo llevan Tekla. Determinista. El test comprueba byte a byte el archivo commiteado, recuentos, 6 perfiles y que web-ifc real genera mallas para 158 piezas.
- public/models/steel-demo/steel-hall.ifc
- src/lib/steel/demo.ts, tour.ts, demo.test.ts; i18n.ts (tour ×10)
- src/lib/url-params.ts: `steel=demo` → modelUrls = [demo] (ignora otros model=).
- src/stores/steelStore.ts (demo/autoRun/tour), SteelTakeoffPanel.tsx (cálculo automático cuando están los fragments, anclas data-tour, SteelTour con GuidedTourView, igual que el tour de comparación de revisiones), App.tsx (startDemo + strip `tour`), Toolbar.tsx.

Verificado: vitest src/lib/steel + scripts/steel-demo 67/67; toolbar-gating + url-params 81/81; tsc -b limpio; npm run build OK (10 min).
Sin probar: abrir el enlace en el navegador (dev).
Riesgos: 1) En producción, /models/ se sirve desde el Worker: hay que desplegar el modelo (deploy:models). 2) El tour usa GuidedTourView, no TourPlayer (el patrón de compare). 3) Las anclas del tour no se han probado en el móvil.
