# Prompt — subir el listón visual del mundo 3D (GIS/contexto OSM)

## Contexto y objetivo

El modo mapa 3D (`VITE_FEATURE_GIS`) ya está construido y es profundo, pero el resultado en
pantalla todavía no es presentable. Quiero escribir artículos enseñando esta feature, así que el
listón es **"captura que aguanta un post"**, no "funciona". Esta tarea es de calidad de imagen y de
control del usuario, no de arquitectura nueva.

Lee antes de proponer nada:
- Memorias: `project_gis_map_built.md`, `project_gis_map_plan.md`, `project_digital_twin_frame.md`,
  `project_showcase_props_pipeline.md`, `project_reference_ifc_models.md`, `project_embed_url_params.md`.
- Docs del repo: `docs/GIS_MAP_MODE.md` (secciones "Ground handling differs per layer",
  "Buildings: why Overpass" y "Traps that cost real debugging time"),
  `docs/GIS_MAP_INTEGRATION_PLAN.md`, `docs/TERRAIN_3D_IMPROVEMENT_PLAN.md`.

Código: todo en `src/lib/geo/` (~19k líneas, cada módulo con su `.test.ts`) + `src/components/GeoPanel.tsx`
+ `src/stores/geoStore.ts`. Los módulos son PUROS por diseño (geometría dentro, geometría fuera);
mantén esa separación: nada de materiales ni THREE en `osm-features.ts`, `road-network.ts`,
`buildings.ts`, `feature-variation.ts`, `context-suppression.ts`.

**Importante: no reconstruyas lo que ya existe.** Ya hay: visibilidad por capa
(`geoStore.setFeatureLayer` sobre los 10 `FEATURE_KINDS`, persistida en localStorage y expuesta al
SDK vía `cmd.layers`), supresión de contexto bajo el modelo (`context-suppression.ts`), solver de
intersecciones por nodo (`road-network.ts`), variación determinista por feature
(`feature-variation.ts`) y tres niveles de detalle (`simple` / `detailed` / `showcase`).
El trabajo es afinar y cerrar huecos concretos.

---

## Los 4 frentes, con las pistas que ya he localizado

Trata cada pista como hipótesis a verificar, no como diagnóstico cerrado. Si al leer el código la
causa real es otra, dilo y corrige el plan.

### 1. El verde se ve mal y sale incompleto

Síntomas: en muchos sitios se ve la textura del tile del basemap en vez de nuestro verde, y los
parques salen a trozos.

Pistas concretas:
- `osm-scene.ts:236` — en la ruta `buildSimpleSurface` el material es `MeshBasicMaterial` con
  `opacity: 0.45`, `depthWrite: false`. Es deliberado ("deja que la imagen del basemap tiña"), pero
  es exactamente lo que produce el "se ve el mapa en vez del verde". Decide si esa decisión sigue
  siendo correcta, y con qué opacidad/mezcla, o si `simple` debe dejar de ser translúcido.
  Ojo: `simple` vs `detailed` lo elige `geo-system.ts:763 surfaceQuality()` a partir de
  `contextDetail`, así que aclara en cuál de las dos rutas se ve feo antes de tocar.
- `osm-scene.ts:330` — `buildDetailedSurface` tiene `budget = DETAIL_MAX_POINTS` (40 000) y hace
  `if (budget <= 0) break` **en medio del bucle de features**. Eso literalmente corta el layer a
  media lista: parques que desaparecen enteros o a trozos según el orden. Un presupuesto agotado
  debería degradar la teselación, no abandonar features.
- `osm-features.ts:545-552` — al ensamblar relaciones solo se leen los miembros con
  `role === 'outer'`. Los `inner` (huecos de multipolígono) se ignoran: un parque con un lago o un
  edificio dentro se pinta macizo, y cada `outer` se emite como feature suelta sin agujeros.
- `osm-scene.ts:143 triangulate()` devuelve `null` y la feature entera se cae en silencio. Cuenta
  cuántas se pierden así en un caso real antes de decidir si merece un fallback.
- `osm-features.ts:660-700` — el presupuesto Overpass se reparte por grupos; el ground cover solo
  tiene el 30 % de `maxElements` (cap global 6000). Verifica si en un sitio denso ese cap está
  recortando polígonos de verde.
- Calidad visual: el verde debe tener variación de tono y transición creíble con el terreno.
  `greenTone`/`greenRoughness` (`feature-variation.ts:166,188`) y `surface-shaders.ts` ya dan
  material; el problema puede ser tanto de material como de que el polígono ni llega a pintarse.

### 2. Ocultar elementos del mundo 3D (caso del templo japonés)

Caso real: con el IFC de un templo japonés, al activar el mapa 3D aparece el bloque de edificios OSM
donde está el templo, tapando el modelo. `context-suppression.ts` debería cubrirlo: aplica una
política por `FacilityKind` sobre la huella del modelo con `DEFAULT_MARGIN_M = 2`. Diagnostica por
qué falla en ese caso — sospechas: `facilityKindFromTree` devuelve `unknown`, la huella
(`footprintFromBounds`) es un rectángulo del bounding box que no cubre el edificio vecino, o el
margen de 2 m es corto.

Lo que quiero además, como producto:
- **Ocultar un elemento concreto con un clic**, no solo la capa entera: pinchar un edificio de
  contexto (o un árbol/tramo) y quitarlo o atenuarlo. Los layers van en meshes fusionados —
  `buildingRanges` en `geo-system.ts` ya mapea rangos por edificio, mira si eso da el pick y el
  ocultado sin partir el merge.
- Que la lista de capas existente sea **descubrible** desde la escena, no enterrada en el panel; y
  revisar si las 10 `FEATURE_KINDS` son la granularidad correcta (por ejemplo, separar caminos
  peatonales de carreteras — ver punto 3).
- Persistencia coherente con lo que ya hay (localStorage + `cmd.layers` del SDK). Si añades params
  de share/embed, lee `docs/EMBED_URL_PARAMS.md` antes de inventar nombres.

### 3. Caminos: intersecciones y vías peatonales

- Las intersecciones siguen dejando tramos feos cuando la vía se ensancha, se bifurca o hace curva.
  `road-network.ts` ya hace topología → solver de nodo → ribbons con `MITER_LIMIT = 2.5`,
  `MAX_TRIM_FRACTION = 0.42`, `MAX_TRIM_WIDTHS = 5`, `TAPER_WIDTHS = 5`, `DEFAULT_SNAP_M = 0.3`.
  Quiero un diagnóstico de **qué configuración de nodo concreta rompe** (ángulos muy agudos,
  degree-2 con salto de ancho, ramales tangentes, snap que no recupera el nodo compartido) con un
  caso reproducible en un test, no un retoque de constantes a ciegas.
- Peatonales: `footway`, `path`, `pedestrian`, `steps`, `cycleway`, `track` **ya existen** en
  `ROAD_VALUES` con sus anchos (`osm-features.ts:138-159`) — pero caen todos en `kind === 'road'`
  (`osm-scene.ts:763`), entran al mismo `buildRoadNetwork` y comparten material asfalto. De ahí
  salen dos problemas: se ven como carreteras en miniatura, y un footway de 1,6 m unido a una
  trunk de 12 m se resuelve como un cruce de calzadas, que es una de las fuentes de junctions feos.
  Quiero jerarquía propia: material/tono/ancho de peatonal, y decidir si el solver debe agrupar por
  clase (la red de coche por un lado, la peatonal por otro) en vez de mezclarlas en un grafo.

### 4. Edificios de contexto: dejar de parecer todos iguales y feos

- Hoy la variación es determinista pero **global**: `facadeColor` (`feature-variation.ts:132`) elige
  de una paleta `FACADE_TONES` fija por hash del id, sin mirar región ni tags. Por eso el barrio
  alrededor de un templo japonés parece un extrarradio europeo.
- Ya existen formas de tejado (`flat`/`gabled`/`pyramidal` desde `roof:shape`) y colores tagueados
  en `building-mesh.ts:194-251`, y alturas con honestidad de estimación en `buildings.ts`. La
  palanca que falta es **contexto**: `building=house|temple|shrine|industrial|retail`, densidad del
  tejido, y región/país del emplazamiento deberían mover paleta, proporción y tejado.
- Quiero además un **modo "contexto discreto"**: masas neutras, casi diagramáticas, para cuando el
  protagonista es el IFC y el contexto solo debe dar escala. Encaja como tratamiento dentro de los
  niveles `simple`/`detailed`/`showcase` existentes, no como un cuarto nivel — decide dónde vive.

---

## Cómo quiero que trabajes

1. **Primero diagnóstico, no código.** Un informe corto por cada uno de los 4 frentes: causa real
   con fichero:línea, qué de mis pistas se confirma y qué no, y qué es barato vs caro.
2. **Propón un orden por impacto visual / esfuerzo y espera mi OK** antes de implementar en bloque.
3. Implementa por fases. Cada módulo de `src/lib/geo` tiene su `.test.ts` — mantén la convención y
   añade tests de regresión para los casos geométricos (junction que rompe, multipolígono con hueco,
   presupuesto agotado).
4. **Verifica con píxeles reales de la app**, no con razonamiento. `project_showcase_props_pipeline.md`
   explica cómo sacar capturas de la app real; ahí también están las 4 trampas que ningún test
   detecta. Antes/después en al menos dos emplazamientos: uno urbano denso (Poblenou / Torre
   Poblenou, ver `project_reference_ifc_models.md`) y el del templo japonés.
5. **Cuidado con Overpass**: una consulta por toggle, nunca por tile ni por movimiento de cámara, y
   espacia las pruebas — rate-limita por IP con cooldowns de minutos (`docs/GIS_MAP_MODE.md`).
   Aprovecha el caché de features: los cambios de aspecto deben reconstruirse en local sin refetch.
6. Sin regresiones de rendimiento: si cambias conteo de meshes, materiales o draw calls, mídelo
   antes y después. Los árboles son 2 draw calls para ~1500 instancias; no rompas ese patrón.
7. No menciones IA/Claude/Anthropic en commits ni PRs.
